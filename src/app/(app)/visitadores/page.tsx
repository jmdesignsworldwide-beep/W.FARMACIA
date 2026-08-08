import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normaliza } from '@/lib/catalogos';
import { VisitadoresCliente, type VisitaItem, type ProductoMin } from './VisitadoresCliente';

export const dynamic = 'force-dynamic';

export default async function VisitadoresPage() {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  const { data: prodData } = await supabase.from('producto').select('id, nombre').is('eliminado_en', null).order('nombre');
  const productos: ProductoMin[] = ((prodData as unknown as Array<{ id: string; nombre: string }>) ?? []).map((p) => ({ id: p.id, nombre: p.nombre, busqueda: normaliza(p.nombre) }));

  const { data } = await supabase
    .from('visita_medica')
    .select('id, laboratorio, visitador, fecha, notas')
    .order('fecha', { ascending: false })
    .limit(30);
  const visitas: VisitaItem[] = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((v) => ({
    id: String(v.id), laboratorio: String(v.laboratorio), visitador: (v.visitador as string) ?? '', fecha: String(v.fecha), notas: (v.notas as string) ?? '',
  }));

  return <VisitadoresCliente productos={productos} visitas={visitas} />;
}
