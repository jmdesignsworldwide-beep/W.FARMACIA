'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Banknote, Check, Loader2, Lock, MapPin, Package, PauseCircle, Pill, RotateCcw, ScanLine, ShieldCheck, ShoppingCart, Trash2, Wallet, X } from 'lucide-react';
import { BRAND } from '@/lib/tokens';
import { formatMoney, formatNumber } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';
import { cobrarEnEfectivo, anularVenta, aparcarVenta, retomarEnEspera, type CarritoEnEspera } from './actions';

export interface CatalogoItem {
  id: string;
  nombre: string;
  precio: number;
  exentoItbis: boolean;
  controlado: boolean;
  receta: boolean;
  existencia: number;
  ubicacion: string | null;
  fraccionable: boolean;
  unidadBase: string;
  busqueda: string;
  firmaMolecula: string;
  firmaCompleta: string;
  principios: string;
}

interface Linea {
  id: string;
  nombre: string;
  precio: number;
  exentoItbis: boolean;
  cantidad: number;
  existencia: number;
  controlado: boolean;
  receta: boolean;
}

/** Denominaciones dominicanas para el cálculo de vuelto. */
const DENOMINACIONES = [2000, 1000, 500, 200, 100, 50];

function nuevoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

const inputBase =
  'h-12 w-full rounded-control border border-line bg-canvas px-4 text-lg text-ink outline-none transition-shadow focus:luminous';

/** ITBIS incluido en el precio de anaquel (gravado). Se extrae, no se suma. */
function itbisLinea(precio: number, cantidad: number, exento: boolean): number {
  if (exento) return 0;
  const r = BRAND.itbisRate;
  return (precio * cantidad * r) / (1 + r);
}

