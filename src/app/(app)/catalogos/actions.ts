'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import {
  catalogoDef,
  normaliza,
  similitud,
  entradaSospechosa,
  UMBRAL_PARECIDO,
  type CatalogoTipo,
} from '@/lib/catalogos';

export interface CatalogoState {
  tipo?: CatalogoTipo;
  id?: string; // para editar/borrar: qué entrada
  ok?: boolean;
  creado?: string;
  editado?: string;
  borrado?: string;
  error?: string;
  /** Nombres existentes PARECIDOS: requieren confirmación (§4). */
  similares?: string[];
  /** Entrada "obvia" (corta/genérica): requiere confirmación (§4). */
  sospechoso?: string;
  /** Borrado bloqueado: cuántos productos usan la entrada. */
  enUso?: number;
  /** El nombre intentado, para reenviarlo si el usuario confirma. */
  intento?: string;
}

const TIPOS: CatalogoTipo[] = [
  'principio_activo',
  'forma_farmaceutica',
  'via_administracion',
  'clase_terapeutica',
  'familia_alergenica',
  'categoria_comercial',
];

type Cliente = ReturnType<typeof createClient>;

/**
 * Chequeo compartido de un nombre antes de escribir (alta o edición):
 *  • Duplicado EXACTO (normalizado) → bloqueo duro, aun confirmando.
 *  • Entrada sospechosa (§4) y/o parecidos (§4) → avisos BLANDOS que se
 *    muestran juntos y se saltan con `confirmar`.
 * Devuelve un fragmento de estado si hay algo que decir, o null si está limpio.
 * `idExcluir` evita que una entrada choque consigo misma al editarla.
 */
async function chequearNombre(
  supabase: Cliente,
  tipo: CatalogoTipo,
  nombre: string,
  opts: { idExcluir?: string; confirmar: boolean },
): Promise<Pick<CatalogoState, 'error' | 'similares' | 'sospechoso'> | null> {
  const { data, error } = await supabase.from(tipo).select('id, nombre, nombre_normalizado');
  if (error) return { error: 'No se pudo leer el catálogo. Intenta de nuevo.' };
  const existentes = (data ?? []) as Array<{ id: string; nombre: string; nombre_normalizado: string }>;
  const otros = existentes.filter((e) => e.id !== opts.idExcluir);

  const norm = normaliza(nombre);
  const exacto = otros.find((e) => e.nombre_normalizado === norm);
  if (exacto) return { error: `Ya existe: «${exacto.nombre}».` };

  if (opts.confirmar) return null; // el usuario ya vio los avisos blandos

  const sospechoso = entradaSospechosa(nombre) ?? undefined;
  const similares = otros
    .map((e) => ({ nombre: e.nombre, s: similitud(nombre, e.nombre) }))
    .filter((e) => e.s >= UMBRAL_PARECIDO)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((e) => e.nombre);

  if (sospechoso || similares.length > 0) {
    return { sospechoso, similares: similares.length ? similares : undefined };
  }
  return null;
}

/** Guarda de rol de servidor para gestionar catálogos (además de RLS). */
async function guardaRol(tipo: CatalogoTipo): Promise<CatalogoState | null> {
  const def = catalogoDef(tipo);
  if (!def || !TIPOS.includes(tipo)) return { tipo, error: 'Catálogo desconocido.' };
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_catalogos')) {
    return { tipo, error: 'No tienes permiso para gestionar este catálogo.' };
  }
  return null;
}

/**
 * Alta de un valor de catálogo crítico. §4: solo Dueño/Admin (servidor + RLS).
 * Detecta duplicados EXACTOS y PARECIDOS y entradas obvias antes de escribir.
 */
export async function crearValorCatalogo(
  _prev: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  const tipo = String(formData.get('tipo') ?? '') as CatalogoTipo;
  const nombre = String(formData.get('nombre') ?? '').trim();
  const confirmar = String(formData.get('confirmar') ?? '') === 'true';

  const denegado = await guardaRol(tipo);
  if (denegado) return denegado;
  if (!nombre) return { tipo, error: 'Escribe un nombre.' };
  if (nombre.length > 120) return { tipo, error: 'El nombre es demasiado largo.' };

  const supabase = createClient();
  const chk = await chequearNombre(supabase, tipo, nombre, { confirmar });
  if (chk?.error) return { tipo, error: chk.error };
  if (chk) return { tipo, similares: chk.similares, sospechoso: chk.sospechoso, intento: nombre };

  const { error: insErr } = await supabase.from(tipo).insert({ nombre } as never);
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') return { tipo, error: `Ya existe: «${nombre}».` };
    return { tipo, error: 'No se pudo guardar. Revisa tu permiso e intenta de nuevo.' };
  }

  revalidatePath('/catalogos');
  return { tipo, ok: true, creado: nombre };
}

