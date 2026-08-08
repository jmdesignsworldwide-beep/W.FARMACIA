'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

export interface RegistrarAbonoInput {
  pagadorId: string;
  monto: number;
  metodo?: 'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito';
  nota?: string;
}

/** Abono (pago parcial) de un cliente contra su saldo de fiado. */
export async function registrarAbono(input: RegistrarAbonoInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  // Quien cobra en caja puede recibir un abono: Dueño/Admin/Farmacéutico/Cajero.
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const monto = Number(input.monto);
  if (!(monto > 0)) return { error: 'El monto del abono debe ser mayor que cero.' };
  const supabase = createClient();

  const { error } = await supabase.from('abono').insert({
    pagador_id: input.pagadorId,
    monto,
    metodo: input.metodo ?? 'efectivo',
    nota: input.nota?.trim() || null,
    registrado_por: user.id,
  } as never);
  if (error) return { error: 'No se pudo registrar el abono.' };
  revalidatePath('/fiado');
  return { ok: true };
}

/** Ajusta el límite de crédito de un pagador. Solo Dueño/Administrador. */
export async function ajustarLimite(pagadorId: string, limite: number | null): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_finanzas')) return { error: 'Solo Dueño o Administrador ajusta el límite.' };
  const lim = limite == null || Number.isNaN(Number(limite)) ? null : Number(limite);
  if (lim != null && lim < 0) return { error: 'El límite no puede ser negativo.' };
  const supabase = createClient();
  const { error } = await supabase.from('pagador').update({ limite_credito: lim } as never).eq('id', pagadorId);
  if (error) return { error: 'No se pudo guardar el límite.' };
  revalidatePath('/fiado');
  return { ok: true };
}
