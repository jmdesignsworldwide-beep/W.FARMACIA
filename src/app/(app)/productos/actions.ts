'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { normaliza } from '@/lib/catalogos';
import { UNIDADES_CONCENTRACION, UNIDADES_VOLUMEN, type ProductoPayload } from '@/lib/producto';

type Cliente = ReturnType<typeof createClient>;

/**
 * Cliente service_role SOLO para el "deshacer" interno de una alta abortada.
 * El rol `authenticated` no tiene DELETE sobre `producto` (0007 lo revocó:
 * modelo de borrado suave). Sin esto, el rollback de un duplicado no
 * confirmado fallaría en silencio y el duplicado quedaría persistido —
 * justo el fallo que la alerta debe impedir. Nunca se usa para leer/escribir
 * a pedido del usuario; solo para revertir lo que este mismo servidor creó.
 */
function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface ProductoState {
  ok?: boolean;
  productoId?: string;
  error?: string;
  /** DUPLICADO de inventario: misma firma clínica + mismo laboratorio + misma
   *  presentación. Es la alerta real (bloquea salvo confirmación). */
  duplicados?: string[];
  /** EQUIVALENTES de OTRA marca: misma firma, distinto laboratorio. Es
   *  informativo positivo — el producto se crea como marca alternativa. */
  marcaAlternativaDe?: string[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function validar(payload: ProductoPayload): string | null {
  if (!(payload.nombre ?? '').trim()) return 'El producto necesita un nombre.';
  const vistos = new Set<string>();
  for (const p of payload.principios ?? []) {
    if (!p.principio_activo_id) return 'Falta elegir el principio activo de un renglón.';
    if (vistos.has(p.principio_activo_id))
      return 'Un principio activo está repetido. Cada uno va una sola vez.';
    vistos.add(p.principio_activo_id);
    const valor = num(p.concentracion_valor);
    if (valor === null || valor <= 0) return 'La concentración debe ser un número mayor que cero.';
    if (!UNIDADES_CONCENTRACION.includes(p.concentracion_unidad))
      return 'Unidad de concentración inválida.';
    const vv = num(p.concentracion_volumen_valor);
    const vu = p.concentracion_volumen_unidad;
    if ((vv === null) !== (vu === null || vu === undefined))
      return 'El volumen necesita valor y unidad juntos (ej. 5 ml), o ninguno.';
    if (vu && !UNIDADES_VOLUMEN.includes(vu)) return 'Unidad de volumen inválida.';
  }
  return null;
}

/** Selector inteligente: busca el valor por nombre normalizado o lo crea (§3). */
async function buscarOCrear(
  supabase: Cliente,
  tabla: 'laboratorio' | 'presentacion',
  texto: string | null,
): Promise<string | null> {
  const nombre = (texto ?? '').trim();
  if (!nombre) return null;
  const norm = normaliza(nombre);
  const { data } = await supabase.from(tabla).select('id, nombre_normalizado');
  const found = (data as { id: string; nombre_normalizado: string }[] | null)?.find(
    (e) => e.nombre_normalizado === norm,
  );
  if (found) return found.id;
  const { data: creado } = await supabase
    .from(tabla)
    .insert({ nombre } as never)
    .select('id')
    .single<{ id: string }>();
  return creado?.id ?? null;
}

async function insertarRenglones(
  supabase: Cliente,
  productoId: string,
  payload: ProductoPayload,
): Promise<boolean> {
  const filas = (payload.principios ?? []).map((p, i) => ({
    producto_id: productoId,
    principio_activo_id: p.principio_activo_id,
    concentracion_valor: num(p.concentracion_valor),
    concentracion_unidad: p.concentracion_unidad,
    concentracion_volumen_valor: num(p.concentracion_volumen_valor),
    concentracion_volumen_unidad: p.concentracion_volumen_unidad ?? null,
    orden: i + 1,
  }));
  if (filas.length === 0) return true;
  const { error } = await supabase.from('producto_principio_activo').insert(filas as never);
  return !error;
}

const camposProducto = (payload: ProductoPayload, laboratorioId: string | null, presentacionId: string | null) => ({
  nombre: payload.nombre.trim(),
  forma_farmaceutica_id: payload.forma_farmaceutica_id || null,
  via_administracion_id: payload.via_administracion_id || null,
  laboratorio_id: laboratorioId,
  presentacion_id: presentacionId,
  unidad_base: payload.unidad_base?.trim() || null,
  unidad_caja: payload.unidad_caja?.trim() || null,
  factor_caja: num(payload.factor_caja),
  precio_venta: num(payload.precio_venta),
  precio_caja: num(payload.precio_caja),
  margen_objetivo: num(payload.margen_objetivo),
  // Tres estados (Adenda IV §1): marcar = true (explícito); sin marcar = null
  // (HEREDA de la molécula). NUNCA false por defecto: un false silencioso sobre
  // una molécula controlada se saltaría el candado (docs/PENDIENTES.md). El
  // override a false (bajar el candado) se hace en la pantalla de edición, con
  // motivo, y lo enforce el trigger de la base.
  es_controlado: payload.es_controlado ? true : null,
  requiere_receta: payload.requiere_receta ? true : null,
  exento_itbis: Boolean(payload.exento_itbis),
  codigo_barras: payload.codigo_barras?.trim() || null,
  registro_sanitario: payload.registro_sanitario?.trim() || null,
});

/**
 * Evalúa la firma del producto contra el resto (Adenda III):
 *  • DUPLICADO = misma firma clínica + mismo laboratorio + misma presentación.
 *  • EQUIVALENTE (marca alternativa) = misma firma, distinto laboratorio/presentación.
 * Un producto incompleto (firma con '?') no se compara.
 */
async function evaluarFirma(
  supabase: Cliente,
  productoId: string,
): Promise<{ duplicados: string[]; equivalentes: string[] }> {
  const { data: self } = await supabase
    .from('producto')
    .select('firma_equivalencia, laboratorio_id, presentacion_id')
    .eq('id', productoId)
    .single<{ firma_equivalencia: string | null; laboratorio_id: string | null; presentacion_id: string | null }>();
  const firma = self?.firma_equivalencia ?? null;
  if (!firma || firma.includes('?')) return { duplicados: [], equivalentes: [] };
  const { data: otros } = await supabase
    .from('producto')
    .select('nombre, laboratorio_id, presentacion_id')
    .eq('firma_equivalencia', firma)
    .is('eliminado_en', null)
    .neq('id', productoId);
  const duplicados: string[] = [];
  const equivalentes: string[] = [];
  for (const o of (otros as { nombre: string; laboratorio_id: string | null; presentacion_id: string | null }[] | null) ?? []) {
    if (o.laboratorio_id === self!.laboratorio_id && o.presentacion_id === self!.presentacion_id)
      duplicados.push(o.nombre);
    else equivalentes.push(o.nombre);
  }
  return { duplicados, equivalentes };
}

/** Alta de producto con identidad clínica + laboratorio/presentación (§4, §3). */
export async function crearProducto(payload: ProductoPayload): Promise<ProductoState> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario'))
    return { error: 'No tienes permiso para gestionar productos.' };
  const err = validar(payload);
  if (err) return { error: err };

  const supabase = createClient();
  const laboratorioId = await buscarOCrear(supabase, 'laboratorio', payload.laboratorio);
  const presentacionId = await buscarOCrear(supabase, 'presentacion', payload.presentacion);

  const { data: prod, error: prodErr } = await supabase
    .from('producto')
    .insert(camposProducto(payload, laboratorioId, presentacionId) as never)
    .select('id')
    .single<{ id: string }>();
  if (prodErr || !prod) {
    if ((prodErr as { code?: string } | null)?.code === '23505')
      return { error: 'Ese código de barras ya está en otro producto.' };
    return { error: 'No se pudo crear el producto. Revisa tu permiso e intenta de nuevo.' };
  }

  if (!(await insertarRenglones(supabase, prod.id, payload))) {
    await admin().from('producto').delete().eq('id', prod.id);
    return { error: 'No se pudieron guardar los principios activos. Nada quedó a medias.' };
  }

  const apto =
    Boolean(payload.forma_farmaceutica_id) &&
    Boolean(payload.via_administracion_id) &&
    (payload.principios ?? []).length > 0;
  if (apto) {
    const { duplicados, equivalentes } = await evaluarFirma(supabase, prod.id);
    if (duplicados.length > 0 && !payload.confirmarDuplicado) {
      await admin().from('producto').delete().eq('id', prod.id);
      return { duplicados };
    }
    if (equivalentes.length > 0) {
      revalidatePath('/productos');
      return { ok: true, productoId: prod.id, marcaAlternativaDe: equivalentes };
    }
  }

  revalidatePath('/productos');
  return { ok: true, productoId: prod.id };
}

/**
 * Edición/completado de un producto. Re-chequea DUPLICADO en este momento
 * (Adenda III, punto del Dueño): si al completarlo choca con otro, avisa. Si
 * el duplicado no se confirma, revierte para no dejarlo entrar por atrás.
 */
export async function actualizarProducto(
  productoId: string,
  payload: ProductoPayload,
): Promise<ProductoState> {
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_inventario'))
    return { error: 'No tienes permiso para gestionar productos.' };
  const err = validar(payload);
  if (err) return { error: err };

  const supabase = createClient();

  // Snapshot para poder revertir si resulta duplicado no confirmado.
  const { data: previo } = await supabase
    .from('producto')
    .select('*')
    .eq('id', productoId)
    .single<Record<string, unknown>>();
  const { data: renglonesPrevios } = await supabase
    .from('producto_principio_activo')
    .select('producto_id, principio_activo_id, concentracion_valor, concentracion_unidad, concentracion_volumen_valor, concentracion_volumen_unidad, orden')
    .eq('producto_id', productoId);
  if (!previo) return { error: 'El producto no existe.' };

  const laboratorioId = await buscarOCrear(supabase, 'laboratorio', payload.laboratorio);
  const presentacionId = await buscarOCrear(supabase, 'presentacion', payload.presentacion);

  const { error: upErr } = await supabase
    .from('producto')
    .update(camposProducto(payload, laboratorioId, presentacionId) as never)
    .eq('id', productoId);
  if (upErr) return { error: 'No se pudo actualizar el producto.' };
  await supabase.from('producto_principio_activo').delete().eq('producto_id', productoId);
  await insertarRenglones(supabase, productoId, payload);

  const apto =
    Boolean(payload.forma_farmaceutica_id) &&
    Boolean(payload.via_administracion_id) &&
    (payload.principios ?? []).length > 0;
  if (apto && !payload.confirmarDuplicado) {
    const { duplicados } = await evaluarFirma(supabase, productoId);
    if (duplicados.length > 0) {
      // Revertir al estado previo — el duplicado no entra por la puerta de atrás.
      // Solo campos mutables (nombre_normalizado/firma_equivalencia son generados/trigger).
      const MUTABLES = [
        'nombre', 'forma_farmaceutica_id', 'via_administracion_id', 'laboratorio_id',
        'presentacion_id', 'unidad_base', 'unidad_caja', 'factor_caja', 'precio_venta',
        'precio_caja', 'margen_objetivo', 'es_controlado', 'requiere_receta', 'exento_itbis',
        'codigo_barras', 'registro_sanitario',
      ] as const;
      const revert = Object.fromEntries(MUTABLES.map((k) => [k, previo[k] ?? null]));
      await supabase.from('producto').update(revert as never).eq('id', productoId);
      await supabase.from('producto_principio_activo').delete().eq('producto_id', productoId);
      if (renglonesPrevios && renglonesPrevios.length > 0)
        await supabase.from('producto_principio_activo').insert(renglonesPrevios as never);
      return { duplicados };
    }
  }

  revalidatePath('/productos');
  return { ok: true, productoId };
}
