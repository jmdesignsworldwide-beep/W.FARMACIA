'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { crearEntrega, asignarMotorista, marcarEnCamino, marcarEntregado, marcarNoEntregado } from './actions';
import { Loader2, Plus, MapPin, Phone, Bike, Check, X, PackageCheck, MessageCircle } from 'lucide-react';

export type EstadoEntrega = 'pendiente' | 'en_camino' | 'entregado' | 'no_entregado';

export interface EntregaRow {
  id: string;
  destinatario: string;
  direccion: string;
  referencia: string | null;
  telefono: string | null;
  estado: EstadoEntrega;
  contraEntrega: boolean;
  montoACobrar: number;
  cobrado: boolean;
  nota: string | null;
  motoristaId: string | null;
  motoristaNombre: string | null;
  motivoNoEntrega: string | null;
}
export interface MotoristaOpt {
  id: string;
  nombre: string;
}

const card = 'rounded-card border border-line bg-surface p-4';

function waLink(telefono: string | null, texto: string): string | null {
  if (!telefono) return null;
  const digits = telefono.replace(/\D/g, '');
  if (!digits) return null;
  const num = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

function EstadoChip({ estado }: { estado: EstadoEntrega }) {
  const map: Record<EstadoEntrega, string> = {
    pendiente: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    en_camino: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    entregado: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    no_entregado: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  };
  const label: Record<EstadoEntrega, string> = {
    pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado', no_entregado: 'No entregada',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[estado]}`}>{label[estado]}</span>;
}

/** Tarjeta de una entrega con los botones de acción del motorista. */
function AccionesMotorista({ r }: { r: EntregaRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cerrando, setCerrando] = useState<null | 'entregar' | 'fallo'>(null);
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok?: true; error?: string }>) {
    setBusy(true); setError(null);
    const res = await fn();
    setBusy(false);
    if (res.ok) { setCerrando(null); router.refresh(); }
    else setError(res.error ?? 'No se pudo.');
  }

  const wa = waLink(r.telefono, `Hola ${r.destinatario}, soy de la farmacia, ya voy en camino con su pedido.`);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.direccion + (r.referencia ? ' ' + r.referencia : ''))}`;

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-ink">{r.destinatario}</div>
          <a href={maps} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-start gap-1 text-sm text-accent hover:underline">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> <span>{r.direccion}{r.referencia ? ` — ${r.referencia}` : ''}</span>
          </a>
          {r.nota && <div className="mt-1 text-xs text-ink-faint">{r.nota}</div>}
        </div>
        <EstadoChip estado={r.estado} />
      </div>

      {r.contraEntrega && (
        <div className="mt-2 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-300">
          Cobrar en la casa: <span className="font-semibold tabular-nums">{formatMoney(r.montoACobrar)}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.telefono && (
          <a href={`tel:${r.telefono}`} className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-sm text-ink hover:bg-canvas">
            <Phone className="h-4 w-4" /> Llamar
          </a>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-sm text-emerald-700 hover:bg-canvas dark:text-emerald-400">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        )}
        {r.estado === 'pendiente' && (
          <button onClick={() => void run(() => marcarEnCamino(r.id))} disabled={busy} className="inline-flex items-center gap-1.5 rounded-control bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bike className="h-4 w-4" />} Voy en camino
          </button>
        )}
        {(r.estado === 'pendiente' || r.estado === 'en_camino') && (
          <>
            <button onClick={() => { setCerrando('entregar'); setError(null); }} className="inline-flex items-center gap-1.5 rounded-control bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              <PackageCheck className="h-4 w-4" /> Entregado
            </button>
            <button onClick={() => { setCerrando('fallo'); setError(null); }} className="inline-flex items-center gap-1.5 rounded-control border border-line px-4 py-2 text-sm text-rose-700 hover:bg-canvas dark:text-rose-400">
              <X className="h-4 w-4" /> No pude
            </button>
          </>
        )}
      </div>

      {cerrando === 'entregar' && (
        <div className="mt-3 space-y-2 rounded-control border border-line bg-canvas p-3">
          {r.contraEntrega ? (
            <>
              <div className="text-sm text-ink">¿Cobraste los {formatMoney(r.montoACobrar)}? ¿Cómo?</div>
              <div className="inline-flex rounded-control border border-line p-0.5 text-sm">
                <button onClick={() => setMetodo('efectivo')} className={`rounded-control px-3 py-1 ${metodo === 'efectivo' ? 'bg-accent/10 text-ink' : 'text-ink-soft'}`}>Efectivo</button>
                <button onClick={() => setMetodo('transferencia')} className={`rounded-control px-3 py-1 ${metodo === 'transferencia' ? 'bg-accent/10 text-ink' : 'text-ink-soft'}`}>Transferencia</button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => void run(() => marcarEntregado({ entregaId: r.id, cobrado: true, metodo }))} disabled={busy} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Entregado y cobrado
                </button>
                <button onClick={() => setCerrando(null)} className="rounded-control border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface">Cancelar</button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => void run(() => marcarEntregado({ entregaId: r.id, cobrado: false }))} disabled={busy} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar entrega
              </button>
              <button onClick={() => setCerrando(null)} className="rounded-control border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface">Cancelar</button>
            </div>
          )}
        </div>
      )}

      {cerrando === 'fallo' && (
        <div className="mt-3 space-y-2 rounded-control border border-line bg-canvas p-3">
          <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Por qué no se pudo? (no estaba, dirección mala…)" className="h-10 w-full rounded-control border border-line bg-surface px-3 text-ink outline-none focus:luminous" />
          <div className="flex gap-2">
            <button onClick={() => void run(() => marcarNoEntregado(r.id, motivo))} disabled={busy || !motivo.trim()} className="inline-flex items-center gap-1.5 rounded-control bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </button>
            <button onClick={() => setCerrando(null)} className="rounded-control border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface">Cancelar</button>
          </div>
        </div>
      )}

      {error && <div className="mt-2 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
    </div>
  );
}

export function DeliveryMotorista({ rows }: { rows: EntregaRow[] }) {
  if (rows.length === 0) {
    return <div className={`${card} text-center text-sm text-ink-faint`}>No tienes entregas pendientes. 🛵</div>;
  }
  return <div className="space-y-3">{rows.map((r) => <AccionesMotorista key={r.id} r={r} />)}</div>;
}

export function DeliveryMostrador({ rows, activas, motoristas }: { rows: EntregaRow[]; activas: EntregaRow[]; motoristas: MotoristaOpt[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ destinatario: '', direccion: '', referencia: '', telefono: '', motoristaId: '', contra: false, monto: '' });

  async function guardar() {
    setBusy(true); setError(null);
    const res = await crearEntrega({
      destinatario: f.destinatario, direccion: f.direccion, referencia: f.referencia, telefono: f.telefono,
      motoristaId: f.motoristaId || null, contraEntrega: f.contra, montoACobrar: Number(f.monto) || 0,
    });
    setBusy(false);
    if (res.ok) {
      setNuevo(false);
      setF({ destinatario: '', direccion: '', referencia: '', telefono: '', motoristaId: '', contra: false, monto: '' });
      router.refresh();
    } else setError(res.error ?? 'No se pudo.');
  }

  async function reasignar(entregaId: string, motoristaId: string) {
    if (!motoristaId) return;
    const res = await asignarMotorista(entregaId, motoristaId);
    if (res.ok) router.refresh();
  }

  const inp = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

  return (
    <div className="space-y-4">
      <button onClick={() => { setNuevo(!nuevo); setError(null); }} className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm text-ink hover:bg-canvas">
        <Plus className="h-4 w-4" /> Nueva entrega
      </button>

      {nuevo && (
        <div className={`${card} space-y-3`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs text-ink-soft">A nombre de</label><input value={f.destinatario} onChange={(e) => setF({ ...f, destinatario: e.target.value })} className={inp} /></div>
            <div><label className="mb-1 block text-xs text-ink-soft">Teléfono</label><input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} className={inp} /></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-xs text-ink-soft">Dirección</label><input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} className={inp} /></div>
            <div className="sm:col-span-2"><label className="mb-1 block text-xs text-ink-soft">Referencia (la casa amarilla al lado del colmado…)</label><input value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} className={inp} /></div>
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Motorista</label>
              <select value={f.motoristaId} onChange={(e) => setF({ ...f, motoristaId: e.target.value })} className={inp}>
                <option value="">— Asignar luego —</option>
                {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={f.contra} onChange={(e) => setF({ ...f, contra: e.target.checked })} /> Contra entrega (cobra en la casa)
              </label>
              {f.contra && <input type="number" min="0" step="any" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder="Monto a cobrar" className={`${inp} text-right tabular-nums`} />}
            </div>
          </div>
          {error && <div className="rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
          <button onClick={() => void guardar()} disabled={busy} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Crear entrega
          </button>
        </div>
      )}

      <div>
        <div className="mb-2 text-sm font-medium text-ink">En curso ({activas.length})</div>
        {activas.length === 0 ? <div className={`${card} text-center text-sm text-ink-faint`}>No hay entregas en curso.</div> : (
          <div className="space-y-3">
            {activas.map((r) => (
              <div key={r.id} className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{r.destinatario}</div>
                    <div className="mt-0.5 flex items-start gap-1 text-sm text-ink-soft"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {r.direccion}{r.referencia ? ` — ${r.referencia}` : ''}</div>
                    <div className="mt-1 text-xs text-ink-faint">
                      {r.telefono ? `${r.telefono} · ` : ''}
                      {r.contraEntrega ? `contra entrega ${formatMoney(r.montoACobrar)} · ` : ''}
                      {r.motoristaNombre ? `Motorista: ${r.motoristaNombre}` : 'Sin motorista'}
                    </div>
                  </div>
                  <EstadoChip estado={r.estado} />
                </div>
                <div className="mt-3">
                  <select defaultValue={r.motoristaId ?? ''} onChange={(e) => void reasignar(r.id, e.target.value)} className="h-9 rounded-control border border-line bg-canvas px-3 text-sm text-ink outline-none focus:luminous">
                    <option value="">{r.motoristaId ? 'Reasignar…' : 'Asignar motorista…'}</option>
                    {motoristas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-ink">Cerradas (recientes)</div>
        <div className="space-y-2">
          {rows.filter((r) => r.estado === 'entregado' || r.estado === 'no_entregado').slice(0, 15).map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-control border border-line bg-surface px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="text-ink">{r.destinatario}</span>
                <span className="ml-2 text-xs text-ink-faint">{r.motoristaNombre ?? '—'}{r.estado === 'no_entregado' && r.motivoNoEntrega ? ` · ${r.motivoNoEntrega}` : ''}{r.contraEntrega && r.cobrado ? ` · cobrado ${formatMoney(r.montoACobrar)}` : ''}</span>
              </div>
              <EstadoChip estado={r.estado} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
