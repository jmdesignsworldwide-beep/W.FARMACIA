import { requireCapability, getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CajaDiariaCliente, type SesionActual } from './CajaDiariaCliente';

export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export default async function CajaDiariaPage() {
  await requireCapability('ver_operacion');
  const user = await getSessionUser();
  const puedeEgreso = user?.role === 'dueno' || user?.role === 'administrador';
  const supabase = createClient();

  const { data: ses } = await supabase
    .from('caja_sesion')
    .select('id, estado, abierta_en, monto_inicial, es_arranque, fecha_corte, empleado:empleado_id ( nombre )')
    .eq('sucursal_id', SUCURSAL)
    .eq('estado', 'abierta')
    .order('abierta_en', { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      estado: string;
      abierta_en: string;
      monto_inicial: number;
      es_arranque: boolean;
      fecha_corte: string | null;
      empleado: { nombre: string | null } | null;
    }>();

  let sesion: SesionActual | null = null;
  if (ses) {
    const { data: cobros } = await supabase
      .from('cobro')
      .select('monto, venta:venta_id!inner(caja_sesion_id, estado)')
      .eq('metodo', 'efectivo')
      .eq('venta.caja_sesion_id', ses.id)
      .eq('venta.estado', 'completada');
    const ventasEfectivo = ((cobros as unknown as Array<{ monto: number }>) ?? []).reduce((s, c) => s + Number(c.monto), 0);

    const { count: ventasCount } = await supabase
      .from('venta')
      .select('id', { count: 'exact', head: true })
      .eq('caja_sesion_id', ses.id)
      .eq('estado', 'completada');

    const { data: egresosData } = await supabase
      .from('caja_egreso')
      .select('id, monto, motivo, created_at')
      .eq('caja_sesion_id', ses.id)
      .order('created_at', { ascending: false });
    const egresos = (egresosData as unknown as Array<{ id: string; monto: number; motivo: string; created_at: string }>) ?? [];
    const totalEgresos = egresos.reduce((s, e) => s + Number(e.monto), 0);

    sesion = {
      id: ses.id,
      abiertaEn: ses.abierta_en,
      cajero: ses.empleado?.nombre ?? '—',
      montoInicial: Number(ses.monto_inicial),
      esArranque: ses.es_arranque,
      fechaCorte: ses.fecha_corte,
      ventasCount: ventasCount ?? 0,
      ventasEfectivo,
      egresos: egresos.map((e) => ({ id: e.id, monto: Number(e.monto), motivo: e.motivo, creadoEn: e.created_at })),
      totalEgresos,
      esperado: Number(ses.monto_inicial) + ventasEfectivo - totalEgresos,
    };
  }

  return <CajaDiariaCliente sesion={sesion} puedeEgreso={puedeEgreso} />;
}
