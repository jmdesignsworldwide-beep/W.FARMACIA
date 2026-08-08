'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, RotateCcw, Truck, X } from 'lucide-react';
import { guardarProveedor } from './actions';

export interface ProveedorItem {
  id: string;
  nombre: string;
  tipo: 'laboratorio' | 'drogueria' | 'ambos';
  contactoNombre: string;
  telefono: string;
  rnc: string;
  condicionesPago: string;
  diasEntrega: number | null;
  aceptaDevoluciones: boolean;
  diasMinimosVidaUtil: number | null;
  condicionesDevolucion: string;
  porcentajeRecuperacion: number | null;
  ficha?: {
    compras: number;
    desde: string | null;
    completitudPct: number | null;
    precioHonradoPct: number | null;
    pendientePago: number;
  } | null;
}

const TIPO_LABEL = { laboratorio: 'Laboratorio', drogueria: 'Droguería', ambos: 'Ambos' };
const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

const VACIO: ProveedorItem = {
  id: '', nombre: '', tipo: 'drogueria', contactoNombre: '', telefono: '', rnc: '', condicionesPago: '',
  diasEntrega: null, aceptaDevoluciones: false, diasMinimosVidaUtil: null, condicionesDevolucion: '', porcentajeRecuperacion: null, ficha: null,
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
}

