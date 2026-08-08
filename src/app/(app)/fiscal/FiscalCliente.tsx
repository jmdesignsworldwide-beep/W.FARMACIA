'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, FileText, Loader2, Plus } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { crearSecuencia, alternarSecuencia } from './actions';

export interface SecuenciaItem {
  id: string;
  tipo: string;
  rangoDesde: number;
  rangoHasta: number;
  siguiente: number;
  digitos: number;
  vigenciaHasta: string | null;
  alertaRestantes: number;
  activa: boolean;
  restantes: number;
  porAgotarse: boolean;
}

const TIPOS = [
  { v: 'B02', l: 'B02 · Consumidor final' },
  { v: 'B01', l: 'B01 · Crédito fiscal' },
  { v: 'B04', l: 'B04 · Nota de crédito' },
  { v: 'E31', l: 'E31 · e-CF crédito' },
  { v: 'E32', l: 'E32 · e-CF consumidor' },
  { v: 'E34', l: 'E34 · e-CF nota de crédito' },
];

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous tabular-nums';

export function FiscalCliente({ secuencias }: { secuencias: SecuenciaItem[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState('B02');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [alerta, setAlerta] = useState('50');
  const [proc, setProc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setProc(true);
    setError(null);
    const res = await crearSecuencia({
      tipo,
      rangoDesde: Number(desde) || 0,
      rangoHasta: Number(hasta) || 0,
      vigenciaHasta: vigencia || null,
      alertaRestantes: Number(alerta) || 50,
    });
    if (res.ok) {
      setDesde('');
      setHasta('');
      setVigencia('');
      router.refresh();
    } else setError(res.error ?? 'No se pudo.');
    setProc(false);
  }

  async function toggle(id: string, activa: boolean) {
    await alternarSecuencia(id, activa);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <FileText className="h-6 w-6 text-accent" /> Secuencias fiscales (NCF)
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Carga aquí los rangos <strong>autorizados por la DGII</strong>. El POS asigna el próximo número automáticamente y avisa antes de agotarse.
        </p>
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center gap-2 font-medium text-ink"><Plus className="h-4 w-4 text-ink-faint" /> Nueva secuencia</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="col-span-2 lg:col-span-1">
            <label className="mb-1 block text-xs text-ink-soft">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputBase.replace('tabular-nums', '')}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Desde</label>
            <input type="number" min="1" value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="1" className={inputBase} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Hasta</label>
            <input type="number" min="1" value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="1000" className={inputBase} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Vigencia (opcional)</label>
            <input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} className={inputBase.replace('tabular-nums', '')} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Avisar al quedar</label>
            <input type="number" min="0" value={alerta} onChange={(e) => setAlerta(e.target.value)} className={inputBase} />
          </div>
        </div>
        {error && <div className="mt-3 rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}
        <button onClick={crear} disabled={proc || !desde || !hasta} className="brand-gradient mt-3 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {proc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Cargar secuencia
        </button>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Secuencias cargadas</div>
        {secuencias.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Aún no hay secuencias. El POS no puede emitir NCF hasta cargar al menos una.</p>
        ) : (
          <ul className="divide-y divide-line">
            {secuencias.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="flex items-center gap-2 text-ink">
                    <span className="font-medium tabular-nums">{s.tipo}</span>
                    <span className="text-xs text-ink-faint tabular-nums">{s.tipo}{String(s.rangoDesde).padStart(s.digitos, '0')} – {s.tipo}{String(s.rangoHasta).padStart(s.digitos, '0')}</span>
                    {s.porAgotarse && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" /> por agotarse
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-faint tabular-nums">
                    Próximo #{s.siguiente} · quedan {formatNumber(s.restantes)}{s.vigenciaHasta ? ` · vence ${s.vigenciaHasta}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => toggle(s.id, !s.activa)}
                  className={`rounded-control border px-3 py-1 text-xs ${s.activa ? 'border-line text-ink-soft hover:bg-canvas' : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'}`}
                >
                  {s.activa ? 'Desactivar' : 'Activar'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
