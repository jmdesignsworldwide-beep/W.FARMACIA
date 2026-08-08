'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export interface CrearEncargoInput {
  productoTexto: string;
  clienteNombre: string;
  telefono: string;
  cantidad: number | null;
  nota: string;
}

export async function crearEncargo(input: CrearEncargoInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  if (!input.productoTexto.trim()) return { error: '¿Qué se encarga?' };
  const supabase = createClient();
  const { error } = await supabase.from('encargo').insert({
    sucursal_id: SUCURSAL,
    producto_texto: input.productoTexto.trim(),
    cliente_nombre: input.clienteNombre.trim() || null,
    telefono: input.telefono.trim() || null,
    cantidad: input.cantidad,
    estado: 'pendiente',
    nota: input.nota.trim() || null,
    registrado_por: user.id,
  } as never);
  if (error) return { error: 'No se pudo registrar el encargo.' };
  revalidatePath('/encargos');
  return { ok: true };
}

export async function cambiarEstadoEncargo(id: string, estado: 'pendiente' | 'pedido' | 'llego' | 'entregado' | 'no_volvio'): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('encargo').update({ estado } as never).eq('id', id);
  if (error) return { error: 'No se pudo actualizar.' };
  revalidatePath('/encargos');
  return { ok: true };
}