/** Ficha de cumplimiento calculada de las recepciones (§3.4). Dice algo desde la 1ª compra. */
function FichaCumplimiento({ f, prometidos }: { f: NonNullable<ProveedorItem['ficha']>; prometidos: number | null }) {
  const Fila = ({ k, v, tono }: { k: string; v: string; tono?: string }) => (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-ink-faint">{k}</span>
      <span className={tono ?? 'text-ink'}>{v}</span>
    </div>
  );
  return (
    <div className="mt-2 rounded-control border border-line bg-canvas px-3 py-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Cumplimiento · {f.compras} compra(s){f.desde ? ` · desde ${new Date(f.desde + 'T00:00:00').toLocaleDateString('es-DO', { month: 'short', year: 'numeric' })}` : ''}
      </div>
      {f.completitudPct != null && (
        <Fila k="Completitud (llega lo pedido)" v={`${f.completitudPct}%`} tono={f.completitudPct >= 95 ? 'text-emerald-600 dark:text-emerald-400' : f.completitudPct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'} />
      )}
      {f.precioHonradoPct != null && (
        <Fila k="Honró la cotización" v={`${f.precioHonradoPct}%`} tono={f.precioHonradoPct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
      )}
      {prometidos != null && <Fila k="Entrega prometida" v={`${prometidos} día(s)`} />}
      {f.pendientePago > 0 && <Fila k="Pendiente de pago" v={fmtMoney(f.pendientePago)} tono="text-rose-600 dark:text-rose-400" />}
      <div className="mt-1 text-[10px] text-ink-faint">Días reales de entrega: se calculan al enlazar la orden con su recepción (mejora anotada).</div>
    </div>
  );
}

export function ProveedoresCliente({ proveedores }: { proveedores: ProveedorItem[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<ProveedorItem | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><Truck className="h-6 w-6 text-accent" /> Proveedores</div>
          <p className="mt-1 text-sm text-ink-soft">Laboratorio (fabrica) ≠ droguería (vende). La política de devolución alimenta el radar de vencimientos.</p>
        </div>
        <button onClick={() => setEditando(VACIO)} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </div>

      <div className={card}>
        {proveedores.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">Aún no hay proveedores.</p>
        ) : (
          <ul className="divide-y divide-line">
            {proveedores.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-ink">
                    <span className="font-medium">{p.nombre}</span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">{TIPO_LABEL[p.tipo]}</span>
                    {p.aceptaDevoluciones && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/5 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                        <RotateCcw className="h-3 w-3" /> devoluciones
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-faint">
                    {p.telefono || 'sin teléfono'}
                    {p.diasEntrega != null ? ` · entrega ${p.diasEntrega}d` : ''}
                    {p.aceptaDevoluciones && p.diasMinimosVidaUtil != null ? ` · devuelve con ≥${p.diasMinimosVidaUtil}d de vida` : ''}
                    {p.aceptaDevoluciones && p.porcentajeRecuperacion != null ? ` · recupera ${p.porcentajeRecuperacion}%` : ''}
                  </div>
                </div>
                <button onClick={() => setEditando(p)} className="rounded-control border border-line px-3 py-1.5 text-xs text-ink-soft hover:luminous">Editar</button>
                {p.ficha && <div className="w-full"><FichaCumplimiento f={p.ficha} prometidos={p.diasEntrega} /></div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando && <ProveedorModal inicial={editando} onClose={() => setEditando(null)} onDone={() => { setEditando(null); router.refresh(); }} />}
    </div>
  );
}

function ProveedorModal({ inicial, onClose, onDone }: { inicial: ProveedorItem; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(inicial);
  const [proc, setProc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setProc(true);
    setError(null);
    const res = await guardarProveedor({
      id: f.id || undefined,
      nombre: f.nombre,
      tipo: f.tipo,
      contactoNombre: f.contactoNombre,
      telefono: f.telefono,
      rnc: f.rnc,
      condicionesPago: f.condicionesPago,
      diasEntrega: f.diasEntrega,
      aceptaDevoluciones: f.aceptaDevoluciones,
      diasMinimosVidaUtil: f.diasMinimosVidaUtil,
      condicionesDevolucion: f.condicionesDevolucion,
      porcentajeRecuperacion: f.porcentajeRecuperacion,
    });
    setProc(false);
    if (res.ok) onDone();
    else setError(res.error ?? 'No se pudo.');
  }

  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-lg font-semibold text-ink">{f.id ? 'Editar' : 'Nuevo'} proveedor</div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="mb-1 block text-xs text-ink-soft">Nombre</label><input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} className={inputBase} /></div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Tipo</label>
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as ProveedorItem['tipo'] })} className={inputBase}>
              <option value="drogueria">Droguería</option>
              <option value="laboratorio">Laboratorio</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
          <div><label className="mb-1 block text-xs text-ink-soft">Teléfono</label><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Contacto</label><input value={f.contactoNombre} onChange={(e) => setF({ ...f, contactoNombre: e.target.value })} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">RNC</label><input value={f.rnc} onChange={(e) => setF({ ...f, rnc: e.target.value })} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Condiciones de pago</label><input value={f.condicionesPago} onChange={(e) => setF({ ...f, condicionesPago: e.target.value })} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Días de entrega</label><input type="number" min="0" value={f.diasEntrega ?? ''} onChange={(e) => setF({ ...f, diasEntrega: num(e.target.value) })} className={inputBase} /></div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={f.aceptaDevoluciones} onChange={(e) => setF({ ...f, aceptaDevoluciones: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          Acepta devoluciones
        </label>
        {f.aceptaDevoluciones && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs text-ink-soft">Vida útil mínima (días)</label><input type="number" min="0" value={f.diasMinimosVidaUtil ?? ''} onChange={(e) => setF({ ...f, diasMinimosVidaUtil: num(e.target.value) })} className={inputBase} /></div>
            <div><label className="mb-1 block text-xs text-ink-soft">% recuperación</label><input type="number" min="0" max="100" value={f.porcentajeRecuperacion ?? ''} onChange={(e) => setF({ ...f, porcentajeRecuperacion: num(e.target.value) })} className={inputBase} /></div>
            <div className="col-span-2"><label className="mb-1 block text-xs text-ink-soft">Condiciones</label><input value={f.condicionesDevolucion} onChange={(e) => setF({ ...f, condicionesDevolucion: e.target.value })} className={inputBase} /></div>
          </div>
        )}

        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-control border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas">Cancelar</button>
          <button onClick={guardar} disabled={proc || !f.nombre.trim()} className="brand-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {proc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
