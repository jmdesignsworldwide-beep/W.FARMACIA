'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { registrarAbono, ajustarLimite } from './actions';
import { Loader2, Check, MessageCircle, AlertTriangle } from 'lucide-react';

export interface FiadoRow {
  id: string;
  nombre: string;
  telefono: string | null;
  limite: number | null;
  fiado: number;
  abonado: number;
  saldo: number;
}

const card = 'rounded-card border border-line bg-surface p-4';

function waLink(telefono: string | null, texto: string): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  const num = digits.length === 10 ? `1${digits}` : digits; // RD: +1
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

export function FiadoCliente({ rows, puedeLimite }: { rows: FiadoRow[]; puedeLimite: boolean }) {
  const router = useRouter();
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editLimite, setEditLimite] = useState<string | null>(null);
  const [limiteVal, setLimiteVal] = useState('');

  if (rows.length === 0) {
    return <div className={`${card} text-center text-sm text-ink-faint`}>Nadie debe nada. Cuenta limpia. 🎉</div>;
  }

  async function confirmarAbono(pagadorId: string) {
    const m = Number(monto);
    if (!(m > 0)) { setError('Escribe un monto mayor que cero.'); return; }
    setBusy(true);
    setError(null);
    const res = await registrarAbono({ pagadorId, monto: m, metodo });
    setBusy(false);
    if (res.ok) {
      setAbriendo(null);
      setMonto('');
      router.refresh();
    } else {
      setError(res.error ?? 'No se pudo registrar.');
    }
  }

  async function guardarLimite(pagadorId: string) {
    setBusy(true);
    setError(null);
    const val = limiteVal.trim() === '' ? null : Number(limiteVal);
    const res = await ajustarLimite(pagadorId, val);
    setBusy(false);
    if (res.ok) {
      setEditLimite(null);
      setLimiteVal('');
      router.refresh();
    } else {
      setError(res.error ?? 'No se pudo guardar.');
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const sobreLimite = r.limite != null && r.saldo >= r.limite;
        const cercaLimite = r.limite != null && !sobreLimite && r.saldo >= r.limite * 0.8;
        const estado = `Hola ${r.nombre}, de parte de la farmacia. Su cuenta de fiado tiene un saldo pendiente de ${formatMoney(r.saldo)}. Gracias.`;
        const wa = waLink(r.telefono, estado);
        return (
          <div key={r.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{r.nombre}</div>
                <div className="text-xs text-ink-faint">
                  Fiado {formatMoney(r.fiado)} · abonado {formatMoney(r.abonado)}
                  {r.telefono ? ` · ${r.telefono}` : ''}
                </div>
                {r.limite != null && (
                  <div className={`mt-1 inline-flex items-center gap-1 text-xs ${sobreLimite ? 'text-rose-600 dark:text-rose-400' : cercaLimite ? 'text-amber-600 dark:text-amber-400' : 'text-ink-faint'}`}>
                    {(sobreLimite || cercaLimite) && <AlertTriangle className="h-3 w-3" />}
                    {sobreLimite ? 'Pasó su límite de ' : cercaLimite ? 'Cerca del límite de ' : 'Límite '}
                    {formatMoney(r.limite)}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-faint">Saldo</div>
                <div className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatMoney(r.saldo)}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setAbriendo(abriendo === r.id ? null : r.id); setMonto(''); setError(null); }}
                className="rounded-control border border-line px-3 py-1.5 text-sm text-ink hover:bg-canvas"
              >
                Registrar abono
              </button>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm text-emerald-700 hover:bg-canvas dark:text-emerald-400">
                  <MessageCircle className="h-4 w-4" /> Enviar estado de cuenta
                </a>
              )}
              {puedeLimite && (
                <button
                  onClick={() => { setEditLimite(editLimite === r.id ? null : r.id); setLimiteVal(r.limite != null ? String(r.limite) : ''); setError(null); }}
                  className="rounded-control border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-canvas"
                >
                  {r.limite != null ? 'Cambiar límite' : 'Poner límite'}
                </button>
              )}
            </div>

            {abriendo === r.id && (
              <div className="mt-3 space-y-2 rounded-control border border-line bg-canvas p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-ink-soft">Monto del abono</label>
                    <input
                      type="number" min="0" step="any" inputMode="decimal" autoFocus
                      value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00"
                      className="h-10 w-36 rounded-control border border-line bg-surface px-3 text-right tabular-nums text-ink outline-none focus:luminous"
                    />
                  </div>
                  <div className="inline-flex rounded-control border border-line p-0.5 text-sm">
                    <button onClick={() => setMetodo('efectivo')} className={`rounded-control px-3 py-1 ${metodo === 'efectivo' ? 'bg-accent/10 text-ink' : 'text-ink-soft'}`}>Efectivo</button>
                    <button onClick={() => setMetodo('transferencia')} className={`rounded-control px-3 py-1 ${metodo === 'transferencia' ? 'bg-accent/10 text-ink' : 'text-ink-soft'}`}>Transferencia</button>
                  </div>
                  <button
                    onClick={() => void confirmarAbono(r.id)}
                    disabled={busy}
                    className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Abonar
                  </button>
                </div>
                <button onClick={() => setMonto(String(r.saldo))} className="text-xs text-accent hover:underline">Abonar el saldo completo ({formatMoney(r.saldo)})</button>
              </div>
            )}

            {editLimite === r.id && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-control border border-line bg-canvas p-3">
                <div>
                  <label className="mb-1 block text-xs text-ink-soft">Límite de crédito (vacío = sin límite)</label>
                  <input
                    type="number" min="0" step="any" inputMode="decimal" autoFocus
                    value={limiteVal} onChange={(e) => setLimiteVal(e.target.value)} placeholder="Sin límite"
                    className="h-10 w-40 rounded-control border border-line bg-surface px-3 text-right tabular-nums text-ink outline-none focus:luminous"
                  />
                </div>
                <button onClick={() => void guardarLimite(r.id)} disabled={busy} className="rounded-control border border-line px-4 py-2 text-sm text-ink hover:bg-surface disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                </button>
              </div>
            )}

            {error && abriendo === r.id && (
              <div className="mt-2 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
