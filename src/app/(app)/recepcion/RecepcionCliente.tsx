'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, PackagePlus, Search, Trash2 } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';
import { registrarRecepcion, type LineaRecepcion } from './actions';

export interface ProveedorRec { id: string; nombre: string }
export interface ProductoRec { id: string; nombre: string; precio: number; costoAnterior: number | null; busqueda: string }

interface Fila extends LineaRecepcion {
  nombre: string;
  precio: number;
  costoAnterior: number | null;
}

const card = 'rounded-card border border-line bg-surface p-4';
const inp = 'h-9 w-full rounded-control border border-line bg-canvas px-2 text-sm text-ink outline-none focus:luminous tabular-nums';

function derivaCosto(f: Fila): { pct: number; sugerido: number } | null {
  if (f.precioFacturado == null || !f.costoAnterior || f.costoAnterior <= 0) return null;
  if (f.precioFacturado <= f.costoAnterior) return null;
  const pct = ((f.precioFacturado - f.costoAnterior) / f.costoAnterior) * 100;
  const ratio = f.precio > 0 ? f.precio / f.costoAnterior : 1;
  return { pct: Math.round(pct * 10) / 10, sugerido: Math.round(f.precioFacturado * ratio * 100) / 100 };
}

export function RecepcionCliente({ proveedores, productos }: { proveedores: ProveedorRec[]; productos: ProductoRec[] }) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState('');
  const [factura, setFactura] = useState('');
  const [filas, setFilas] = useState<Fila[]>([]);
  const [q, setQ] = useState('');
  const [proc, setProc] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const resultados = useMemo(() => {
    const t = normaliza(q).trim();
    if (!t) return [];
    return productos.filter((p) => p.busqueda.includes(t)).slice(0, 8);
  }, [q, productos]);

  function agregar(p: ProductoRec) {
    setFilas((f) => [...f, { productoId: p.id, nombre: p.nombre, precio: p.precio, costoAnterior: p.costoAnterior, cantidadPedida: null, cantidadRecibida: 0, precioCotizado: null, precioFacturado: p.costoAnterior, numeroLote: '', fechaVencimiento: null }]);
    setQ('');
  }
  function set(i: number, k: keyof Fila, v: unknown) {
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  }
  const num = (v: string): number | null => (v === '' ? null : Number(v));

  async function confirmar() {
    setProc(true);
    setAviso(null);
    const res = await registrarRecepcion({
      proveedorId: proveedorId || null,
      facturaNumero: factura,
      lineas: filas.map((f) => ({
        productoId: f.productoId, cantidadPedida: f.cantidadPedida, cantidadRecibida: Number(f.cantidadRecibida),
        precioCotizado: f.precioCotizado, precioFacturado: f.precioFacturado, numeroLote: f.numeroLote, fechaVencimiento: f.fechaVencimiento,
      })),
    });
    setProc(false);
    if (res.ok) { setFilas([]); setFactura(''); setAviso('Recepción registrada: lotes creados, entradas y costo actualizados.'); router.refresh(); }
    else setAviso(res.error ?? 'No se pudo.');
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><PackagePlus className="h-6 w-6 text-accent" /> Recepción de mercancía</div>
        <p className="mt-1 text-sm text-ink-soft">El control nace en la puerta: recibido vs pedido, facturado vs cotizado, lote y vencimiento por renglón.</p>
      </div>

      <div className={card}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Proveedor</label>
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="h-9 w-full rounded-control border border-line bg-canvas px-2 text-sm text-ink outline-none focus:luminous">
              <option value="">— sin especificar —</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft"># de factura</label>
            <input value={factura} onChange={(e) => setFactura(e.target.value)} className="h-9 w-full rounded-control border border-line bg-canvas px-2 text-sm text-ink outline-none focus:luminous" />
          </div>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto para agregar un renglón…" className="h-9 w-full rounded-control border border-line bg-canvas pl-8 pr-2 text-sm text-ink outline-none focus:luminous" />
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-lg">
              {resultados.map((p) => (
                <button key={p.id} onClick={() => agregar(p)} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-accent/10">{p.nombre}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filas.length > 0 && (
        <div className={card}>
          <div className="space-y-3">
            {filas.map((f, i) => {
              const d = derivaCosto(f);
              return (
                <div key={i} className="rounded-control border border-line p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-ink">{f.nombre}</span>
                    <button onClick={() => setFilas((x) => x.filter((_, j) => j !== i))} className="text-ink-faint hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
                    <div><label className="mb-0.5 block text-[10px] text-ink-faint">Pedida</label><input type="number" className={inp} value={f.cantidadPedida ?? ''} onChange={(e) => set(i, 'cantidadPedida', num(e.target.value))} /></div>
                    <div><label className="mb-0.5 block text-[10px] text-ink-faint">Recibida</label><input type="number" className={inp} value={f.cantidadRecibida || ''} onChange={(e) => set(i, 'cantidadRecibida', Number(e.target.value) || 0)} /></div>
                    <div><label className="mb-0.5 block text-[10px] text-ink-faint">Cotizado</label><input type="number" className={inp} value={f.precioCotizado ?? ''} onChange={(e) => set(i, 'precioCotizado', num(e.target.value))} /></div>
                    <div><label className="mb-0.5 block text-[10px] text-ink-faint">Facturado</label><input type="number" className={inp} value={f.precioFacturado ?? ''} onChange={(e) => set(i, 'precioFacturado', num(e.target.value))} /></div>
                    <div><label className="mb-0.5 block text-[10px] text-ink-faint">Lote</label><input className={inp.replace('tabular-nums', '')} value={f.numeroLote} onChange={(e) => set(i, 'numeroLote', e.target.value)} /></div>
                    <div><label className="mb-0.5 block text-[10px] text-ink-faint">Vence</label><input type="date" className={inp.replace('tabular-nums', '')} value={f.fechaVencimiento ?? ''} onChange={(e) => set(i, 'fechaVencimiento', e.target.value || null)} /></div>
                  </div>
                  {d && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-control border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" /> Llegó {d.pct}% más caro (antes {formatMoney(f.costoAnterior ?? 0)}). Para mantener tu margen, sugerido: <strong>{formatMoney(d.sugerido)}</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {aviso && <div className="mt-3 rounded-control border border-line bg-canvas px-3 py-1.5 text-xs text-ink-soft">{aviso}</div>}
          <button onClick={confirmar} disabled={proc} className="brand-gradient mt-3 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {proc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar recepción
          </button>
        </div>
      )}
      {filas.length === 0 && aviso && <div className="rounded-control border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{aviso}</div>}
    </div>
  );
}
