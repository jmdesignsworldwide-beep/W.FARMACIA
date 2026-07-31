import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldCheck, TriangleAlert, Package, Boxes, FlaskConical } from 'lucide-react';
import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { formatConcentracion } from '@/lib/producto';

export const dynamic = 'force-dynamic';

interface PrincipioRow {
  orden: number;
  concentracion_valor: number;
  concentracion_unidad: string;
  concentracion_volumen_valor: number | null;
  concentracion_volumen_unidad: string | null;
  principio_activo: { nombre: string } | null;
}

interface ProductoRel {
  id: string;
  nombre: string;
  firma_equivalencia: string | null;
  firma_molecula: string | null;
  laboratorio: { nombre: string } | null;
  forma_farmaceutica: { nombre: string } | null;
  via_administracion: { nombre: string } | null;
  producto_principio_activo: PrincipioRow[];
}

const SELECT_PRODUCTO = `id, nombre, firma_equivalencia, firma_molecula,
  forma_farmaceutica:forma_farmaceutica_id ( nombre ),
  via_administracion:via_administracion_id ( nombre ),
  laboratorio:laboratorio_id ( nombre ),
  producto_principio_activo (
    orden, concentracion_valor, concentracion_unidad,
    concentracion_volumen_valor, concentracion_volumen_unidad,
    principio_activo:principio_activo_id ( nombre )
  )`;

/** Texto "Losartán 50 mg + Hidroclorotiazida 12.5 mg" a partir de los renglones. */
function principiosTexto(rows: PrincipioRow[]): string {
  if (rows.length === 0) return 'Sin principios activos';
  return [...rows]
    .sort((a, b) => a.orden - b.orden)
    .map(
      (pp) =>
        `${pp.principio_activo?.nombre ?? '—'} ${formatConcentracion(
          pp.concentracion_valor,
          pp.concentracion_unidad,
          pp.concentracion_volumen_valor,
          pp.concentracion_volumen_unidad,
        )}`,
    )
    .join('  +  ');
}

/**
 * Hueco de EXISTENCIA — diseñado ya, pendiente para la Tanda 3 (inventario).
 * Un equivalente agotado no salva la venta, así que en la Tanda 3 este espacio
 * se llena con la existencia por sucursal y el orden por defecto será: primero
 * lo que hay, lo agotado abajo / tras "ver todos". Aquí queda el molde para no
 * rehacer la pantalla: solo hay que reemplazar el contenido de este bloque.
 */
function HuecoExistencia() {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 rounded-control border border-dashed border-line px-2.5 py-1 text-[11px] text-ink-faint"
      title="La existencia por sucursal llega en la Tanda 3 (inventario)"
    >
      <Boxes size={13} />
      <span>Existencia · Tanda&nbsp;3</span>
    </div>
  );
}

function FilaProducto({ p, tono }: { p: ProductoRel; tono: 'real' | 'verificar' }) {
  const anillo =
    tono === 'real'
      ? 'border-accent/25 bg-accent/[0.04]'
      : 'border-warning/30 bg-warning/[0.06]';
  return (
    <li
      className={`flex flex-col gap-2 rounded-control border ${anillo} px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-semibold text-ink">{p.nombre}</span>
          {/* Laboratorio SIEMPRE visible: es una marca alternativa, no un error. */}
          {p.laboratorio?.nombre ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                tono === 'real' ? 'bg-accent/12 text-accent' : 'bg-surface-2 text-ink-soft'
              }`}
            >
              {p.laboratorio.nombre}
            </span>
          ) : (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-faint">
              laboratorio sin registrar
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-soft">{principiosTexto(p.producto_principio_activo)}</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {[p.forma_farmaceutica?.nombre, p.via_administracion?.nombre].filter(Boolean).join(' · ') ||
            'forma/vía pendiente'}
        </p>
      </div>
      <HuecoExistencia />
    </li>
  );
}

