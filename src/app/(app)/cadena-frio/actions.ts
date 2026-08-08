'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';

const SUCURSAL = '00000000-0000-0000-0000-000000000001';

function esFarmaceutico(role: string) {
  return role === 'dueno' || role === 'administrador' || role === 'farmaceutico';
}

async function configNum(supabase: ReturnType<typeof createClient>, clave: string, def: number): Promise<number> {
  const { data } = await supabase.from('configuracion').select('valor').eq('clave', clave).limit(1).maybeSingle<{ valor: unknown }>();
  const v = Number(data?.valor);
  return Number.isFinite(v) ? v : def;
}

export async function registrarTemperatura(valorCelsius: number, nota: string): Promise<{ ok?: true; error?: string; fueraDeRango?: boolean }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const v = Number(valorCelsius);
  if (!Number.isFinite(v)) return { error: 'Temperatura inválida.' };
  const supabase = createClient();
  const min = await configNum(supabase, 'nevera_temp_min', 2);
  const max = await configNum(supabase, 'nevera_temp_max', 8);
  const fuera = v < min || v > max;
  const { error } = await supabase.from('lectura_temperatura').insert({
    sucursal_id: SUCURSAL,
    valor_celsius: v,
    fuera_de_rango: fuera,
    nota: nota.trim() || null,
    tomada_por: user.id,
  } as never);
  if (error) return { error: 'No se pudo registrar la temperatura.' };
  revalidatePath('/cadena-frio');
  return { ok: true, fueraDeRango: fuera };
}

export async function registrarApagon(inicioISO: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  if (!inicioISO) return { error: 'Falta la hora de inicio.' };
  const supabase = createClient();
  const { error } = await supabase.from('apagon').insert({ sucursal_id: SUCURSAL, inicio: inicioISO, registrado_por: user.id } as never);
  if (error) return { error: 'No se pudo registrar el apagón.' };
  revalidatePath('/cadena-frio');
  return { ok: true };
}

export async function cerrarApagon(id: string, retornoISO: string): Promise<{ ok?: true; error?: string; umbralExcedido?: boolean; lotesAfectados?: number }> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'ver_operacion')) return { error: 'No autorizado.' };
  const supabase = createClient();

  const { data: ap } = await supabase.from('apagon').select('inicio, retorno').eq('id', id).maybeSingle<{ inicio: string; retorno: string | null }>();
  if (!ap) return { error: 'Ese apagón no existe.' };
  if (ap.retorno) return { error: 'Ese apagón ya está cerrado.' };

  const inicio = new Date(ap.inicio).getTime();
  const retorno = new Date(retornoISO).getTime();
  if (!Number.isFinite(retorno) || retorno <= inicio) return { error: 'La hora de retorno debe ser posterior al inicio.' };
  const horas = Math.round(((retorno - inicio) / 3600000) * 100) / 100;
  const umbral = await configNum(supabase, 'umbral_apagon_horas', 2);
  const excedido = horas > umbral;

  let afectados = 0;
  if (excedido) {
    // Lotes activos de productos que requieren refrigeración (override o heredado de la forma).
    const { data: lotes } = await supabase
      .from('lote')
      .select('id, en_revision_frio, producto:producto_id ( requiere_refrigeracion, forma:forma_farmaceutica_id ( requiere_refrigeracion ) )')
      .eq('estado', 'activo');
    const rows = (lotes as unknown as Array<{ id: string; en_revision_frio: boolean; producto: { requiere_refrigeracion: boolean | null; forma: { requiere_refrigeracion: boolean | null } | null } | null }>) ?? [];
    const aMarcar = rows.filter((l) => {
      const refrig = l.producto?.requiere_refrigeracion ?? l.producto?.forma?.requiere_refrigeracion ?? false;
      return refrig && !l.en_revision_frio;
    });
    for (const l of aMarcar) {
      await supabase.from('lote').update({ en_revision_frio: true, revision_motivo: `Apagón de ${horas} h (> umbral ${umbral} h)` } as never).eq('id', l.id);
    }
    afectados = aMarcar.length;
  }

  await supabase
    .from('apagon')
    .update({ retorno: retornoISO, duracion_horas: horas, umbral_excedido: excedido, lotes_afectados: afectados } as never)
    .eq('id', id);

  revalidatePath('/cadena-frio');
  return { ok: true, umbralExcedido: excedido, lotesAfectados: afectados };
}

/** El farmacéutico decide: liberar (se salvó) o descartar (merma) un lote en revisión. */
export async function resolverLoteFrio(loteId: string, decision: 'liberar' | 'descartar', motivo: string): Promise<{ ok?: true; error?: string }> {
  const user = await getSessionUser();
  if (!user || !esFarmaceutico(user.role)) return { error: 'Solo el farmacéutico decide sobre los lotes en revisión.' };
  const supabase = createClient();

  if (decision === 'liberar') {
    const { error } = await supabase.from('lote').update({ en_revision_frio: false, revision_motivo: null } as never).eq('id', loteId);
    if (error) return { error: 'No se pudo liberar.' };
  } else {
    const { data: lote } = await supabase.from('lote').select('producto_id, cantidad_actual, costo_unitario').eq('id', loteId).maybeSingle<{ producto_id: string; cantidad_actual: number; costo_unitario: number | null }>();
    if (!lote) return { error: 'No existe el lote.' };
    // Merma inviolable + lote a 0 y estado mermado.
    await supabase.from('movimiento_inventario').insert({
      producto_id: lote.producto_id,
      lote_id: loteId,
      sucursal_id: SUCURSAL,
      tipo: 'merma',
      cantidad: -Number(lote.cantidad_actual),
      cantidad_resultante: 0,
      costo_unitario_momento: lote.costo_unitario,
      motivo: `Cadena de frío: ${motivo.trim() || 'descartado tras apagón'}`,
      referencia: `frio-descarte:${loteId}`,
      empleado_id: user.id,
    } as never);
    await supabase.from('lote').update({ cantidad_actual: 0, estado: 'mermado', en_revision_frio: false, revision_motivo: null } as never).eq('id', loteId);
  }
  revalidatePath('/cadena-frio');
  return { ok: true };
}
