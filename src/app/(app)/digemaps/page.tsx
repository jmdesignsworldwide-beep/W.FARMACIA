import { requireCapability } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatNumber } from '@/lib/format';
import { FolderOpen } from 'lucide-react';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';
const seccion = 'rounded-card border border-line bg-surface p-4 break-inside-avoid';
const th = 'py-1 pr-3 text-left text-xs font-medium text-ink-faint';
const td = 'py-1 pr-3 align-top';

export default async function DigemapsPage() {
  await requireCapability('despachar_controlados');
  const supabase = createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const [regentes, libro, temps, sanitarios, vencidos, recepciones] = await Promise.all([
    supabase.from('profiles').select('nombre, exequatur, licencia_vencimiento').not('exequatur', 'is', null).is('eliminado_en', null),
    supabase.from('libro_controlado').select('cantidad, paciente_nombre, despachado_en, producto:producto_id ( nombre ), farmaceutico:farmaceutico_id ( nombre )').order('despachado_en', { ascending: false }).limit(50),
    supabase.from('lectura_temperatura').select('valor_celsius, fuera_de_rango, tomada_en').eq('sucursal_id', SUCURSAL).order('tomada_en', { ascending: false }).limit(30),
    supabase.from('producto').select('nombre, registro_sanitario').not('registro_sanitario', 'is', null).is('eliminado_en', null).order('nombre').limit(200),
    supabase.from('lote').select('numero_lote, fecha_vencimiento, cantidad_actual, estado, producto:producto_id ( nombre )').or(`estado.eq.vencido,and(fecha_vencimiento.lt.${hoy})`).gt('cantidad_actual', 0).limit(100),
    supabase.from('recepcion').select('factura_numero, fecha, proveedor:proveedor_id ( nombre )').eq('confirmada', true).order('fecha', { ascending: false }).limit(40),
  ]);

  const r = <T,>(d: { data: unknown }) => (d.data as unknown as T[]) ?? [];
  const regentesL = r<{ nombre: string; exequatur: string; licencia_vencimiento: string | null }>(regentes);
  const libroL = r<{ cantidad: number; paciente_nombre: string; despachado_en: string; producto: { nombre?: string } | null; farmaceutico: { nombre?: string } | null }>(libro);
  const tempsL = r<{ valor_celsius: number; fuera_de_rango: boolean; tomada_en: string }>(temps);
  const sanitariosL = r<{ nombre: string; registro_sanitario: string }>(sanitarios);
  const vencidosL = r<{ numero_lote: string | null; fecha_vencimiento: string | null; cantidad_actual: number; producto: { nombre?: string } | null }>(vencidos);
  const recepcionesL = r<{ factura_numero: string | null; fecha: string; proveedor: { nombre?: string } | null }>(recepciones);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2 font-display text-xl font-semibold text-ink"><FolderOpen className="h-6 w-6 text-accent" /> Carpeta de inspección DIGEMAPS</div>
          <p className="mt-1 text-sm text-ink-soft">Todo lo que piden en una inspección, en una pantalla, listo para imprimir.</p>
        </div>
        <PrintButton />
      </div>

      <div className={seccion}>
        <h2 className="mb-2 font-display font-semibold text-ink">Regente farmacéutico y licencia</h2>
        {regentesL.length === 0 ? <p className="text-sm text-ink-faint">Sin regente con exequátur registrado.</p> : (
          <table className="w-full text-sm"><tbody>
            {regentesL.map((x, i) => <tr key={i}><td className={td}>{x.nombre}</td><td className={td}>Exequátur {x.exequatur}</td><td className={td}>{x.licencia_vencimiento ? `Vence ${x.licencia_vencimiento}` : 'Sin fecha'}</td></tr>)}
          </tbody></table>
        )}
      </div>

      <div className={seccion}>
        <h2 className="mb-2 font-display font-semibold text-ink">Libro de controlados ({formatNumber(libroL.length)})</h2>
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Fecha</th><th className={th}>Producto</th><th className={th}>Cant.</th><th className={th}>Paciente</th><th className={th}>Responsable</th></tr></thead>
          <tbody>{libroL.map((x, i) => <tr key={i}><td className={td}>{new Date(x.despachado_en).toLocaleDateString('es-DO')}</td><td className={td}>{x.producto?.nombre ?? '—'}</td><td className={`${td} tabular-nums`}>{formatNumber(x.cantidad)}</td><td className={td}>{x.paciente_nombre}</td><td className={td}>{x.farmaceutico?.nombre ?? '—'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className={seccion}>
        <h2 className="mb-2 font-display font-semibold text-ink">Registro de temperatura de la nevera</h2>
        <table className="w-full text-sm"><tbody>
          {tempsL.map((x, i) => <tr key={i}><td className={td}>{new Date(x.tomada_en).toLocaleString('es-DO')}</td><td className={`${td} tabular-nums ${x.fuera_de_rango ? 'text-rose-600' : ''}`}>{x.valor_celsius} °C{x.fuera_de_rango ? ' (fuera de rango)' : ''}</td></tr>)}
        </tbody></table>
      </div>

      <div className={seccion}>
        <h2 className="mb-2 font-display font-semibold text-ink">Registros sanitarios ({formatNumber(sanitariosL.length)})</h2>
        <table className="w-full text-sm"><tbody>
          {sanitariosL.map((x, i) => <tr key={i}><td className={td}>{x.nombre}</td><td className={td}>{x.registro_sanitario}</td></tr>)}
        </tbody></table>
      </div>

      <div className={seccion}>
        <h2 className="mb-2 font-display font-semibold text-ink">Productos vencidos en existencia ({formatNumber(vencidosL.length)})</h2>
        <table className="w-full text-sm"><tbody>
          {vencidosL.map((x, i) => <tr key={i}><td className={td}>{x.producto?.nombre ?? '—'}</td><td className={td}>Lote {x.numero_lote ?? '—'}</td><td className={td}>Vence {x.fecha_vencimiento ?? '—'}</td><td className={`${td} tabular-nums`}>{formatNumber(x.cantidad_actual)} u</td></tr>)}
        </tbody></table>
      </div>

      <div className={seccion}>
        <h2 className="mb-2 font-display font-semibold text-ink">Facturas de compra ({formatNumber(recepcionesL.length)})</h2>
        <table className="w-full text-sm"><tbody>
          {recepcionesL.map((x, i) => <tr key={i}><td className={td}>{x.fecha}</td><td className={td}>{x.proveedor?.nombre ?? '—'}</td><td className={td}>Factura {x.factura_numero ?? '—'}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
