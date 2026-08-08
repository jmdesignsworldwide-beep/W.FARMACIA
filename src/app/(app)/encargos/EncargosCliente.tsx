'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ClipboardList, Loader2, MessageCircle, Plus } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { crearEncargo, cambiarEstadoEncargo } from './actions';

export interface EncargoItem {
  id: string; producto: string; cliente: string; telefono: string; cantidad: number | null;
  estado: 'pendiente' | 'pedido' | 'llego' | 'entregado' | 'no_volvio'; nota: string; fecha: string;
}

const ESTADO_LABEL: Record<EncargoItem['estado'], string> = {
  pendiente: 'Pendiente', pedido: 'Pedido al proveedor', llego: 'Llegó', entregado: 'Entregado', no_volvio: 'No volvió',
};
const SIGUIENTE: Partial<Record<EncargoItem['estado'], EncargoItem['estado']>> = { pendiente: 'pedido', pedido: 'llego', llego: 'entregado' };
const card = 'rounded-card border border-line bg-surface p-4';
const inputBase = 'h-10 w-full rounded-control border border-line bg-canvas px-3 text-ink outline-none focus:luminous';

function waLink(tel: string, texto: string): string | null {
  const d = tel.replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? '1' + d : d}?text=${encodeURIComponent(texto)}`;
}

export function EncargosCliente({ encargos }: { encargos: EncargoItem[] }) {
  const router = useRouter();
  const [producto, setProducto] = useState('');
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const activos = encargos.filter((e) => e.estado !== 'entregado' && e.estado !== 'no_volvio');
  const noAtendidos = encargos.filter((e) => e.estado === 'no_volvio').length;

  async function crear() {
    if (!producto.trim()) { setAviso('¿Qué se encarga?'); return; }
    setBusy('crear'); setAviso(null);
    const res = await crearEncargo({ productoTexto: producto, clienteNombre: cliente, telefono, cantidad: cantidad ? Number(cantidad) : null, nota });
    setBusy(null);
    if (res.ok) { setProducto(''); setCliente(''); setTelefono(''); setCantidad(''); setNota(''); router.refresh(); }
    else setAviso(res.error ?? 'No se pudo.');
  }
  async function estado(id: string, e: EncargoItem['estado']) {
    setBusy(id + e);
    await cambiarEstadoEncargo(id, e);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><ClipboardList className="h-6 w-6 text-accent" /> Encargos</div>
        <p className="mt-1 text-sm text-ink-soft">«Te lo consigo mañana» — que no se pierda ni se olvide avisar.</p>
      </div>

      {noAtendidos > 0 && (
        <div className="rounded-card border border-amber-500/40 bg-amber-500/5 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          <strong>{formatNumber(noAtendidos)}</strong> encargo(s) que el cliente no volvió a buscar = ventas perdidas medibles.
        </div>
      )}

      <div className={card}>
        <div className="mb-2 flex items-center gap-2 font-medium text-ink"><Plus className="h-4 w-4 text-ink-faint" /> Nuevo encargo</div>
        <input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="¿Qué se encarga? (producto)" className={inputBase} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Cliente" className={inputBase} />
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" className={inputBase} />
          <input type="number" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" className={`${inputBase} tabular-nums`} />
        </div>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" className={`${inputBase} mt-2`} />
        {aviso && <div className="mt-2 rounded-control border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">{aviso}</div>}
        <button onClick={crear} disabled={busy === 'crear' || !producto.trim()} className="brand-gradient mt-2 inline-flex items-center gap-2 rounded-control px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy === 'crear' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Registrar
        </button>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Activos ({formatNumber(activos.length)})</div>
        {activos.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin encargos activos.</p> : (
          <ul className="divide-y divide-line">
            {activos.map((e) => {
              const wa = e.estado === 'llego' ? waLink(e.telefono, `Hola${e.cliente ? ' ' + e.cliente : ''}, llegó lo que encargó (${e.producto}). Puede pasar a buscarlo.`) : null;
              const sig = SIGUIENTE[e.estado];
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="text-ink">{e.producto}{e.cantidad ? ` · ${formatNumber(e.cantidad)}` : ''}</div>
                    <div className="text-xs text-ink-faint">
                      <span className={e.estado === 'llego' ? 'text-emerald-600 dark:text-emerald-400' : ''}>{ESTADO_LABEL[e.estado]}</span>
                      {e.cliente ? ` · ${e.cliente}` : ''}{e.telefono ? ` · ${e.telefono}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-control border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"><MessageCircle className="h-3.5 w-3.5" /> Avisar</a>}
                    {sig && <button onClick={() => estado(e.id, sig)} disabled={busy === e.id + sig} className="rounded-control border border-line px-2.5 py-1 text-xs text-ink-soft hover:luminous disabled:opacity-40">→ {ESTADO_LABEL[sig]}</button>}
                    <button onClick={() => estado(e.id, 'no_volvio')} disabled={busy === e.id + 'no_volvio'} className="rounded-control border border-line px-2.5 py-1 text-xs text-ink-faint hover:text-rose-500 disabled:opacity-40">No volvió</button>
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