export default async function EquivalenciasPage({ params }: { params: { id: string } }) {
  await requireCapability('gestionar_inventario');
  const supabase = createClient();

  // Producto base (la fila que estás mirando): lectura por PK.
  const { data: baseData } = await supabase
    .from('producto')
    .select(SELECT_PRODUCTO)
    .eq('id', params.id)
    .is('eliminado_en', null)
    .maybeSingle();
  const base = baseData as unknown as ProductoRel | null;
  if (!base) notFound();

  // ¿Identidad clínica completa? Sin forma/vía/principios (o firma con '?')
  // no se puede buscar equivalencia — y una firma incompleta ('…##') no debe
  // matchear con otros incompletos. Ese es un estado propio, no "sin equivalente".
  const completo =
    Boolean(base.forma_farmaceutica?.nombre) &&
    Boolean(base.via_administracion?.nombre) &&
    base.producto_principio_activo.length > 0 &&
    Boolean(base.firma_molecula) &&
    !(base.firma_equivalencia ?? '').includes('?');

  // ── LA consulta del panel: una sola, indexada por firma_molecula. ──
  // Trae de un golpe los dos grupos (equivalentes reales + "casi coinciden");
  // la partición se hace en memoria comparando la firma completa.
  let relacionados: ProductoRel[] = [];
  if (completo) {
    const { data } = await supabase
      .from('producto')
      .select(SELECT_PRODUCTO)
      .eq('firma_molecula', base.firma_molecula as string)
      .is('eliminado_en', null)
      .neq('id', base.id)
      .order('nombre');
    relacionados = (data as unknown as ProductoRel[]) ?? [];
  }

  const equivalentes = relacionados.filter((r) => r.firma_equivalencia === base.firma_equivalencia);
  const casiCoinciden = relacionados.filter((r) => r.firma_equivalencia !== base.firma_equivalencia);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/productos"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeft size={16} /> Productos
      </Link>

      {/* Producto base: qué estás resolviendo en el mostrador */}
      <LuminousCard neutral className="mt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Buscando equivalentes de</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-bold text-ink">{base.nombre}</h1>
          {base.laboratorio?.nombre ? (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft">
              {base.laboratorio.nombre}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-soft">
          <FlaskConical size={14} className="shrink-0 text-ink-faint" />
          {principiosTexto(base.producto_principio_activo)}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {[base.forma_farmaceutica?.nombre, base.via_administracion?.nombre].filter(Boolean).join(' · ') ||
            'forma/vía pendiente'}
        </p>
      </LuminousCard>

      {!completo ? (
        <LuminousCard neutral className="mt-4">
          <EmptyState
            titulo="Complétalo para buscar equivalentes"
            mensaje="Este producto aún no tiene forma, vía o principios activos. La equivalencia se calcula sobre su identidad clínica: complétala y aquí aparecerán sus equivalentes."
            icon={<FlaskConical size={28} />}
            tone="accent"
            cta={
              <Link
                href={`/productos/${base.id}/editar`}
                className="inline-flex h-10 items-center gap-2 rounded-control brand-gradient px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
              >
                Completar producto
              </Link>
            }
          />
        </LuminousCard>
      ) : equivalentes.length === 0 && casiCoinciden.length === 0 ? (
        // Estado vacío informativo: la ausencia también es información.
        <LuminousCard neutral className="mt-4">
          <EmptyState
            titulo="No hay equivalente registrado para este producto"
            mensaje="Ningún otro producto del catálogo comparte su identidad clínica. Si esperabas una marca alternativa, quizá falte cargarla — su equivalencia aparecerá aquí en cuanto exista."
            icon={<Package size={28} />}
            tone="info"
          />
        </LuminousCard>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Nota de la dependencia con la Tanda 3 (existencia) */}
          <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-ink-soft">
            La <span className="font-medium">existencia</span> llega en la Tanda&nbsp;3. Entonces el orden
            será: primero lo que hay en el mostrador, y lo agotado abajo o tras “ver todos”. El molde ya está
            aquí, marcado <span className="font-medium">Tanda&nbsp;3</span> en cada fila.
          </p>

          {/* ── LISTA 1: EQUIVALENTES REALES (verde/acento) ── */}
          {equivalentes.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck size={17} className="text-accent" />
                <h2 className="font-display text-sm font-semibold text-ink">
                  Equivalentes ({equivalentes.length})
                </h2>
                <span className="text-xs text-ink-faint">— misma identidad clínica, intercambiables</span>
              </div>
              <ul className="space-y-2">
                {equivalentes.map((p) => (
                  <FilaProducto key={p.id} p={p} tono="real" />
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── LISTA 2: CASI COINCIDEN — REQUIERE VERIFICACIÓN (ámbar) ── */}
          {/* Nunca del mismo color ni mezclada con los equivalentes reales. */}
          {casiCoinciden.length > 0 ? (
            <section>
              <div className="mb-2 rounded-control border border-warning/40 bg-warning/10 px-3 py-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <TriangleAlert size={17} className="shrink-0" />
                  ⚠️ Concentración diferente — requiere verificación del farmacéutico
                </p>
                <p className="mt-1 pl-[25px] text-xs text-ink-soft">
                  Mismo principio activo y forma, pero <span className="font-medium">no</span> la misma dosis.
                  No los entregues como equivalentes sin que el farmacéutico lo confirme.
                </p>
              </div>
              <ul className="space-y-2">
                {casiCoinciden.map((p) => (
                  <FilaProducto key={p.id} p={p} tono="verificar" />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
