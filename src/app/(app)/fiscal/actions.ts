'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';
const TIPOS = ['B01', 'B02', 'B04', 'E31', 'E32', 'E34'] as const;

export interface CrearSecuenciaInput {
  tipo: string;
  rangoDesde: number;
  rangoHasta: number;
  vigenciaHasta: string | null;
  alertaRestantes: number;
}

export async function crearSecuencia(input: CrearSecuenciaInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'dueno' && user.role !== 'administrador')) {
    return { error: 'Solo el Dueño o el Administrador carga secuencias fiscales.' };
  }
  if (!TIPOS.includes(input.tipo as (typeof TIPOS)[number])) return { error: 'Tipo de comprobante inválido.' };
  const desde = Math.floor(Number(input.rangoDesde));
  const hasta = Math.floor(Number(input.rangoHasta));
  if (!(desde >= 1) || !(hasta >= desde)) return { error: 'El rango es inválido (desde ≥ 1 y hasta ≥ desde).' };
  const digitos = input.tipo.startsWith('E') ? 10 : 8;

  const supabase = createClient();
  const { error } = await supabase.from('secuencia_fiscal').insert({
    sucursal_id: SUCURSAL,
    tipo: input.tipo,
    rango_desde: desde,
    rango_hasta: hasta,
    siguiente: desde,
    digitos,
    vigencia_hasta: input.vigenciaHasta || null,
    alerta_restantes: Math.max(0, Math.floor(Number(input.alertaRestantes) || 50)),
    activa: true,
  } as never);
  if (error) return { error: 'No se pudo crear la secuencia (¿ya existe ese rango?).' };
  revalidatePath('/fiscal');
  return { ok: true };
}

export async function alternarSecuencia(id: string, activa: boolean): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || (user.role !== 'dueno' && user.role !== 'administrador')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('secuencia_fiscal').update({ activa } as never).eq('id', id);
  if (error) return { error: 'No se pudo actualizar.' };
  revalidatePath('/fiscal');
  return { ok: true };
}
