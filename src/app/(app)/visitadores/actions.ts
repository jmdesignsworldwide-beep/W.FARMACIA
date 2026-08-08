'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

function esFarmaceutico(role: string) {
  return role === 'dueno' || role === 'administrador' || role === 'farmaceutico';
}

export interface RegistrarVisitaInput {
  laboratorio: string;
  visitador: string;
  fecha: string | null;
  notas: string;
  muestras: Array<{ productoId: string; cantidad: number }>;
}

export async function registrarVisita(input: RegistrarVisitaInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esFarmaceutico(user.role)) return { error: 'Solo el farmacéutico registra visitas.' };
  if (!input.laboratorio.trim()) return { error: 'Indica el laboratorio.' };
  const supabase = createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { error: eV } = await supabase.from('visita_medica').insert({
    sucursal_id: SUCURSAL,
    laboratorio: input.laboratorio.trim(),
    visitador: input.visitador.trim() || null,
    fecha: input.fecha || hoy,
    notas: input.notas.trim() || null,
    registrado_por: user.id,
  } as never);
  if (eV) return { error: 'No se pudo registrar la visita.' };

  // Muestras: entran al inventario MARCADAS como muestra (no se venden).
  for (const m of input.muestras.filter((x) => x.productoId && Number(x.cantidad) > 0)) {
    const { data: lote } = await supabase
      .from('lote')
      .insert({
        producto_id: m.productoId, sucursal_id: SUCURSAL, cantidad_actual: Number(m.cantidad), estado: 'activo',
        fecha_recepcion: hoy, costo_unitario: 0, es_muestra: true, numero_lote: `MUESTRA ${input.laboratorio.trim()}`,
      } as never)
      .select('id')
      .single<{ id: string }>();
    await supabase.from('movimiento_inventario').insert({
      producto_id: m.productoId, lote_id: lote?.id ?? null, sucursal_id: SUCURSAL, tipo: 'entrada',
      cantidad: Number(m.cantidad), cantidad_resultante: Number(m.cantidad), costo_unitario_momento: 0,
      motivo: `Muestra médica (${input.laboratorio.trim()})`, empleado_id: user.id,
    } as never);
  }

  revalidatePath('/visitadores');
  return { ok: true };
}
