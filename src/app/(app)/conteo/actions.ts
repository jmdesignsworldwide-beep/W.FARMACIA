'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { formatMoney } from '@/lib/format';
import {
  UMBRAL_DISCREPANCIA_RD,
  TAMANO_LISTA_DIARIA,
  proponerCausa,
  type MovimientoReciente,
} from '@/lib/conteo';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

async function actor() {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return null;
  return user;
}

/**
 * Umbral de discrepancia CONFIGURABLE desde Ajustes (clave `umbral_discrepancia_conteo`).
 * Cae a la constante `UMBRAL_DISCREPANCIA_RD` (RD$5,000) si no está configurado —
 * "una farmacia grande y una pequeña no tienen el mismo umbral" (PENDIENTES · Tanda 3).
 */
async function umbralDiscrepancia(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'umbral_discrepancia_conteo')
    .eq('sucursal_id', SUCURSAL)
    .maybeSingle<{ valor: unknown }>();
  const v = Number(data?.valor);
  return v > 0 ? v : UMBRAL_DISCREPANCIA_RD;
}

/** Resultado revelado de una línea (lo que ve el humano tras contar a ciegas). */
export interface LineaRevelada {
  lineaId: string;
  cantidadSistema: number;
  cantidadContada: number;
  diferencia: number;
  valor: number; // RD$ (con signo)
  causaSugerida: string;
  requiereAutorizacion: boolean; // |valor| ≥ umbral
}

/**
 * Abre (o retoma) el conteo del día: 10–15 productos priorizados por valor y
 * antigüedad de verificación. La velocidad de venta se suma cuando el POS venda
 * (Tanda 4); hoy no hay ventas, así que se prioriza por valor + antigüedad.
 * La `cantidad_sistema` se congela aquí (lo que el sistema cree) para el conteo
 * a ciegas: la app no la muestra hasta revelar.
 */
export async function abrirConteoDelDia(): Promise<{ conteoId?: string; error?: string }> {
  const user = await actor();
  if (!user) return { error: 'No autorizado.' };
  const supabase = createClient();

  // ¿Hay un conteo abierto? Se retoma en vez de crear otro.
  const { data: abierto } = await supabase
    .from('conteo_ciclico')
    .select('id')
    .neq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (abierto) return { conteoId: abierto.id };

  // Candidatos: lotes activos con existencia, con su producto.
  const { data: lotes, error: eLotes } = await supabase
    .from('lote')
    .select(
      `id, cantidad_actual, producto_id,
       producto:producto_id ( id, nombre, precio_venta, estado_verificacion, fecha_ultima_verificacion )`,
    )
    .eq('estado', 'activo')
    .gt('cantidad_actual', 0);
  if (eLotes) return { error: 'No se pudieron leer los lotes.' };

  type Fila = {
    id: string;
    cantidad_actual: number | null;
    producto_id: string;
    producto: {
      id: string;
      nombre: string;
      precio_venta: number | null;
      estado_verificacion: string | null;
      fecha_ultima_verificacion: string | null;
    } | null;
  };
  const filas = (lotes as unknown as Fila[]) ?? [];

  // Agrupa por producto para priorizar PRODUCTOS (no lotes sueltos).
  const porProducto = new Map<string, { valor: number; noVerif: boolean; antiguedad: number; lotes: Fila[] }>();
  for (const f of filas) {
    if (!f.producto) continue;
    const precio = Number(f.producto.precio_venta ?? 0);
    const val = precio * Number(f.cantidad_actual ?? 0);
    const noVerif = (f.producto.estado_verificacion ?? 'estimado') !== 'verificado';
    const antig = f.producto.fecha_ultima_verificacion
      ? Date.parse(f.producto.fecha_ultima_verificacion)
      : 0; // nunca verificado → más antiguo
    const cur = porProducto.get(f.producto_id) ?? { valor: 0, noVerif, antiguedad: antig, lotes: [] };
    cur.valor += val;
    cur.noVerif = cur.noVerif || noVerif;
    cur.antiguedad = Math.min(cur.antiguedad, antig);
    cur.lotes.push(f);
    porProducto.set(f.producto_id, cur);
  }

  // Orden: primero los NO verificados; luego mayor valor; luego más antiguos.
  const productos = [...porProducto.values()].sort((a, b) => {
    if (a.noVerif !== b.noVerif) return a.noVerif ? -1 : 1;
    if (b.valor !== a.valor) return b.valor - a.valor;
    return a.antiguedad - b.antiguedad;
  });
  const elegidos = productos.slice(0, TAMANO_LISTA_DIARIA);
  if (elegidos.length === 0) return { error: 'No hay productos con existencia para contar.' };

  // Crea el conteo y una línea POR LOTE (conteo por lote, preserva FEFO).
  const { data: conteo, error: eConteo } = await supabase
    .from('conteo_ciclico')
    .insert({ sucursal_id: SUCURSAL, empleado_id: user.id, estado: 'en_proceso' } as never)
    .select('id')
    .single<{ id: string }>();
  if (eConteo || !conteo) return { error: 'No se pudo crear el conteo.' };

  const lineas = elegidos.flatMap((p) =>
    p.lotes.map((l) => ({
      conteo_id: conteo.id,
      producto_id: l.producto_id,
      lote_id: l.id,
      cantidad_sistema: Number(l.cantidad_actual ?? 0), // congelada para el conteo a ciegas
    })),
  );
  const { error: eLineas } = await supabase.from('conteo_ciclico_linea').insert(lineas as never);
  if (eLineas) return { error: 'No se pudieron crear las líneas del conteo.' };

  revalidatePath('/conteo');
  return { conteoId: conteo.id };
}

