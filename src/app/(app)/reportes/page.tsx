import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatNumber, formatMoney } from '@/lib/format';
import { BarChart3, PackageX, ShieldAlert, ClipboardX, Pill } from 'lucide-react';

export const dynamic = 'force-dynamic';

const card = 'rounded-card border border-line bg-surface p-4';

function hace(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function Barra({ label, valor, max, sufijo }: { label: string; valor: number; max: number; sufijo?: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <div className="w-40 truncate text-ink-soft">{label}</div>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-accent/60" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-24 text-right tabular-nums text-ink">{formatNumber(valor)}{sufijo ?? ''}</div>
    </div>
  );
}

export default async function ReportesPage() {
  await requireCapability('ver_finanzas'); // reportes de gestión: Dueño/Admin
  const supabase = createClient();

  // Más vendidos (90 días).
  const { data: ventas90 } = await supabase.from('venta').select('id').eq('estado', 'completada').gte('fecha', hace(90));
  const vIds = ((ventas90 as unknown as Array<{ id: string }>) ?? []).map((v) => v.id);
  const masVendidos = new Map<string, number>();
  if (vIds.length > 0) {
    const { data: lineas } = await supabase.from('venta_linea').select('cantidad, producto:producto_id ( nombre )').in('venta_id', vIds.slice(0, 1000));
    for (const l of (lineas as unknown as Array<{ cantidad: number; producto: { nombre?: string } | null }>) ?? []) {
      const n = l.producto?.nombre ?? '—';
      masVendidos.set(n, (masVendidos.get(n) ?? 0) + Number(l.cantidad));
    }
  }
  const topVendidos = [...masVendidos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxVend = topVendidos[0]?.[1] ?? 0;

  // Merma por motivo tipificado (180 días).
  const { data: mermas } = await supabase.from('movimiento_inventario').select('cantidad, motivo_tipificado, costo_unitario_momento').eq('tipo', 'merma').gte('ocurrido_en', hace(180));
  const mermaPorMotivo = new Map<string, { unidades: number; valor: number }>();
  for (const m of (mermas as unknown as Array<{ cantidad: number; motivo_tipificado: string | null; costo_unitario_momento: number | null }>) ?? []) {
    const k = m.motivo_tipificado ?? 'sin tipificar';
    const acc = mermaPorMotivo.get(k) ?? { unidades: 0, valor: 0 };
    acc.unidades += Math.abs(Number(m.cantidad));
    acc.valor += Math.abs(Number(m.cantidad)) * Number(m.costo_unitario_momento ?? 0);
    mermaPorMotivo.set(k, acc);
  }
  const mermas180 = [...mermaPorMotivo.entries()].sort((a, b) => b[1].valor - a[1].valor);
  const maxMerma = mermas180[0]?.[1].valor ?? 0;

  // Robo hormiga: discrepancias negativas repetidas por producto (180 días).
  const { data: discs } = await supabase.from('discrepancia_inventario').select('diferencia, producto:producto_id ( nombre )').lt('diferencia', 0).gte('created_at', hace(180));
  const roboMap = new Map<string, number>();
  for (const d of (discs as unknown as Array<{ diferencia: number; producto: { nombre?: string } | null }>) ?? []) {
    const n = d.producto?.nombre ?? '—';
    roboMap.set(n, (roboMap.get(n) ?? 0) + 1);
  }
  const robo = [...roboMap.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Encargos no atendidos.
  const { data: noAtend } = await supabase.from('encargo').select('producto_texto, cliente_nombre').eq('estado', 'no_volvio').limit(20);
  const encargos = (noAtend as unknown as Array<{ producto_texto: string; cliente_nombre: string | null }>) ?? [];

  // Controlados despachados (30 días).
  const { count: controlados30 } = await supabase.from('libro_controlado').select('id', { count: 'exact', head: true }).gte('despachado_en', hace(30));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><BarChart3 className="h-6 w-6 text-accent" /> Reportes e inteligencia</div>
        <p className="mt-1 text-sm text-ink-soft">Lo que el acumulado dice y el día a día no: dónde se va el dinero y por qué.</p>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Más vendidos (90 días)</div>
        {topVendidos.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin ventas en el período.</p> :
          topVendidos.map(([n, v]) => <Barra key={n} label={n} valor={v} max={maxVend} sufijo=" u" />)}
      </div>

      <div className={card}>
        <div className="mb-2 flex items-center gap-2 font-medium text-ink"><PackageX className="h-4 w-4 text-ink-faint" /> Merma por motivo (180 días)</div>
        {mermas180.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin mermas registradas. 🎉</p> :
          mermas180.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 py-1 text-sm">
              <div className="w-40 truncate capitalize text-ink-soft">{k.replace(/_/g, ' ')}</div>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-rose-500/50" style={{ width: `${maxMerma > 0 ? Math.max(3, Math.round((v.valor / maxMerma) * 100)) : 0}%` }} /></div>
              <div className="w-28 text-right tabular-nums text-ink">{formatMoney(v.valor)}</div>
            </div>
          ))}
      </div>

      <div className={card}>
        <div className="mb-2 flex items-center gap-2 font-medium text-ink"><ShieldAlert className="h-4 w-4 text-ink-faint" /> Posible robo hormiga (discrepancias repetidas, 180 días)</div>
        <p className="mb-2 text-xs text-ink-faint">El sistema muestra el patrón, no acusa a nadie. La decisión es del dueño.</p>
        {robo.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin patrones repetidos.</p> : (
          <ul className="divide-y divide-line text-sm">
            {robo.map(([n, c]) => <li key={n} className="flex items-center justify-between py-1.5"><span className="text-ink">{n}</span><span className="text-amber-600 dark:text-amber-400 tabular-nums">{formatNumber(c)} discrepancias en contra</span></li>)}
          </ul>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={card}>
          <div className="mb-2 flex items-center gap-2 font-medium text-ink"><ClipboardX className="h-4 w-4 text-ink-faint" /> Encargos no atendidos = ventas perdidas</div>
          {encargos.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Ninguno.</p> : (
            <ul className="divide-y divide-line text-sm">
              {encargos.map((e, i) => <li key={i} className="py-1.5 text-ink-soft">{e.producto_texto}{e.cliente_nombre ? ` · ${e.cliente_nombre}` : ''}</li>)}
            </ul>
          )}
        </div>
        <div className={card}>
          <div className="mb-2 flex items-center gap-2 font-medium text-ink"><Pill className="h-4 w-4 text-ink-faint" /> Controlados despachados (30 días)</div>
          <div className="font-display text-3xl font-bold text-ink tabular-nums">{formatNumber(controlados30 ?? 0)}</div>
        </div>
      </div>

      <p className="text-xs text-ink-faint">Exportación a PDF/Excel: la carpeta DIGEMAPS ya imprime; el export tabular completo llega en Configuración (Tanda 17).</p>
    </div>
  );
}
