'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, Power, Snowflake, Thermometer } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { registrarTemperatura, registrarApagon, cerrarApagon, resolverLoteFrio } from './actions';

export interface Lectura { id: string; valor: number; fueraDeRango: boolean; tomadaEn: string }
export interface Apagon { id: string; inicio: string; retorno: string | null; duracionHoras: number | null; umbralExcedido: boolean; lotesAfectados: number }
export interface LoteRevision { id: string; motivo: string; cantidad: number; producto: string }

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

function localISO(v: string): string {
  // datetime-local → ISO con offset local
  return v ? new Date(v).toISOString() : '';
}

export function CadenaFrioCliente({
  lecturas, apagones, enRevision, puedeResolver, tempMin, tempMax, umbralHoras,
}: {
  lecturas: Lectura[]; apagones: Apagon[]; enRevision: LoteRevision[]; puedeResolver: boolean; tempMin: number; tempMax: number; umbralHoras: number;
}) {
  const router = useRouter();
  const [temp, setTemp] = useState('');
  const [inicio, setInicio] = useState('');
  const [retorno, setRetorno] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const apagonAbierto = apagones.find((a) => !a.retorno) ?? null;

  async function guardarTemp() {
    setBusy('temp'); setAviso(null);
    const res = await registrarTemperatura(Number(temp), '');
    setBusy(null);
    if (res.ok) { setTemp(''); if (res.fueraDeRango) setAviso('⚠️ Temperatura fuera de rango.'); router.refresh(); }
    else setAviso(res.error ?? 'No se pudo.');
  }
  async function abrirApagon() {
    if (!inicio) return;
    setBusy('apagon'); setAviso(null);
    const res = await registrarApagon(localISO(inicio));
    setBusy(null);
    if (res.ok) { setInicio(''); router.refresh(); } else setAviso(res.error ?? 'No se pudo.');
  }
  async function cerrar(id: string) {
    if (!retorno) { setAviso('Indica la hora de retorno.'); return; }
    setBusy('cerrar'); setAviso(null);
    const res = await cerrarApagon(id, localISO(retorno));
    setBusy(null);
    if (res.ok) {
      setRetorno('');
      setAviso(res.umbralExcedido ? `Apagón largo: ${formatNumber(res.lotesAfectados ?? 0)} lote(s) refrigerado(s) en revisión y bloqueados.` : 'Apagón cerrado dentro del umbral.');
      router.refresh();
    } else setAviso(res.error ?? 'No se pudo.');
  }
  async function resolver(id: string, decision: 'liberar' | 'descartar') {
    setBusy(id + decision);
    await resolverLoteFrio(id, decision, decision === 'descartar' ? 'Descartado tras apagón' : '');
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><Snowflake className="h-6 w-6 text-accent" /> Cadena de frío</div>
        <p className="mt-1 text-sm text-ink-soft">En la nevera hay insulina y aquí se va la luz. Rango {tempMin}–{tempMax} °C · umbral de apagón {umbralHoras} h.</p>
      </div>

      {aviso && <div className="rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{aviso}</div>}

      {enRevision.length > 0 && (
        <div className="rounded-card border border-rose-500/50 bg-rose-500/5 p-4">
          <div className="mb-2 flex items-center gap-2 font-medium text-rose-700 dark:text-rose-300"><AlertTriangle className="h-4 w-4" /> Lotes en revisión — despacho BLOQUEADO ({formatNumber(enRevision.length)})</div>
          <ul className="divide-y divide-line">
            {enRevision.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="text-ink">{l.producto} <span className="text-ink-faint tabular-nums">· {formatNumber(l.cantidad)} u</span></div>
                  <div className="text-xs text-ink-faint">{l.motivo}</div>
                </div>
                {puedeResolver ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => resolver(l.id, 'liberar')} disabled={busy === l.id + 'liberar'} className="rounded-control border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300 disabled:opacity-40">Se salvó</button>
                    <button onClick={() => resolver(l.id, 'descartar')} disabled={busy === l.id + 'descartar'} className="rounded-control border border-rose-500/40 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300 disabled:opacity-40">Descartar (merma)</button>
                  </div>
                ) : <span className="text-xs text-ink-faint">Decide el farmacéutico</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-2 flex items-center gap-2 font-medium text-ink"><Thermometer className="h-4 w-4 text-ink-faint" /> Temperatura de la nevera</div>
          <div className="flex gap-2">
            <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="°C" className={`${inputBase} tabular-nums`} />
            <button onClick={guardarTemp} disabled={busy === 'temp' || temp === ''} className="brand-gradient inline-flex items-center gap-1.5 rounded-control px-4 text-sm font-semibold text-white disabled:opacity-40">
              {busy === 'temp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {lecturas.map((l) => (
              <li key={l.id} className="flex items-center justify-between">
                <span className={l.fueraDeRango ? 'text-rose-600 dark:text-rose-400' : 'text-ink-soft'} >{l.valor} °C{l.fueraDeRango ? ' · fuera de rango' : ''}</span>
                <span className="text-xs text-ink-faint">{new Date(l.tomadaEn).toLocaleString('es-DO')}</span>
              </li>
            ))}
            {lecturas.length === 0 && <li className="text-sm text-ink-faint">Sin lecturas.</li>}
          </ul>
        </div>

        <div className={card}>
          <div className="mb-2 flex items-center gap-2 font-medium text-ink"><Power className="h-4 w-4 text-ink-faint" /> Apagones</div>
          {apagonAbierto ? (
            <div className="rounded-control border border-amber-500/40 bg-amber-500/5 p-2.5">
              <div className="text-sm text-ink">Apagón abierto desde {new Date(apagonAbierto.inicio).toLocaleString('es-DO')}</div>
              <label className="mt-2 block text-xs text-ink-soft">Hora de retorno de la luz</label>
              <input type="datetime-local" value={retorno} onChange={(e) => setRetorno(e.target.value)} className={inputBase} />
              <button onClick={() => cerrar(apagonAbierto.id)} disabled={busy === 'cerrar'} className="brand-gradient mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-control py-2 text-sm font-semibold text-white disabled:opacity-40">
                {busy === 'cerrar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Cerrar apagón
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputBase} />
              <button onClick={abrirApagon} disabled={busy === 'apagon' || !inicio} className="rounded-control border border-line px-3 text-sm text-ink-soft hover:luminous disabled:opacity-40">Registrar</button>
            </div>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            {apagones.filter((a) => a.retorno).map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className={a.umbralExcedido ? 'text-rose-600 dark:text-rose-400' : 'text-ink-soft'}>{a.duracionHoras} h{a.umbralExcedido ? ` · ${formatNumber(a.lotesAfectados)} lote(s) afectados` : ''}</span>
                <span className="text-xs text-ink-faint">{new Date(a.inicio).toLocaleDateString('es-DO')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
