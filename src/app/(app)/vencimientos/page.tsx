import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatMoney, formatNumber } from '@/lib/format';
import { AlertTriangle, CalendarClock } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface LoteRow {
  id: string;
  cantidad_actual: number | null;
  costo_unitario: number | null;
  fecha_vencimiento: string | null;
  fecha_recepcion: string | null;
  producto: { nombre: string | null; precio_venta: number | null } | null;
  proveedor: { nombre: string | null; acepta_devoluciones: boolean | null; dias_minimos_vida_util_devolucion: number | null; porcentaje_recuperacion: number | null } | null;
}

function diasEntre(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default async function VencimientosPage() {
  await requireCapability('ver_operacion');
  const supabase = createClient();

  const { data } = await supabase
    .from('lote')
    .select('id, cantidad_actual, costo_unitario, fecha_vencimiento, fecha_recepcion, producto:producto_id ( nombre, precio_venta ), proveedor:proveedor_id ( nombre, acepta_devoluciones, dias_minimos_vida_util_devolucion, porcentaje_recuperacion )')
    .eq('estado', 'activo')
    .gt('cantidad_actual', 0)
    .not('fecha_vencimiento', 'is', null);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const filas = ((data as unknown as LoteRow[]) ?? [])
    .map((l) => {
      const venc = new Date((l.fecha_vencimiento as string) + 'T00:00:00');
      const recep = l.fecha_recepcion ? new Date(l.fecha_recepcion + 'T00:00:00') : null;
      const diasRestantes = diasEntre(hoy, venc);
      const ventana = recep ? diasEntre(recep, venc) : null;
      const vidaPct = ventana && ventana > 0 ? Math.max(0, Math.min(100, Math.round((diasRestantes / ventana) * 100))) : null;
      const cant = Number(l.cantidad_actual ?? 0);
      const costo = Number(l.costo_unitario ?? 0);
      const valorRiesgo = cant * costo;

      // Ventana de devolución = vencimiento − días mínimos del proveedor.
      const aceptaDev = Boolean(l.proveedor?.acepta_devoluciones);
      const diasMin = l.proveedor?.dias_minimos_vida_util_devolucion ?? null;
      const ventanaAbierta = aceptaDev && diasMin != null && diasRestantes >= diasMin;

      let recomendacion: string;
      let tono: string;
      let recupera: string;
      if (diasRestantes < 0) {
        recomendacion = 'Provisionar pérdida'; tono = 'text-ink-faint'; recupera = 'Registrar la lección';
      } else if (ventanaAbierta) {
        recomendacion = 'Devolver al laboratorio'; tono = 'text-emerald-600 dark:text-emerald-400';
        recupera = l.proveedor?.porcentaje_recuperacion != null ? `Recupera ${l.proveedor.porcentaje_recuperacion}%` : 'Recupera ~100%';
      } else if (diasRestantes > 60) {
        recomendacion = 'Promocionar'; tono = 'text-amber-600 dark:text-amber-400'; recupera = 'Margen parcial';
      } else if (diasRestantes >= 0) {
        recomendacion = 'Descontar fuerte'; tono = 'text-orange-600 dark:text-orange-400'; recupera = 'Recupera el costo';
      } else {
        recomendacion = 'Provisionar pérdida'; tono = 'text-ink-faint'; recupera = '';
      }

      const limiteDevolucion = diasMin != null ? new Date(venc.getTime() - diasMin * 86400000) : null;

      return {
        id: l.id,
        producto: l.producto?.nombre ?? '—',
        proveedor: l.proveedor?.nombre ?? null,
        cant,
        diasRestantes,
        vidaPct,
        valorRiesgo,
        recomendacion,
        tono,
        recupera,
        limiteDevolucion: ventanaAbierta && limiteDevolucion ? limiteDevolucion.toISOString().slice(0, 10) : null,
      };
    })
    // El radar no grita por lo que está bien: solo lo que se acerca (≤180 días o vencido).
    .filter((f) => f.diasRestantes <= 180)
    .sort((a, b) => b.valorRiesgo - a.valorRiesgo);

  const totalRiesgo = filas.reduce((s, f) => s + f.valorRiesgo, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><CalendarClock className="h-6 w-6 text-accent" /> Radar de vencimientos</div>
        <p className="mt-1 text-sm text-ink-soft">No es «cuándo vence». Es «cuándo se cierra mi última opción de recuperar este dinero».</p>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        <div className="text-xs text-ink-faint">Capital en riesgo (vence en ≤180 días)</div>
        <div className="font-display text-3xl font-bold text-ink tabular-nums">{formatMoney(totalRiesgo)}</div>
      </div>

      <div className="rounded-card border border-line bg-surface p-4">
        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">Nada por vencer en los próximos 180 días. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-faint">
                  <th className="py-2 pr-2">Producto</th>
                  <th className="px-2">Vida útil</th>
                  <th className="px-2">Vence en</th>
                  <th className="px-2 text-right">En riesgo</th>
                  <th className="px-2">Recomendación</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b border-line/60">
                    <td className="py-2 pr-2">
                      <div className="text-ink">{f.producto}</div>
                      <div className="text-xs text-ink-faint">{formatNumber(f.cant)} u{f.proveedor ? ` · ${f.proveedor}` : ''}</div>
                    </td>
                    <td className="px-2 tabular-nums">{f.vidaPct != null ? `${f.vidaPct}%` : '—'}</td>
                    <td className="px-2 tabular-nums">
                      {f.diasRestantes < 0 ? <span className="text-ink-faint">vencido</span> : <span className={f.diasRestantes < 30 ? 'text-rose-600 dark:text-rose-400' : 'text-ink-soft'}>{f.diasRestantes} d</span>}
                    </td>
                    <td className="px-2 text-right font-medium text-ink tabular-nums">{formatMoney(f.valorRiesgo)}</td>
                    <td className="px-2">
                      <div className={`font-medium ${f.tono}`}>{f.recomendacion}</div>
                      <div className="text-xs text-ink-faint">{f.recupera}{f.limiteDevolucion ? ` · hasta ${f.limiteDevolucion}` : ''}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <AlertTriangle className="h-3.5 w-3.5" /> El flujo de devolución de un clic (con su registro y seguimiento de nota de crédito) llega en una pieza siguiente.
      </p>
    </div>
  );
}
