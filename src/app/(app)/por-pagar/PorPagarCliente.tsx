'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, formatDate } from '@/lib/format';
import { registrarCxp, marcarPagada } from './actions';
import { Loader2, Check, Plus, CalendarClock } from 'lucide-react';

export interface CxpRow {
  id: string;
  monto: number;
  fechaEmision: string;
  fechaVencimiento: string | null;
  nota: string | null;
  proveedor: string | null;
}
export interface ProveedorOpt {
  id: string;
  nombre: string;
}

const card = 'rounded-card border border-line bg-surface p-4';

export function PorPagarCliente({ rows, proveedores }: { rows: CxpRow[]; proveedores: ProveedorOpt[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(false);
  const [provId, setProvId] = useState('');
  const [monto, setMonto] = useState('');
  const [venc, setVenc] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoy = new Date().toISOString().slice(0, 10);

  async function guardar() {
    const m = Number(monto);
    if (!(m > 0)) { setError('Escribe un monto mayor que cero.'); return; }
    setBusy(true);
    setError(null);
    const res = await registrarCxp({ proveedorId: provId || null, monto: m, fechaVencimiento: venc || null, nota });
    setBusy(false);
    if (res.ok) {
      setNuevo(false); setProvId(''); setMonto(''); setVenc(''); setNota('');
      router.refresh();
    } else {
      setError(res.error ?? 'No se pudo guardar.');
    }
  }

  async function pagar(id: string) {
    setBusy(true);
    const res = await marcarPagada(id);
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error ?? 'No se pudo.');
  }

  return (
    <div className="space-y-3">
      <button onClick={() => { setNuevo(!nuevo); setError(null); }} className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm text-ink hover:bg-canvas">
        <Plus className="h-4 w-4" /> Registrar cuenta por pagar
      </button>

      {nuevo && (
        <div className={`${card} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Proveedor</label>
              <select value={provId} onChange={(e) => setProvId(e.target.value)} className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous">
                <option value="">— Sin proveedor —</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Monto</label>
              <input type="number" min="0" step="any" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-right tabular-nums text-ink outline-none focus:luminous" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Vence (opcional)</label>
              <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Nota (opcional)</label>
              <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Factura #, etc." className="h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous" />
            </div>
          </div>
          {error && <div className="rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
          <button onClick={() => void guardar()} disabled={busy} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className={`${card} text-center text-sm text-ink-faint`}>No hay cuentas pendientes por pagar. 🎉</div>
      ) : (
        rows.map((r) => {
          const vencida = r.fechaVencimiento && r.fechaVencimiento < hoy;
          return (
            <div key={r.id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-ink">{r.proveedor ?? 'Sin proveedor'}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                    {r.fechaVencimiento ? (
                      <span className={`inline-flex items-center gap-1 ${vencida ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                        <CalendarClock className="h-3 w-3" /> {vencida ? 'Venció' : 'Vence'} {formatDate(r.fechaVencimiento)}
                      </span>
                    ) : <span>Sin fecha de vencimiento</span>}
                    {r.nota && <span>· {r.nota}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-ink-faint">Monto</div>
                    <div className="font-display text-xl font-bold text-ink tabular-nums">{formatMoney(r.monto)}</div>
                  </div>
                  <button onClick={() => void pagar(r.id)} disabled={busy} className="rounded-control border border-line px-3 py-1.5 text-sm text-emerald-700 hover:bg-canvas disabled:opacity-40 dark:text-emerald-400">
                    Marcar pagada
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
