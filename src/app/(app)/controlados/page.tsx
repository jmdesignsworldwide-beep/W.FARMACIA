import { requireCapability, getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { can } from '@/lib/roles';
import { normaliza } from '@/lib/catalogos';
import { ControladosCliente, type ControladoProd, type LibroEntry } from './ControladosCliente';

export const dynamic = 'force-dynamic';

export default async function ControladosPage() {
  await requireCapability('despachar_controlados');
  const user = await getSessionUser();
  const puedeDespachar = user ? can(user.role, 'despachar_controlados') : false;
  const supabase = createClient();

  const { data: prodData } = await supabase
    .from('producto')
    .select('id, nombre, es_controlado, requiere_receta, producto_principio_activo ( principio_activo:principio_activo_id ( es_controlado, requiere_receta ) ), lote ( cantidad_actual, estado )')
    .is('eliminado_en', null)
    .order('nombre');
  const productos: ControladoProd[] = ((prodData as unknown as Array<Record<string, unknown>>) ?? [])
    .map((p) => {
      const pas = (p.producto_principio_activo as Array<{ principio_activo: { es_controlado: boolean | null; requiere_receta: boolean | null } | null }>) ?? [];
      const controlado = (p.es_controlado as boolean | null) ?? pas.some((x) => x.principio_activo?.es_controlado);
      const receta = (p.requiere_receta as boolean | null) ?? pas.some((x) => x.principio_activo?.requiere_receta);
      const existencia = ((p.lote as Array<{ cantidad_actual: number | null; estado: string }>) ?? []).filter((l) => l.estado === 'activo').reduce((s, l) => s + Number(l.cantidad_actual ?? 0), 0);
      return { id: String(p.id), nombre: String(p.nombre), controlado: Boolean(controlado), receta: Boolean(receta), existencia, busqueda: normaliza(String(p.nombre)) };
    })
    .filter((p) => p.controlado || p.receta);

  const { data: libroData } = await supabase
    .from('libro_controlado')
    .select('id, cantidad, paciente_nombre, despachado_en, producto:producto_id ( nombre ), farmaceutico:farmaceutico_id ( nombre )')
    .order('despachado_en', { ascending: false })
    .limit(30);
  const libro: LibroEntry[] = ((libroData as unknown as Array<Record<string, unknown>>) ?? []).map((e) => ({
    id: String(e.id),
    producto: (e.producto as { nombre?: string } | null)?.nombre ?? '—',
    paciente: (e.paciente_nombre as string) ?? '',
    cantidad: Number(e.cantidad),
    farmaceutico: (e.farmaceutico as { nombre?: string } | null)?.nombre ?? '—',
    fecha: String(e.despachado_en),
  }));

  return <ControladosCliente productos={productos} libro={libro} puedeDespachar={puedeDespachar} />;
}
