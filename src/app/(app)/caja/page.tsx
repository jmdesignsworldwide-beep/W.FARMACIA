import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normaliza } from '@/lib/catalogos';
import { CajaCliente, type CatalogoItem } from './CajaCliente';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  nombre: string;
  precio_venta: number | null;
  exento_itbis: boolean | null;
  es_controlado: boolean | null;
  requiere_receta: boolean | null;
  codigo_barras: string | null;
  ubicacion_fisica_default: string | null;
  laboratorio: { nombre: string } | null;
  producto_principio_activo: Array<{
    principio_activo: { nombre: string; es_controlado: boolean | null; requiere_receta: boolean | null } | null;
  }>;
  lote: Array<{ cantidad_actual: number | null; estado: string; ubicacion_fisica: string | null; fecha_vencimiento: string | null }>;
}

export default async function CajaPage() {
  await requireCapability('ver_operacion');
  const supabase = createClient();

  // El catálogo se precarga UNA vez al abrir la caja: buscar nunca toca la red.
  const { data } = await supabase
    .from('producto')
    .select(
      `id, nombre, precio_venta, exento_itbis, es_controlado, requiere_receta, codigo_barras,
       ubicacion_fisica_default,
       laboratorio:laboratorio_id ( nombre ),
       producto_principio_activo ( principio_activo:principio_activo_id ( nombre, es_controlado, requiere_receta ) ),
       lote ( cantidad_actual, estado, ubicacion_fisica, fecha_vencimiento )`,
    )
    .is('eliminado_en', null)
    .order('nombre');

  const rows = (data as unknown as Row[]) ?? [];
  const catalogo: CatalogoItem[] = rows.map((p) => {
    const pas = p.producto_principio_activo ?? [];
    const molControlado = pas.some((x) => x.principio_activo?.es_controlado);
    const molReceta = pas.some((x) => x.principio_activo?.requiere_receta);
    const activos = (p.lote ?? []).filter((l) => l.estado === 'activo' && Number(l.cantidad_actual ?? 0) > 0);
    const existencia = activos.reduce((s, l) => s + Number(l.cantidad_actual ?? 0), 0);
    // Ubicación: la del producto por defecto, o la del lote que vence primero.
    const fefo = [...activos].sort((a, b) => (a.fecha_vencimiento ?? '9999').localeCompare(b.fecha_vencimiento ?? '9999'));
    const ubicacion = p.ubicacion_fisica_default ?? fefo[0]?.ubicacion_fisica ?? null;

    return {
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio_venta ?? 0),
      exentoItbis: Boolean(p.exento_itbis),
      controlado: p.es_controlado ?? molControlado,
      receta: p.requiere_receta ?? molReceta,
      existencia,
      ubicacion,
      busqueda: normaliza(
        [p.nombre, pas.map((x) => x.principio_activo?.nombre).filter(Boolean).join(' '), p.laboratorio?.nombre, p.codigo_barras]
          .filter(Boolean)
          .join(' '),
      ),
    };
  });

  return <CajaCliente catalogo={catalogo} />;
}
