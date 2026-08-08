'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

export interface ProveedorInput {
  id?: string;
  nombre: string;
  tipo: 'laboratorio' | 'drogueria' | 'ambos';
  contactoNombre: string;
  telefono: string;
  rnc: string;
  condicionesPago: string;
  diasEntrega: number | null;
  aceptaDevoluciones: boolean;
  diasMinimosVidaUtil: number | null;
  condicionesDevolucion: string;
  porcentajeRecuperacion: number | null;
}

export async function guardarProveedor(input: ProveedorInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_proveedores')) return { error: 'Solo el Dueño o el Administrador gestiona proveedores.' };
  if (!input.nombre.trim()) return { error: 'El nombre es obligatorio.' };

  const fila = {
    nombre: input.nombre.trim(),
    tipo: input.tipo,
    contacto_nombre: input.contactoNombre.trim() || null,
    telefono: input.telefono.trim() || null,
    rnc: input.rnc.trim() || null,
    condiciones_pago: input.condicionesPago.trim() || null,
    dias_entrega: input.diasEntrega,
    acepta_devoluciones: input.aceptaDevoluciones,
    dias_minimos_vida_util_devolucion: input.aceptaDevoluciones ? input.diasMinimosVidaUtil : null,
    condiciones_devolucion: input.aceptaDevoluciones ? input.condicionesDevolucion.trim() || null : null,
    porcentaje_recuperacion: input.aceptaDevoluciones ? input.porcentajeRecuperacion : null,
  };

  const supabase = createClient();
  const { error } = input.id
    ? await supabase.from('proveedor').update(fila as never).eq('id', input.id)
    : await supabase.from('proveedor').insert(fila as never);
  if (error) return { error: 'No se pudo guardar el proveedor.' };
  revalidatePath('/proveedores');
  return { ok: true };
}
