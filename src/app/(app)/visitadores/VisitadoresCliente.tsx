'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Check, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';
import { registrarVisita } from './actions';

export interface ProductoMin { id: string; nombre: string; busqueda: string }
export interface VisitaItem { id: string; laboratorio: string; visitador: string; fecha: string; notas: string }

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

export function VisitadoresCliente({ productos, visitas }: { productos: ProductoMin[]; visitas: VisitaItem[] }) {
  const router = useRouter();
  const [laboratorio, setLaboratorio] = useState('');
  const [visitador, setVisitador] = useState('');
  const [fecha, setFecha] = useState('');
  const [notas, setNotas] = useState('');
  const [muestras, setMuestras] = useState<Array<{ productoId: string; nombre: string; cantidad: string }>>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const resultados = useMemo(() => {
    const t = normaliza(q).trim();
    if (!t) return [];
    return productos.filter((p) => p.busqueda.includes(t)).slice(0, 6);
  }, [q, productos]);

  async function registrar() {
    if (!laboratorio.trim()) { setAviso('Indica el laboratorio.'); return; }
    setBusy(true); setAviso(null);
    const res = await registrarVisita({
      laboratorio, visitador, fecha: fecha || null, notas,
      muestras: muestras.map((m) => ({ productoId: m.productoId, cantidad: Number(m.cantidad) || 0 })),
    });
    setBusy(false);
    if (res.ok) { setLaboratorio(''); setVisitador(''); setFecha(''); setNotas(''); setMuestras([]); setQ(''); setAviso('Visita registrada. Las muestras entraron marcadas (no se venden).'); router.refresh(); }
    else setAviso(res.error ?? 'No se pudo.');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><Briefcase className="h-6 w-6 text-accent" /> Visitadores médicos</div>
        <p className="mt-1 text-sm text-ink-soft">La visita, las muestras (que entran marcadas y no se venden) y los pedidos.</p>
      </div>

      <div className={card}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs text-ink-soft">Laboratorio</label><input value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Visitador</label><input value={visitador} onChange={(e) => setVisitador(e.target.value)} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Fecha</label><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputBase} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">Notas</label><input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputBase} /></div>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-xs text-ink-soft">Muestras recibidas (opcional)</div>
          {muestras.map((m, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <span className="flex-1 truncate text-sm text-ink">{m.nombre}</span>
              <input type="number" min="0" value={m.cantidad} onChange={(e) => setMuestras((x) => x.map((y, j) => j === i ? { ...y, cantidad: e.target.value } : y))} placeholder="cant." className="h-9 w-20 rounded-control border border-line bg-canvas px-2 text-center text-sm tabular-nums outline-none focus:luminous" />
              <button onClick={() => setMuestras((x) => x.filter((_, j) => j !== i))} className="text-ink-faint hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto para agregar muestra…" className={`${inputBase} pl-8`} />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-lg">
                {resultados.map((p) => (
                  <button key={p.id} onClick={() => { setMuestras((x) => [...x, { productoId: p.id, nombre: p.nombre, cantidad: '' }]); setQ(''); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-accent/10">
                    <Plus className="h-3.5 w-3.5 text-ink-faint" /> {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {aviso && <div className="mt-3 rounded-control border border-line bg-canvas px-3 py-1.5 text-xs text-ink-soft">{aviso}</div>}
        <button onClick={registrar} disabled={busy || !laboratorio.trim()} className="brand-gradient mt-3 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar visita
        </button>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Últimas visitas ({formatNumber(visitas.length)})</div>
        {visitas.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin visitas registradas.</p> : (
          <ul className="divide-y divide-line text-sm">
            {visitas.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2">
                <span className="text-ink">{v.laboratorio}{v.visitador ? ` · ${v.visitador}` : ''}</span>
                <span className="text-xs text-ink-faint">{v.fecha}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
