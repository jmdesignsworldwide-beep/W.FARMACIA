'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

/** Denominaciones dominicanas, de mayor a menor. */
export const DENOMINACIONES_DO = [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];

export interface AbrirCajaInput {
  montoInicial: number;
  esArranque: boolean;
  fechaCorte: string | null;
}

export async function abrirCaja(input: AbrirCajaInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();

  const { data: abierta } = await supabase
    .from('caja_sesion')
    .select('id')
    .eq('sucursal_id', SUCURSAL)
    .eq('estado', 'abierta')
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (abierta) return { error: 'Ya hay una caja abierta en esta sucursal.' };

  const { error } = await supabase.from('caja_sesion').insert({
    sucursal_id: SUCURSAL,
    empleado_id: user.id,
    estado: 'abierta',
    monto_inicial: Math.max(0, Number(input.montoInicial) || 0),
    es_arranque: Boolean(input.esArranque),
    fecha_corte: input.esArranque ? input.fechaCorte || null : null,
  } as never);
  if (error) return { error: 'No se pudo abrir la caja.' };
  revalidatePath('/caja-diaria');
  return { ok: true };
}

/** Egreso de efectivo: motivo obligatorio y SOLO Dueño/Administrador lo autoriza. */
export async function registrarEgreso(cajaSesionId: string, monto: number, motivo: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'No autorizado.' };
  if (user.role !== 'dueno' && user.role !== 'administrador') {
    return { error: 'Solo el Dueño o el Administrador autoriza un egreso de caja.' };
  }
  const m = Number(monto);
  if (!(m > 0)) return { error: 'El monto del egreso debe ser mayor que cero.' };
  if (!motivo.trim()) return { error: 'El egreso exige un motivo.' };

  const supabase = createClient();
  const { error } = await supabase.from('caja_egreso').insert({
    caja_sesion_id: cajaSesionId,
    monto: m,
    motivo: motivo.trim(),
    autorizado_por: user.id,
    empleado_id: user.id,
  } as never);
  if (error) return { error: 'No se pudo registrar el egreso.' };
  revalidatePath('/caja-diaria');
  return { ok: true };
}

export interface CerrarCajaInput {
  cajaSesionId: string;
  arqueo: Array<{ denominacion: number; cantidad: number }>;
  totalMetodoViejo: number | null;
  notas: string;
}

export interface CerrarCajaResultado {
  ok?: true;
  error?: string;
  declarado?: number;
  esperado?: number;
  diferencia?: number;
}

export async function cerrarCaja(input: CerrarCajaInput): Promise<CerrarCajaResultado> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();

  const { data: sesion } = await supabase
    .from('caja_sesion')
    .select('id, estado, monto_inicial')
    .eq('id', input.cajaSesionId)
    .maybeSingle<{ id: string; estado: string; monto_inicial: number }>();
  if (!sesion) return { error: 'La caja no existe.' };
  if (sesion.estado !== 'abierta') return { error: 'Esa caja ya está cerrada.' };

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const declarado = round2(input.arqueo.reduce((s, a) => s + Number(a.denominacion) * Math.max(0, Number(a.cantidad) || 0), 0));

  // Esperado = inicial + ventas en efectivo de la sesión − egresos.
  const { data: cobros } = await supabase
    .from('cobro')
    .select('monto, venta:venta_id!inner(caja_sesion_id, estado)')
    .eq('metodo', 'efectivo')
    .eq('venta.caja_sesion_id', input.cajaSesionId)
    .eq('venta.estado', 'completada');
  const ventasEfectivo = ((cobros as unknown as Array<{ monto: number }>) ?? []).reduce((s, c) => s + Number(c.monto), 0);

  const { data: egresos } = await supabase.from('caja_egreso').select('monto').eq('caja_sesion_id', input.cajaSesionId);
  const totalEgresos = ((egresos as unknown as Array<{ monto: number }>) ?? []).reduce((s, e) => s + Number(e.monto), 0);

  const esperado = round2(Number(sesion.monto_inicial) + ventasEfectivo - totalEgresos);
  const diferencia = round2(declarado - esperado);

  // Arqueo append-only: una fila por denominación contada (>0).
  const filas = input.arqueo
    .filter((a) => (Number(a.cantidad) || 0) > 0)
    .map((a) => ({ caja_sesion_id: input.cajaSesionId, denominacion: Number(a.denominacion), cantidad: Math.floor(Number(a.cantidad)) }));
  if (filas.length > 0) await supabase.from('caja_arqueo').insert(filas as never);

  const { error } = await supabase
    .from('caja_sesion')
    .update({
      estado: 'cerrada',
      cerrada_en: new Date().toISOString(),
      monto_declarado_cierre: declarado,
      total_esperado: esperado,
      diferencia,
      total_metodo_viejo: input.totalMetodoViejo != null ? round2(Number(input.totalMetodoViejo)) : null,
      notas_cierre: input.notas.trim() || null,
      cerrada_por: user.id,
    } as never)
    .eq('id', input.cajaSesionId);
  if (error) return { error: 'No se pudo cerrar la caja.' };

  revalidatePath('/caja-diaria');
  return { ok: true, declarado, esperado, diferencia };
}
