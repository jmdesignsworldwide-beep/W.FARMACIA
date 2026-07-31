'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { UNIDADES_CONCENTRACION, UNIDADES_VOLUMEN, type ProductoPayload } from '@/lib/producto';

export interface ProductoState {
  ok?: boolean;
  productoId?: string;
  error?: string;
  /** Productos ya existentes con la MISMA firma de equivalencia (aviso, no bloqueo). */
  equivalentes?: string[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Alta de producto con sus principios activos (Adenda III). Gestión de
 * inventario: Dueño/Admin/Farmacéutico (servidor + RLS). Inserta el producto
 * y sus renglones de concentración; si un renglón falla, deshace el producto
 * para no dejar huérfanos. La firma de equivalencia la calcula el trigger.
 */
export async function crearProducto(payload: ProductoPayload): Promise<ProductoState> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario')) {
    return { error: 'No tienes permiso para gestionar productos.' };
  }

  const nombre = (payload.nombre ?? '').trim();
  if (!nombre) return { error: 'El producto necesita un nombre.' };

  // Validar principios (cada renglón con su concentración).
  const principios = payload.principios ?? [];
  const vistos = new Set<string>();
  for (const p of principios) {
    if (!p.principio_activo_id) return { error: 'Falta elegir el principio activo de un renglón.' };
    if (vistos.has(p.principio_activo_id))
      return { error: 'Un principio activo está repetido. Cada uno va una sola vez.' };
    vistos.add(p.principio_activo_id);
    const valor = num(p.concentracion_valor);
    if (valor === null || valor <= 0)
      return { error: 'La concentración debe ser un número mayor que cero.' };
    if (!UNIDADES_CONCENTRACION.includes(p.concentracion_unidad))
      return { error: 'Unidad de concentración inválida.' };
    const vv = num(p.concentracion_volumen_valor);
    const vu = p.concentracion_volumen_unidad;
    if ((vv === null) !== (vu === null || vu === undefined))
      return { error: 'El volumen necesita valor y unidad juntos (ej. 5 ml), o ninguno.' };
    if (vu && !UNIDADES_VOLUMEN.includes(vu)) return { error: 'Unidad de volumen inválida.' };
  }

  const supabase = createClient();

  const { data: prod, error: prodErr } = await supabase
    .from('producto')
    .insert({
      nombre,
      forma_farmaceutica_id: payload.forma_farmaceutica_id || null,
      via_administracion_id: payload.via_administracion_id || null,
      unidad_base: payload.unidad_base?.trim() || null,
      unidad_caja: payload.unidad_caja?.trim() || null,
      factor_caja: num(payload.factor_caja),
      precio_venta: num(payload.precio_venta),
      precio_caja: num(payload.precio_caja),
      margen_objetivo: num(payload.margen_objetivo),
      es_controlado: Boolean(payload.es_controlado),
      requiere_receta: Boolean(payload.requiere_receta),
      exento_itbis: Boolean(payload.exento_itbis),
      codigo_barras: payload.codigo_barras?.trim() || null,
    } as never)
    .select('id')
    .single<{ id: string }>();

  if (prodErr || !prod) {
    if ((prodErr as { code?: string } | null)?.code === '23505')
      return { error: 'Ese código de barras ya está en otro producto.' };
    return { error: 'No se pudo crear el producto. Revisa tu permiso e intenta de nuevo.' };
  }

  if (principios.length > 0) {
    const filas = principios.map((p, i) => ({
      producto_id: prod.id,
      principio_activo_id: p.principio_activo_id,
      concentracion_valor: num(p.concentracion_valor),
      concentracion_unidad: p.concentracion_unidad,
      concentracion_volumen_valor: num(p.concentracion_volumen_valor),
      concentracion_volumen_unidad: p.concentracion_volumen_unidad ?? null,
      orden: i + 1,
    }));
    const { error: ppaErr } = await supabase
      .from('producto_principio_activo')
      .insert(filas as never);
    if (ppaErr) {
      // Deshacer el producto para no dejarlo sin su identidad clínica.
      await supabase.from('producto').delete().eq('id', prod.id);
      return { error: 'No se pudieron guardar los principios activos. Nada quedó a medias.' };
    }
  }

  // ── Dedup por FIRMA DE EQUIVALENCIA (Adenda III) ──
  // Solo si el producto es apto para equivalencia: forma + vía + al menos un
  // principio con concentración. Incompleto = no apto = no se compara (su
  // firma lleva marcadores '?'/vacío). Si ya existe otro con la misma firma
  // y el usuario no confirmó, se deshace y se avisa — no se duplica en silencio.
  const aptoEquivalencia =
    Boolean(payload.forma_farmaceutica_id) &&
    Boolean(payload.via_administracion_id) &&
    principios.length > 0;
  if (aptoEquivalencia && !payload.confirmarEquivalente) {
    const { data: nuevo } = await supabase
      .from('producto')
      .select('firma_equivalencia')
      .eq('id', prod.id)
      .single<{ firma_equivalencia: string | null }>();
    const firma = nuevo?.firma_equivalencia ?? null;
    if (firma && !firma.includes('?')) {
      const { data: equiv } = await supabase
        .from('producto')
        .select('nombre')
        .eq('firma_equivalencia', firma)
        .is('eliminado_en', null)
        .neq('id', prod.id);
      if (equiv && (equiv as { nombre: string }[]).length > 0) {
        // Deshacer: el usuario decide si de verdad es distinto.
        await supabase.from('producto').delete().eq('id', prod.id);
        return { equivalentes: (equiv as { nombre: string }[]).map((e) => e.nombre) };
      }
    }
  }

  revalidatePath('/productos');
  return { ok: true, productoId: prod.id };
}
