'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

export interface ExpedienteInput {
  id: string;
  cedula: string;
  telefono: string;
  contactoNombre: string;
  contactoTelefono: string;
  fechaIngreso: string | null;
  direccion: string;
  exequatur: string;
  licenciaVencimiento: string | null;
}

export async function actualizarExpediente(input: ExpedienteInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_empleados')) return { error: 'Solo el Dueño o el Administrador gestiona empleados.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      cedula: input.cedula.trim() || null,
      telefono: input.telefono.trim() || null,
      contacto_emergencia_nombre: input.contactoNombre.trim() || null,
      contacto_emergencia_telefono: input.contactoTelefono.trim() || null,
      fecha_ingreso: input.fechaIngreso || null,
      direccion: input.direccion.trim() || null,
      exequatur: input.exequatur.trim() || null,
      licencia_vencimiento: input.licenciaVencimiento || null,
    } as never)
    .eq('id', input.id);
  if (error) return { error: 'No se pudo guardar el expediente.' };
  revalidatePath('/empleados');
  return { ok: true };
}
