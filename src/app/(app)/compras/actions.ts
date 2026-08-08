'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

function esInventario(role: string) {
  return role === 'dueno' || role === 'administrador' || role === 'farmaceutico';
}

/** Fija (o quita) el mínimo de reorden de un producto (§3.1, día uno). */
export async function fijarMinimo(productoId: string, minimo: number | null): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esInventario(user.role)) return { error: 'Solo quien gestiona inventario fija el mínimo.' };
  const val = minimo == null || Number.isNaN(Number(minimo)) || Number(minimo) < 0 ? null : Number(minimo);
  const supabase = createClient();
  const { error } = await supabase.from('producto').update({ punto_reorden_manual: val } as never).eq('id', productoId);
  if (error) return { error: 'No se pudo guardar el mínimo.' };
  revalidatePath('/compras');
  return { ok: true };
}

export interface LineaOrden {
  productoId: string;
  cantidad: number;
  precioEsperado?: number | null;
}

/** Crea una orden de compra (borrador) a un proveedor con sus renglones (§3.2). */
export async function crearOrdenCompra(input: { proveedorId: string | null; nota?: string; lineas: LineaOrden[] }): Promise<{ ok?: true; ordenId?: string; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esInventario(user.role)) return { error: 'No autorizado.' };
  const lineas = (input.lineas ?? []).filter((l) => Number(l.cantidad) > 0);
  if (lineas.length === 0) return { error: 'La orden no tiene renglones con cantidad.' };
  const supabase = createClient();

  const { data: orden, error: eO } = await supabase
    .from('orden_compra')
    .insert({ sucursal_id: SUCURSAL, proveedor_id: input.proveedorId, estado: 'borrador', nota: input.nota?.trim() || null, creado_por: user.id } as never)
    .select('id')
    .single<{ id: string }>();
  if (eO || !orden) return { error: 'No se pudo crear la orden.' };

  for (const l of lineas) {
    await supabase.from('orden_compra_linea').insert({
      orden_id: orden.id, producto_id: l.productoId, cantidad_pedida: Number(l.cantidad), precio_esperado: l.precioEsperado ?? null,
    } as never);
  }
  revalidatePath('/compras');
  return { ok: true, ordenId: orden.id };
}

/** Marca la orden como enviada (registra fecha_envio → base de "cuánto tardó"). */
export async function marcarOrdenEnviada(ordenId: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esInventario(user.role)) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('orden_compra').update({ estado: 'enviada', fecha_envio: new Date().toISOString() } as never).eq('id', ordenId);
  if (error) return { error: 'No se pudo marcar enviada.' };
  revalidatePath('/compras');
  return { ok: true };
}

/** Cambia el estado de una orden (recibida, recibida_parcial, cancelada). */
export async function cambiarEstadoOrden(ordenId: string, estado: 'recibida' | 'recibida_parcial' | 'cancelada'): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esInventario(user.role)) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('orden_compra').update({ estado } as never).eq('id', ordenId);
  if (error) return { error: 'No se pudo actualizar la orden.' };
  revalidatePath('/compras');
  return { ok: true };
}