/**
 * Edición del nombre de una entrada. Mismas reglas que el alta —exactos,
 * parecidos y entradas obvias— para que un error no entre por editar.
 */
export async function editarValorCatalogo(input: {
  tipo: CatalogoTipo;
  id: string;
  nombre: string;
  confirmar?: boolean;
}): Promise<CatalogoState> {
  const { tipo, id } = input;
  const nombre = (input.nombre ?? '').trim();
  const confirmar = Boolean(input.confirmar);

  const denegado = await guardaRol(tipo);
  if (denegado) return { ...denegado, id };
  if (!id) return { tipo, error: 'Falta la entrada a editar.' };
  if (!nombre) return { tipo, id, error: 'Escribe un nombre.' };
  if (nombre.length > 120) return { tipo, id, error: 'El nombre es demasiado largo.' };

  const supabase = createClient();
  const chk = await chequearNombre(supabase, tipo, nombre, { idExcluir: id, confirmar });
  if (chk?.error) return { tipo, id, error: chk.error };
  if (chk) return { tipo, id, similares: chk.similares, sospechoso: chk.sospechoso, intento: nombre };

  const { error } = await supabase.from(tipo).update({ nombre } as never).eq('id', id);
  if (error) {
    if ((error as { code?: string }).code === '23505') return { tipo, id, error: `Ya existe: «${nombre}».` };
    return { tipo, id, error: 'No se pudo guardar el cambio. Revisa tu permiso.' };
  }

  revalidatePath('/catalogos');
  return { tipo, id, ok: true, editado: nombre };
}

/** Cuántas filas usan una entrada de catálogo (para el mensaje de bloqueo). */
async function contarUsos(supabase: Cliente, tipo: CatalogoTipo, id: string): Promise<number> {
  // principio activo: lo referencian los renglones de producto
  if (tipo === 'principio_activo') {
    const { count } = await supabase
      .from('producto_principio_activo')
      .select('producto_id', { count: 'exact', head: true })
      .eq('principio_activo_id', id);
    return count ?? 1;
  }
  // clase y familia: las referencia el principio activo (la molécula)
  if (tipo === 'clase_terapeutica' || tipo === 'familia_alergenica') {
    const col = tipo === 'clase_terapeutica' ? 'clase_terapeutica_id' : 'familia_alergenica_id';
    const { count } = await supabase
      .from('principio_activo')
      .select('id', { count: 'exact', head: true })
      .eq(col, id);
    return count ?? 1;
  }
  // forma, vía y categoría: las referencia el producto
  const col =
    tipo === 'forma_farmaceutica'
      ? 'forma_farmaceutica_id'
      : tipo === 'via_administracion'
        ? 'via_administracion_id'
        : 'categoria_comercial_id';
  const { count } = await supabase
    .from('producto')
    .select('id', { count: 'exact', head: true })
    .eq(col, id);
  return count ?? 1;
}

/**
 * Borrado de una entrada. Borrado DIRECTO gobernado por la política RLS de
 * DELETE (solo Dueño/Admin — condición 1, se cumple aun por llamada directa);
 * el FK RESTRICT bloquea atómicamente si está en uso (condición 2); el DELETE
 * corre con la sesión del usuario, así que deja rastro en audit_log con el
 * actor real (condición 3). Aquí se valida el rol también (defensa en
 * profundidad) y se traduce el resultado para el usuario.
 */
export async function borrarValorCatalogo(input: {
  tipo: CatalogoTipo;
  id: string;
  nombre: string;
}): Promise<CatalogoState> {
  const { tipo, id, nombre } = input;

  const denegado = await guardaRol(tipo);
  if (denegado) return { ...denegado, id };
  if (!id) return { tipo, error: 'Falta la entrada a borrar.' };

  const supabase = createClient();
  const { error, count } = await supabase.from(tipo).delete({ count: 'exact' }).eq('id', id);

  if (error) {
    // 23503: foreign_key_violation → está en uso. Se cuenta para el mensaje.
    if ((error as { code?: string }).code === '23503') {
      return { tipo, id, enUso: await contarUsos(supabase, tipo, id) };
    }
    return { tipo, id, error: 'No se pudo borrar. Revisa tu permiso e intenta de nuevo.' };
  }

  // count 0 = la RLS lo filtró (sin rol; ya cubierto por guardaRol) o ya no
  // existía → en ambos casos, para el usuario, la entrada ya no está.
  revalidatePath('/catalogos');
  return { tipo, id, ok: true, borrado: nombre };
}
