'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Check, HeartPulse, Loader2, Syringe } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import { registrarServicio } from './actions';

export interface ServicioItem {
  id: string;
  tipo: string;
  cliente: string | null;
  valor: number;
  resultado: Record<string, number>;
  nota: string | null;
  creadoEn: string;
}

const TIPOS = [
  { v: 'inyeccion', l: 'Inyección' },
  { v: 'presion_arterial', l: 'Presión arterial' },
  { v: 'glucometria', l: 'Glucometría' },
  { v: 'curacion', l: 'Curación' },
  { v: 'otro', l: 'Otro' },
];

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

function resumenMedicion(tipo: string, r: Record<string, number>): string {
  if (tipo === 'presion_arterial' && r.sistolica) return `${r.sistolica}/${r.diastolica ?? '—'} mmHg`;
  if (tipo === 'glucometria' && r.glucosa) return `${r.glucosa} mg/dL`;
  return '';
}

export function ServiciosCliente({ servicios }: { servicios: ServicioItem[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState('presion_arterial');
  const [telefono, setTelefono] = useState('');
  const [valor, setValor] = useState('');
  const [sis, setSis] = useState('');
  const [dia, setDia] = useState('');
  const [glu, setGlu] = useState('');
  const [nota, setNota] = useState('');
  const [proc, setProc] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function registrar() {
    setProc(true);
    setAviso(null);
    const resultado: Record<string, number> = {};
    if (tipo === 'presion_arterial') {
      if (sis) resultado.sistolica = Number(sis);
      if (dia) resultado.diastolica = Number(dia);
    } else if (tipo === 'glucometria') {
      if (glu) resultado.glucosa = Number(glu);
    }
    const res = await registrarServicio({
      tipo: tipo as ServicioItem['tipo'] as never,
      telefonoCliente: telefono.trim() || undefined,
      valor: Number(valor) || 0,
      resultado,
      nota: nota.trim() || undefined,
    });
    setProc(false);
    if (res.ok) {
      setValor('');
      setSis('');
      setDia('');
      setGlu('');
      setNota('');
      if (res.clienteCronico) setAviso('Registrado. Este paciente se mide seguido — considéralo como crónico en seguimiento.');
      router.refresh();
    } else setAviso(res.error ?? 'No se pudo.');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <HeartPulse className="h-6 w-6 text-accent" /> Servicios de farmacia
        </div>
        <p className="mt-1 text-sm text-ink-soft">Inyección, presión, glucosa, curación. Ingreso real y la puerta del paciente crónico.</p>
      </div>

      <div className={card}>
        <div className="mb-3 flex items-center gap-2 font-medium text-ink"><Syringe className="h-4 w-4 text-ink-faint" /> Registrar servicio</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputBase}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Teléfono (opcional)</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Para el historial" className={inputBase} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">Valor cobrado</label>
            <input type="number" min="0" step="any" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0.00" className={`${inputBase} text-right tabular-nums`} />
          </div>

          {tipo === 'presion_arterial' && (
            <>
              <div>
                <label className="mb-1 block text-xs text-ink-soft">Sistólica</label>
                <input type="number" value={sis} onChange={(e) => setSis(e.target.value)} placeholder="120" className={`${inputBase} tabular-nums`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-ink-soft">Diastólica</label>
                <input type="number" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="80" className={`${inputBase} tabular-nums`} />
              </div>
            </>
          )}
          {tipo === 'glucometria' && (
            <div>
              <label className="mb-1 block text-xs text-ink-soft">Glucosa (mg/dL)</label>
              <input type="number" value={glu} onChange={(e) => setGlu(e.target.value)} placeholder="100" className={`${inputBase} tabular-nums`} />
            </div>
          )}
        </div>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" className={`${inputBase} mt-3`} />
        {aviso && <div className="mt-3 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">{aviso}</div>}
        <button onClick={registrar} disabled={proc} className="brand-gradient mt-3 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {proc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar
        </button>
        <p className="mt-2 text-xs text-ink-faint">El descuento de insumos (jeringa, tiras) del inventario llega en la próxima pieza.</p>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Últimos servicios</div>
        {servicios.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Aún no hay servicios registrados.</p>
        ) : (
          <ul className="divide-y divide-line">
            {servicios.map((s) => {
              const med = resumenMedicion(s.tipo, s.resultado);
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-ink-faint" />
                    <span className="text-ink">{TIPOS.find((t) => t.v === s.tipo)?.l ?? s.tipo}</span>
                    {s.cliente && <span className="text-ink-soft">· {s.cliente}</span>}
                    {med && <span className="text-ink-soft tabular-nums">· {med}</span>}
                  </div>
                  <span className="font-medium text-ink tabular-nums">{formatMoney(s.valor)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
