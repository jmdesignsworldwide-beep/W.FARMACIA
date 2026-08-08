'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

function esFarmaceutico(role: string) {
  return role === 'dueno' || role === 'administrador' || role === 'farmaceutico';
}

export interface RegistrarPrestamoInput {
  tipo: 'dado' | 'recibido';
  productoId: string;
  cantidad: number;
  contraparte: string;
  nota: string;
}

export async function registrarPrestamo(input: RegistrarPrestamoInput): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esFarmaceutico(user.role)) return { error: 'Solo el farmacéutico registra préstamos.' };
  const cant = Number(input.cantidad);
  if (!(cant > 0)) return { error: 'La cantidad debe ser mayor que cero.' };
  if (!input.contraparte.trim()) return { error: 'Indica la otra farmacia.' };
  const supabase = createClient();

  let loteId: string | null = null;

  if (input.tipo === 'dado') {
    // Sale de nuestro inventario: tomar del lote FEFO que tenga suficiente.
    const { data: lotes } = await supabase
      .from('lote')
      .select('id, cantidad_actual, fecha_vencimiento')
      .eq('producto_id', input.productoId)
      .eq('estado', 'activo')
      .eq('en_revision_frio', false)
      .gt('cantidad_actual', 0)
      .order('fecha_vencimiento', { ascending: true });
    const rows = (lotes as unknown as Array<{ id: string; cantidad_actual: number; fecha_vencimiento: string | null }>) ?? [];
    const lote = rows.find((l) => Number(l.cantidad_actual) >= cant);
    if (!lote) return { error: 'Ningún lote tiene existencia suficiente para prestar esa cantidad.' };
    const saldo = Number(lote.cantidad_actual) - cant;
    await supabase.from('lote').update({ cantidad_actual: saldo } as never).eq('id', lote.id);
    await supabase.from('movimiento_inventario').insert({
      producto_id: input.productoId, lote_id: lote.id, sucursal_id: SUCURSAL, tipo: 'transferencia',
      cantidad: -cant, cantidad_resultante: saldo, motivo: `Préstamo dado a ${input.contraparte.trim()}`, empleado_id: user.id,
    } as never);
    loteId = lote.id;
  } else {
    // Entra prestado: nuevo lote (sin costo) + movimiento positivo.
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: loteIns } = await supabase
      .from('lote')
      .insert({ producto_id: input.productoId, sucursal_id: SUCURSAL, cantidad_actual: cant, estado: 'activo', fecha_recepcion: hoy, numero_lote: `PRESTAMO ${input.contraparte.trim()}` } as never)
      .select('id')
      .single<{ id: string }>();
    loteId = loteIns?.id ?? null;
    await supabase.from('movimiento_inventario').insert({
      producto_id: input.productoId, lote_id: loteId, sucursal_id: SUCURSAL, tipo: 'transferencia',
      cantidad: cant, cantidad_resultante: cant, motivo: `Préstamo recibido de ${input.contraparte.trim()}`, empleado_id: user.id,
    } as never);
  }

  const { error } = await supabase.from('prestamo').insert({
    sucursal_id: SUCURSAL, tipo: input.tipo, producto_id: input.productoId, cantidad: cant,
    contraparte: input.contraparte.trim(), estado: 'pendiente', lote_id: loteId, nota: input.nota.trim() || null, registrado_por: user.id,
  } as never);
  if (error) return { error: 'No se pudo registrar el préstamo.' };
  revalidatePath('/prestamos');
  return { ok: true };
}

export async function marcarDevuelto(id: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esFarmaceutico(user.role)) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { data: p } = await supabase
    .from('prestamo')
    .select('tipo, producto_id, cantidad, lote_id, estado')
    .eq('id', id)
    .maybeSingle<{ tipo: string; producto_id: string; cantidad: number; lote_id: string | null; estado: string }>();
  if (!p) return { error: 'No existe.' };
  if (p.estado === 'devuelto') return { ok: true };
  const cant = Number(p.cantidad);

  if (p.lote_id) {
    const { data: lote } = await supabase.from('lote').select('cantidad_actual').eq('id', p.lote_id).maybeSingle<{ cantidad_actual: number }>();
    const actual = Number(lote?.cantidad_actual ?? 0);
    // 'dado' devuelto: nos regresan la mercancía → sube. 'recibido' devuelto: la devolvemos → baja.
    const delta = p.tipo === 'dado' ? cant : -cant;
    const saldo = Math.max(0, actual + delta);
    await supabase.from('lote').update({ cantidad_actual: saldo } as never).eq('id', p.lote_id);
    await supabase.from('movimiento_inventario').insert({
      producto_id: p.producto_id, lote_id: p.lote_id, sucursal_id: SUCURSAL, tipo: 'transferencia',
      cantidad: delta, cantidad_resultante: saldo, motivo: `Devolución de préstamo (${p.tipo})`, referencia: `prestamo-dev:${id}`, empleado_id: user.id,
    } as never);
  }

  await supabase.from('prestamo').update({ estado: 'devuelto', fecha_devolucion: new Date().toISOString().slice(0, 10) } as never).eq('id', id);
  revalidatePath('/prestamos');
  return { ok: true };
}
