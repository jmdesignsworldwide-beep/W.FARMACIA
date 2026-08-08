'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BookLock, Check, Loader2, Lock, Search, ShieldCheck, FileCheck } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';
import { AvisoClinico } from '@/components/legal/AvisoClinico';
import { despacharControlado } from './actions';

export interface ControladoProd { id: string; nombre: string; controlado: boolean; receta: boolean; existencia: number; busqueda: string }
export interface LibroEntry { id: string; producto: string; paciente: string; cantidad: number; farmaceutico: string; fecha: string }

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

export function ControladosCliente({ productos, libro, puedeDespachar }: { productos: ControladoProd[]; libro: LibroEntry[]; puedeDespachar: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [prod, setProd] = useState<ControladoProd | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [medico, setMedico] = useState('');
  const [exequatur, setExequatur] = useState('');
  const [paciente, setPaciente] = useState('');
  const [indicaciones, setIndicaciones] = useState('');
  const [recetaFisica, setRecetaFisica] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error' | 'sospecha'; texto: string } | null>(null);

  const resultados = useMemo(() => {
    const t = normaliza(q).trim();
    if (!t || prod) return [];
    return productos.filter((p) => p.busqueda.includes(t)).slice(0, 6);
  }, [q, productos, prod]);

  async function despachar() {
    if (!prod) { setAviso({ tipo: 'error', texto: 'Elige el producto.' }); return; }
    if (!recetaFisica) { setAviso({ tipo: 'error', texto: 'Confirma que tienes la receta física en mano antes de despachar.' }); return; }
    setBusy(true); setAviso(null);
    const res = await despacharControlado({ productoId: prod.id, cantidad: Number(cantidad), medicoNombre: medico, medicoExequatur: exequatur, pacienteNombre: paciente, indicaciones, recetaFisica });
    setBusy(false);
    if (res.ok) {
      setProd(null); setQ(''); setCantidad(''); setMedico(''); setExequatur(''); setPaciente(''); setIndicaciones(''); setRecetaFisica(false);
      setAviso(res.sospechoso
        ? { tipo: 'sospecha', texto: 'Despachado y anotado en el libro. Nota: este paciente ya adquirió este mismo controlado recientemente. Revísalo — la decisión es tuya.' }
        : { tipo: 'ok', texto: 'Despachado y anotado en el libro inviolable con tu responsabilidad.' });
      router.refresh();
    } else setAviso({ tipo: 'error', texto: res.error ?? 'No se pudo.' });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><ShieldCheck className="h-6 w-6 text-accent" /> Despacho de controlados</div>
        <p className="mt-1 text-sm text-ink-soft">Solo el farmacéutico. Cada despacho entra al libro inviolable con su responsable.</p>
      </div>

      {!puedeDespachar && (
        <div className="flex items-center gap-2 rounded-card border border-rose-500/40 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <Lock className="h-4 w-4" /> Tu rol no puede despachar controlados. Puedes ver el libro, no dispensar.
        </div>
      )}

      {puedeDespachar && (
        <div className={card}>
          {prod ? (
            <div className="mb-2 flex items-center justify-between rounded-control border border-line px-3 py-2 text-sm">
              <span className="text-ink">{prod.nombre} <span className="text-ink-faint tabular-nums">· {formatNumber(prod.existencia)} u</span></span>
              <button onClick={() => { setProd(null); setQ(''); }} className="text-xs text-ink-faint hover:text-ink">cambiar</button>
            </div>
          ) : (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar controlado / de receta…" className={`${inputBase} pl-8`} />
              {resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-lg">
                  {resultados.map((p) => (
                    <button key={p.id} onClick={() => { setProd(p); setQ(p.nombre); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-ink hover:bg-accent/10">
                      <span>{p.nombre}</span><span className="text-xs text-ink-faint tabular-nums">{formatNumber(p.existencia)} u</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div><label className="mb-1 block text-xs text-ink-soft">Cantidad</label><input type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${inputBase} tabular-nums`} /></div>
            <div><label className="mb-1 block text-xs text-ink-soft">Paciente</label><input value={paciente} onChange={(e) => setPaciente(e.target.value)} className={inputBase} /></div>
            <div><label className="mb-1 block text-xs text-ink-soft">Médico</label><input value={medico} onChange={(e) => setMedico(e.target.value)} className={inputBase} /></div>
            <div><label className="mb-1 block text-xs text-ink-soft">Exequátur</label><input value={exequatur} onChange={(e) => setExequatur(e.target.value)} className={inputBase} /></div>
          </div>
          <input value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} placeholder="Indicaciones (opcional)" className={`${inputBase} mt-2`} />

          <div className="mt-3 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-2">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={recetaFisica} onChange={(e) => setRecetaFisica(e.target.checked)} className="mt-0.5" />
              <span className="flex items-center gap-1.5 font-medium"><FileCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Tengo la receta física en mano.</span>
            </label>
            <p className="mt-1 pl-6 text-xs text-amber-700 dark:text-amber-300">
              El despacho con receta solo se completa con la receta física, impresa y legible. Una foto puede acompañar el expediente como referencia, pero nunca habilita el despacho.
            </p>
          </div>

          {aviso && (
            <div className={`mt-3 flex items-center gap-2 rounded-control border px-3 py-1.5 text-xs ${aviso.tipo === 'error' ? 'border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300' : aviso.tipo === 'sospecha' ? 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300' : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'}`}>
              {aviso.tipo === 'sospecha' && <AlertTriangle className="h-3.5 w-3.5" />} {aviso.texto}
            </div>
          )}
          <button onClick={despachar} disabled={busy || !prod || !cantidad || !paciente.trim() || !recetaFisica} className="brand-gradient mt-3 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Despachar y anotar en el libro
          </button>

          <div className="mt-3"><AvisoClinico /></div>
        </div>
      )}

      <div className={card}>
        <div className="mb-2 flex items-center gap-2 font-medium text-ink"><BookLock className="h-4 w-4 text-ink-faint" /> Libro de controlados (inviolable)</div>
        {libro.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin despachos registrados.</p> : (
          <ul className="divide-y divide-line text-sm">
            {libro.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <div><span className="text-ink">{e.producto}</span> <span className="text-ink-faint tabular-nums">· {formatNumber(e.cantidad)} u</span><div className="text-xs text-ink-faint">{e.paciente} · resp. {e.farmaceutico}</div></div>
                <span className="text-xs text-ink-faint">{new Date(e.fecha).toLocaleDateString('es-DO')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
