import Link from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { normaliza } from '@/lib/catalogos';
import { formatConcentracion } from '@/lib/producto';
import { ProductosLista, type ProductoItem } from './ProductosLista';

export const dynamic = 'force-dynamic';

interface ProductoRow {
  id: string;
  nombre: string;
  es_controlado: boolean | null;
  requiere_receta: boolean | null;
  precio_venta: number | null;
  completitud: number | null;
  estado_verificacion: ProductoItem['estadoVerificacion'];
  codigo_barras: string | null;
  laboratorio: { nombre: string } | null;
  categoria: { nombre: string } | null;
  producto_principio_activo: Array<{
    orden: number;
    concentracion_valor: number;
    concentracion_unidad: string;
    concentracion_volumen_valor: number | null;
    concentracion_volumen_unidad: string | null;
    principio_activo: { nombre: string; es_controlado: boolean; requiere_receta: boolean } | null;
  }>;
  lote: Array<{ cantidad_actual: number; fecha_vencimiento: string | null; estado: string }>;
}

export default async function ProductosPage({ searchParams }: { searchParams: { alt?: string } }) {
  const user = await requireCapability('gestionar_inventario');
  const verFinanzas = can(user.role, 'ver_finanzas');
  const supabase = createClient();

  const { data } = await supabase
    .from('producto')
    .select(
      `id, nombre, es_controlado, requiere_receta, precio_venta, completitud, estado_verificacion, codigo_barras,
       laboratorio:laboratorio_id ( nombre ),
       categoria:categoria_comercial_id ( nombre ),
       producto_principio_activo (
         orden, concentracion_valor, concentracion_unidad,
         concentracion_volumen_valor, concentracion_volumen_unidad,
         principio_activo:principio_activo_id ( nombre, es_controlado, requiere_receta )
       ),
       lote ( cantidad_actual, fecha_vencimiento, estado )`,
    )
    .is('eliminado_en', null)
    .order('nombre');

  const rows = (data as unknown as ProductoRow[]) ?? [];

  const productos: ProductoItem[] = rows.map((p) => {
    const pas = [...p.producto_principio_activo].sort((a, b) => a.orden - b.orden);
    const principios = pas
      .map((pp) =>
        `${pp.principio_activo?.nombre ?? '—'} ${formatConcentracion(
          pp.concentracion_valor,
          pp.concentracion_unidad,
          pp.concentracion_volumen_valor,
          pp.concentracion_volumen_unidad,
        )}`,
      )
      .join('  +  ');
    // Candado EFECTIVO: el override del producto si se decidió (true/false), o la
    // herencia de la molécula (lo más restrictivo de sus principios) si es null.
    const molControlado = pas.some((pp) => pp.principio_activo?.es_controlado);
    const molReceta = pas.some((pp) => pp.principio_activo?.requiere_receta);
    const activos = (p.lote ?? []).filter((l) => l.estado === 'activo');
    const existencia = activos.reduce((s, l) => s + Number(l.cantidad_actual ?? 0), 0);
    const vencs = activos.map((l) => l.fecha_vencimiento).filter((f): f is string => Boolean(f)).sort();

    return {
      id: p.id,
      nombre: p.nombre,
      busqueda: normaliza(
        [p.nombre, pas.map((pp) => pp.principio_activo?.nombre).filter(Boolean).join(' '), p.laboratorio?.nombre, p.codigo_barras]
          .filter(Boolean)
          .join(' '),
      ),
      principios,
      laboratorio: p.laboratorio?.nombre ?? null,
      categoria: p.categoria?.nombre ?? null,
      controlado: p.es_controlado ?? molControlado,
      receta: p.requiere_receta ?? molReceta,
      completitud: p.completitud ?? 0,
      incompleto: (p.completitud ?? 0) < 100,
      estadoVerificacion: p.estado_verificacion ?? 'estimado',
      existencia,
      estimada: (p.estado_verificacion ?? 'estimado') !== 'verificado',
      precio: p.precio_venta,
      vencimientoIso: vencs[0] ?? null,
    };
  });

  const alt = searchParams.alt?.trim();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Productos</h1>
          <p className="mt-1 text-sm text-ink-soft">
            El maestro de la farmacia. Busca al instante y filtra; pensado para miles.
          </p>
        </div>
        <Link
          href="/productos/nuevo"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-control brand-gradient px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
        >
          <Plus size={17} /> Nuevo producto
        </Link>
      </header>

      {alt ? (
        <div className="mb-4 flex items-start gap-2 rounded-control border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-ink">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
          <span>
            Agregado como <span className="font-medium">marca alternativa</span> — es equivalente a{' '}
            <span className="font-medium">{alt}</span>. Ambas aparecerán juntas en el mostrador.
          </span>
        </div>
      ) : null}

      <ProductosLista productos={productos} verFinanzas={verFinanzas} />
    </div>
  );
}
