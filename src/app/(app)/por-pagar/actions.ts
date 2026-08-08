'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

export interface RegistrarCxpInput {
  proveedorId: string | null;
  monto: number;
  fechaVencimiento?: string | null;
  nota?: string;
}

/** Registra una cuenta por pagar (lo que la farmacia le debe a un proveedor). Solo Dueño/Admin. */
export async function registrarCxp(input: RegistrarCxpInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_finanzas')) return { error: 'Solo Dueño o Administrador registra cuentas por pagar.' };
  const monto = Number(input.monto);
  if (!(monto > 0)) return { error: 'El monto debe ser mayor que cero.' };
  const supabase = createClient();
  const { error } = await supabase.from('cuenta_por_pagar').insert({
    proveedor_id: input.proveedorId,
    monto,
    fecha_vencimiento: input.fechaVencimiento || null,
    estado: 'pendiente',
    nota: input.nota?.trim() || null,
    registrado_por: user.id,
  } as never);
  if (error) return { error: 'No se pudo registrar la cuenta por pagar.' };
  revalidatePath('/por-pagar');
  return { ok: true };
}

/** Marca una cuenta por pagar como pagada. Solo Dueño/Admin. */
export async function marcarPagada(id: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_finanzas')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('cuenta_por_pagar').update({ estado: 'pagada' } as never).eq('id', id);
  if (error) return { error: 'No se pudo marcar como pagada.' };
  revalidatePath('/por-pagar');
  return { ok: true };
}
