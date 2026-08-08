'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, Loader2, MessageCircle, Sparkles, UserCheck } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { confirmarCronico, marcarAbandonado, registrarRetiro } from './actions';

export interface ActivoItem {
  id: string;
  cliente: string;
  telefono: string | null;
  principio: string;
  cicloDias: number;
  proximaFecha: string | null;
  estadoLabel: string;
  estadoTono: string;
  orden: number;
}

export interface CandidatoItem {
  clienteId: string;
  clienteNombre: string;
  principioActivoId: string;
  principioNombre: string;
  compras: number;
  ultima: string | null;
  intervaloPromedio: number | null;
}

const card = 'rounded-card border border-line bg-surface p-4';

function waLink(telefono: string | null, texto: string): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  const num = digits.length === 10 ? `1${digits}` : digits; // RD: +1
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

export function CronicosCliente({ activos, candidatos, puedeConfirmar }: { activos: ActivoItem[]; candidatos: CandidatoItem[]; puedeConfirmar: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function confirmar(c: CandidatoItem) {
    setBusy(c.clienteId + c.principioActivoId);
    await confirmarCronico({
      clienteId: c.clienteId,
      principioActivoId: c.principioActivoId,
      cicloDias: c.intervaloPromedio && c.intervaloPromedio > 0 ? Math.round(c.intervaloPromedio) : 30,
      ultimaCompra: c.ultima,
    });
    setBusy(null);
    router.refresh();
  }

  async function accion(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    await fn();
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <CalendarClock className="h-6 w-6 text-accent" /> Tratamientos crónicos
        </div>
        <p className="mt-1 text-sm text-ink-soft">El paciente que vuelve cada mes. La demanda deja de ser adivinanza.</p>
      </div>

      {candidatos.length > 0 && (
        <div className={card}>
          <div className="mb-2 flex items-center gap-2 font-medium text-ink">
            <Sparkles className="h-4 w-4 text-accent" /> El sistema propone ({formatNumber(candidatos.length)})
          </div>
          <ul className="divide-y divide-line">
            {candidatos.map((c) => (
              <li key={c.clienteId + c.principioActivoId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="text-ink">{c.clienteNombre} · <span className="text-ink-soft">{c.principioNombre}</span></div>
                  <div className="text-xs text-ink-faint tabular-nums">
                    {formatNumber(c.compras)} compras{c.intervaloPromedio ? ` · cada ~${formatNumber(c.intervaloPromedio)} días` : ''}
                  </div>
                </div>
                {puedeConfirmar ? (
                  <button
                    onClick={() => confirmar(c)}
                    disabled={busy === c.clienteId + c.principioActivoId}
                    className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {busy === c.clienteId + c.principioActivoId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Confirmar
                  </button>
                ) : (
                  <span className="text-xs text-ink-faint">Confirma el farmacéutico</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Activos ({formatNumber(activos.length)})</div>
        {activos.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Aún no hay tratamientos crónicos confirmados.</p>
        ) : (
          <ul className="divide-y divide-line">
            {activos.map((t) => {
              // §2.2: ningún mensaje nombra el medicamento (revela condición de salud, Ley 172-13).
              const texto = `Buenos días, ${t.cliente}. Le recordamos su visita pendiente a la farmacia. Puede pasar cuando guste.`;
              const wa = waLink(t.telefono, texto);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-ink">{t.cliente} · <span className="text-ink-soft">{t.principio}</span></div>
                    <div className="text-xs tabular-nums">
                      <span className={t.estadoTono}>{t.estadoLabel}</span>
                      <span className="text-ink-faint">{t.proximaFecha ? ` · próxima ${t.proximaFecha}` : ''} · cada {formatNumber(t.cicloDias)} días</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-control border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    )}
                    <button onClick={() => accion(() => registrarRetiro(t.id), t.id + 'r')} disabled={busy === t.id + 'r'} className="inline-flex items-center gap-1 rounded-control border border-line px-2.5 py-1 text-xs text-ink-soft hover:luminous disabled:opacity-40">
                      {busy === t.id + 'r' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Vino
                    </button>
                    {puedeConfirmar && (
                      <button onClick={() => accion(() => marcarAbandonado(t.id), t.id + 'a')} disabled={busy === t.id + 'a'} className="rounded-control border border-line px-2.5 py-1 text-xs text-ink-faint hover:text-rose-500 disabled:opacity-40">
                        Abandonó
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
