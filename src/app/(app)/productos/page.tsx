import Link from 'next/link';
import { Plus, Package, ShieldAlert, FileText, Pencil, Sparkles, GitCompareArrows } from 'lucide-react';
import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { formatConcentracion } from '@/lib/producto';

export const dynamic = 'force-dynamic';

interface ProductoRow {
  id: string;
  nombre: string;
  es_controlado: boolean;
  requiere_receta: boolean;
  forma_farmaceutica: { nombre: string } | null;
  via_administracion: { nombre: string } | null;
  laboratorio: { nombre: string } | null;
  producto_principio_activo: Array<{
    orden: number;
    concentracion_valor: number;
    concentracion_unidad: string;
    concentracion_volumen_valor: number | null;
    concentracion_volumen_unidad: string | null;
    principio_activo: { nombre: string } | null;
  }>;
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: { alt?: string };
}) {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  const { data } = await supabase
    .from('producto')
    .select(
      `id, nombre, es_controlado, requiere_receta,
       forma_farmaceutica:forma_farmaceutica_id ( nombre ),
       via_administracion:via_administracion_id ( nombre ),
       laboratorio:laboratorio_id ( nombre ),
       producto_principio_activo (
         orden, concentracion_valor, concentracion_unidad,
         concentracion_volumen_valor, concentracion_volumen_unidad,
         principio_activo:principio_activo_id ( nombre )
       )`,
    )
    .is('eliminado_en', null)
    .order('nombre');

  const productos = (data as unknown as ProductoRow[]) ?? [];
  const alt = searchParams.alt?.trim();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Productos</h1>
          <p className="mt-1 text-sm text-ink-soft">
            El maestro de la farmacia. Cada producto lleva su identidad clínica: principios activos y
            concentración.
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

      {productos.length === 0 ? (
        <LuminousCard neutral>
          <EmptyState
            titulo="Aún no hay productos"
            mensaje="Crea el primero. El catálogo se completa vendiendo: puedes cargar lo esencial ahora y enriquecerlo después."
            icon={<Package size={30} />}
            tone="accent"
            cta={
              <Link href="/productos/nuevo" className="inline-flex h-10 items-center gap-2 rounded-control brand-gradient px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95">
                <Plus size={17} /> Crear el primer producto
              </Link>
            }
          />
        </LuminousCard>
      ) : (
        <ul className="space-y-3">
          {productos.map((p) => {
            const principios = [...p.producto_principio_activo].sort((a, b) => a.orden - b.orden);
            return (
              <li key={p.id}>
                <LuminousCard neutral className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold text-ink">{p.nombre}</span>
                      {p.laboratorio?.nombre ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft">
                          {p.laboratorio.nombre}
                        </span>
                      ) : null}
                      {p.es_controlado ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                          <ShieldAlert size={12} /> Controlado
                        </span>
                      ) : null}
                      {p.requiere_receta ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                          <FileText size={12} /> Receta
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">
                      {principios.length > 0
                        ? principios
                            .map(
                              (pp) =>
                                `${pp.principio_activo?.nombre ?? '—'} ${formatConcentracion(
                                  pp.concentracion_valor,
                                  pp.concentracion_unidad,
                                  pp.concentracion_volumen_valor,
                                  pp.concentracion_volumen_unidad,
                                )}`,
                            )
                            .join('  +  ')
                        : 'Sin principios activos aún'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-ink-faint">
                      {[p.forma_farmaceutica?.nombre, p.via_administracion?.nombre].filter(Boolean).join(' · ') ||
                        'forma/vía pendiente'}
                    </span>
                    <Link
                      href={`/productos/${p.id}/equivalencias`}
                      aria-label={`Ver equivalentes de ${p.nombre}`}
                      title="Equivalentes"
                      className="flex h-9 w-9 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-accent"
                    >
                      <GitCompareArrows size={16} />
                    </Link>
                    <Link
                      href={`/productos/${p.id}/editar`}
                      aria-label={`Editar ${p.nombre}`}
                      title="Editar"
                      className="flex h-9 w-9 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-accent"
                    >
                      <Pencil size={16} />
                    </Link>
                  </div>
                </LuminousCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
