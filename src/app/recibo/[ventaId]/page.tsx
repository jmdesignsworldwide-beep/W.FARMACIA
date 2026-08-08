import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatMoney } from '@/lib/format';
import { BRAND } from '@/lib/tokens';
import { PrintControls } from './PrintControls';

export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';
const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Tarjeta débito', tarjeta_credito: 'Tarjeta crédito', credito_interno: 'Crédito (fiado)',
};

export default async function ReciboPage({ params, searchParams }: { params: { ventaId: string }; searchParams: { auto?: string } }) {
  await requireUser();
  const supabase = createClient();

  const { data: venta } = await supabase
    .from('venta')
    .select('id, fecha, subtotal, itbis, descuento, total, estado, empleado:empleado_id ( nombre )')
    .eq('id', params.ventaId)
    .maybeSingle<{ id: string; fecha: string; subtotal: number; itbis: number; descuento: number; total: number; estado: string; empleado: { nombre: string } | null }>();
  if (!venta) notFound();

  const { data: lineasData } = await supabase
    .from('venta_linea')
    .select('cantidad, es_fraccionada, precio_unitario, itbis_linea, producto:producto_id ( nombre )')
    .eq('venta_id', params.ventaId);
  const lineas = (lineasData as unknown as Array<{ cantidad: number; es_fraccionada: boolean; precio_unitario: number; itbis_linea: number; producto: { nombre: string } | null }>) ?? [];

  const { data: comp } = await supabase.from('comprobante').select('ncf, tipo, rnc_receptor').eq('venta_id', params.ventaId).maybeSingle<{ ncf: string; tipo: string; rnc_receptor: string | null }>();
  const { data: cobrosData } = await supabase.from('cobro').select('metodo, monto').eq('venta_id', params.ventaId);
  const cobros = (cobrosData as unknown as Array<{ metodo: string; monto: number }>) ?? [];

  const { data: cfgData } = await supabase.from('configuracion').select('clave, valor').eq('sucursal_id', SUCURSAL).in('clave', ['farmacia_nombre', 'farmacia_rnc', 'farmacia_direccion', 'farmacia_telefono', 'recibo_mensaje']);
  const cfg: Record<string, string> = {};
  for (const c of (cfgData as unknown as Array<{ clave: string; valor: unknown }>) ?? []) cfg[c.clave] = typeof c.valor === 'string' ? c.valor : String(c.valor ?? '');

  const nombre = cfg.farmacia_nombre || BRAND.name;
  const itbisGravado = Number(venta.itbis);
  const totalExento = lineas.filter((l) => Number(l.itbis_linea) === 0).reduce((s, l) => s + Number(l.precio_unitario) * Number(l.cantidad), 0);
  const totalCobrado = cobros.reduce((s, c) => s + Number(c.monto), 0);
  const vuelto = Math.max(0, totalCobrado - Number(venta.total));

  return (
    <div className="min-h-screen bg-neutral-100 py-6 text-black dark:bg-neutral-100">
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media print { .no-print { display: none !important; } body { background: white !important; } .recibo { box-shadow: none !important; margin: 0 !important; } }
      `}</style>
      <div className="recibo mx-auto max-w-[80mm] bg-white p-3 font-mono text-[11px] leading-tight text-black shadow-md" style={{ width: '80mm' }}>
        <div className="text-center">
          <div className="text-sm font-bold uppercase">{nombre}</div>
          {cfg.farmacia_rnc && <div>RNC: {cfg.farmacia_rnc}</div>}
          {cfg.farmacia_direccion && <div>{cfg.farmacia_direccion}</div>}
          {cfg.farmacia_telefono && <div>Tel: {cfg.farmacia_telefono}</div>}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        <div>
          <div>Fecha: {new Date(venta.fecha).toLocaleString('es-DO')}</div>
          {venta.empleado?.nombre && <div>Cajero: {venta.empleado.nombre}</div>}
          {comp?.ncf && <div>NCF: {comp.ncf} ({comp.tipo})</div>}
          {comp?.rnc_receptor && <div>RNC cliente: {comp.rnc_receptor}</div>}
          {venta.estado === 'anulada' && <div className="font-bold">*** VENTA ANULADA ***</div>}
        </div>

        <div className="my-2 border-t border-dashed border-black" />

        <table className="w-full">
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="align-top">
                  {l.producto?.nombre ?? '—'}{l.es_fraccionada ? ' (frac.)' : ''}
                  <div className="text-[10px]">{Number(l.cantidad)} × {formatMoney(l.precio_unitario)}</div>
                </td>
                <td className="whitespace-nowrap text-right align-top tabular-nums">{formatMoney(Number(l.precio_unitario) * Number(l.cantidad))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-black" />

        <table className="w-full tabular-nums">
          <tbody>
            <tr><td>Subtotal</td><td className="text-right">{formatMoney(venta.subtotal)}</td></tr>
            {itbisGravado > 0 && <tr><td>ITBIS (18%)</td><td className="text-right">{formatMoney(itbisGravado)}</td></tr>}
            {totalExento > 0 && <tr><td>Exento de ITBIS</td><td className="text-right">{formatMoney(totalExento)}</td></tr>}
            {Number(venta.descuento) > 0 && <tr><td>Descuento</td><td className="text-right">-{formatMoney(venta.descuento)}</td></tr>}
            <tr className="text-sm font-bold"><td>TOTAL</td><td className="text-right">{formatMoney(venta.total)}</td></tr>
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-black" />

        <table className="w-full tabular-nums">
          <tbody>
            {cobros.map((c, i) => (
              <tr key={i}><td>{METODO_LABEL[c.metodo] ?? c.metodo}</td><td className="text-right">{formatMoney(c.monto)}</td></tr>
            ))}
            {vuelto > 0 && <tr><td>Vuelto</td><td className="text-right">{formatMoney(vuelto)}</td></tr>}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-black" />

        <div className="text-center">
          {cfg.recibo_mensaje && <div className="mb-1">{cfg.recibo_mensaje}</div>}
          <div className="text-[10px]">Hecho por {BRAND.maker}</div>
        </div>
      </div>

      <PrintControls auto={searchParams?.auto === '1'} />
    </div>
  );
}