export function CajaCliente({
  catalogo,
  puedeDespacharControlados,
  puedeAnular,
  enEspera,
}: {
  catalogo: CatalogoItem[];
  puedeDespacharControlados: boolean;
  puedeAnular: boolean;
  enEspera: CarritoEnEspera[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);
  const [sel, setSel] = useState(0);
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const buscarRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Cobro
  const [cobrando, setCobrando] = useState(false);
  const [recibido, setRecibido] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [rnc, setRnc] = useState('');
  const [exito, setExito] = useState<{ vuelto: number; total: number; ventaId: string; ncf: string | null } | null>(null);
  const idemRef = useRef<string>('');
  const recibidoRef = useRef<HTMLInputElement>(null);

  // ¿Cuánto le alcanza? (F3)
  const [presupuesto, setPresupuesto] = useState<CatalogoItem | null>(null);
  const [monto, setMonto] = useState('');
  const montoRef = useRef<HTMLInputElement>(null);

  // Venta en espera (F8)
  const [aparcando, setAparcando] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [verEspera, setVerEspera] = useState(false);
  const etiquetaRef = useRef<HTMLInputElement>(null);

  // Anulación de la última venta (solo Dueño/Administrador)
  const [anulando, setAnulando] = useState(false);
  const [motivoAnul, setMotivoAnul] = useState('');
  const [procAnul, setProcAnul] = useState(false);
  const [errAnul, setErrAnul] = useState<string | null>(null);
  const [anulada, setAnulada] = useState(false);

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

  // Índice por firma de molécula: agrupar candidatos a equivalencia una sola vez.
  const indice = useMemo(() => {
    const m = new Map<string, CatalogoItem[]>();
    for (const it of catalogo) {
      if (!it.firmaMolecula) continue;
      const arr = m.get(it.firmaMolecula);
      if (arr) arr.push(it);
      else m.set(it.firmaMolecula, [it]);
    }
    return m;
  }, [catalogo]);

  // Equivalencias del destacado: mismo principio y con existencia. Real = misma
  // concentración; "casi coincide" = mismo principio, otra concentración/forma.
  const equivalencias = useMemo(() => {
    const reales: CatalogoItem[] = [];
    const casi: CatalogoItem[] = [];
    if (destacado?.firmaMolecula) {
      for (const it of indice.get(destacado.firmaMolecula) ?? []) {
        if (it.id === destacado.id || it.existencia <= 0) continue;
        if (it.firmaCompleta === destacado.firmaCompleta) reales.push(it);
        else casi.push(it);
      }
    }
    return { reales, casi };
  }, [destacado, indice]);

  const totales = useMemo(() => {
    let total = 0;
    let itbis = 0;
    for (const l of carrito) {
      total += l.precio * l.cantidad;
      itbis += itbisLinea(l.precio, l.cantidad, l.exentoItbis);
    }
    return { total, itbis, subtotal: total - itbis, unidades: carrito.reduce((s, l) => s + l.cantidad, 0) };
  }, [carrito]);

  const bloqueadoClinico = carrito.some((l) => l.controlado || l.receta) && !puedeDespacharControlados;
  const recibidoNum = Number(recibido) || 0;
  const vuelto = recibidoNum - totales.total;

  function abrirCobro() {
    if (carrito.length === 0 || bloqueadoClinico) return;
    idemRef.current = nuevoId();
    setRecibido('');
    setRnc('');
    setErrorCobro(null);
    setExito(null);
    setCobrando(true);
    setTimeout(() => recibidoRef.current?.focus(), 50);
  }

  function cerrarCobro() {
    setCobrando(false);
    setProcesando(false);
    setErrorCobro(null);
  }

  function abrirPresupuesto() {
    if (!destacado) return;
    setPresupuesto(destacado);
    setMonto('');
    setTimeout(() => montoRef.current?.focus(), 50);
  }

  function abrirAparcar() {
    if (carrito.length === 0) {
      setAviso('No hay nada que poner en espera.');
      return;
    }
    setEtiqueta('');
    setAparcando(true);
    setTimeout(() => etiquetaRef.current?.focus(), 50);
  }

  async function confirmarAparcar() {
    const res = await aparcarVenta(carrito, etiqueta);
    if (res.ok) {
      setCarrito([]);
      setAparcando(false);
      setAviso('Carrito puesto en espera.');
      router.refresh();
      buscarRef.current?.focus();
    } else {
      setAviso(res.error ?? 'No se pudo poner en espera.');
      setAparcando(false);
    }
  }

  async function retomar(id: string) {
    const res = await retomarEnEspera(id);
    if (res.ok && res.lineas) {
      setCarrito(res.lineas);
      setVerEspera(false);
      router.refresh();
      buscarRef.current?.focus();
    } else {
      setAviso(res.error ?? 'No se pudo retomar.');
    }
  }

  function agregarPresupuesto(it: CatalogoItem, n: number) {
    if (n <= 0) return;
    setCarrito((c) => {
      const i = c.findIndex((l) => l.id === it.id);
      if (i >= 0) {
        const nx = [...c];
        nx[i] = { ...nx[i], cantidad: n };
        return nx;
      }
      return [
        {
          id: it.id,
          nombre: it.nombre,
          precio: it.precio,
          exentoItbis: it.exentoItbis,
          cantidad: n,
          existencia: it.existencia,
          controlado: it.controlado,
          receta: it.receta,
        },
        ...c,
      ];
    });
    setPresupuesto(null);
    buscarRef.current?.focus();
  }

  async function confirmarCobro() {
    if (procesando) return;
    if (recibidoNum + 0.001 < totales.total) {
      setErrorCobro('El efectivo recibido no cubre el total.');
      return;
    }
    setProcesando(true);
    setErrorCobro(null);
    const res = await cobrarEnEfectivo({
      idempotencia: idemRef.current,
      recibido: recibidoNum,
      lineas: carrito.map((l) => ({ productoId: l.id, cantidad: l.cantidad })),
      rnc: rnc.trim() || undefined,
    });
    if (res.ok && res.ventaId) {
      setExito({ vuelto: res.vuelto ?? 0, total: res.total ?? totales.total, ventaId: res.ventaId, ncf: res.ncf ?? null });
      setAnulada(false);
      setCarrito([]);
      setCobrando(false);
      setProcesando(false);
      router.refresh(); // recarga el catálogo con la existencia ya descontada
      buscarRef.current?.focus();
    } else {
      setProcesando(false);
      setErrorCobro(res.error ?? 'No se pudo cobrar.');
    }
  }

  function abrirAnulacion() {
    if (!exito || !puedeAnular) return;
    setMotivoAnul('');
    setErrAnul(null);
    setAnulando(true);
  }

  async function confirmarAnulacion() {
    if (procAnul || !exito) return;
    if (!motivoAnul.trim()) {
      setErrAnul('La anulación exige un motivo.');
      return;
    }
    setProcAnul(true);
    setErrAnul(null);
    const res = await anularVenta(exito.ventaId, motivoAnul.trim());
    if (res.ok) {
      setAnulando(false);
      setProcAnul(false);
      setAnulada(true);
      setExito(null);
      router.refresh(); // el stock volvió al lote
    } else {
      setProcAnul(false);
      setErrAnul(res.error ?? 'No se pudo anular.');
    }
  }

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
        {
          id: it.id,
          nombre: it.nombre,
          precio: it.precio,
          exentoItbis: it.exentoItbis,
          cantidad: 1,
          existencia: it.existencia,
          controlado: it.controlado,
          receta: it.receta,
        },
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
      if (cobrando) {
        if (e.key === 'Enter') {
          e.preventDefault();
          void confirmarCobro();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cerrarCobro();
        }
        return;
      }
      if (presupuesto) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setPresupuesto(null);
        }
        return;
      }
      if (aparcando) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setAparcando(false);
        }
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        abrirPresupuesto();
      } else if (e.key === 'F2') {
        e.preventDefault();
        const ult = carrito[carrito.length - 1];
        if (ult) qtyRefs.current[ult.id]?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (bloqueadoClinico) setAviso('Esta venta incluye un controlado o de receta. Solo el farmacéutico puede despacharla.');
        else abrirCobro();
      } else if (e.key === 'F8') {
        e.preventDefault();
        abrirAparcar();
      } else if (e.key === 'Delete' && query === '') {
        e.preventDefault();
        quitarUltima();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrito, query, cobrando, bloqueadoClinico, recibido, presupuesto, destacado, aparcando]);

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
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-ink-faint">
              F3 presupuesto · F8 en espera · F4 cobrar · Supr quita
            </div>
            <button
              onClick={() => setVerEspera(true)}
              disabled={enEspera.length === 0}
              className="inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1 text-xs text-ink-soft hover:luminous disabled:opacity-40"
            >
              <PauseCircle className="h-3.5 w-3.5" /> En espera ({enEspera.length})
            </button>
          </div>
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
                {destacado.principios && <div className="mt-1 text-xs text-ink-faint">{destacado.principios}</div>}
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
              <button
                onClick={abrirPresupuesto}
                className="inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-1 text-xs text-ink-soft hover:luminous"
              >
                <Wallet className="h-3.5 w-3.5" /> ¿Cuánto le alcanza? <span className="text-ink-faint">F3</span>
              </button>
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

              {(equivalencias.reales.length > 0 || equivalencias.casi.length > 0) && (
                <div className="space-y-2 border-t border-line pt-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    {destacado.existencia > 0 ? 'También sirve' : 'No hay, pero sí tienes'}
                  </div>
                  {equivalencias.reales.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => agregar(it)}
                      className="flex w-full items-center justify-between gap-2 rounded-control border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-left hover:bg-emerald-500/10"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{it.nombre}</span>
                      <span className="text-xs text-ink-faint tabular-nums">{formatNumber(it.existencia)}</span>
                      <span className="text-sm font-medium text-ink tabular-nums">{formatMoney(it.precio)}</span>
                    </button>
                  ))}
                  {equivalencias.casi.length > 0 && (
                    <>
                      <div className="pt-1 text-xs text-amber-700 dark:text-amber-400">Casi coincide — verifica con el farmacéutico</div>
                      {equivalencias.casi.map((it) => (
                        <button
                          key={it.id}
                          onClick={() => agregar(it)}
                          className="flex w-full items-center justify-between gap-2 rounded-control border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left hover:bg-amber-500/10"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">
                            {it.nombre}
                            <span className="ml-1.5 text-xs text-ink-faint">{it.principios}</span>
                          </span>
                          <span className="text-xs text-ink-faint tabular-nums">{formatNumber(it.existencia)}</span>
                          <span className="text-sm font-medium text-ink tabular-nums">{formatMoney(it.precio)}</span>
                        </button>
                      ))}
                    </>
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
        {exito && (
          <div className="mb-2 flex items-center gap-2 rounded-control border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-700 dark:text-emerald-300">
            <Check className="h-4 w-4" /> Cobrado {formatMoney(exito.total)}
            {exito.vuelto > 0 && <span className="font-semibold">· Vuelto {formatMoney(exito.vuelto)}</span>}
            {exito.ncf && <span className="tabular-nums">· NCF {exito.ncf}</span>}
            {puedeAnular && (
              <button
                onClick={abrirAnulacion}
                className="ml-auto inline-flex items-center gap-1 rounded-control border border-line px-2 py-0.5 text-xs text-ink-soft hover:text-rose-600 dark:hover:text-rose-400"
              >
                <RotateCcw className="h-3 w-3" /> Anular
              </button>
            )}
          </div>
        )}
        {anulada && (
          <div className="mb-2 flex items-center gap-2 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-sm text-rose-700 dark:text-rose-300">
            <RotateCcw className="h-4 w-4" /> Venta anulada · la mercancía volvió a su lote
          </div>
        )}
        {aviso && (
          <div className="mb-2 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            {aviso}
          </div>
        )}
        {bloqueadoClinico && carrito.length > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">
            <Lock className="h-3.5 w-3.5" /> El carrito incluye un controlado o de receta. Solo el farmacéutico puede despacharlo.
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
              onClick={abrirCobro}
              disabled={carrito.length === 0 || bloqueadoClinico}
              className="brand-gradient inline-flex items-center gap-2 rounded-control px-6 py-3 text-base font-semibold text-white disabled:opacity-40"
            >
              Cobrar <span className="text-xs opacity-80">F4</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de cobro en efectivo */}
      {cobrando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrarCobro}>
          <div
            className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Banknote className="h-5 w-5 text-accent" /> Cobro en efectivo
              </div>
              <button onClick={cerrarCobro} className="text-ink-faint hover:text-ink" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">Total a cobrar</span>
              <span className="font-display text-3xl font-bold text-ink tabular-nums">{formatMoney(totales.total)}</span>
            </div>

            <label className="mb-1 block text-xs text-ink-soft">Efectivo recibido</label>
            <input
              ref={recibidoRef}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={recibido}
              onChange={(e) => setRecibido(e.target.value)}
              placeholder="0.00"
              className={`${inputBase} text-right tabular-nums`}
            />

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                onClick={() => setRecibido(String(totales.total))}
                className="rounded-control border border-line px-3 py-1 text-xs text-ink-soft hover:bg-canvas"
              >
                Exacto
              </button>
              {DENOMINACIONES.map((d) => (
                <button
                  key={d}
                  onClick={() => setRecibido((r) => String((Number(r) || 0) + d))}
                  className="rounded-control border border-line px-3 py-1 text-xs text-ink-soft tabular-nums hover:bg-canvas"
                >
                  +{formatNumber(d)}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
              <span className="text-sm text-ink-soft">Vuelto</span>
              <span
                className={`font-display text-2xl font-bold tabular-nums ${
                  vuelto < -0.001 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {vuelto < -0.001 ? 'Falta ' + formatMoney(-vuelto) : formatMoney(Math.max(0, vuelto))}
              </span>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs text-ink-soft">RNC (opcional — emite crédito fiscal B01)</label>
              <input
                value={rnc}
                onChange={(e) => setRnc(e.target.value)}
                placeholder="Sin RNC = consumidor final (B02)"
                className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous"
              />
            </div>

            {errorCobro && (
              <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">
                {errorCobro}
              </div>
            )}

            <button
              onClick={() => void confirmarCobro()}
              disabled={procesando || recibidoNum + 0.001 < totales.total}
              className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control px-6 py-3 text-base font-semibold text-white disabled:opacity-40"
            >
              {procesando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {procesando ? 'Cobrando…' : 'Confirmar cobro'}
            </button>
          </div>
        </div>
      )}

      {/* Poner en espera (F8) */}
      {aparcando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAparcando(false)}>
          <div className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <PauseCircle className="h-5 w-5 text-accent" /> Poner en espera
            </div>
            <p className="mb-3 text-sm text-ink-soft">Ponle un nombre o referencia para retomarlo después (opcional).</p>
            <input
              ref={etiquetaRef}
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void confirmarAparcar();
                }
              }}
              placeholder="Ej: Doña Carmen, camisa azul…"
              className={inputBase}
            />
            <div className="mt-4 flex gap-2">
              <button onClick={() => setAparcando(false)} className="flex-1 rounded-control border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas">
                Cancelar
              </button>
              <button
                onClick={() => void confirmarAparcar()}
                className="brand-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold text-white"
              >
                <PauseCircle className="h-4 w-4" /> En espera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retomar un carrito en espera */}
      {verEspera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setVerEspera(false)}>
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <PauseCircle className="h-5 w-5 text-accent" /> Carritos en espera
              </div>
              <button onClick={() => setVerEspera(false)} className="text-ink-faint hover:text-ink" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {enEspera.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">No hay carritos en espera.</p>
            ) : (
              <ul className="space-y-2">
                {enEspera.map((c) => {
                  const tot = c.lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
                  const uds = c.lineas.reduce((s, l) => s + l.cantidad, 0);
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => void retomar(c.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-control border border-line px-3 py-2.5 text-left hover:luminous"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-ink">{c.etiqueta || 'Sin nombre'}</div>
                          <div className="text-xs text-ink-faint tabular-nums">{formatNumber(uds)} unidad(es)</div>
                        </div>
                        <div className="text-right font-semibold text-ink tabular-nums">{formatMoney(tot)}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ¿Cuánto le alcanza? (F3) */}
      {presupuesto &&
        (() => {
          const p = presupuesto;
          const m = Number(monto) || 0;
          const maxU = p.precio > 0 ? Math.min(Math.floor(m / p.precio), Math.max(0, Math.floor(p.existencia))) : 0;
          const totalP = maxU * p.precio;
          const vueltoP = m - totalP;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPresupuesto(null)}>
              <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <Wallet className="h-5 w-5 text-accent" /> ¿Cuánto le alcanza?
                  </div>
                  <button onClick={() => setPresupuesto(null)} className="text-ink-faint hover:text-ink" aria-label="Cerrar">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mb-3 text-sm text-ink-soft">
                  {p.nombre} · {formatMoney(p.precio)} por {p.unidadBase.toLowerCase()}
                </div>

                <label className="mb-1 block text-xs text-ink-soft">El cliente tiene</label>
                <input
                  ref={montoRef}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && maxU > 0) {
                      e.preventDefault();
                      agregarPresupuesto(p, maxU);
                    }
                  }}
                  placeholder="200.00"
                  className={`${inputBase} text-right tabular-nums`}
                />

                <div className="mt-4 rounded-control border border-line bg-canvas p-3 text-center">
                  {m <= 0 ? (
                    <span className="text-sm text-ink-faint">Escribe el monto para ver cuánto le alcanza.</span>
                  ) : maxU <= 0 ? (
                    <span className="text-sm text-rose-600 dark:text-rose-400">
                      {p.existencia <= 0 ? 'Sin existencia.' : `No alcanza ni para un(a) ${p.unidadBase.toLowerCase()}.`}
                    </span>
                  ) : (
                    <>
                      <div className="font-display text-2xl font-bold text-ink tabular-nums">
                        {formatNumber(maxU)} {p.unidadBase.toLowerCase()}
                        {maxU === 1 ? '' : 's'}
                      </div>
                      <div className="mt-1 text-sm text-ink-soft tabular-nums">
                        {formatMoney(totalP)} · vuelto {formatMoney(vueltoP)}
                      </div>
                      {!p.fraccionable && (
                        <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                          Este producto no se fracciona — verifica con el farmacéutico si se vende por unidad.
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={() => agregarPresupuesto(p, maxU)}
                  disabled={maxU <= 0}
                  className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control px-6 py-3 text-base font-semibold text-white disabled:opacity-40"
                >
                  Agregar {maxU > 0 ? `${formatNumber(maxU)} ${p.unidadBase.toLowerCase()}${maxU === 1 ? '' : 's'}` : ''}
                </button>
              </div>
            </div>
          );
        })()}

      {/* Modal de anulación (Dueño/Administrador) */}
      {anulando && exito && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAnulando(false)}>
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <RotateCcw className="h-5 w-5 text-rose-500" /> Anular la última venta
            </div>
            <p className="mb-3 text-sm text-ink-soft">
              La mercancía vuelve a su lote y queda registro permanente de la anulación. El motivo es obligatorio.
            </p>
            <textarea
              autoFocus
              value={motivoAnul}
              onChange={(e) => setMotivoAnul(e.target.value)}
              placeholder="Motivo de la anulación…"
              rows={3}
              className="w-full rounded-control border border-line bg-canvas px-3 py-2 text-ink outline-none focus:luminous"
            />
            {errAnul && (
              <div className="mt-2 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">
                {errAnul}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setAnulando(false)}
                className="flex-1 rounded-control border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={() => void confirmarAnulacion()}
                disabled={procAnul || !motivoAnul.trim()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-control bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {procAnul ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {procAnul ? 'Anulando…' : 'Anular venta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
