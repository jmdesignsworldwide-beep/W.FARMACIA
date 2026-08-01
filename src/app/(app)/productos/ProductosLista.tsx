'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownUp, ArrowDown, ArrowUp, FileText, GitCompareArrows, Package, Pencil,
  Search, ShieldAlert, SlidersHorizontal, X,
} from 'lucide-react';
import { LuminousCard } from '@/components/brand/LuminousCard';
import { EmptyState } from '@/components/brand/EmptyState';
import { CountUp } from '@/components/brand/CountUp';
import { normaliza } from '@/lib/catalogos';
import { formatMoney, formatNumber } from '@/lib/format';
import { vencimientoDeFecha } from '@/lib/vencimiento';
import { toneColor, type Tone } from '@/lib/tokens';

/** Fila magra que el servidor precarga en memoria — buscar NUNCA toca la red. */
export interface ProductoItem {
  id: string;
  nombre: string;
  busqueda: string; // blob normalizado: nombre + principios + laboratorio + código
  principios: string; // "Losartán 50 mg + HCT 25 mg" o ""
  laboratorio: string | null;
  categoria: string | null;
  controlado: boolean; // efectivo (override ?? herencia de la molécula)
  receta: boolean;
  incompleto: boolean;
  completitud: number;
  estadoVerificacion: 'verificado' | 'estimado' | 'discrepancia';
  existencia: number;
  estimada: boolean; // la existencia se muestra "aprox." cuando no está verificada
  precio: number | null;
  vencimientoIso: string | null;
}

type SortKey = 'nombre' | 'existencia' | 'vencimiento' | 'valor';
type Existencia = 'todos' | 'con' | 'sin';

const ROW_H = 64;

const control =
  'h-10 rounded-control border border-line bg-canvas px-3 text-sm text-ink outline-none transition-shadow focus:luminous';

const ESTADO_LABEL: Record<ProductoItem['estadoVerificacion'], { txt: string; tone: Tone }> = {
  verificado: { txt: 'Verificado', tone: 'success' },
  estimado: { txt: 'Estimado', tone: 'warning' },
  discrepancia: { txt: 'Discrepancia', tone: 'danger' },
};

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
        activo
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-line bg-surface-2 text-ink-soft hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

