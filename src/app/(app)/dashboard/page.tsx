import { requireUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { DashboardClient } from './DashboardClient';

/**
 * Dashboard vivo (Tanda 18): los TRES ESTADOS DEL DINERO — líquido (lo que se
 * movió hoy), parado (inventario) y en la calle (por cobrar − por pagar) — más
 * los carriles de urgencia con datos reales. Todo lo financiero exige
 * 'ver_finanzas'; el cajero ve la operación sin cifras de dinero (§2.7).
 */
export const dynamic = 'force-dynamic';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

function inicioDeHoyISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function haceDiasISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export default async function DashboardPage() {
  const user = await requireUser();
  const verFinanzas = can(user.role, 'ver_finanzas');
  const supabase = createClient();

  // ── Estado 1: LÍQUIDO (lo que se movió hoy) ──
  const { data: ventasHoy } = await supabase
    .from('venta')
    .select('id, total')
    .eq('estado', 'completada')
    .gte('fecha', inicioDeHoyISO());
  const ventasHoyRows = (ventasHoy as unknown as Array<{ id: string; total: number }>) ?? [];
  const liquidoHoy = ventasHoyRows.reduce((s, v) => s + Number(v.total), 0);
  const ticketsHoy = ventasHoyRows.length;

  let margenHoy = 0;
  if (verFinanzas && ventasHoyRows.length > 0) {
    const { data: lineas } = await supabase
      .from('venta_linea')
      .select('cantidad, precio_unitario, itbis_linea, costo_unitario_momento')
      .in('venta_id', ventasHoyRows.map((v) => v.id).slice(0, 1000));
    for (const l of (lineas as unknown as Array<{ cantidad: number; precio_unitario: number; itbis_linea: number; costo_unitario_momento: number | null }>) ?? []) {
      const ingreso = Number(l.precio_unitario) * Number(l.cantidad) - Number(l.itbis_linea ?? 0);
      const costo = Number(l.costo_unitario_momento ?? 0) * Number(l.cantidad);
      margenHoy += ingreso - costo;
    }
  }

  // ── Estado 2: PARADO (inventario) ──
  let inventarioParado = 0;
  let capitalDormido = 0;
  if (verFinanzas) {
    const { data: movVenta } = await supabase.from('movimiento_inventario').select('producto_id').eq('tipo', 'venta').gte('ocurrido_en', haceDiasISO(90));
    const movidos = new Set(((movVenta as unknown as Array<{ producto_id: string }>) ?? []).map((m) => m.producto_id));
    const { data: lotes } = await supabase.from('lote').select('producto_id, cantidad_actual, costo_unitario').eq('estado', 'activo').gt('cantidad_actual', 0);
    for (const l of (lotes as unknown as Array<{ producto_id: string; cantidad_actual: number; costo_unitario: number | null }>) ?? []) {
      const val = Number(l.cantidad_actual) * Number(l.costo_unitario ?? 0);
      inventarioParado += val;
      if (!movidos.has(l.producto_id)) capitalDormido += val;
    }
  }

  // ── Estado 3: EN LA CALLE (por cobrar − por pagar) ──
  let porCobrar = 0;
  let porPagar = 0;
  if (verFinanzas) {
    const { data: cobrosCred } = await supabase.from('cobro').select('monto').eq('metodo', 'credito_interno');
    const fiadoBruto = ((cobrosCred as unknown as Array<{ monto: number }>) ?? []).reduce((s, c) => s + Number(c.monto), 0);
    const { data: abonosAll } = await supabase.from('abono').select('monto');
    const abonadoBruto = ((abonosAll as unknown as Array<{ monto: number }>) ?? []).reduce((s, a) => s + Number(a.monto), 0);
    porCobrar = Math.max(0, fiadoBruto - abonadoBruto);
    const { data: cxp } = await supabase.from('cuenta_por_pagar').select('monto').eq('estado', 'pendiente');
    porPagar = ((cxp as unknown as Array<{ monto: number }>) ?? []).reduce((s, c) => s + Number(c.monto), 0);
  }

  // ── Urgencias (reales) ──
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const { data: lotesVenc } = await supabase
    .from('lote')
    .select('cantidad_actual, costo_unitario, fecha_vencimiento')
    .eq('estado', 'activo')
    .gt('cantidad_actual', 0)
    .not('fecha_vencimiento', 'is', null);
  let vencidosN = 0, vencidosVal = 0, semanaN = 0, semanaVal = 0;
  for (const l of (lotesVenc as unknown as Array<{ cantidad_actual: number; costo_unitario: number | null; fecha_vencimiento: string }>) ?? []) {
    const venc = new Date(l.fecha_vencimiento + 'T00:00:00');
    const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
    const val = Number(l.cantidad_actual) * Number(l.costo_unitario ?? 0);
    if (dias < 0) { vencidosN++; vencidosVal += val; }
    else if (dias <= 7) { semanaN++; semanaVal += val; }
  }

  const { count: entregasN } = await supabase.from('entrega').select('id', { count: 'exact', head: true }).in('estado', ['pendiente', 'en_camino']);
  const { count: frioN } = await supabase.from('lote').select('id', { count: 'exact', head: true }).eq('en_revision_frio', true).eq('sucursal_id', SUCURSAL);

  // ── Farmacia de turno ──
  const { data: turnoCfg } = await supabase.from('configuracion').select('valor').eq('clave', 'farmacia_de_turno').eq('sucursal_id', SUCURSAL).maybeSingle<{ valor: unknown }>();
  const turnoRaw = (turnoCfg?.valor ?? null) as { activo?: boolean } | null;
  const deTurno = Boolean(turnoRaw?.activo);

  return (
    <DashboardClient
      nombre={user.nombre}
      verFinanzas={verFinanzas}
      deTurno={deTurno}
      money={{ liquidoHoy, ticketsHoy, margenHoy, inventarioParado, capitalDormido, porCobrar, porPagar, posicionNeta: porCobrar - porPagar }}
      urgencias={{ vencidosN, vencidosVal, semanaN, semanaVal, entregasN: entregasN ?? 0, frioN: frioN ?? 0 }}
    />
  );
}
