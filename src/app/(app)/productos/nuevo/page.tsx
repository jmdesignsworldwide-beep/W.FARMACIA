import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ProductoForm, type OpcionCatalogo } from './ProductoForm';

export const dynamic = 'force-dynamic';

export default async function NuevoProductoPage() {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  const [pa, ff, va] = await Promise.all([
    supabase.from('principio_activo').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('forma_farmaceutica').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('via_administracion').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  return (
    <ProductoForm
      principiosCatalogo={(pa.data as unknown as OpcionCatalogo[]) ?? []}
      formas={(ff.data as unknown as OpcionCatalogo[]) ?? []}
      vias={(va.data as unknown as OpcionCatalogo[]) ?? []}
    />
  );
}
