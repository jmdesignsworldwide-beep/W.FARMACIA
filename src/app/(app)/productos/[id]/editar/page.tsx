import { notFound } from 'next/navigation';
import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  ProductoForm,
  type OpcionCatalogo,
  type ProductoInicial,
  type RenglonPrincipio,
} from '../../nuevo/ProductoForm';
import type { UnidadConcentracion, UnidadVolumen } from '@/lib/supabase/types';
import { estadoVentaLibre } from '@/lib/ventaLibre';

export const dynamic = 'force-dynamic';

interface ProductoDB {
  id: string;
  nombre: string;
  forma_farmaceutica_id: string | null;
  via_administracion_id: string | null;
  unidad_base: string | null;
  unidad_caja: string | null;
  factor_caja: number | null;
  precio_venta: number | null;
  precio_caja: number | null;
  margen_objetivo: number | null;
  es_controlado: boolean | null;
  requiere_receta: boolean | null;
  motivo_control: string | null;
  motivo_receta: string | null;
  exento_itbis: boolean;
  codigo_barras: string | null;
  registro_sanitario: string | null;
  laboratorio: { nombre: string } | null;
  presentacion: { nombre: string } | null;
  producto_principio_activo: Array<{
    orden: number;
    principio_activo_id: string;
    concentracion_valor: number;
    concentracion_unidad: string;
    concentracion_volumen_valor: number | null;
    concentracion_volumen_unidad: string | null;
  }>;
}

const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));

async function overrideActor(
  supabase: ReturnType<typeof createClient>,
  productoId: string,
  campo: 'motivo_control' | 'motivo_receta',
): Promise<string | null> {
  // Quién bajó el candado, del audit_log (solo Dueño/Admin lo lee por RLS; para
  // otros roles queda null y se muestra "sobrescrito" sin el nombre).
  const { data } = await supabase
    .from('audit_log')
    .select('actor_id, datos, ocurrido_en')
    .eq('tabla', 'producto')
    .eq('registro_id', productoId)
    .eq('operacion', 'UPDATE')
    .order('ocurrido_en', { ascending: false })
    .limit(30);
  const entry = (data as { actor_id: string | null; datos: Record<string, unknown> }[] | null)?.find(
    (e) => e.datos?.[campo],
  );
  if (!entry?.actor_id) return null;
  const { data: prof } = await supabase
    .from('profiles')
    .select('nombre')
    .eq('id', entry.actor_id)
    .maybeSingle<{ nombre: string }>();
  return prof?.nombre ?? null;
}

export default async function EditarProductoPage({ params }: { params: { id: string } }) {
  const user = await requireCapability('gestionar_inventario');
  const puedeBajar = user.role === 'dueno' || user.role === 'administrador';
  const supabase = createClient();

  const [prodRes, pa, ff, va, lab, pre] = await Promise.all([
    supabase
      .from('producto')
      .select(
        `id, nombre, forma_farmaceutica_id, via_administracion_id, unidad_base, unidad_caja,
         factor_caja, precio_venta, precio_caja, margen_objetivo, es_controlado, requiere_receta,
         motivo_control, motivo_receta, exento_itbis, codigo_barras, registro_sanitario,
         laboratorio:laboratorio_id ( nombre ),
         presentacion:presentacion_id ( nombre ),
         producto_principio_activo ( orden, principio_activo_id, concentracion_valor,
           concentracion_unidad, concentracion_volumen_valor, concentracion_volumen_unidad )`,
      )
      .eq('id', params.id)
      .is('eliminado_en', null)
      .maybeSingle(),
    supabase.from('principio_activo').select('id, nombre, es_controlado, requiere_receta').eq('activo', true).order('nombre'),
    supabase.from('forma_farmaceutica').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('via_administracion').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('laboratorio').select('nombre').eq('activo', true).order('nombre'),
    supabase.from('presentacion').select('nombre').eq('activo', true).order('nombre'),
  ]);

  const p = prodRes.data as unknown as ProductoDB | null;
  if (!p) notFound();

  const sobrescritoControlPor = p.es_controlado === false ? await overrideActor(supabase, p.id, 'motivo_control') : null;
  const sobrescritoRecetaPor = p.requiere_receta === false ? await overrideActor(supabase, p.id, 'motivo_receta') : null;
  const estadoMvl = await estadoVentaLibre(supabase);

  const principios: RenglonPrincipio[] = [...p.producto_principio_activo]
    .sort((a, b) => a.orden - b.orden)
    .map((pp) => ({
      principio_activo_id: pp.principio_activo_id,
      valor: s(pp.concentracion_valor),
      unidad: pp.concentracion_unidad as UnidadConcentracion,
      volVal: s(pp.concentracion_volumen_valor),
      volUnidad: (pp.concentracion_volumen_unidad ?? '') as '' | UnidadVolumen,
    }));

  const inicial: ProductoInicial = {
    id: p.id,
    nombre: p.nombre,
    forma_farmaceutica_id: p.forma_farmaceutica_id ?? '',
    via_administracion_id: p.via_administracion_id ?? '',
    laboratorio: p.laboratorio?.nombre ?? '',
    presentacion: p.presentacion?.nombre ?? '',
    unidad_base: p.unidad_base ?? '',
    unidad_caja: p.unidad_caja ?? '',
    factor_caja: s(p.factor_caja),
    precio_venta: s(p.precio_venta),
    precio_caja: s(p.precio_caja),
    margen_objetivo: s(p.margen_objetivo),
    es_controlado: p.es_controlado,
    requiere_receta: p.requiere_receta,
    motivo_control: p.motivo_control ?? '',
    motivo_receta: p.motivo_receta ?? '',
    exento_itbis: p.exento_itbis,
    codigo_barras: p.codigo_barras ?? '',
    registro_sanitario: p.registro_sanitario ?? '',
    principios,
  };

  return (
    <ProductoForm
      inicial={inicial}
      principiosCatalogo={(pa.data as unknown as OpcionCatalogo[]) ?? []}
      formas={(ff.data as unknown as OpcionCatalogo[]) ?? []}
      vias={(va.data as unknown as OpcionCatalogo[]) ?? []}
      laboratorios={((lab.data as unknown as { nombre: string }[]) ?? []).map((x) => x.nombre)}
      presentaciones={((pre.data as unknown as { nombre: string }[]) ?? []).map((x) => x.nombre)}
      puedeBajarCandado={puedeBajar}
      sobrescritoControlPor={sobrescritoControlPor}
      sobrescritoRecetaPor={sobrescritoRecetaPor}
      estadoMvl={estadoMvl}
    />
  );
}