export function ProductosLista({
  productos,
  verFinanzas,
}: {
  productos: ProductoItem[];
  verFinanzas: boolean;
}) {
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [existencia, setExistencia] = useState<Existencia>('todos');
  const [categoria, setCategoria] = useState('');
  const [laboratorio, setLaboratorio] = useState('');
  const [soloControlados, setSoloControlados] = useState(false);
  const [soloIncompletos, setSoloIncompletos] = useState(false);
  const [estadoVer, setEstadoVer] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('nombre');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [ms, setMs] = useState(0);

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort() as string[],
    [productos],
  );
  const laboratorios = useMemo(
    () => [...new Set(productos.map((p) => p.laboratorio).filter(Boolean))].sort() as string[],
    [productos],
  );

  const filtrados = useMemo(() => {
    const t0 = performance.now();
    const tokens = normaliza(query).split(/\s+/).filter(Boolean);
    const out = productos.filter((p) => {
      if (tokens.length && !tokens.every((t) => p.busqueda.includes(t))) return false;
      if (existencia === 'con' && p.existencia <= 0) return false;
      if (existencia === 'sin' && p.existencia > 0) return false;
      if (categoria && p.categoria !== categoria) return false;
      if (laboratorio && p.laboratorio !== laboratorio) return false;
      if (soloControlados && !p.controlado) return false;
      if (soloIncompletos && !p.incompleto) return false;
      if (estadoVer && p.estadoVerificacion !== estadoVer) return false;
      return true;
    });
    out.sort((a, b) => {
      let d = 0;
      if (sortKey === 'nombre') d = a.nombre.localeCompare(b.nombre, 'es');
      else if (sortKey === 'existencia') d = a.existencia - b.existencia;
      else if (sortKey === 'valor') d = a.existencia * (a.precio ?? 0) - b.existencia * (b.precio ?? 0);
      else if (sortKey === 'vencimiento') {
        // Sin fecha va al final siempre; entre fechas, la más próxima primero.
        const av = a.vencimientoIso ? Date.parse(a.vencimientoIso) : Infinity;
        const bv = b.vencimientoIso ? Date.parse(b.vencimientoIso) : Infinity;
        d = av === bv ? 0 : av < bv ? -1 : 1;
      }
      return (d || a.nombre.localeCompare(b.nombre, 'es')) * sortDir;
    });
    setMs(performance.now() - t0);
    return out;
  }, [productos, query, existencia, categoria, laboratorio, soloControlados, soloIncompletos, estadoVer, sortKey, sortDir]);

  // ── Virtualización: solo se renderizan las filas visibles ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(560);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const medir = () => setVh(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // Al cambiar el resultado, volver arriba.
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [query, existencia, categoria, laboratorio, soloControlados, soloIncompletos, estadoVer, sortKey, sortDir]);

  const total = filtrados.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
  const end = Math.min(total, Math.ceil((scrollTop + vh) / ROW_H) + 6);
  const slice = filtrados.slice(start, end);

  const filtrosActivos =
    existencia !== 'todos' || categoria || laboratorio || soloControlados || soloIncompletos || estadoVer || q;
  const limpiar = () => {
    setQ('');
    setExistencia('todos');
    setCategoria('');
    setLaboratorio('');
    setSoloControlados(false);
    setSoloIncompletos(false);
    setEstadoVer('');
  };

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === 'nombre' ? 1 : -1);
    }
  };
  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      className={`inline-flex h-9 items-center gap-1 rounded-control px-2.5 text-sm transition-colors ${
        sortKey === k ? 'bg-surface-2 font-medium text-ink' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {children}
      {sortKey === k ? (
        sortDir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />
      ) : (
        <ArrowDownUp size={12} className="opacity-40" />
      )}
    </button>
  );

  if (productos.length === 0) {
    return (
      <LuminousCard neutral>
        <EmptyState
          titulo="Aún no hay productos"
          mensaje="Crea el primero o cárgalos en masa. El catálogo se completa vendiendo: puedes cargar lo esencial ahora y enriquecerlo después."
          icon={<Package size={30} />}
          tone="accent"
          cta={
            <Link href="/productos/nuevo" className="inline-flex h-10 items-center gap-2 rounded-control brand-gradient px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95">
              Crear el primer producto
            </Link>
          }
        />
      </LuminousCard>
    );
  }

  return (
    <div className="animate-blur-in">
      {/* Buscador + resumen */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, principio activo, laboratorio o código de barras…"
            aria-label="Buscar productos"
            className={`${control} h-11 w-full pl-10 pr-10`}
          />
          {q ? (
            <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-ink-faint hover:bg-surface-2 hover:text-ink">
              <X size={15} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-soft">
          <span className="tabular-nums">
            <CountUp value={total} className="font-semibold text-ink" />{' '}
            {total === 1 ? 'producto' : 'productos'}
            {total !== productos.length ? <span className="text-ink-faint"> de {formatNumber(productos.length)}</span> : null}
          </span>
          <span className="text-ink-faint tabular-nums" title="Tiempo de la búsqueda local">· {ms < 1 ? '<1' : Math.round(ms)} ms</span>
          <button type="button" onClick={() => setFiltrosAbiertos((v) => !v)} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface-2 px-3 font-medium text-ink-soft transition-colors hover:text-ink">
            <SlidersHorizontal size={15} /> Filtros
          </button>
          {filtrosActivos ? (
            <button type="button" onClick={limpiar} className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-ink-faint transition-colors hover:text-danger">
              <X size={14} /> Limpiar
            </button>
          ) : null}
        </div>

        {/* Filtros */}
        {filtrosAbiertos ? (
          <div className="grid grid-cols-1 gap-3 rounded-control border border-line bg-surface-2/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Existencia
              <select value={existencia} onChange={(e) => setExistencia(e.target.value as Existencia)} className={control}>
                <option value="todos">Todas</option>
                <option value="con">Con existencia</option>
                <option value="sin">Sin existencia</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Categoría
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={control}>
                <option value="">Todas</option>
                {categorias.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Laboratorio
              <select value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} className={control}>
                <option value="">Todos</option>
                {laboratorios.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              Verificación
              <select value={estadoVer} onChange={(e) => setEstadoVer(e.target.value)} className={control}>
                <option value="">Todos</option>
                <option value="verificado">Verificado</option>
                <option value="estimado">Estimado</option>
                <option value="discrepancia">Discrepancia</option>
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              <Chip activo={soloControlados} onClick={() => setSoloControlados((v) => !v)}>
                <ShieldAlert size={14} /> Controlados
              </Chip>
              <Chip activo={soloIncompletos} onClick={() => setSoloIncompletos((v) => !v)}>
                Incompletos
              </Chip>
            </div>
          </div>
        ) : null}

        {/* Orden */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-ink-faint">
          <span className="mr-1">Ordenar:</span>
          <SortBtn k="nombre">Nombre</SortBtn>
          <SortBtn k="existencia">Existencia</SortBtn>
          <SortBtn k="vencimiento">Vencimiento</SortBtn>
          <SortBtn k="valor">Valor</SortBtn>
        </div>
      </div>

      {/* Tabla densa virtualizada */}
      <LuminousCard neutral className="mt-3 overflow-hidden !p-0">
        {/* Encabezado de columnas (desde sm) */}
        <div className="hidden items-center gap-3 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint sm:flex">
          <span className="min-w-0 flex-1">Producto</span>
          <span className="w-24 text-right">Existencia</span>
          {verFinanzas ? <span className="hidden w-24 text-right md:block">Precio</span> : null}
          <span className="hidden w-28 lg:block">Vencimiento</span>
          <span className="hidden w-24 md:block">Estado</span>
          <span className="w-16 text-right">Acción</span>
        </div>

        {total === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-ink-soft">Ningún producto coincide con lo que buscas.</p>
            <button type="button" onClick={limpiar} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface-2 px-3 text-sm font-medium text-ink-soft hover:text-ink">
              <X size={14} /> Limpiar filtros
            </button>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className="overflow-y-auto"
            style={{ height: 'min(62vh, 640px)' }}
          >
            <div style={{ height: total * ROW_H, position: 'relative' }}>
              {slice.map((p, i) => {
                const index = start + i;
                const v = vencimientoDeFecha(p.vencimientoIso);
                const est = ESTADO_LABEL[p.estadoVerificacion];
                return (
                  <div
                    key={p.id}
                    style={{ position: 'absolute', top: index * ROW_H, left: 0, right: 0, height: ROW_H }}
                    className="flex items-center gap-3 border-b border-line/60 px-4 transition-colors hover:bg-surface-2/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{p.nombre}</span>
                        {p.controlado ? (
                          <span title="Controlado" className="inline-flex shrink-0 items-center rounded-full border border-danger/30 bg-danger/10 p-0.5 text-danger">
                            <ShieldAlert size={12} />
                          </span>
                        ) : null}
                        {p.receta ? (
                          <span title="Requiere receta" className="inline-flex shrink-0 items-center rounded-full border border-warning/30 bg-warning/10 p-0.5 text-warning">
                            <FileText size={12} />
                          </span>
                        ) : null}
                        {p.incompleto ? (
                          <span title={`Completitud ${p.completitud}%`} className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[10px] font-medium text-ink-faint tabular-nums">
                            {p.completitud}%
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
                        <span className="truncate">{p.principios || 'Sin principios aún'}</span>
                        {p.laboratorio ? <span className="hidden shrink-0 sm:inline">· {p.laboratorio}</span> : null}
                        {/* En móvil, la existencia va aquí para no perderla */}
                        <span className="shrink-0 tabular-nums sm:hidden">· {p.estimada ? 'aprox. ' : ''}{formatNumber(p.existencia)}</span>
                      </div>
                    </div>

                    <span className="hidden w-24 text-right text-sm tabular-nums text-ink sm:block">
                      {p.estimada ? <span className="text-ink-faint">aprox. </span> : null}
                      {formatNumber(p.existencia)}
                    </span>
                    {verFinanzas ? (
                      <span className="hidden w-24 text-right text-sm tabular-nums text-ink-soft md:block">
                        {p.precio != null ? formatMoney(p.precio) : '—'}
                      </span>
                    ) : null}
                    <span className="hidden w-28 items-center gap-1.5 text-xs lg:flex" title={v.etiqueta}>
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: toneColor(v.tone) }} />
                      <span className="truncate text-ink-soft">{v.etiqueta}</span>
                    </span>
                    <span className="hidden w-24 md:block">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ color: toneColor(est.tone), backgroundColor: `color-mix(in srgb, ${toneColor(est.tone)} 12%, transparent)` }}
                      >
                        {est.txt}
                      </span>
                    </span>

                    <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                      <Link href={`/productos/${p.id}/equivalencias`} aria-label={`Equivalentes de ${p.nombre}`} title="Equivalentes" className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-accent">
                        <GitCompareArrows size={15} />
                      </Link>
                      <Link href={`/productos/${p.id}/editar`} aria-label={`Editar ${p.nombre}`} title="Editar" className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-2 hover:text-accent">
                        <Pencil size={15} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </LuminousCard>
    </div>
  );
}
