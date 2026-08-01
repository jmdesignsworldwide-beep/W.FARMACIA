/**
 * Catálogos críticos del maestro de productos (Adenda III §3, §4).
 * Principio activo, forma farmacéutica y vía de administración: solo el
 * Dueño y el Administrador los gestionan, desde esta pantalla, con
 * detección de duplicados PARECIDOS al guardar (no solo exactos).
 *
 * Este módulo es neutro (server y client): la config y el detector de
 * similitud viven aquí; la escritura ocurre en actions.ts (servidor).
 */

export type CatalogoTipo =
  | 'principio_activo'
  | 'forma_farmaceutica'
  | 'via_administracion'
  | 'clase_terapeutica'
  | 'familia_alergenica'
  | 'categoria_comercial';

/** Agrupación visual: la identidad clínica vs. la clasificación (Adenda IV). */
export type CatalogoGrupo = 'clinico' | 'clasificacion';

export interface CatalogoDef {
  tipo: CatalogoTipo;
  grupo: CatalogoGrupo;
  titulo: string; // plural
  singular: string;
  icon: string; // lucide
  descripcion: string;
  placeholder: string;
}

export const CATALOGOS: CatalogoDef[] = [
  {
    tipo: 'principio_activo',
    grupo: 'clinico',
    titulo: 'Principios activos',
    singular: 'principio activo',
    icon: 'FlaskConical',
    descripcion:
      'La molécula. Base de la equivalencia: un error aquí sugiere un medicamento por otro.',
    placeholder: 'Ej. Losartán',
  },
  {
    tipo: 'forma_farmaceutica',
    grupo: 'clinico',
    titulo: 'Formas farmacéuticas',
    singular: 'forma farmacéutica',
    icon: 'Pill',
    descripcion: 'Tableta, cápsula, jarabe, gotas… Cómo se presenta el medicamento.',
    placeholder: 'Ej. Tableta',
  },
  {
    tipo: 'via_administracion',
    grupo: 'clinico',
    titulo: 'Vías de administración',
    singular: 'vía de administración',
    icon: 'Waypoints',
    descripcion:
      'Oral, oftálmica, ótica… Campo aparte de la forma: unas gotas oftálmicas no son unas óticas.',
    placeholder: 'Ej. Oftálmica',
  },
  {
    tipo: 'clase_terapeutica',
    grupo: 'clasificacion',
    titulo: 'Clases terapéuticas',
    singular: 'clase terapéutica',
    icon: 'Activity',
    descripcion:
      'Antihipertensivo, antibiótico, analgésico… Agrupa las moléculas para reportes y para el mostrador.',
    placeholder: 'Ej. Antihipertensivo',
  },
  {
    tipo: 'familia_alergenica',
    grupo: 'clasificacion',
    titulo: 'Familias alergénicas',
    singular: 'familia alergénica',
    icon: 'ShieldAlert',
    descripcion:
      'Penicilinas, sulfas, AINEs… La base de la alerta cruzada de alergia: la reacción es por familia, no por molécula.',
    placeholder: 'Ej. Penicilinas',
  },
  {
    tipo: 'categoria_comercial',
    grupo: 'clasificacion',
    titulo: 'Categorías comerciales',
    singular: 'categoría comercial',
    icon: 'Tags',
    descripcion:
      'Medicamento, cuidado personal, bebé, belleza… Una farmacia no vende solo medicinas.',
    placeholder: 'Ej. Cuidado personal',
  },
];

export function catalogoDef(tipo: CatalogoTipo): CatalogoDef | undefined {
  return CATALOGOS.find((c) => c.tipo === tipo);
}

/** Normalización espejo de app.slug() en la base (minúsculas, sin acentos). */
export function normaliza(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Similitud por trigramas (misma noción que pg_trgm en la base). Devuelve
 * 0..1. Se usa para avisar de duplicados PARECIDOS antes de guardar —
 * "Tableta" vs "Tabletas" vs "Tablet" — que romperían la equivalencia en
 * silencio si entraran como valores distintos (Adenda III §4).
 */
function trigramas(s: string): Set<string> {
  const t = `  ${normaliza(s)} `;
  const set = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}

export function similitud(a: string, b: string): number {
  const A = trigramas(a);
  const B = trigramas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Umbral para considerar dos nombres "parecidos" (aviso, no bloqueo). */
export const UMBRAL_PARECIDO = 0.42;

/**
 * Palabras de relleno que casi nunca son vocabulario clínico real. No es una
 * lista para bloquear —puede haber excepciones— sino para PEDIR CONFIRMACIÓN.
 */
const GENERICAS = new Set([
  'new', 'nuevo', 'nueva', 'test', 'prueba', 'pruebas', 'ejemplo', 'sample',
  'tbd', 'na', 'n/a', 'xxx', 'aaa', 'asdf', 'qwerty', 'sin nombre', 'ninguno',
  'nada', 'otro', 'otra', 'varios', 'temp', 'temporal', 'placeholder',
]);

/**
 * Detecta una entrada "obvia" que merece confirmación antes de guardar
 * (Adenda III §4, punto del Dueño): muy corta, sin letras, o una palabra
 * genérica de relleno. Devuelve el motivo (para el aviso) o null si parece
 * un nombre real. Es una CONFIRMACIÓN, no un bloqueo — un nombre corto
 * legítimo se guarda igual tras confirmar.
 */
export function entradaSospechosa(nombre: string): string | null {
  const limpio = nombre.trim();
  const norm = normaliza(limpio);
  const soloLetras = norm.replace(/[^a-záéíóúñ]/gi, '');
  if (limpio.length <= 3) {
    return `«${limpio}» tiene solo ${limpio.length} ${limpio.length === 1 ? 'letra' : 'letras'}.`;
  }
  if (soloLetras.length === 0) {
    return `«${limpio}» no tiene letras.`;
  }
  if (GENERICAS.has(norm)) {
    return `«${limpio}» parece un texto de relleno, no un nombre real.`;
  }
  return null;
}
