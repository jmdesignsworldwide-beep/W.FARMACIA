import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ProveedoresCliente, type ProveedorItem } from './ProveedoresCliente';

export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
  await requireCapability('gestionar_proveedores');
  const supabase = createClient();

  const { data } = await supabase
    .from('proveedor')
    .select('id, nombre, tipo, contacto_nombre, telefono, rnc, condiciones_pago, dias_entrega, acepta_devoluciones, dias_minimos_vida_util_devolucion, condiciones_devolucion, porcentaje_recuperacion')
    .is('eliminado_en', null)
    .order('nombre');

  // ── Ficha de cumplimiento (§3.4): se calcula sola de las recepciones ──
  const { data: recs } = await supabase
    .from('recepcion')
    .select('id, proveedor_id, fecha, recepcion_linea ( cantidad_pedida, cantidad_recibida, precio_cotizado, precio_facturado )')
    .eq('confirmada', true)
    .limit(2000);
  const { data: cxp } = await supabase.from('cuenta_por_pagar').select('proveedor_id, monto').eq('estado', 'pendiente');

  const fichaAcc = new Map<string, { compras: number; desde: string | null; pedida: number; recibida: number; precioOk: number; precioTotal: number }>();
  for (const r of (recs as unknown as Array<{ proveedor_id: string | null; fecha: string; recepcion_linea: Array<{ cantidad_pedida: number | null; cantidad_recibida: number; precio_cotizado: number | null; precio_facturado: number | null }> }>) ?? []) {
    if (!r.proveedor_id) continue;
    const a = fichaAcc.get(r.proveedor_id) ?? { compras: 0, desde: null, pedida: 0, recibida: 0, precioOk: 0, precioTotal: 0 };
    a.compras += 1;
    if (!a.desde || r.fecha < a.desde) a.desde = r.fecha;
    for (const l of r.recepcion_linea ?? []) {
      if (l.cantidad_pedida != null && Number(l.cantidad_pedida) > 0) { a.pedida += Number(l.cantidad_pedida); a.recibida += Number(l.cantidad_recibida); }
      if (l.precio_cotizado != null && l.precio_facturado != null) { a.precioTotal += 1; if (Number(l.precio_facturado) <= Number(l.precio_cotizado) + 0.001) a.precioOk += 1; }
    }
    fichaAcc.set(r.proveedor_id, a);
  }
  const pendientePago = new Map<string, number>();
  for (const c of (cxp as unknown as Array<{ proveedor_id: string | null; monto: number }>) ?? []) {
    if (c.proveedor_id) pendientePago.set(c.proveedor_id, (pendientePago.get(c.proveedor_id) ?? 0) + Number(c.monto));
  }

  const proveedores: ProveedorItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((p) => {
    const id = String(p.id);
    const acc = fichaAcc.get(id);
    const ficha = acc && acc.compras > 0 ? {
      compras: acc.compras,
      desde: acc.desde,
      completitudPct: acc.pedida > 0 ? Math.round((acc.recibida / acc.pedida) * 100) : null,
      precioHonradoPct: acc.precioTotal > 0 ? Math.round((acc.precioOk / acc.precioTotal) * 100) : null,
      pendientePago: pendientePago.get(id) ?? 0,
    } : null;
    return {
      id,
      nombre: String(p.nombre),
      tipo: String(p.tipo) as ProveedorItem['tipo'],
      contactoNombre: (p.contacto_nombre as string) ?? '',
      telefono: (p.telefono as string) ?? '',
      rnc: (p.rnc as string) ?? '',
      condicionesPago: (p.condiciones_pago as string) ?? '',
      diasEntrega: p.dias_entrega != null ? Number(p.dias_entrega) : null,
      aceptaDevoluciones: Boolean(p.acepta_devoluciones),
      diasMinimosVidaUtil: p.dias_minimos_vida_util_devolucion != null ? Number(p.dias_minimos_vida_util_devolucion) : null,
      condicionesDevolucion: (p.condiciones_devolucion as string) ?? '',
      porcentajeRecuperacion: p.porcentaje_recuperacion != null ? Number(p.porcentaje_recuperacion) : null,
      ficha,
    };
  });

  return <ProveedoresCliente proveedores={proveedores} />;
}
