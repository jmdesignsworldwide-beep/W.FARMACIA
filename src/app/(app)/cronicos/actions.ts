'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

function esFarmaceutico(role: string) {
  return role === 'dueno' || role === 'administrador' || role === 'farmaceutico';
}

export interface ConfirmarCronicoInput {
  clienteId: string;
  principioActivoId: string;
  cicloDias: number;
  ultimaCompra: string | null;
}

export async function confirmarCronico(input: ConfirmarCronicoInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esFarmaceutico(user.role)) return { error: 'Solo el farmacéutico confirma un tratamiento crónico.' };
  const ciclo = Math.max(1, Math.floor(Number(input.cicloDias) || 30));

  let proxima: string | null = null;
  if (input.ultimaCompra) {
    const base = new Date(input.ultimaCompra + 'T00:00:00');
    base.setDate(base.getDate() + ciclo);
    proxima = base.toISOString().slice(0, 10);
  }

  const supabase = createClient();
  const { error } = await supabase.from('tratamiento_cronico').insert({
    cliente_id: input.clienteId,
    principio_activo_id: input.principioActivoId,
    ciclo_dias: ciclo,
    ultima_compra: input.ultimaCompra,
    proxima_fecha: proxima,
    estado: 'activo',
    confirmado_por: user.id,
    confirmado_en: new Date().toISOString(),
  } as never);
  if (error) return { error: 'No se pudo confirmar (¿ya existe?).' };
  revalidatePath('/cronicos');
  return { ok: true };
}

export async function marcarAbandonado(id: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esFarmaceutico(user.role)) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('tratamiento_cronico').update({ estado: 'abandonado' } as never).eq('id', id);
  if (error) return { error: 'No se pudo actualizar.' };
  revalidatePath('/cronicos');
  return { ok: true };
}

/** Registra que el paciente vino: mueve la próxima fecha un ciclo adelante. */
export async function registrarRetiro(id: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { data: tc } = await supabase
    .from('tratamiento_cronico')
    .select('ciclo_dias')
    .eq('id', id)
    .maybeSingle<{ ciclo_dias: number }>();
  if (!tc) return { error: 'No existe.' };
  const hoy = new Date();
  const prox = new Date(hoy);
  prox.setDate(prox.getDate() + Number(tc.ciclo_dias));
  const { error } = await supabase
    .from('tratamiento_cronico')
    .update({ ultima_compra: hoy.toISOString().slice(0, 10), proxima_fecha: prox.toISOString().slice(0, 10), estado: 'activo' } as never)
    .eq('id', id);
  if (error) return { error: 'No se pudo registrar.' };
  revalidatePath('/cronicos');
  return { ok: true };
}
