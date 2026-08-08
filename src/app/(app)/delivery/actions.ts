'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

function esMostrador(role: string) {
  return role === 'dueno' || role === 'administrador' || role === 'farmaceutico' || role === 'cajero';
}

export interface CrearEntregaInput {
  ventaId?: string | null;
  clienteId?: string | null;
  destinatario: string;
  direccion: string;
  referencia?: string;
  telefono?: string;
  motoristaId?: string | null;
  contraEntrega?: boolean;
  montoACobrar?: number;
  nota?: string;
}

/** Crea una entrega a domicilio. Solo el mostrador (no el motorista). */
export async function crearEntrega(input: CrearEntregaInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esMostrador(user.role)) return { error: 'Solo el mostrador crea entregas.' };
  if (!input.destinatario.trim()) return { error: 'Escribe a quién se le lleva.' };
  if (!input.direccion.trim()) return { error: 'La dirección es obligatoria.' };
  const contra = Boolean(input.contraEntrega);
  const monto = contra ? Number(input.montoACobrar ?? 0) : 0;
  if (contra && !(monto > 0)) return { error: 'En contra entrega, indica cuánto se cobra en la casa.' };
  const supabase = createClient();

  const { error } = await supabase.from('entrega').insert({
    sucursal_id: SUCURSAL,
    venta_id: input.ventaId ?? null,
    cliente_id: input.clienteId ?? null,
    destinatario: input.destinatario.trim(),
    direccion: input.direccion.trim(),
    referencia: input.referencia?.trim() || null,
    telefono: input.telefono?.trim() || null,
    motorista_id: input.motoristaId || null,
    estado: 'pendiente',
    contra_entrega: contra,
    monto_a_cobrar: monto,
    nota: input.nota?.trim() || null,
    asignada_en: input.motoristaId ? new Date().toISOString() : null,
    creado_por: user.id,
  } as never);
  if (error) return { error: 'No se pudo crear la entrega.' };
  revalidatePath('/delivery');
  return { ok: true };
}

/** Asigna (o reasigna) un motorista. Solo el mostrador. */
export async function asignarMotorista(entregaId: string, motoristaId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esMostrador(user.role)) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('entrega')
    .update({ motorista_id: motoristaId, asignada_en: new Date().toISOString() } as never)
    .eq('id', entregaId);
  if (error) return { error: 'No se pudo asignar.' };
  revalidatePath('/delivery');
  return { ok: true };
}

/** El motorista (o el mostrador) marca que salió a la calle. */
export async function marcarEnCamino(entregaId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('entrega')
    .update({ estado: 'en_camino', en_camino_en: new Date().toISOString() } as never)
    .eq('id', entregaId);
  if (error) return { error: 'No se pudo actualizar (¿es tuya la entrega?).' };
  revalidatePath('/delivery');
  return { ok: true };
}

export interface EntregadoInput {
  entregaId: string;
  cobrado?: boolean;
  metodo?: 'efectivo' | 'transferencia' | 'tarjeta_debito' | 'tarjeta_credito';
}

/** Marca entregado. Si es contra entrega, registra que el motorista cobró en la casa. */
export async function marcarEntregado(input: EntregadoInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('entrega')
    .update({
      estado: 'entregado',
      cerrada_en: new Date().toISOString(),
      cobrado: input.cobrado ?? false,
      metodo_cobro: input.cobrado ? (input.metodo ?? 'efectivo') : null,
    } as never)
    .eq('id', input.entregaId);
  if (error) return { error: 'No se pudo marcar entregado (¿es tuya la entrega?).' };
  revalidatePath('/delivery');
  return { ok: true };
}

/** Marca que no se pudo entregar, con motivo. Vuelve a la farmacia. */
export async function marcarNoEntregado(entregaId: string, motivo: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { error: 'No autorizado.' };
  if (!motivo.trim()) return { error: 'Escribe por qué no se pudo entregar.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('entrega')
    .update({ estado: 'no_entregado', cerrada_en: new Date().toISOString(), motivo_no_entrega: motivo.trim() } as never)
    .eq('id', entregaId);
  if (error) return { error: 'No se pudo actualizar (¿es tuya la entrega?).' };
  revalidatePath('/delivery');
  return { ok: true };
}
