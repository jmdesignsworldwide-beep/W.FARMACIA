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

  const proveedores: ProveedorItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((p) => ({
    id: String(p.id),
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
  }));

  return <ProveedoresCliente proveedores={proveedores} />;
}
