'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatNumber, formatMoney } from '@/lib/format';
import { normaliza } from '@/lib/catalogos';
import { fijarMinimo, crearOrdenCompra, marcarOrdenEnviada, cambiarEstadoOrden, type LineaOrden } from './actions';
import { Loader2, MessageCircle, Send, Check, PackagePlus, AlertTriangle, X } from 'lucide-react';

export interface ProductoBajo {
  id: string; nombre: string; existencia: number; minimo: number; sugeridoPedir: number;
  proveedorId: string | null; proveedorNombre: string | null; precioEsperado: number | null;
}
export interface ProveedorOpt { id: string; nombre: string; telefono: string | null }
export interface OrdenItem { id: string; estado: string; proveedor: string; renglones: number; fechaEnvio: string | null; createdAt: string }
interface SinMinimo { id: string; nombre: string; sugerido: number; existencia: number }

const card = 'rounded-card border border-line bg-surface p-4';

function waProveedor(telefono: string | null, texto: string): string | null {
  if (!telefono) return null;
  const d = telefono.replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? '1' + d : d}?text=${encodeURIComponent(texto)}`;
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada', recibida_parcial: 'Recibida parcial', recibida: 'Recibida', cancelada: 'Cancelada',
};

export function ComprasCliente({ bajos, sinMinimo, proveedores, ordenes }: { bajos: ProductoBajo[]; sinMinimo: SinMinimo[]; proveedores: ProveedorOpt[]; ordenes: OrdenItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cant, setCant] = useState<Record<string, string>>(() => Object.fromEntries(bajos.map((b) => [b.id, String(b.sugeridoPedir)])));
  const [config, setConfig] = useState(false);
  const [qMin, setQMin] = useState('');
  const [minVals, setMinVals] = useState<Record<string, string>>({});

  const telProv = useMemo(() => new Map(proveedores.map((p) => [p.nombre, p.telefono])), [proveedores]);

  // Agrupar bajos por proveedor.
  const grupos = useMemo(() => {
    const m = new Map<string, ProductoBajo[]>();
    for (const b of bajos) {
      const k = b.proveedorNombre ?? 'Sin proveedor asignado';
      const arr = m.get(k); if (arr) arr.push(b); else m.set(k, [b]);
    }
    return [...m.entries()];
  }, [bajos]);

  async function generarOrden(proveedorNombre: string, items: ProductoBajo[]) {
    setBusy(`orden:${proveedorNombre}`); setError(null);
    const proveedorId = items.find((i) => i.proveedorId)?.proveedorId ?? null;
    const lineas: LineaOrden[] = items
      .map((i) => ({ productoId: i.id, cantidad: Number(cant[i.id] ?? i.sugeridoPedir) || 0, precioEsperado: i.precioEsperado }))
      .filter((l) => l.cantidad > 0);
    const res = await crearOrdenCompra({ proveedorId, nota: `Reabastecimiento — ${proveedorNombre}`, lineas });
    setBusy(null);
    if (res.ok) router.refresh();
    else setError(res.error ?? 'No se pudo crear la orden.');
  }

  async function guardarMinimo(id: string) {
    const v = Number(minVals[id]);
    if (!(v > 0)) return;
    setBusy(`min:${id}`);
    const res = await fijarMinimo(id, v);
    setBusy(null);
    if (res.ok) router.refresh(); else setError(res.error ?? 'No se pudo.');
  }

  const sinMinFiltrados = useMemo(() => {
    const t = normaliza(qMin).trim();
    if (!t) return sinMinimo.slice(0, 12);
    return sinMinimo.filter((s) => normaliza(s.nombre).includes(t)).slice(0, 12);
  }, [qMin, sinMinimo]);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-control border border-rose-500/40 bg-rose-500/5 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-300">{error}</div>}

      {/* Bajo de stock, por proveedor */}
      {grupos.length === 0 ? (
        <div className={`${card} text-center text-sm text-ink-faint`}>
          Nada por debajo de su mínimo. {sinMinimo.length > 0 && 'Configura mínimos abajo para que el radar empiece a avisar.'}
        </div>
      ) : grupos.map(([prov, items]) => {
        const texto = `Buenos días, ${prov}. Necesito reabastecer:\n` + items.map((i) => `• ${i.nombre} — ${cant[i.id] ?? i.sugeridoPedir}`).join('\n');
        const wa = waProveedor(telProv.get(prov) ?? null, texto);
        return (
          <div key={prov} className={card}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-ink"><AlertTriangle className="h-4 w-4 text-amber-500" /> {prov}</div>
              <span className="text-xs text-ink-faint">{items.length} producto(s)</span>
            </div>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-ink">{i.nombre}</div>
                    <div className="text-xs text-ink-faint">Hay {formatNumber(i.existencia)} · mínimo {formatNumber(i.minimo)}{i.precioEsperado ? ` · últ. costo ${formatMoney(i.precioEsperado)}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-ink-faint">Pedir</span>
                    <input type="number" min="0" value={cant[i.id] ?? String(i.sugeridoPedir)} onChange={(e) => setCant((c) => ({ ...c, [i.id]: e.target.value }))} className="h-8 w-20 rounded-control border border-line bg-canvas px-2 text-right text-sm tabular-nums text-ink outline-none focus:luminous" />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void generarOrden(prov, items)} disabled={busy === `orden:${prov}`} className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-2 text-sm text-ink hover:bg-canvas disabled:opacity-40">
                {busy === `orden:${prov}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Crear orden
              </button>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-control bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  <MessageCircle className="h-4 w-4" /> Pedir por WhatsApp
                </a>
              )}
            </div>
          </div>
        );
      })}

      {/* Configurar mínimos */}
      <div className={card}>
        <button onClick={() => setConfig(!config)} className="flex w-full items-center justify-between text-left">
          <span className="font-medium text-ink">Configurar mínimos por producto</span>
          <span className="text-xs text-ink-faint">{config ? 'ocultar' : `${sinMinimo.length} sin mínimo`}</span>
        </button>
        {config && (
          <div className="mt-3 space-y-2">
            <input value={qMin} onChange={(e) => setQMin(e.target.value)} placeholder="Buscar producto…" className="h-9 w-full rounded-control border border-line bg-canvas px-3 text-sm text-ink outline-none focus:luminous" />
            {sinMinFiltrados.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-sm">
                <div className="min-w-0"><span className="text-ink">{s.nombre}</span><span className="ml-2 text-xs text-ink-faint">hay {formatNumber(s.existencia)}</span></div>
                <div className="flex items-center gap-1.5">
                  <input type="number" min="0" placeholder={`sug. ${s.sugerido}`} value={minVals[s.id] ?? ''} onChange={(e) => setMinVals((m) => ({ ...m, [s.id]: e.target.value }))} className="h-8 w-24 rounded-control border border-line bg-canvas px-2 text-right text-sm tabular-nums text-ink outline-none focus:luminous" />
                  <button onClick={() => { setMinVals((m) => ({ ...m, [s.id]: String(s.sugerido) })); }} className="rounded-control border border-line px-2 py-1 text-xs text-ink-soft hover:bg-canvas">usar {s.sugerido}</button>
                  <button onClick={() => void guardarMinimo(s.id)} disabled={busy === `min:${s.id}` || !(Number(minVals[s.id]) > 0)} className="rounded-control bg-accent/10 px-2 py-1 text-xs text-ink disabled:opacity-40">
                    {busy === `min:${s.id}` ? '…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Órdenes */}
      <div className={card}>
        <div className="mb-2 font-medium text-ink">Órdenes de compra</div>
        {ordenes.length === 0 ? <p className="py-2 text-center text-sm text-ink-faint">Aún no hay órdenes.</p> : (
          <ul className="divide-y divide-line text-sm">
            {ordenes.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="text-ink">{o.proveedor}</span>
                  <span className="ml-2 text-xs text-ink-faint">{o.renglones} renglón(es) · {ESTADO_LABEL[o.estado] ?? o.estado}{o.fechaEnvio ? ` · enviada ${new Date(o.fechaEnvio).toLocaleDateString('es-DO')}` : ''}</span>
                </div>
                <div className="flex gap-1.5">
                  {o.estado === 'borrador' && (
                    <button onClick={() => { setBusy(`env:${o.id}`); void marcarOrdenEnviada(o.id).then((r) => { setBusy(null); if (r.ok) router.refresh(); }); }} disabled={busy === `env:${o.id}`} className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs text-ink hover:bg-canvas">
                      <Send className="h-3 w-3" /> Marcar enviada
                    </button>
                  )}
                  {(o.estado === 'enviada' || o.estado === 'recibida_parcial') && (
                    <button onClick={() => { setBusy(`rec:${o.id}`); void cambiarEstadoOrden(o.id, 'recibida').then((r) => { setBusy(null); if (r.ok) router.refresh(); }); }} disabled={busy === `rec:${o.id}`} className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs text-emerald-700 hover:bg-canvas dark:text-emerald-400">
                      <Check className="h-3 w-3" /> Recibida
                    </button>
                  )}
                  {o.estado !== 'recibida' && o.estado !== 'cancelada' && (
                    <button onClick={() => { setBusy(`can:${o.id}`); void cambiarEstadoOrden(o.id, 'cancelada').then((r) => { setBusy(null); if (r.ok) router.refresh(); }); }} disabled={busy === `can:${o.id}`} className="inline-flex items-center gap-1 rounded-control border border-line px-2 py-1 text-xs text-ink-faint hover:bg-canvas">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