/** Guarda lo contado SIN revelar la cantidad del sistema (conteo a ciegas). */
export async function guardarConteoLinea(
  lineaId: string,
  cantidadContada: number,
): Promise<{ ok?: true; error?: string }> {
  const user = await actor();
  if (!user) return { error: 'No autorizado.' };
  if (!(cantidadContada >= 0)) return { error: 'La cantidad contada no puede ser negativa.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('conteo_ciclico_linea')
    .update({ cantidad_contada: cantidadContada } as never)
    .eq('id', lineaId);
  if (error) return { error: 'No se pudo guardar el conteo.' };
  return { ok: true };
}

/**
 * Revela: compara lo contado contra la cantidad del sistema, calcula el valor
 * en RD$ y PROPONE una causa (§Innovación 5) revisando los movimientos
 * recientes. No toca los libros: eso ocurre al confirmar.
 */
export async function revelarConteo(conteoId: string): Promise<{ lineas?: LineaRevelada[]; error?: string }> {
  const user = await actor();
  if (!user) return { error: 'No autorizado.' };
  const supabase = createClient();

  const { data, error } = await supabase
    .from('conteo_ciclico_linea')
    .select(
      `id, producto_id, lote_id, cantidad_sistema, cantidad_contada,
       producto:producto_id ( precio_venta )`,
    )
    .eq('conteo_id', conteoId)
    .not('cantidad_contada', 'is', null);
  if (error) return { error: 'No se pudo revelar el conteo.' };
  const umbral = await umbralDiscrepancia(supabase);

  type L = {
    id: string;
    producto_id: string;
    lote_id: string | null;
    cantidad_sistema: number | null;
    cantidad_contada: number | null;
    producto: { precio_venta: number | null } | null;
  };
  const lineas = (data as unknown as L[]) ?? [];
  const out: LineaRevelada[] = [];

  for (const l of lineas) {
    const sistema = Number(l.cantidad_sistema ?? 0);
    const contada = Number(l.cantidad_contada ?? 0);
    const diferencia = contada - sistema;
    const precio = Number(l.producto?.precio_venta ?? 0);
    const valor = diferencia * precio;

    let causa = 'Sin diferencia.';
    if (diferencia !== 0) {
      const { data: movs } = await supabase
        .from('movimiento_inventario')
        .select('tipo, cantidad, motivo_tipificado, ocurrido_en')
        .eq('producto_id', l.producto_id)
        .order('ocurrido_en', { ascending: false })
        .limit(20);
      causa = proponerCausa(((movs as unknown as MovimientoReciente[]) ?? []), diferencia);
    }

    out.push({
      lineaId: l.id,
      cantidadSistema: sistema,
      cantidadContada: contada,
      diferencia,
      valor,
      causaSugerida: causa,
      requiereAutorizacion: Math.abs(valor) >= umbral,
    });
  }
  return { lineas: out };
}

/**
 * Confirma y CORRIGE (Camino A que aprobó Marien): la persona vio la diferencia
 * y su valor y confirma explícitamente. Si la diferencia supera el umbral en
 * RD$, exige motivo y rol Dueño/Administrador. La corrección emite un movimiento
 * `conteo` (guarda AMBAS cantidades: sistema y contada), registra la discrepancia
 * permanente, ajusta la existencia del lote y marca el producto verificado.
 * Idempotente: si ya se aplicó (movimiento con la referencia de la línea), no
 * repite.
 */
export async function confirmarCorreccion(input: {
  lineaId: string;
  causaSugerida?: string;
  causaConfirmada?: string;
  motivo?: string;
}): Promise<{ ok?: true; yaConfirmado?: true; error?: string }> {
  const user = await actor();
  if (!user) return { error: 'No autorizado.' };
  const supabase = createClient();

  const { data: linea, error: eLinea } = await supabase
    .from('conteo_ciclico_linea')
    .select(
      `id, conteo_id, producto_id, lote_id, cantidad_sistema, cantidad_contada,
       producto:producto_id ( precio_venta ),
       lote:lote_id ( costo_unitario )`,
    )
    .eq('id', input.lineaId)
    .maybeSingle();
  if (eLinea || !linea) return { error: 'No se encontró la línea del conteo.' };

  const l = linea as unknown as {
    id: string;
    conteo_id: string;
    producto_id: string;
    lote_id: string | null;
    cantidad_sistema: number | null;
    cantidad_contada: number | null;
    producto: { precio_venta: number | null } | null;
    lote: { costo_unitario: number | null } | null;
  };
  if (l.cantidad_contada === null) return { error: 'Esta línea aún no se ha contado.' };

  const referencia = `conteo-linea:${l.id}`;

  // Idempotencia: ¿ya se emitió el movimiento de esta línea?
  const { data: ya } = await supabase
    .from('movimiento_inventario')
    .select('id')
    .eq('referencia', referencia)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (ya) return { ok: true, yaConfirmado: true };

  const sistema = Number(l.cantidad_sistema ?? 0);
  const contada = Number(l.cantidad_contada ?? 0);
  const diferencia = contada - sistema;
  const precio = Number(l.producto?.precio_venta ?? 0);
  const valor = diferencia * precio;
  const motivo = input.motivo?.trim() || '';

  // Gate por umbral (condición 2 de Marien) — configurable desde Ajustes.
  const umbral = await umbralDiscrepancia(supabase);
  if (Math.abs(valor) >= umbral) {
    if (user.role !== 'dueno' && user.role !== 'administrador') {
      return {
        error: `Una diferencia de ${formatMoney(Math.abs(valor))} requiere autorización del Dueño o Administrador.`,
      };
    }
    if (!motivo) {
      return { error: `Una diferencia de ${formatMoney(Math.abs(valor))} exige un motivo.` };
    }
  }

  // Sin diferencia → solo se marca verificado.
  if (diferencia !== 0) {
    // 1) Discrepancia permanente (append-only) con su valor en RD$.
    const { error: eDisc } = await supabase.from('discrepancia_inventario').insert({
      producto_id: l.producto_id,
      lote_id: l.lote_id,
      conteo_id: l.conteo_id,
      diferencia,
      valor,
      causa_sugerida: input.causaSugerida?.trim() || null,
      causa_confirmada: input.causaConfirmada?.trim() || null,
      empleado_id: user.id,
    } as never);
    if (eDisc) return { error: 'No se pudo registrar la discrepancia.' };

    // 2) Movimiento `conteo` — guarda AMBAS cantidades (condición 3).
    const nota =
      `Conteo cíclico: sistema=${sistema} contada=${contada}` + (motivo ? ` · ${motivo}` : '');
    const { error: eMov } = await supabase.from('movimiento_inventario').insert({
      producto_id: l.producto_id,
      lote_id: l.lote_id,
      sucursal_id: SUCURSAL,
      tipo: 'conteo',
      cantidad: diferencia, // delta (sistema recuperable = contada − delta)
      cantidad_resultante: contada, // saldo tras el conteo = lo contado
      costo_unitario_momento: l.lote?.costo_unitario ?? null,
      motivo: nota,
      referencia,
      empleado_id: user.id,
    } as never);
    if (eMov) return { error: 'No se pudo registrar el movimiento de conteo.' };

    // 3) Corrige la existencia del lote (deja el número bien, con rastro).
    if (l.lote_id) {
      const { error: eLote } = await supabase
        .from('lote')
        .update({ cantidad_actual: contada } as never)
        .eq('id', l.lote_id);
      if (eLote) return { error: 'No se pudo ajustar la existencia del lote.' };
    }
  }

  // 4) Producto verificado (el número ahora cuadra; la discrepancia queda en el libro).
  await supabase
    .from('producto')
    .update({
      estado_verificacion: 'verificado',
      fecha_ultima_verificacion: new Date().toISOString(),
      verificado_por: user.id,
    } as never)
    .eq('id', l.producto_id);

  await supabase
    .from('conteo_ciclico_linea')
    .update({ valor_diferencia: valor } as never)
    .eq('id', l.id);

  revalidatePath('/conteo');
  revalidatePath('/productos');
  return { ok: true };
}

/** Cierra el conteo (todas las líneas atendidas). */
export async function cerrarConteo(conteoId: string): Promise<{ ok?: true; error?: string }> {
  const user = await actor();
  if (!user) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('conteo_ciclico').update({ estado: 'cerrado' } as never).eq('id', conteoId);
  if (error) return { error: 'No se pudo cerrar el conteo.' };
  revalidatePath('/conteo');
  return { ok: true };
}
