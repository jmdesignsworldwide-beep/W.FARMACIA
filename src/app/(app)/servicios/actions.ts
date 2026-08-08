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

export async function registrarServicio(input: RegistrarServicioInput): Promise<{ ok?: true; error?: string; clienteCronico?: boolean; insumoAviso?: string }> {
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

  const { data: servIns, error } = await supabase.from('servicio').insert({
    sucursal_id: SUCURSAL,
    tipo: input.tipo,
    cliente_id: clienteId,
    empleado_id: user.id,
    valor: Math.max(0, Number(input.valor) || 0),
    resultado: input.resultado ?? {},
    nota: input.nota?.trim() || null,
    caja_sesion_id: caja?.id ?? null,
  } as never).select('id').single<{ id: string }>();
  if (error || !servIns) return { error: 'No se pudo registrar el servicio.' };

  // §5 — Descontar los INSUMOS de este tipo de servicio (jeringa, algodón, alcohol…),
  // por FEFO, para que el conteo cíclico cuadre. Degrada con gracia: si la tabla
  // aún no existe en el ambiente (migración 0042 pendiente), no se descuenta y punto.
  const insumoAviso = await descontarInsumos(supabase, input.tipo, servIns.id, user.id);

  // La jugada: quien viene a medirse la presión es un hipertenso. Si el cliente
  // existe y el servicio es de presión/glucosa, se sugiere seguirlo (crónico).
  const clienteCronico = Boolean(clienteId && (input.tipo === 'presion_arterial' || input.tipo === 'glucometria'));

  revalidatePath('/servicios');
  return { ok: true, clienteCronico, insumoAviso };
}

/** Agrega un insumo a un tipo de servicio (config). Solo quien gestiona inventario. */
export async function agregarInsumoServicio(input: { tipo: RegistrarServicioInput['tipo']; productoId: string; cantidad: number }): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'Solo quien gestiona inventario configura los insumos.' };
  if (!(Number(input.cantidad) > 0)) return { error: 'La cantidad debe ser mayor que cero.' };
  const supabase = createClient();
  const { error } = await supabase
    .from('servicio_insumo')
    .insert({ servicio_tipo: input.tipo, producto_id: input.productoId, cantidad: Number(input.cantidad) } as never);
  if (error) return { error: 'No se pudo agregar (¿ya está ese insumo en este servicio, o falta aplicar la migración 0042?).' };
  revalidatePath('/servicios');
  return { ok: true };
}

/** Quita un insumo de un tipo de servicio (config). */
export async function quitarInsumoServicio(id: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) return { error: 'No autorizado.' };
  const supabase = createClient();
  const { error } = await supabase.from('servicio_insumo').delete().eq('id', id);
  if (error) return { error: 'No se pudo quitar.' };
  revalidatePath('/servicios');
  return { ok: true };
}

/**
 * Descuenta los insumos configurados para un tipo de servicio, por FEFO, dejando un
 * movimiento 'ajuste' por lote (referencia servicio:<id>). No bloquea el servicio si
 * falta stock: lo registra y avisa. Devuelve un aviso si algo no se pudo descontar.
 */
async function descontarInsumos(
  supabase: ReturnType<typeof createClient>,
  tipo: RegistrarServicioInput['tipo'],
  servicioId: string,
  empleadoId: string,
): Promise<string | undefined> {
  const { data: mapeo, error: eMap } = await supabase
    .from('servicio_insumo')
    .select('producto_id, cantidad, producto:producto_id ( nombre )')
    .eq('servicio_tipo', tipo);
  // Tabla ausente (migración 0042 pendiente) o sin mapeo → no se descuenta nada.
  if (eMap || !mapeo || (mapeo as unknown[]).length === 0) return undefined;

  const faltantes: string[] = [];
  for (const m of mapeo as unknown as Array<{ producto_id: string; cantidad: number; producto: { nombre?: string } | null }>) {
    let restante = Number(m.cantidad);
    const nombre = m.producto?.nombre ?? 'insumo';
    const { data: lotes } = await supabase
      .from('lote')
      .select('id, cantidad_actual, costo_unitario, fecha_vencimiento')
      .eq('producto_id', m.producto_id)
      .eq('estado', 'activo')
      .eq('en_revision_frio', false)
      .gt('cantidad_actual', 0)
      .order('fecha_vencimiento', { ascending: true });
    for (const l of (lotes as unknown as Array<{ id: string; cantidad_actual: number; costo_unitario: number | null; fecha_vencimiento: string | null }>) ?? []) {
      if (restante <= 0) break;
      const toma = Math.min(restante, Number(l.cantidad_actual));
      const saldo = Number(l.cantidad_actual) - toma;
      await supabase.from('lote').update((saldo <= 0 ? { cantidad_actual: saldo, estado: 'agotado' } : { cantidad_actual: saldo }) as never).eq('id', l.id);
      await supabase.from('movimiento_inventario').insert({
        producto_id: m.producto_id, lote_id: l.id, sucursal_id: SUCURSAL, tipo: 'ajuste',
        cantidad: -toma, cantidad_resultante: saldo, costo_unitario_momento: l.costo_unitario,
        motivo: `Insumo de servicio: ${tipo}`, referencia: `servicio:${servicioId}`, empleado_id: empleadoId,
      } as never);
      restante -= toma;
    }
    if (restante > 0.0001) faltantes.push(`${nombre} (faltaron ${restante})`);
  }
  if (faltantes.length > 0) return `Servicio registrado, pero sin existencia de: ${faltantes.join(', ')}. Ajusta el inventario.`;
  return undefined;
}
