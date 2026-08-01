import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { CatalogoTipo } from '@/lib/catalogos';
import { CatalogosClient, type ValorCatalogo } from './CatalogosClient';

/**
 * Pantalla de catálogos críticos (Adenda III §4). Solo Dueño/Admin
 * (requireCapability, barrera de servidor — §2.7). Aquí se gestionan
 * principio activo, forma farmacéutica y vía de administración, con
 * detección de duplicados parecidos al guardar. NUNCA desde el formulario
 * de producto, nunca automático.
 */
export const dynamic = 'force-dynamic';

export default async function CatalogosPage() {
  await requireCapability('gestionar_catalogos');
  const supabase = createClient();

  const [pa, ff, va, ct, fa, cc] = await Promise.all([
    supabase.from('principio_activo').select('id, nombre, activo').order('nombre'),
    supabase.from('forma_farmaceutica').select('id, nombre, activo').order('nombre'),
    supabase.from('via_administracion').select('id, nombre, activo').order('nombre'),
    supabase.from('clase_terapeutica').select('id, nombre, activo').order('nombre'),
    supabase.from('familia_alergenica').select('id, nombre, activo').order('nombre'),
    supabase.from('categoria_comercial').select('id, nombre, activo').order('nombre'),
  ]);

  const valores: Record<CatalogoTipo, ValorCatalogo[]> = {
    principio_activo: (pa.data as ValorCatalogo[]) ?? [],
    forma_farmaceutica: (ff.data as ValorCatalogo[]) ?? [],
    via_administracion: (va.data as ValorCatalogo[]) ?? [],
    clase_terapeutica: (ct.data as ValorCatalogo[]) ?? [],
    familia_alergenica: (fa.data as ValorCatalogo[]) ?? [],
    categoria_comercial: (cc.data as ValorCatalogo[]) ?? [],
  };

  return <CatalogosClient valores={valores} />;
}
