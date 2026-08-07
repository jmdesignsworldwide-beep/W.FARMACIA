'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { BRAND } from '@/lib/tokens';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export interface LineaCobro {
  productoId: string;
  cantidad: number;
}

export interface CobrarEfectivoInput {
  /** Clave del intento — un doble clic o un reintento no cobra dos veces. */
  idempotencia: string;
  recibido: number;
  lineas: LineaCobro[];
}

export interface CobrarResultado {
  ok?: true;
  ventaId?: string;
  total?: number;
  vuelto?: number;
  error?: string;
  requiereFarmaceutico?: boolean;
  faltantes?: string[];
}

interface ProdRow {
  id: string;
  nombre: string;
  precio_venta: number | null;
  exento_itbis: boolean | null;
  es_controlado: boolean | null;
  requiere_receta: boolean | null;
  producto_principio_activo: Array<{
    principio_activo: { es_controlado: boolean | null; requiere_receta: boolean | null } | null;
  }>;
  lote: Array<{ id: string; cantidad_actual: number | null; estado: string; fecha_vencimiento: string | null; costo_unitario: number | null }>;
}

function lotesFefo(p: ProdRow) {
  return p.lote
    .filter((l) => l.estado === 'activo' && Number(l.cantidad_actual ?? 0) > 0)
    .sort((a, b) => (a.fecha_vencimiento ?? '9999-12-31').localeCompare(b.fecha_vencimiento ?? '9999-12-31'));
}

/**
 * Cobra el carrito en efectivo: crea la venta persistente, descuenta por FEFO del
 * lote que vence primero (partiendo entre lotes si hace falta), deja el movimiento
 * de inventario inviolable por cada descuento, y registra el cobro. El candado
 * clínico (controlados / receta) se valida AQUÍ, en el servidor: el cajero no puede
 * despacharlos aunque la UI se lo permitiera. Sin RPC — el repo aún no tiene uno;
 * la atomicidad real (transacción / RPC) es un endurecimiento pendiente.
 */
