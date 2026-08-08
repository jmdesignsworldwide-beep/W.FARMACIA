'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

export interface DespacharControladoInput {
  productoId: string;
  cantidad: number;
  medicoNombre: string;
  medicoExequatur: string;
  pacienteNombre: string;
  indicaciones: string;
}

export interface DespacharResultado {
  ok?: true;
  error?: string;
  sospechoso?: boolean;
}

export async function despacharControlado(input: DespacharControladoInput): Promise<DespacharResultado> {
  const user = await getSessionUser();
  // El CAJERO no puede: validado en el servidor (crítico #1).
  if (!user || !can(user.role, 'despachar_controlados')) {
    return { error: 'Solo el farmacéutico o superior despacha controlados.' };
  }
  const cant = Number(input.cantidad);
  if (!(cant > 0)) return { error: 'La cantidad debe ser mayor que cero.' };
  if (!input.pacienteNombre.trim()) return { error: 'El paciente es obligatorio para un controlado.' };

  const supabase = createClient();

  // Verificar que el producto es realmente controlado (override o herencia).
  const { data: prod } = await supabase
    .from('producto')
    .select('id, nombre, es_controlado, requiere_receta, producto_principio_activo ( principio_activo:principio_activo_id ( es_controlado, requiere_receta ) ), lote ( id, cantidad_actual, estado, fecha_vencimiento, costo_unitario, en_revision_frio, es_muestra )')
    .eq('id', input.productoId)
    .maybeSingle<{
      id: string; nombre: string; es_controlado: boolean | null; requiere_receta: boolean | null;
      producto_principio_activo: Array<{ principio_activo: { es_controlado: boolean | null; requiere_receta: boolean | null } | null }>;
      lote: Array<{ id: string; cantidad_actual: number | null; estado: string; fecha_vencimiento: string | null; costo_unitario: number | null; en_revision_frio: boolean | null; es_muestra: boolean | null }>;
    }>();
  if (!prod) return { error: 'Producto no encontrado.' };
  const controlado = prod.es_controlado ?? prod.producto_principio_activo.some((x) => x.principio_activo?.es_controlado);
  const receta = prod.requiere_receta ?? prod.producto_principio_activo.some((x) => x.principio_activo?.requiere_receta);
  if (!controlado && !receta) return { error: 'Este producto no es controlado ni de receta; véndelo en la caja.' };

  const lotes = (prod.lote ?? [])
    .filter((l) => l.estado === 'activo' && !l.en_revision_frio && !l.es_muestra && Number(l.cantidad_actual ?? 0) > 0)
    .sort((a, b) => (a.fecha_vencimiento ?? '9999').localeCompare(b.fecha_vencimiento ?? '9999'));
  const disp = lotes.reduce((s, l) => s + Number(l.cantidad_actual ?? 0), 0);
  if (disp < cant) return { error: `Sin existencia suficiente (hay ${disp}).` };

  // Receta primero.
  const { data: recIns } = await supabase
    .from('receta')
    .insert({
      sucursal_id: SUCURSAL, medico_nombre: input.medicoNombre.trim() || null, medico_exequatur: input.medicoExequatur.trim() || null,
      paciente_nombre: input.pacienteNombre.trim(), producto_id: input.productoId, cantidad: cant,
      indicaciones: input.indicaciones.trim() || null, registrado_por: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>();
  const recetaId = recIns?.id ?? null;

  // Descontar por FEFO y anotar en el libro inviolable, por lote.
  let restante = cant;
  for (const l of lotes) {
    if (restante <= 0) break;
    const toma = Math.min(restante, Number(l.cantidad_actual ?? 0));
    const saldo = Number(l.cantidad_actual ?? 0) - toma;
    await supabase.from('lote').update({ cantidad_actual: saldo } as never).eq('id', l.id);
    await supabase.from('movimiento_inventario').insert({
      producto_id: input.productoId, lote_id: l.id, sucursal_id: SUCURSAL, tipo: 'venta',
      cantidad: -toma, cantidad_resultante: saldo, costo_unitario_momento: l.costo_unitario,
      motivo: `Despacho de controlado a ${input.pacienteNombre.trim()}`, empleado_id: user.id,
    } as never);
    await supabase.from('libro_controlado').insert({
      sucursal_id: SUCURSAL, producto_id: input.productoId, lote_id: l.id, cantidad: toma,
      receta_id: recetaId, paciente_nombre: input.pacienteNombre.trim(), farmaceutico_id: user.id,
    } as never);
    restante -= toma;
  }

  // Patrón sospechoso: mismo paciente + mismo controlado en los últimos 20 días.
  const desde = new Date();
  desde.setDate(desde.getDate() - 20);
  const { count } = await supabase
    .from('libro_controlado')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', input.productoId)
    .eq('paciente_nombre', input.pacienteNombre.trim())
    .gte('despachado_en', desde.toISOString());

  revalidatePath('/controlados');
  return { ok: true, sospechoso: (count ?? 0) > 1 };
}
