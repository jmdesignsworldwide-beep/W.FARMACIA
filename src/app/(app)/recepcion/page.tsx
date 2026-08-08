import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normaliza } from '@/lib/catalogos';
import { RecepcionCliente, type ProductoRec, type ProveedorRec } from './RecepcionCliente';

export const dynamic = 'force-dynamic';

export default async function RecepcionPage() {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  const { data: provData } = await supabase
    .from('proveedor')
    .select('id, nombre')
    .is('eliminado_en', null)
    .order('nombre');
  const proveedores: ProveedorRec[] = ((provData as unknown as Array<{ id: string; nombre: string }>) ?? []).map((p) => ({ id: p.id, nombre: p.nombre }));

  const { data: prodData } = await supabase
    .from('producto')
    .select('id, nombre, precio_venta, lote ( costo_unitario, fecha_recepcion )')
    .is('eliminado_en', null)
    .order('nombre');
  const productos: ProductoRec[] = ((prodData as unknown as Array<{ id: string; nombre: string; precio_venta: number | null; lote: Array<{ costo_unitario: number | null; fecha_recepcion: string | null }> }>) ?? []).map((p) => {
    const lotesOrd = [...(p.lote ?? [])].sort((a, b) => (b.fecha_recepcion ?? '').localeCompare(a.fecha_recepcion ?? ''));
    const costoAnterior = lotesOrd.find((l) => l.costo_unitario != null)?.costo_unitario ?? null;
    return { id: p.id, nombre: p.nombre, precio: Number(p.precio_venta ?? 0), costoAnterior: costoAnterior != null ? Number(costoAnterior) : null, busqueda: normaliza(p.nombre) };
  });

  return <RecepcionCliente proveedores={proveedores} productos={productos} />;
}
