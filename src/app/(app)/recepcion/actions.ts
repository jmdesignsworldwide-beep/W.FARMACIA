'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export interface LineaRecepcion {
  productoId: string;
  cantidadPedida: number | null;
  cantidadRecibida: number;
  precioCotizado: number | null;
  precioFacturado: number | null;
  numeroLote: string;
  fechaVencimiento: string | null;
}

export interface RegistrarRecepcionInput {
  proveedorId: string | null;
  facturaNumero: string;
  lineas: LineaRecepcion[];
}

export async function registrarRecepcion(input: RegistrarRecepcionInput): Promise<{ ok?: true; error?: string; recepcionId?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No autorizado para recibir mercancía.' };
  const lineas = (input.lineas ?? []).filter((l) => l.productoId && Number(l.cantidadRecibida) > 0);
  if (lineas.length === 0) return { error: 'Agrega al menos un renglón con cantidad recibida.' };

  // Validación: fechas de vencimiento imposibles (en el pasado o a >20 años).
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const tope = new Date(hoy);
  tope.setFullYear(tope.getFullYear() + 20);
  for (const l of lineas) {
    if (l.fechaVencimiento) {
      const v = new Date(l.fechaVencimiento + 'T00:00:00');
      if (v < hoy) return { error: `Un lote tiene vencimiento en el pasado (${l.fechaVencimiento}).` };
      if (v > tope) return { error: `Un lote tiene un vencimiento imposible (${l.fechaVencimiento}).` };
    }
  }

  const supabase = createClient();

  const { data: recIns, error: eR } = await supabase
    .from('recepcion')
    .insert({ sucursal_id: SUCURSAL, proveedor_id: input.proveedorId, factura_numero: input.facturaNumero.trim() || null, recibido_por: user.id, confirmada: true } as never)
    .select('id')
    .single<{ id: string }>();
  if (eR || !recIns) return { error: 'No se pudo crear la recepción.' };
  const recepcionId = recIns.id;
  const fechaHoy = hoy.toISOString().slice(0, 10);

  for (const l of lineas) {
    const facturado = l.precioFacturado != null ? Number(l.precioFacturado) : null;

    // Costo anterior del producto (para la variación del historial).
    let costoAnterior: number | null = null;
    const { data: hc } = await supabase
      .from('historial_costo')
      .select('costo')
      .eq('producto_id', l.productoId)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle<{ costo: number }>();
    costoAnterior = hc?.costo != null ? Number(hc.costo) : null;

    // Crear el lote recibido.
    const { data: loteIns } = await supabase
      .from('lote')
      .insert({
        producto_id: l.productoId,
        sucursal_id: SUCURSAL,
        numero_lote: l.numeroLote.trim() || null,
        fecha_vencimiento: l.fechaVencimiento || null,
        cantidad_actual: Number(l.cantidadRecibida),
        costo_unitario: facturado,
        proveedor_id: input.proveedorId,
        fecha_recepcion: fechaHoy,
        estado: 'activo',
      } as never)
      .select('id')
      .single<{ id: string }>();
    const loteId = loteIns?.id ?? null;

    // Movimiento de entrada (inviolable).
    await supabase.from('movimiento_inventario').insert({
      producto_id: l.productoId,
      lote_id: loteId,
      sucursal_id: SUCURSAL,
      tipo: 'entrada',
      cantidad: Number(l.cantidadRecibida),
      cantidad_resultante: Number(l.cantidadRecibida),
      costo_unitario_momento: facturado,
      motivo: `Recepción${input.facturaNumero ? ' factura ' + input.facturaNumero : ''}`,
      referencia: `recepcion:${recepcionId}`,
      empleado_id: user.id,
    } as never);

    // Historial de costo con variación.
    if (facturado != null) {
      const variacion = costoAnterior && costoAnterior > 0 ? ((facturado - costoAnterior) / costoAnterior) * 100 : null;
      await supabase.from('historial_costo').insert({
        producto_id: l.productoId,
        proveedor_id: input.proveedorId,
        lote_id: loteId,
        costo: facturado,
        variacion_porcentual: variacion != null ? Math.round(variacion * 100) / 100 : null,
        fecha: fechaHoy,
      } as never);
    }

    // Renglón de recepción (discrepancias se calculan solas).
    await supabase.from('recepcion_linea').insert({
      recepcion_id: recepcionId,
      producto_id: l.productoId,
      cantidad_pedida: l.cantidadPedida,
      cantidad_recibida: Number(l.cantidadRecibida),
      precio_cotizado: l.precioCotizado,
      precio_facturado: facturado,
      numero_lote: l.numeroLote.trim() || null,
      fecha_vencimiento: l.fechaVencimiento || null,
      lote_id: loteId,
    } as never);
  }

  revalidatePath('/recepcion');
  revalidatePath('/productos');
  return { ok: true, recepcionId };
}
