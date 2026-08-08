'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownCircle, Check, Loader2, Lock, PiggyBank, Sparkles, Wallet, X } from 'lucide-react';
import { formatMoney, formatNumber } from '@/lib/format';
import { abrirCaja, registrarEgreso, cerrarCaja, DENOMINACIONES_DO, type CerrarCajaResultado } from './actions';

export interface SesionActual {
  id: string;
  abiertaEn: string;
  cajero: string;
  montoInicial: number;
  esArranque: boolean;
  fechaCorte: string | null;
  ventasCount: number;
  ventasEfectivo: number;
  egresos: Array<{ id: string; monto: number; motivo: string; creadoEn: string }>;
  totalEgresos: number;
  esperado: number;
}

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase =
  'h-11 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none transition-shadow focus:luminous tabular-nums';

function Tile({ label, valor, tono }: { label: string; valor: string; tono?: string }) {
  return (
    <div className={card}>
      <div className="text-xs text-ink-faint">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${tono ?? 'text-ink'}`}>{valor}</div>
    </div>
  );
}

export function CajaDiariaCliente({ sesion, puedeEgreso }: { sesion: SesionActual | null; puedeEgreso: boolean }) {
  const router = useRouter();
  if (!sesion) return <AbrirCaja />;
  return <TurnoAbierto sesion={sesion} puedeEgreso={puedeEgreso} router={router} />;
}

function AbrirCaja() {
  const router = useRouter();
  const [monto, setMonto] = useState('');
  const [arranque, setArranque] = useState(false);
  const [fechaCorte, setFechaCorte] = useState('');
  const [proc, setProc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setProc(true);
    setError(null);
    const res = await abrirCaja({ montoInicial: Number(monto) || 0, esArranque: arranque, fechaCorte: fechaCorte || null });
    if (res.ok) router.refresh();
    else {
      setError(res.error ?? 'No se pudo abrir.');
      setProc(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className={card}>
        <div className="mb-1 flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <PiggyBank className="h-6 w-6 text-accent" /> Abrir caja
        </div>
        <p className="mb-4 text-sm text-ink-soft">Declara el efectivo con el que arranca el turno.</p>

        <label className="mb-1 block text-xs text-ink-soft">Monto inicial</label>
        <input type="number" min="0" step="any" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={`${inputBase} text-right`} />

        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={arranque} onChange={(e) => setArranque(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Modo de arranque (primera caja del sistema)
        </label>
        {arranque && (
          <div className="mt-2">
            <label className="mb-1 block text-xs text-ink-soft">Fecha de corte</label>
            <input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} className={inputBase} />
          </div>
        )}

        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}

        <button onClick={abrir} disabled={proc} className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control px-6 py-3 font-semibold text-white disabled:opacity-40">
          {proc ? <Loader2 className="h-5 w-5 animate-spin" /> : <PiggyBank className="h-5 w-5" />} Abrir caja
        </button>
      </div>
    </div>
  );
}

function TurnoAbierto({ sesion, puedeEgreso, router }: { sesion: SesionActual; puedeEgreso: boolean; router: ReturnType<typeof useRouter> }) {
  const [egresoAbierto, setEgresoAbierto] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState<CerrarCajaResultado | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-xl font-semibold text-ink">Caja del turno</div>
          <div className="text-sm text-ink-soft">
            {sesion.cajero} · abierta {new Date(sesion.abiertaEn).toLocaleString('es-DO')}
            {sesion.esArranque && <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">Arranque{sesion.fechaCorte ? ` · corte ${sesion.fechaCorte}` : ''}</span>}
          </div>
        </div>
        <button onClick={() => setCerrando(true)} className="brand-gradient inline-flex items-center gap-2 rounded-control px-5 py-2.5 font-semibold text-white">
          <Wallet className="h-4 w-4" /> Cerrar caja
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Monto inicial" valor={formatMoney(sesion.montoInicial)} />
        <Tile label="Ventas del turno" valor={formatNumber(sesion.ventasCount)} />
        <Tile label="Efectivo cobrado" valor={formatMoney(sesion.ventasEfectivo)} tono="text-emerald-600 dark:text-emerald-400" />
        <Tile label="Esperado en caja" valor={formatMoney(sesion.esperado)} />
      </div>

      <div className={card}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-ink">
            <ArrowDownCircle className="h-4 w-4 text-ink-faint" /> Egresos ({formatNumber(sesion.egresos.length)}) · {formatMoney(sesion.totalEgresos)}
          </div>
          {puedeEgreso ? (
            <button onClick={() => setEgresoAbierto(true)} className="rounded-control border border-line px-3 py-1 text-xs text-ink-soft hover:luminous">
              Registrar egreso
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-ink-faint"><Lock className="h-3 w-3" /> Solo Dueño/Admin</span>
          )}
        </div>
        {sesion.egresos.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-faint">Sin egresos en este turno.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sesion.egresos.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-soft">{e.motivo}</span>
                <span className="font-medium text-ink tabular-nums">−{formatMoney(e.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {egresoAbierto && <EgresoModal cajaSesionId={sesion.id} onClose={() => setEgresoAbierto(false)} onDone={() => { setEgresoAbierto(false); router.refresh(); }} />}
      {cerrando && !resultado && (
        <CerrarModal
          sesion={sesion}
          onClose={() => setCerrando(false)}
          onDone={(r) => setResultado(r)}
        />
      )}
      {resultado?.ok && <CierreResumen resultado={resultado} onClose={() => { setResultado(null); setCerrando(false); router.refresh(); }} />}
    </div>
  );
}

function EgresoModal({ cajaSesionId, onClose, onDone }: { cajaSesionId: string; onClose: () => void; onDone: () => void }) {
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [proc, setProc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setProc(true);
    setError(null);
    const res = await registrarEgreso(cajaSesionId, Number(monto) || 0, motivo);
    if (res.ok) onDone();
    else {
      setError(res.error ?? 'No se pudo.');
      setProc(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-ink"><ArrowDownCircle className="h-5 w-5 text-accent" /> Registrar egreso</div>
        <label className="mb-1 block text-xs text-ink-soft">Monto</label>
        <input type="number" min="0" step="any" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className={`${inputBase} text-right`} />
        <label className="mb-1 mt-3 block text-xs text-ink-soft">Motivo</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: compra de fundas" className={inputBase.replace('tabular-nums', '')} />
        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-control border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas">Cancelar</button>
          <button onClick={guardar} disabled={proc || !monto || !motivo.trim()} className="brand-gradient inline-flex flex-1 items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {proc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

function CerrarModal({ sesion, onClose, onDone }: { sesion: SesionActual; onClose: () => void; onDone: (r: CerrarCajaResultado) => void }) {
  const [conteo, setConteo] = useState<Record<number, string>>({});
  const [metodoViejo, setMetodoViejo] = useState('');
  const [notas, setNotas] = useState('');
  const [proc, setProc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const declarado = useMemo(
    () => DENOMINACIONES_DO.reduce((s, d) => s + d * Math.max(0, Number(conteo[d]) || 0), 0),
    [conteo],
  );
  const diferencia = declarado - sesion.esperado;

  async function cerrar() {
    setProc(true);
    setError(null);
    const arqueo = DENOMINACIONES_DO.map((d) => ({ denominacion: d, cantidad: Math.max(0, Number(conteo[d]) || 0) }));
    const res = await cerrarCaja({ cajaSesionId: sesion.id, arqueo, totalMetodoViejo: metodoViejo ? Number(metodoViejo) : null, notas });
    if (res.ok) onDone(res);
    else {
      setError(res.error ?? 'No se pudo cerrar.');
      setProc(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-card border border-line bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink"><Wallet className="h-5 w-5 text-accent" /> Cierre — arqueo por denominación</div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {DENOMINACIONES_DO.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-16 text-right text-sm text-ink-soft tabular-nums">{formatMoney(d)}</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={conteo[d] ?? ''}
                onChange={(e) => setConteo((c) => ({ ...c, [d]: e.target.value }))}
                placeholder="0"
                className="h-9 w-full rounded-control border border-line bg-canvas px-2 text-center text-ink outline-none focus:luminous tabular-nums"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 rounded-control border border-line bg-canvas p-3 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Contado (declarado)</span><span className="font-semibold text-ink tabular-nums">{formatMoney(declarado)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Esperado</span><span className="text-ink tabular-nums">{formatMoney(sesion.esperado)}</span></div>
          <div className="flex justify-between border-t border-line pt-1">
            <span className="text-ink-soft">Diferencia</span>
            <span className={`font-bold tabular-nums ${Math.abs(diferencia) < 0.005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {diferencia > 0 ? '+' : ''}{formatMoney(diferencia)}
            </span>
          </div>
        </div>

        <label className="mb-1 mt-4 block text-xs text-ink-soft">Total del método viejo (cierre comparativo — opcional)</label>
        <input type="number" min="0" step="any" inputMode="decimal" value={metodoViejo} onChange={(e) => setMetodoViejo(e.target.value)} placeholder="Para cotejar con el cuaderno" className={`${inputBase} text-right`} />

        <label className="mb-1 mt-3 block text-xs text-ink-soft">Notas del cierre (opcional)</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-control border border-line bg-canvas px-3 py-2 text-ink outline-none focus:luminous" />

        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}

        <button onClick={cerrar} disabled={proc} className="brand-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control px-6 py-3 font-semibold text-white disabled:opacity-40">
          {proc ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wallet className="h-5 w-5" />} Cerrar caja
        </button>
      </div>
    </div>
  );
}

function CierreResumen({ resultado, onClose }: { resultado: CerrarCajaResultado; onClose: () => void }) {
  const cuadro = Math.abs(resultado.diferencia ?? 0) < 0.005;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full ${cuadro ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
          {cuadro ? <Sparkles className="h-7 w-7" /> : <Wallet className="h-7 w-7" />}
        </div>
        <div className="font-display text-lg font-semibold text-ink">{cuadro ? '¡Caja cuadrada!' : 'Caja cerrada'}</div>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">Contado</span><span className="text-ink tabular-nums">{formatMoney(resultado.declarado ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-ink-soft">Esperado</span><span className="text-ink tabular-nums">{formatMoney(resultado.esperado ?? 0)}</span></div>
          <div className="flex justify-between border-t border-line pt-1">
            <span className="text-ink-soft">Diferencia</span>
            <span className={`font-bold tabular-nums ${cuadro ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatMoney(resultado.diferencia ?? 0)}</span>
          </div>
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-control border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-canvas">Entendido</button>
      </div>
    </div>
  );
}
