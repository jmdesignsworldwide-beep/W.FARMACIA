import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatNumber } from '@/lib/format';
import { TrendingUp, Moon, HeartPulse, Factory, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const card = 'rounded-card border border-line bg-surface p-4';
const tile = 'rounded-card border border-line bg-surface p-4';

export default async function FinanzasPage() {
  await requireCapability('ver_finanzas'); // solo Dueño/Admin — barrera de servidor
  const supabase = createClient();

  const desde30 = haceDias(30);

  // Ventas completadas (30 días) → ingresos.
  const { data: ventas } = await supabase
    .from('venta')
    .select('id, total, itbis')
    .eq('estado', 'completada')
    .gte('fecha', desde30);
  const ventasRows = (ventas as unknown as Array<{ id: string; total: number; itbis: number }>) ?? [];
  const ingresos = ventasRows.reduce((s, v) => s + Number(v.total), 0);
  const ventaIds = ventasRows.map((v) => v.id);

  // Líneas de esas ventas → costo real (congelado) + margen por categoría.
  let costo = 0;
  const porCategoria = new Map<string, { ingreso: number; costo: number }>();
  if (ventaIds.length > 0) {
    const { data: lineas } = await supabase
      .from('venta_linea')
      .select('cantidad, precio_unitario, itbis_linea, costo_unitario_momento, producto:producto_id ( categoria:categoria_comercial_id ( nombre ) )')
      .in('venta_id', ventaIds.slice(0, 1000));
    for (const l of (lineas as unknown as Array<{ cantidad: number; precio_unitario: number; itbis_linea: number; costo_unitario_momento: number | null; producto: { categoria: { nombre: string } | null } | null }>) ?? []) {
      const c = Number(l.costo_unitario_momento ?? 0) * Number(l.cantidad);
      const ingLinea = Number(l.precio_unitario) * Number(l.cantidad) - Number(l.itbis_linea ?? 0);
      costo += c;
      const cat = l.producto?.categoria?.nombre ?? 'Sin categoría';
      const acc = porCategoria.get(cat) ?? { ingreso: 0, costo: 0 };
      acc.ingreso += ingLinea;
      acc.costo += c;
      porCategoria.set(cat, acc);
    }
  }
  const margen = ingresos - costo;
  const margenPct = ingresos > 0 ? (margen / ingresos) * 100 : 0;

  // Capital dormido: lotes activos de productos SIN venta en 90 días.
  const { data: movVenta } = await supabase.from('movimiento_inventario').select('producto_id').eq('tipo', 'venta').gte('ocurrido_en', haceDias(90));
  const movidos = new Set(((movVenta as unknown as Array<{ producto_id: string }>) ?? []).map((m) => m.producto_id));
  const { data: lotes } = await supabase.from('lote').select('producto_id, cantidad_actual, costo_unitario').eq('estado', 'activo').gt('cantidad_actual', 0);
  let inventarioVivo = 0;
  let capitalDormido = 0;
  for (const l of (lotes as unknown as Array<{ producto_id: string; cantidad_actual: number; costo_unitario: number | null }>) ?? []) {
    const val = Number(l.cantidad_actual) * Number(l.costo_unitario ?? 0);
    inventarioVivo += val;
    if (!movidos.has(l.producto_id)) capitalDormido += val;
  }

  // Ingresos por servicios (30 días).
  const { data: servicios } = await supabase.from('servicio').select('valor').gte('created_at', desde30);
  const ingresoServicios = ((servicios as unknown as Array<{ valor: number }>) ?? []).reduce((s, x) => s + Number(x.valor), 0);

  // Crónicos activos (proxy de ingreso recurrente).
  const { count: cronicosActivos } = await supabase.from('tratamiento_cronico').select('id', { count: 'exact', head: true }).eq('estado', 'activo');

  // Erosión de margen por laboratorio (subidas de costo, 180 días).
  const { data: hist } = await supabase
    .from('historial_costo')
    .select('variacion_porcentual, proveedor:proveedor_id ( nombre )')
    .gt('variacion_porcentual', 0)
    .gte('fecha', haceDias(180));
  const porLab = new Map<string, { subidas: number; suma: number }>();
  for (const h of (hist as unknown as Array<{ variacion_porcentual: number; proveedor: { nombre: string } | null }>) ?? []) {
    const lab = h.proveedor?.nombre ?? 'Sin proveedor';
    const acc = porLab.get(lab) ?? { subidas: 0, suma: 0 };
    acc.subidas += 1;
    acc.suma += Number(h.variacion_porcentual);
    porLab.set(lab, acc);
  }
  const labs = [...porLab.entries()].filter(([, v]) => v.subidas >= 2).sort((a, b) => b[1].suma - a[1].suma).slice(0, 5);
  const categorias = [...porCategoria.entries()].map(([k, v]) => ({ cat: k, margen: v.ingreso - v.costo, ingreso: v.ingreso })).sort((a, b) => b.margen - a.margen).slice(0, 6);

  // ── Pronóstico de flujo de caja: por cobrar (fiado) vs por pagar (Tanda 15) ──
  const { data: cobrosCred } = await supabase.from('cobro').select('monto').eq('metodo', 'credito_interno');
  const fiadoBruto = ((cobrosCred as unknown as Array<{ monto: number }>) ?? []).reduce((s, c) => s + Number(c.monto), 0);
  const { data: abonosAll } = await supabase.from('abono').select('monto');
  const abonadoBruto = ((abonosAll as unknown as Array<{ monto: number }>) ?? []).reduce((s, a) => s + Number(a.monto), 0);
  const porCobrar = Math.max(0, fiadoBruto - abonadoBruto);

  const hoyStr = new Date().toISOString().slice(0, 10);
  const { data: cxpPend } = await supabase.from('cuenta_por_pagar').select('monto, fecha_vencimiento').eq('estado', 'pendiente');
  const cxpRows = (cxpPend as unknown as Array<{ monto: number; fecha_vencimiento: string | null }>) ?? [];
  const porPagar = cxpRows.reduce((s, c) => s + Number(c.monto), 0);
  const porPagarVencido = cxpRows.filter((c) => c.fecha_vencimiento && c.fecha_vencimiento < hoyStr).reduce((s, c) => s + Number(c.monto), 0);
  const posicionNeta = porCobrar - porPagar;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><TrendingUp className="h-6 w-6 text-accent" /> Panel financiero</div>
        <p className="mt-1 text-sm text-ink-soft">Rentabilidad real (costo congelado del lote), no ventas brutas. Últimos 30 días.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className={tile}><div className="text-xs text-ink-faint">Ingresos (30d)</div><div className="font-display text-2xl font-bold text-ink tabular-nums">{formatMoney(ingresos)}</div></div>
        <div className={tile}><div className="text-xs text-ink-faint">Costo de lo vendido</div><div className="font-display text-2xl font-bold text-ink tabular-nums">{formatMoney(costo)}</div></div>
        <div className={tile}><div className="text-xs text-ink-faint">Margen real</div><div className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMoney(margen)}</div><div className="text-xs text-ink-faint tabular-nums">{margenPct.toFixed(1)}%</div></div>
        <div className={tile}><div className="flex items-center gap-1 text-xs text-ink-faint"><HeartPulse className="h-3 w-3" /> Servicios (30d)</div><div className="font-display text-2xl font-bold text-ink tabular-nums">{formatMoney(ingresoServicios)}</div></div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={tile}><div className="flex items-center gap-1 text-xs text-ink-faint"><Moon className="h-3 w-3" /> Capital dormido (sin venta &gt;90 días)</div><div className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{formatMoney(capitalDormido)}</div><div className="text-xs text-ink-faint">de {formatMoney(inventarioVivo)} de inventario vivo (al costo)</div></div>
        <div className={tile}><div className="text-xs text-ink-faint">Ingreso recurrente (crónicos activos)</div><div className="font-display text-2xl font-bold text-ink tabular-nums">{formatNumber(cronicosActivos ?? 0)}</div><div className="text-xs text-ink-faint">pacientes con tratamiento recurrente</div></div>
      </div>

      <div className={card}>
        <div className="mb-2 font-medium text-ink">Rentabilidad por categoría (30d)</div>
        {categorias.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin ventas en el período.</p> : (
          <table className="w-full text-sm"><tbody>
            {categorias.map((c) => <tr key={c.cat}><td className="py-1 text-ink">{c.cat}</td><td className="py-1 text-right text-ink-soft tabular-nums">ingreso {formatMoney(c.ingreso)}</td><td className="py-1 text-right font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">margen {formatMoney(c.margen)}</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className={card}>
        <div className="mb-2 flex items-center gap-2 font-medium text-ink"><Factory className="h-4 w-4 text-ink-faint" /> Erosión de margen por laboratorio (180d)</div>
        {labs.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">Sin subidas de costo repetidas. 🎉</p> : (
          <ul className="divide-y divide-line text-sm">
            {labs.map(([lab, v]) => <li key={lab} className="flex items-center justify-between py-1.5"><span className="text-ink">{lab}</span><span className="text-amber-600 dark:text-amber-400 tabular-nums">te subió {formatNumber(v.subidas)} veces · +{v.suma.toFixed(1)}% acumulado</span></li>)}
          </ul>
        )}
      </div>

      <div className={card}>
        <div className="mb-3 font-medium text-ink">Pronóstico de flujo de caja</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="rounded-card border border-line bg-canvas p-3">
            <div className="flex items-center gap-1 text-xs text-ink-faint"><ArrowDownCircle className="h-3 w-3 text-emerald-500" /> Por cobrar (fiado)</div>
            <div className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatMoney(porCobrar)}</div>
          </div>
          <div className="rounded-card border border-line bg-canvas p-3">
            <div className="flex items-center gap-1 text-xs text-ink-faint"><ArrowUpCircle className="h-3 w-3 text-rose-500" /> Por pagar (droguerías)</div>
            <div className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatMoney(porPagar)}</div>
            {porPagarVencido > 0 && <div className="text-xs text-rose-500">{formatMoney(porPagarVencido)} ya vencido</div>}
          </div>
          <div className="rounded-card border border-line bg-canvas p-3">
            <div className="text-xs text-ink-faint">Posición neta</div>
            <div className={`font-display text-2xl font-bold tabular-nums ${posicionNeta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatMoney(posicionNeta)}</div>
            <div className="text-xs text-ink-faint">{posicionNeta >= 0 ? 'te deben más de lo que debes' : 'debes más de lo que te deben'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
