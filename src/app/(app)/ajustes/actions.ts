'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

/** Guarda (upsert) un ajuste clave-valor. Solo quien configura el sistema. */
export async function guardarConfig(clave: string, valor: unknown): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'configurar_sistema')) return { error: 'Solo el Dueño/Administrador cambia los ajustes.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('configuracion')
    .upsert({ clave, sucursal_id: SUCURSAL, valor: valor as never } as never, { onConflict: 'clave,sucursal_id' });
  if (error) return { error: 'No se pudo guardar el ajuste.' };
  revalidatePath('/ajustes');
  revalidatePath('/dashboard');
  return { ok: true };
}

export interface TurnoInput {
  activo: boolean;
  desde?: string | null;
  hasta?: string | null;
}

/** Marca (o quita) la farmacia de turno, con rango de fechas opcional. */
export async function setTurno(input: TurnoInput): Promise<{ ok?: true; error?: string }> {
  return guardarConfig('farmacia_de_turno', {
    activo: Boolean(input.activo),
    desde: input.desde || null,
    hasta: input.hasta || null,
  });
}
