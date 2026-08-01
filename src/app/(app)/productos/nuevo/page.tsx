import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ProductoForm, type OpcionCatalogo } from './ProductoForm';

export const dynamic = 'force-dynamic';

export default async function NuevoProductoPage() {
  const user = await requireCapability('gestionar_inventario');
  const puedeBajar = user.role === 'dueno' || user.role === 'administrador';
  const supabase = createClient();

  const [pa, ff, va, lab, pre] = await Promise.all([
    supabase.from('principio_activo').select('id, nombre, es_controlado, requiere_receta').eq('activo', true).order('nombre'),
    supabase.from('forma_farmaceutica').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('via_administracion').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('laboratorio').select('nombre').eq('activo', true).order('nombre'),
    supabase.from('presentacion').select('nombre').eq('activo', true).order('nombre'),
  ]);

  return (
    <ProductoForm
      principiosCatalogo={(pa.data as unknown as OpcionCatalogo[]) ?? []}
      formas={(ff.data as unknown as OpcionCatalogo[]) ?? []}
      vias={(va.data as unknown as OpcionCatalogo[]) ?? []}
      laboratorios={((lab.data as unknown as { nombre: string }[]) ?? []).map((x) => x.nombre)}
      presentaciones={((pre.data as unknown as { nombre: string }[]) ?? []).map((x) => x.nombre)}
      puedeBajarCandado={puedeBajar}
    />
  );
}