export async function cobrarEnEfectivo(input: CobrarEfectivoInput): Promise<CobrarResultado> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };

  const lineas = (input.lineas ?? []).filter((l) => l.productoId && Number(l.cantidad) > 0);
  if (lineas.length === 0) return { error: 'El carrito está vacío.' };

  const supabase = createClient();

  // Idempotencia: si este intento ya se cobró, devolver la misma venta (no re-cobrar).
  const refIdem = `venta-idem:${input.idempotencia}`;
  const { data: yaCobro } = await supabase
    .from('cobro')
    .select('venta_id')
    .eq('referencia', refIdem)
    .limit(1)
    .maybeSingle<{ venta_id: string }>();
  if (yaCobro) {
    const { data: v } = await supabase.from('venta').select('total').eq('id', yaCobro.venta_id).maybeSingle<{ total: number }>();
    const total = Number(v?.total ?? 0);
    return { ok: true, ventaId: yaCobro.venta_id, total, vuelto: Math.max(0, Number(input.recibido ?? 0) - total) };
  }

  // Cargar productos + lotes + candado clínico efectivo en una sola consulta.
  const ids = [...new Set(lineas.map((l) => l.productoId))];
  const { data: prodsData } = await supabase
    .from('producto')
    .select(
      `id, nombre, precio_venta, exento_itbis, es_controlado, requiere_receta,
       producto_principio_activo ( principio_activo:principio_activo_id ( es_controlado, requiere_receta ) ),
       lote ( id, cantidad_actual, estado, fecha_vencimiento, costo_unitario )`,
    )
    .in('id', ids)
    .is('eliminado_en', null);
  const prods = (prodsData as unknown as ProdRow[]) ?? [];
  const mapa = new Map(prods.map((p) => [p.id, p]));

  // ── Validación previa (nada se escribe si algo falla) ──────────────
  const faltantes: string[] = [];
  let hayControlado = false;
  for (const l of lineas) {
    const p = mapa.get(l.productoId);
    if (!p) return { error: 'Un producto del carrito ya no existe.' };
    const controlado = p.es_controlado ?? p.producto_principio_activo.some((x) => x.principio_activo?.es_controlado);
    const receta = p.requiere_receta ?? p.producto_principio_activo.some((x) => x.principio_activo?.requiere_receta);
    if (controlado || receta) hayControlado = true;
    const disp = lotesFefo(p).reduce((s, x) => s + Number(x.cantidad_actual ?? 0), 0);
    if (disp < l.cantidad) faltantes.push(p.nombre);
  }
  if (hayControlado && !can(user.role, 'despachar_controlados')) {
    return {
      error: 'Esta venta incluye un producto controlado o de receta. Solo el farmacéutico puede despacharlo.',
      requiereFarmaceutico: true,
    };
  }
  if (faltantes.length) return { error: `Sin existencia suficiente: ${faltantes.join(', ')}.`, faltantes };

  // ── Totales + plan de despacho por lote (FEFO) ─────────────────────
  const r = BRAND.itbisRate;
  let itbis = 0;
  let total = 0;
  const plan: Array<{ productoId: string; precio: number; exento: boolean; despacho: Array<{ loteId: string; cantidad: number; saldo: number; costo: number | null }> }> = [];
  for (const l of lineas) {
    const p = mapa.get(l.productoId)!;
    const precio = Number(p.precio_venta ?? 0);
    const exento = Boolean(p.exento_itbis);
    total += precio * l.cantidad;
    if (!exento) itbis += (precio * l.cantidad * r) / (1 + r);
    let restante = l.cantidad;
    const despacho: Array<{ loteId: string; cantidad: number; saldo: number; costo: number | null }> = [];
    for (const lo of lotesFefo(p)) {
      if (restante <= 0) break;
      const disp = Number(lo.cantidad_actual ?? 0);
      const toma = Math.min(restante, disp);
      despacho.push({ loteId: lo.id, cantidad: toma, saldo: disp - toma, costo: lo.costo_unitario });
      restante -= toma;
    }
    plan.push({ productoId: l.productoId, precio, exento, despacho });
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  total = round2(total);
  itbis = round2(itbis);
  const subtotal = round2(total - itbis);

  const recibido = Number(input.recibido ?? 0);
  if (recibido + 0.001 < total) return { error: 'El efectivo recibido no cubre el total.' };

  // ── Escritura: venta → líneas + movimientos + descuento de lote → cobro ──
  const { data: ventaIns, error: eV } = await supabase
    .from('venta')
    .insert({ empleado_id: user.id, sucursal_id: SUCURSAL, subtotal, itbis, descuento: 0, total, estado: 'completada' } as never)
    .select('id')
    .single<{ id: string }>();
  if (eV || !ventaIns) return { error: 'No se pudo crear la venta.' };
  const ventaId = ventaIns.id;
  const ref = `venta:${ventaId}`;

  for (const item of plan) {
    for (const d of item.despacho) {
      const itbisPorc = item.exento ? 0 : round2((item.precio * d.cantidad * r) / (1 + r));
      await supabase.from('venta_linea').insert({
        venta_id: ventaId,
        producto_id: item.productoId,
        lote_id: d.loteId,
        cantidad: d.cantidad,
        precio_unitario: item.precio,
        itbis_linea: itbisPorc,
        costo_unitario_momento: d.costo,
      } as never);
      await supabase.from('movimiento_inventario').insert({
        producto_id: item.productoId,
        lote_id: d.loteId,
        sucursal_id: SUCURSAL,
        tipo: 'venta',
        cantidad: -d.cantidad,
        cantidad_resultante: d.saldo,
        costo_unitario_momento: d.costo,
        referencia: ref,
        empleado_id: user.id,
      } as never);
      await supabase
        .from('lote')
        .update((d.saldo <= 0 ? { cantidad_actual: d.saldo, estado: 'agotado' } : { cantidad_actual: d.saldo }) as never)
        .eq('id', d.loteId);
    }
  }

  await supabase.from('cobro').insert({ venta_id: ventaId, metodo: 'efectivo', monto: total, referencia: refIdem } as never);

  revalidatePath('/caja');
  return { ok: true, ventaId, total, vuelto: round2(Math.max(0, recibido - total)) };
}
