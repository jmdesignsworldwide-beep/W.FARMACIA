'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { guardarConfig, setTurno } from './actions';
import { Loader2, Check, Building2, Bell, Siren, Receipt } from 'lucide-react';

export type ConfigMap = Record<string, unknown>;

const card = 'rounded-card border border-line bg-surface p-4';
const inp = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

function str(v: unknown, def = ''): string {
  if (v == null) return def;
  if (typeof v === 'string') return v;
  return String(v);
}
function num(v: unknown, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function AjustesCliente({ config }: { config: ConfigMap }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Identidad
  const [nombre, setNombre] = useState(str(config['farmacia_nombre'], ''));
  const [rnc, setRnc] = useState(str(config['farmacia_rnc'], ''));
  const [direccion, setDireccion] = useState(str(config['farmacia_direccion'], ''));
  const [telefono, setTelefono] = useState(str(config['farmacia_telefono'], ''));
  const [reciboMsg, setReciboMsg] = useState(str(config['recibo_mensaje'], '¡Gracias por su compra! Que se mejore.'));

  // Avisos
  const [diasVenc, setDiasVenc] = useState(String(num(config['dias_alerta_vencimiento'], 180)));
  const [diasCron, setDiasCron] = useState(String(num(config['dias_alerta_cronico'], 5)));
  const [umbral, setUmbral] = useState(String(num(config['umbral_discrepancia_conteo'], 5000)));

  // Turno
  const turnoRaw = (config['farmacia_de_turno'] ?? {}) as { activo?: boolean; desde?: string | null; hasta?: string | null };
  const [turnoActivo, setTurnoActivo] = useState(Boolean(turnoRaw.activo));
  const [turnoDesde, setTurnoDesde] = useState(turnoRaw.desde ?? '');
  const [turnoHasta, setTurnoHasta] = useState(turnoRaw.hasta ?? '');

  async function guardar(id: string, fn: () => Promise<{ ok?: true; error?: string }>) {
    setBusy(id); setMsg(null);
    const res = await fn();
    setBusy(null);
    if (res.ok) { setMsg('Guardado ✓'); router.refresh(); }
    else setMsg(res.error ?? 'No se pudo guardar.');
  }

  return (
    <div className="space-y-4">
      {msg && <div className="rounded-control border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-ink">{msg}</div>}

      {/* Identidad */}
      <div className={card}>
        <div className="mb-3 flex items-center gap-2 font-medium text-ink"><Building2 className="h-4 w-4 text-accent" /> Identidad de la farmacia</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs text-ink-soft">Nombre</label><input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inp} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">RNC</label><input value={rnc} onChange={(e) => setRnc(e.target.value)} className={inp} /></div>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs text-ink-soft">Dirección</label><input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inp} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Teléfono</label><input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inp} /></div>
        </div>
        <button
          onClick={() => void guardar('identidad', async () => {
            const r1 = await guardarConfig('farmacia_nombre', nombre.trim());
            if (r1.error) return r1;
            const r2 = await guardarConfig('farmacia_rnc', rnc.trim());
            if (r2.error) return r2;
            const r3 = await guardarConfig('farmacia_direccion', direccion.trim());
            if (r3.error) return r3;
            return guardarConfig('farmacia_telefono', telefono.trim());
          })}
          disabled={busy === 'identidad'}
          className="brand-gradient mt-3 inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy === 'identidad' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar identidad
        </button>
      </div>

      {/* Recibo */}
      <div className={card}>
        <div className="mb-3 flex items-center gap-2 font-medium text-ink"><Receipt className="h-4 w-4 text-accent" /> Mensaje del recibo</div>
        <input value={reciboMsg} onChange={(e) => setReciboMsg(e.target.value)} className={inp} placeholder="Lo que va al pie del recibo" />
        <button onClick={() => void guardar('recibo', () => guardarConfig('recibo_mensaje', reciboMsg.trim()))} disabled={busy === 'recibo'} className="brand-gradient mt-3 inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy === 'recibo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>

      {/* Avisos */}
      <div className={card}>
        <div className="mb-3 flex items-center gap-2 font-medium text-ink"><Bell className="h-4 w-4 text-accent" /> Avisos y umbrales</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="mb-1 block text-xs text-ink-soft">Radar de vencimiento (días de anticipación)</label><input type="number" min="1" value={diasVenc} onChange={(e) => setDiasVenc(e.target.value)} className={`${inp} text-right tabular-nums`} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Recordar crónico (días antes)</label><input type="number" min="1" value={diasCron} onChange={(e) => setDiasCron(e.target.value)} className={`${inp} text-right tabular-nums`} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Umbral discrepancia (RD$)</label><input type="number" min="0" value={umbral} onChange={(e) => setUmbral(e.target.value)} className={`${inp} text-right tabular-nums`} /></div>
        </div>
        <button
          onClick={() => void guardar('avisos', async () => {
            const r1 = await guardarConfig('dias_alerta_vencimiento', Number(diasVenc) || 180);
            if (r1.error) return r1;
            const r2 = await guardarConfig('dias_alerta_cronico', Number(diasCron) || 5);
            if (r2.error) return r2;
            return guardarConfig('umbral_discrepancia_conteo', Number(umbral) || 5000);
          })}
          disabled={busy === 'avisos'}
          className="brand-gradient mt-3 inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy === 'avisos' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar avisos
        </button>
      </div>

      {/* Farmacia de turno */}
      <div className={card}>
        <div className="mb-3 flex items-center gap-2 font-medium text-ink"><Siren className="h-4 w-4 text-accent" /> Farmacia de turno</div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={turnoActivo} onChange={(e) => setTurnoActivo(e.target.checked)} /> Estamos de turno (24 horas)
        </label>
        {turnoActivo && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs text-ink-soft">Desde</label><input type="date" value={turnoDesde} onChange={(e) => setTurnoDesde(e.target.value)} className={inp} /></div>
            <div><label className="mb-1 block text-xs text-ink-soft">Hasta</label><input type="date" value={turnoHasta} onChange={(e) => setTurnoHasta(e.target.value)} className={inp} /></div>
          </div>
        )}
        <button onClick={() => void guardar('turno', () => setTurno({ activo: turnoActivo, desde: turnoDesde || null, hasta: turnoHasta || null }))} disabled={busy === 'turno'} className="brand-gradient mt-3 inline-flex items-center gap-1.5 rounded-control px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy === 'turno' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar turno
        </button>
      </div>
    </div>
  );
}
