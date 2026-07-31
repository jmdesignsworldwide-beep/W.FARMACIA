'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import {
  catalogoDef,
  normaliza,
  similitud,
  UMBRAL_PARECIDO,
  type CatalogoTipo,
} from '@/lib/catalogos';

export interface CatalogoState {
  tipo?: CatalogoTipo;
  ok?: boolean;
  creado?: string;
  error?: string;
  /** Nombres existentes PARECIDOS: requieren que el usuario confirme (§4). */
  similares?: string[];
  /** El nombre intentado, para reenviarlo si el usuario confirma. */
  intento?: string;
}

const TIPOS: CatalogoTipo[] = ['principio_activo', 'forma_farmaceutica', 'via_administracion'];

/**
 * Alta de un valor de catálogo crítico (principio activo, forma, vía).
 * §4: solo Dueño/Admin (validado en servidor y por RLS). Detecta duplicados
 * EXACTOS (normalizados) y PARECIDOS (trigram) antes de escribir; los
 * parecidos avisan y piden confirmación en vez de crear en silencio.
 */
export async function crearValorCatalogo(
  _prev: CatalogoState,
  formData: FormData,
): Promise<CatalogoState> {
  const tipo = String(formData.get('tipo') ?? '') as CatalogoTipo;
  const nombre = String(formData.get('nombre') ?? '').trim();
  const confirmar = String(formData.get('confirmar') ?? '') === 'true';

  const def = catalogoDef(tipo);
  if (!def || !TIPOS.includes(tipo)) return { tipo, error: 'Catálogo desconocido.' };
  if (!nombre) return { tipo, error: 'Escribe un nombre.' };
  if (nombre.length > 120) return { tipo, error: 'El nombre es demasiado largo.' };

  // Guarda de rol en servidor (además de RLS): solo Dueño/Admin.
  const user = await getSessionUser();
  if (!user || !can(user.role, 'gestionar_catalogos')) {
    return { tipo, error: 'No tienes permiso para gestionar este catálogo.' };
  }

  const supabase = createClient();
  const { data, error: leerErr } = await supabase.from(tipo).select('nombre, nombre_normalizado');
  if (leerErr) return { tipo, error: 'No se pudo leer el catálogo. Intenta de nuevo.' };
  // from() con un nombre de tabla en unión colapsa el tipo; acotamos aquí.
  const existentes = (data ?? []) as Array<{ nombre: string; nombre_normalizado: string }>;

  const norm = normaliza(nombre);

  // Duplicado exacto (normalizado): no se crea.
  const exacto = existentes.find((e) => e.nombre_normalizado === norm);
  if (exacto) return { tipo, error: `Ya existe: «${exacto.nombre}».` };

  // Duplicados PARECIDOS: avisar y pedir confirmación (Adenda III §4).
  if (!confirmar) {
    const similares = existentes
      .map((e) => ({ nombre: e.nombre, s: similitud(nombre, e.nombre) }))
      .filter((e) => e.s >= UMBRAL_PARECIDO)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((e) => e.nombre);
    if (similares.length > 0) {
      return { tipo, similares, intento: nombre };
    }
  }

  const { error: insErr } = await supabase.from(tipo).insert({ nombre } as never);
  if (insErr) {
    // 23505: violación de unicidad (dup normalizado que se coló por carrera).
    if ((insErr as { code?: string }).code === '23505') {
      return { tipo, error: `Ya existe: «${nombre}».` };
    }
    return { tipo, error: 'No se pudo guardar. Revisa tu permiso e intenta de nuevo.' };
  }

  revalidatePath('/catalogos');
  return { tipo, ok: true, creado: nombre };
}
