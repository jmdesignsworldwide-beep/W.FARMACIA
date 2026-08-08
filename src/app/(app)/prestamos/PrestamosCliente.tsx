'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Check, Clock, Handshake, Loader2, Search } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';
import { registrarPrestamo, marcarDevuelto } from './actions';

export interface ProductoMin { id: string; nombre: string; busqueda: string }
export interface PrestamoItem {
  id: string; tipo: 'dado' | 'recibido'; producto: string; cantidad: number; contraparte: string;
  estado: 'pendiente' | 'devuelto'; fecha: string; diasPendiente: number | null;
}

const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

export function PrestamosCliente({ productos, prestamos }: { productos: ProductoMin[]; prestamos: PrestamoItem[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<'dado' | 'recibido'>('dado');
  const [q, setQ] = useState('');
  const [prod, setProd] = useState<ProductoMin | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [contraparte, setContraparte] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const resultados = useMemo(() => {
    const t = normaliza(q).trim();
    if (!t || prod) return [];
    return productos.filter((p) => p.busqueda.includes(t)).slice(0, 6);
  }, [q, productos, prod]);

  const pendientes = prestamos.filter((p) => p.estado === 'pendiente');
  const devueltos = prestamos.filter((p) => p.estado === 'devuelto');

  async function registrar() {
    if (!prod) { setAviso('Elige un producto.'); return; }
    setBusy('reg'); setAviso(null);
    const res = await registrarPrestamo({ tipo, productoId: prod.id, cantidad: Number(cantidad), contraparte, nota });
    setBusy(null);
    if (res.ok) { setProd(null); setQ(''); setCantidad(''); setContraparte(''); setNota(''); router.refresh(); }
    else setAviso(res.error ?? 'No se pudo.');
  }
  async function devolver(id: string) {
    setBusy(id);
    await marcarDevuelto(id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><Handshake className="h-6 w-6 text-accent" /> Préstamos entre farmacias</div>
        <p className="mt-1 text-sm text-ink-soft">Se acabó algo, la de la esquina lo tiene. Que no se lleve en la cabeza.</p>
      </div>

      <div className={card}>
        <div className="mb-3 inline-flex rounded-control border border-line p-0.5 text-sm">
          <button onClick={() => setTipo('dado')} className={`rounded-control px-3 py-1 ${tipo === 'dado' ? 'bg-accent/10 text-ink' : 'text-ink-soft'}`}>Presté (dado)</button>
          <button onClick={() => setTipo('recibido')} className={`rounded-control px-3 py-1 ${tipo === 'recibido' ? 'bg-accent/10 text-ink' : 'text-ink-soft'}`}>Me prestaron (recibido)</button>
        </div>

        {prod ? (
          <div className="mb-2 flex items-center justify-between rounded-control border border-line px-3 py-2 text-sm">
            <span className="text-ink">{prod.nombre}</span>
            <button onClick={() => { setProd(null); setQ(''); }} className="text-xs text-ink-faint hover:text-ink">cambiar</button>
          </div>
        ) : (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className={`${inputBase} pl-8`} />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-card border border-line bg-surface shadow-lg">
                {resultados.map((p) => <button key={p.id} onClick={() => { setProd(p); setQ(p.nombre); }} className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-accent/10">{p.nombre}</button>)}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs text-ink-soft">Cantidad</label><input type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${inputBase} tabular-nums`} /></div>
          <div><label className="mb-1 block text-xs text-ink-soft">La otra farmacia</label><input value={contraparte} onChange={(e) => setContraparte(e.target.value)} className={inputBase} /></div>
        </div>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" className={`${inputBase} mt-3`} />
        {aviso && <div className="mt-3 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">{aviso}</div>}
        <button onClick={registrar} disabled={busy === 'reg' || !prod || !cantidad || !contraparte.trim()} className="brand-gradient mt-3 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy === 'reg' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar préstamo
        </button>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Pendientes ({formatNumber(pendientes.length)})</div>
        {pendientes.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Nada pendiente.</p> : (
          <ul className="divide-y divide-line">
            {pendientes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-ink">
                    <ArrowLeftRight className="h-3.5 w-3.5 text-ink-faint" />
                    {p.tipo === 'dado' ? 'Presté a' : 'Me prestó'} {p.contraparte}
                  </div>
                  <div className="text-xs text-ink-faint tabular-nums">
                    {p.producto} · {formatNumber(p.cantidad)} u · {p.fecha}
                    {p.diasPendiente != null && p.diasPendiente > 30 && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><Clock className="h-3 w-3" />{p.diasPendiente}d sin devolver</span>}
                  </div>
                </div>
                <button onClick={() => devolver(p.id)} disabled={busy === p.id} className="rounded-control border border-line px-3 py-1 text-xs text-ink-soft hover:luminous disabled:opacity-40">Marcar devuelto</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {devueltos.length > 0 && (
        <div className={card}>
          <div className="mb-2 font-medium text-ink">Devueltos</div>
          <ul className="divide-y divide-line text-sm">
            {devueltos.slice(0, 10).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-1.5 text-ink-soft">
                <span>{p.tipo === 'dado' ? 'Presté a' : 'Me prestó'} {p.contraparte} · {p.producto}</span>
                <span className="text-xs text-ink-faint tabular-nums">{formatNumber(p.cantidad)} u</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
