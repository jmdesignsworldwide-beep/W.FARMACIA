'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export interface RegistrarServicioInput {
  tipo: 'inyeccion' | 'presion_arterial' | 'glucometria' | 'curacion' | 'otro';
  telefonoCliente?: string;
  valor: number;
  resultado: Record<string, number>;
  nota?: string;
}

export async function registrarServicio(input: RegistrarServicioInput): Promise<{ ok?: true; error?: string; clienteCronico?: boolean }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };

  const supabase = createClient();

  // Cliente opcional por teléfono.
  let clienteId: string | null = null;
  const tel = input.telefonoCliente?.trim();
  if (tel) {
    const { data: cli } = await supabase.from('cliente').select('id').eq('telefono', tel).is('eliminado_en', null).limit(1).maybeSingle<{ id: string }>();
    clienteId = cli?.id ?? null;
  }

  // Entra a la caja del día si hay turno abierto.
  const { data: caja } = await supabase
    .from('caja_sesion')
    .select('id')
    .eq('sucursal_id', SUCURSAL)
    .eq('estado', 'abierta')
    .limit(1)
    .maybeSingle<{ id: string }>();

  const { error } = await supabase.from('servicio').insert({
    sucursal_id: SUCURSAL,
    tipo: input.tipo,
    cliente_id: clienteId,
    empleado_id: user.id,
    valor: Math.max(0, Number(input.valor) || 0),
    resultado: input.resultado ?? {},
    nota: input.nota?.trim() || null,
    caja_sesion_id: caja?.id ?? null,
  } as never);
  if (error) return { error: 'No se pudo registrar el servicio.' };

  // La jugada: quien viene a medirse la presión es un hipertenso. Si el cliente
  // existe y el servicio es de presión/glucosa, se sugiere seguirlo (crónico).
  const clienteCronico = Boolean(clienteId && (input.tipo === 'presion_arterial' || input.tipo === 'glucometria'));

  revalidatePath('/servicios');
  return { ok: true, clienteCronico };
}
