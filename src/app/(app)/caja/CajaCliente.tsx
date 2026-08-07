'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Package, Pill, ScanLine, ShieldCheck, ShoppingCart, Trash2 } from 'lucide-react';
import { BRAND } from '@/lib/tokens';
import { formatMoney, formatNumber } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';

export interface CatalogoItem {
  id: string;
  nombre: string;
  precio: number;
  exentoItbis: boolean;
  controlado: boolean;
  receta: boolean;
  existencia: number;
  ubicacion: string | null;
  busqueda: string;
}

interface Linea {
  id: string;
  nombre: string;
  precio: number;
  exentoItbis: boolean;
  cantidad: number;
  existencia: number;
}

const inputBase =
  'h-12 w-full rounded-control border border-line bg-canvas px-4 text-lg text-ink outline-none transition-shadow focus:luminous';

/** ITBIS incluido en el precio de anaquel (gravado). Se extrae, no se suma. */
function itbisLinea(precio: number, cantidad: number, exento: boolean): number {
  if (exento) return 0;
  const r = BRAND.itbisRate;
  return (precio * cantidad * r) / (1 + r);
}

export function CajaCliente({ catalogo }: { catalogo: CatalogoItem[] }) {
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);
  const [sel, setSel] = useState(0);
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const buscarRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const resultados = useMemo(() => {
    const t = normaliza(q).trim();
    if (!t) return [];
    const tokens = t.split(/\s+/);
    const out: CatalogoItem[] = [];
    for (const it of catalogo) {
      if (tokens.every((tok) => it.busqueda.includes(tok))) {
        out.push(it);
        if (out.length >= 40) break;
      }
    }
    return out;
  }, [q, catalogo]);

  useEffect(() => setSel(0), [q]);

  const destacado = resultados[sel] ?? null;

  const totales = useMemo(() => {
    let total = 0;
    let itbis = 0;
    for (const l of carrito) {
      total += l.precio * l.cantidad;
      itbis += itbisLinea(l.precio, l.cantidad, l.exentoItbis);
    }
    return { total, itbis, subtotal: total - itbis, unidades: carrito.reduce((s, l) => s + l.cantidad, 0) };
  }, [carrito]);

  function agregar(it: CatalogoItem) {
    if (!it) return;
    setCarrito((c) => {
      const i = c.findIndex((l) => l.id === it.id);
      if (i >= 0) {
        const next = [...c];
        next[i] = { ...next[i], cantidad: next[i].cantidad + 1 };
        return next;
      }
      return [
        ...c,
        { id: it.id, nombre: it.nombre, precio: it.precio, exentoItbis: it.exentoItbis, cantidad: 1, existencia: it.existencia },
      ];
    });
    setQuery('');
    buscarRef.current?.focus();
  }

  function cambiarCantidad(id: string, valor: string) {
    const n = Math.max(0, Number(valor) || 0);
    setCarrito((c) => (n === 0 ? c.filter((l) => l.id !== id) : c.map((l) => (l.id === id ? { ...l, cantidad: n } : l))));
  }

  function quitarUltima() {
    setCarrito((c) => c.slice(0, -1));
  }

  // Teclas de función globales (F2/F4/F8/Supr) — el cajero no suelta el escáner.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        const ult = carrito[carrito.length - 1];
        if (ult) qtyRefs.current[ult.id]?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (carrito.length > 0) setAviso('El cobro llega en la próxima pieza (pago mixto, vuelto, fiado, FEFO).');
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (carrito.length > 0) setAviso('Poner en espera (F8) llega en la próxima pieza.');
      } else if (e.key === 'Delete' && query === '') {
        e.preventDefault();
        quitarUltima();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [carrito, query]);

  function onBuscarKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (destacado) agregar(destacado);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-5">
        {/* Izquierda 60%: buscador + carrito */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-3">
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" />
            <input
              ref={buscarRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onBuscarKey}
              placeholder="Escanea o escribe: nombre, principio, laboratorio…"
              className={`${inputBase} pl-11`}
            />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-card border border-line bg-surface shadow-lg">
                {resultados.map((it, i) => (
                  <button
                    key={it.id}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => agregar(it)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left ${
                      i === sel ? 'bg-accent/10' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {it.nombre}
                      {it.controlado && <ShieldCheck className="ml-1.5 inline h-3.5 w-3.5 text-rose-500" />}
                    </span>
                    <span className="text-xs text-ink-faint tabular-nums">
                      {it.existencia > 0 ? `${formatNumber(it.existencia)} en existencia` : 'sin existencia'}
                    </span>
                    <span className="w-24 text-right font-medium text-ink tabular-nums">{formatMoney(it.precio)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Carrito */}
          <div className="min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface">
            {carrito.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-faint">
                <ShoppingCart className="h-8 w-8" />
                <p className="text-sm">El carrito está vacío. Escanea o busca para empezar.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {carrito.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-ink">{l.nombre}</div>
                      <div className="text-xs text-ink-faint tabular-nums">
                        {formatMoney(l.precio)} c/u{l.exentoItbis ? ' · exento' : ''}
                        {l.cantidad > l.existencia && (
                          <span className="ml-2 text-amber-600 dark:text-amber-400">supera la existencia ({formatNumber(l.existencia)})</span>
                        )}
                      </div>
                    </div>
                    <input
                      ref={(el) => {
                        qtyRefs.current[l.id] = el;
                      }}
                      type="number"
                      min="0"
                      step="any"
                      value={l.cantidad}
                      onChange={(e) => cambiarCantidad(l.id, e.target.value)}
                      className="h-9 w-16 rounded-control border border-line bg-canvas px-2 text-center text-ink outline-none focus:luminous tabular-nums"
                    />
                    <div className="w-24 text-right font-semibold text-ink tabular-nums">{formatMoney(l.precio * l.cantidad)}</div>
                    <button onClick={() => cambiarCantidad(l.id, '0')} className="text-ink-faint hover:text-rose-500" aria-label="Quitar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Derecha 40%: contexto */}
        <div className="min-h-0 overflow-auto rounded-card border border-line bg-surface p-4 lg:col-span-2">
          {destacado ? (
            <div className="space-y-3">
              <div>
                <div className="font-display text-lg font-semibold text-ink">{destacado.nombre}</div>
                <div className="mt-0.5 text-2xl font-bold text-ink tabular-nums">{formatMoney(destacado.precio)}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-ink-faint" />
                <span className={destacado.existencia > 0 ? 'text-ink' : 'text-rose-600 dark:text-rose-400'}>
                  {destacado.existencia > 0 ? `${formatNumber(destacado.existencia)} en existencia` : 'Sin existencia'}
                </span>
              </div>
              {destacado.ubicacion && (
                <div className="flex items-center gap-2 text-sm text-ink-soft">
                  <MapPin className="h-4 w-4 text-ink-faint" /> {destacado.ubicacion}
                </div>
              )}
              {(destacado.controlado || destacado.receta) && (
                <div className="flex flex-wrap gap-1.5">
                  {destacado.controlado && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/5 px-2 py-0.5 text-xs text-rose-700 dark:text-rose-300">
                      <ShieldCheck className="h-3 w-3" /> Controlado
                    </span>
                  )}
                  {destacado.receta && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                      <Pill className="h-3 w-3" /> Requiere receta
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-ink-faint">
              <Pill className="h-8 w-8" />
              <p className="text-sm">Equivalencias, existencia y ubicación del producto aparecen aquí.</p>
            </div>
          )}
        </div>
      </div>

      {/* Abajo fijo: total + cobrar */}
      <div className="border-t border-line bg-surface px-4 py-3">
        {aviso && (
          <div className="mb-2 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            {aviso}
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-ink-soft">
            <span className="tabular-nums">{formatNumber(totales.unidades)}</span> unidad(es)
            {totales.itbis > 0 && <span className="ml-3">ITBIS incluido {formatMoney(totales.itbis)}</span>}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-ink-faint">Total</div>
              <div className="font-display text-3xl font-bold text-ink tabular-nums">{formatMoney(totales.total)}</div>
            </div>
            <button
              onClick={() => carrito.length > 0 && setAviso('El cobro llega en la próxima pieza (pago mixto, vuelto, fiado, FEFO).')}
              disabled={carrito.length === 0}
              className="brand-gradient inline-flex items-center gap-2 rounded-control px-6 py-3 text-base font-semibold text-white disabled:opacity-40"
            >
              Cobrar <span className="text-xs opacity-80">F4</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
