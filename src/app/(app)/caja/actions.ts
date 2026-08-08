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
  /** RNC del receptor: si viene, se emite crédito fiscal (B01); si no, consumidor final (B02). */
  rnc?: string;
  /** Cliente identificado (opcional): la mayoría de ventas son anónimas. */
  clienteId?: string | null;
}

export interface CobrarResultado {
  ok?: true;
  ventaId?: string;
  total?: number;
  vuelto?: number;
  error?: string;
  requiereFarmaceutico?: boolean;
  faltantes?: string[];
  ncf?: string | null;
  tipoNcf?: string | null;
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
  lote: Array<{ id: string; cantidad_actual: number | null; estado: string; fecha_vencimiento: string | null; costo_unitario: number | null; en_revision_frio: boolean | null; es_muestra: boolean | null }>;
}

function lotesFefo(p: ProdRow) {
  return p.lote
    // No se despacha: lote en revisión por frío, ni muestra médica (no se vende).
    .filter((l) => l.estado === 'activo' && !l.en_revision_frio && !l.es_muestra && Number(l.cantidad_actual ?? 0) > 0)
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
       lote ( id, cantidad_actual, estado, fecha_vencimiento, costo_unitario, en_revision_frio, es_muestra )`,
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

  // La venta pertenece al turno de caja abierto, si lo hay (Tanda 5).
  const { data: cajaAbierta } = await supabase
    .from('caja_sesion')
    .select('id')
    .eq('sucursal_id', SUCURSAL)
    .eq('estado', 'abierta')
    .limit(1)
    .maybeSingle<{ id: string }>();

  // ── Escritura: venta → líneas + movimientos + descuento de lote → cobro ──
  const { data: ventaIns, error: eV } = await supabase
    .from('venta')
    .insert({
      empleado_id: user.id,
      sucursal_id: SUCURSAL,
      caja_sesion_id: cajaAbierta?.id ?? null,
      cliente_id: input.clienteId ?? null,
      subtotal,
      itbis,
      descuento: 0,
      total,
      estado: 'completada',
    } as never)
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

  // Comprobante fiscal: RNC → B01 (crédito fiscal); si no, B02 (consumidor final).
  // Si no hay secuencia configurada, la venta NO se bloquea: queda sin NCF y se avisa.
  let ncf: string | null = null;
  let tipoNcf: string | null = null;
  const rnc = input.rnc?.trim() || null;
  const tipo = rnc ? 'B01' : 'B02';
  const { data: numData, error: eNcf } = await supabase.rpc('siguiente_ncf' as never, { p_tipo: tipo, p_sucursal: SUCURSAL } as never);
  if (!eNcf && typeof numData === 'string') {
    const { error: eComp } = await supabase.from('comprobante').insert({
      venta_id: ventaId,
      sucursal_id: SUCURSAL,
      tipo,
      ncf: numData,
      rnc_receptor: rnc,
      subtotal,
      itbis,
      total,
      emitido_por: user.id,
    } as never);
    if (!eComp) {
      ncf = numData;
      tipoNcf = tipo;
    }
  }

  revalidatePath('/caja');
  return { ok: true, ventaId, total, vuelto: round2(Math.max(0, recibido - total)), ncf, tipoNcf };
}

export interface ClienteIdentificado {
  id: string;
  nombre: string;
  telefono: string | null;
  alergias: string[];
}

/** Identifica al cliente por teléfono (el identificador de 3 segundos). */
export async function identificarCliente(telefono: string): Promise<{ cliente?: ClienteIdentificado; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const tel = telefono.trim();
  if (!tel) return { error: 'Escribe un teléfono.' };
  const supabase = createClient();
  const { data: cli } = await supabase
    .from('cliente')
    .select('id, nombre, telefono')
    .eq('telefono', tel)
    .is('eliminado_en', null)
    .limit(1)
    .maybeSingle<{ id: string; nombre: string; telefono: string | null }>();
  if (!cli) return { error: 'No hay cliente con ese teléfono.' };

  const { data: al } = await supabase
    .from('cliente_alergia')
    .select('familia:familia_alergenica_id ( nombre ), principio:principio_activo_id ( nombre )')
    .eq('cliente_id', cli.id);
  const alergias = ((al as unknown as Array<{ familia: { nombre: string } | null; principio: { nombre: string } | null }>) ?? [])
    .map((a) => a.familia?.nombre ?? a.principio?.nombre)
    .filter((n): n is string => Boolean(n));

  return { cliente: { id: cli.id, nombre: cli.nombre, telefono: cli.telefono, alergias } };
}

export interface ConflictoAlergia {
  productoId: string;
  productoNombre: string;
  familia: string | null;
  familiaId: string | null;
}

/** Devuelve los productos del carrito que chocan con una alergia del cliente. */
export async function revisarAlergias(clienteId: string, productoIds: string[]): Promise<ConflictoAlergia[]> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return [];
  if (!clienteId || productoIds.length === 0) return [];
  const supabase = createClient();
  const { data } = await supabase.rpc('alergias_en_conflicto' as never, { p_cliente: clienteId, p_productos: productoIds } as never);
  return ((data as unknown as Array<{ producto_id: string; producto_nombre: string; familia: string | null; familia_id: string | null }>) ?? []).map((r) => ({
    productoId: r.producto_id,
    productoNombre: r.producto_nombre,
    familia: r.familia,
    familiaId: r.familia_id,
  }));
}

/** Registra en el libro inviolable la decisión ante la alerta cruzada. */
export async function registrarDecisionAlergia(
  clienteId: string,
  decision: 'no_despachado' | 'despachado_con_confirmacion',
  motivo: string,
  conflictos: ConflictoAlergia[],
): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const filas = conflictos.map((c) => ({
    cliente_id: clienteId,
    producto_id: c.productoId,
    familia_alergenica_id: c.familiaId,
    decision,
    motivo: motivo.trim() || null,
    decidido_por: user.id,
  }));
  if (filas.length > 0) {
    const { error } = await supabase.from('alerta_alergia_evento').insert(filas as never);
    if (error) return { error: 'No se pudo registrar la decisión.' };
  }
  return { ok: true };
}

export interface LineaEnEspera {
  id: string;
  nombre: string;
  precio: number;
  exentoItbis: boolean;
  cantidad: number;
  existencia: number;
  controlado: boolean;
  receta: boolean;
}

export interface CarritoEnEspera {
  id: string;
  etiqueta: string | null;
  lineas: LineaEnEspera[];
  creadoEn: string;
}

/** Aparca el carrito en curso (F8): varios vivos a la vez, con etiqueta. */
export async function aparcarVenta(lineas: LineaEnEspera[], etiqueta: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  if (!lineas || lineas.length === 0) return { error: 'No hay nada que poner en espera.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('venta_en_espera')
    .insert({ empleado_id: user.id, sucursal_id: SUCURSAL, etiqueta: etiqueta.trim() || null, carrito: lineas } as never);
  if (error) return { error: 'No se pudo poner en espera.' };
  revalidatePath('/caja');
  return { ok: true };
}

/** Retoma un carrito aparcado: devuelve sus líneas y lo consume (queda vacío). */
export async function retomarEnEspera(id: string): Promise<{ ok?: true; lineas?: LineaEnEspera[]; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { data } = await supabase.from('venta_en_espera').select('carrito').eq('id', id).maybeSingle<{ carrito: LineaEnEspera[] }>();
  if (!data) return { error: 'Ese carrito ya no está.' };
  const lineas = Array.isArray(data.carrito) ? data.carrito : [];
  // Sin DELETE por RLS (el mostrador no borra): se consume dejándolo vacío.
  await supabase.from('venta_en_espera').update({ carrito: [] } as never).eq('id', id);
  revalidatePath('/caja');
  return { ok: true, lineas };
}

export interface AnularResultado {
  ok?: true;
  ya?: boolean;
  error?: string;
}

/**
 * Anula una venta COMPLETADA: devuelve cada cantidad al MISMO lote del que salió,
 * deja un movimiento `devolucion` (positivo) por línea en el libro inviolable, y
 * marca la venta como anulada con su motivo y su responsable. Nunca se borra: la
 * venta queda con rastro. Solo Dueño/Administrador (capacidad `anular_ventas`),
 * validado en el servidor. El motivo es OBLIGATORIO.
 */
export async function anularVenta(ventaId: string, motivo: string): Promise<AnularResultado> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'anular_ventas')) return { error: 'No autorizado para anular ventas.' };
  const razon = (motivo ?? '').trim();
  if (!razon) return { error: 'La anulación exige un motivo.' };
  if (!ventaId) return { error: 'Venta no indicada.' };

  const supabase = createClient();
  const { data: venta } = await supabase
    .from('venta')
    .select('id, estado')
    .eq('id', ventaId)
    .maybeSingle<{ id: string; estado: string }>();
  if (!venta) return { error: 'La venta no existe.' };
  if (venta.estado === 'anulada') return { ok: true, ya: true };
  if (venta.estado !== 'completada') return { error: 'Solo se anula una venta completada.' };

  const { data: lineasData } = await supabase
    .from('venta_linea')
    .select('producto_id, lote_id, cantidad')
    .eq('venta_id', ventaId);
  const lineas = (lineasData as unknown as Array<{ producto_id: string; lote_id: string | null; cantidad: number }>) ?? [];

  for (const l of lineas) {
    if (!l.lote_id) continue;
    const { data: lote } = await supabase
      .from('lote')
      .select('cantidad_actual')
      .eq('id', l.lote_id)
      .maybeSingle<{ cantidad_actual: number }>();
    const saldo = Number(lote?.cantidad_actual ?? 0) + Number(l.cantidad);
    await supabase.from('movimiento_inventario').insert({
      producto_id: l.producto_id,
      lote_id: l.lote_id,
      sucursal_id: SUCURSAL,
      tipo: 'devolucion',
      cantidad: Number(l.cantidad),
      cantidad_resultante: saldo,
      motivo: `Anulación de venta: ${razon}`,
      referencia: `anulacion:${ventaId}`,
      empleado_id: user.id,
    } as never);
    // Devolver al mismo lote y revivirlo si había quedado agotado.
    await supabase.from('lote').update({ cantidad_actual: saldo, estado: 'activo' } as never).eq('id', l.lote_id);
  }

  await supabase
    .from('venta')
    .update({ estado: 'anulada', anulada_motivo: razon, anulada_por: user.id, anulada_en: new Date().toISOString() } as never)
    .eq('id', ventaId);

  revalidatePath('/caja');
  return { ok: true };
}
