import { parseNumeroDominicano } from './valores';

/**
 * Infiere la concentración desde el nombre del producto: "Losartán 50 mg" → 50 mg,
 * "Amoxicilina 250 mg/5 ml" → 250 mg / 5 ml. Unidades del catálogo cerrado
 * (unidad_concentracion / unidad_volumen). Devuelve null si no encuentra dosis.
 */
export interface Concentracion {
  valor: number;
  unidad: string; // mg · g · mcg · UI · % · mEq · mmol
  vol_valor: number | null;
  vol_unidad: string | null; // ml · g
}

const UNIDAD: Record<string, string> = {
  mg: 'mg', g: 'g', mcg: 'mcg', 'µg': 'mcg', ug: 'mcg',
  ui: 'UI', 'u.i.': 'UI', '%': '%', meq: 'mEq', mmol: 'mmol',
};
const VOL: Record<string, string> = { ml: 'ml', g: 'g' };

const RE = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|u\.i\.|ui|meq|mmol|%|g)\b(?:\s*\/\s*(\d+(?:[.,]\d+)?)\s*(ml|g)\b)?/i;

export function inferirConcentracion(nombre: string): Concentracion | null {
  const m = RE.exec(nombre ?? '');
  if (!m) return null;
  const unidad = UNIDAD[m[2].toLowerCase()];
  if (!unidad) return null;
  const valor = parseNumeroDominicano(m[1]).valor;
  if (valor == null || valor <= 0) return null;
  const volValor = m[3] ? parseNumeroDominicano(m[3]).valor : null;
  const volUnidad = m[4] ? VOL[m[4].toLowerCase()] ?? null : null;
  return {
    valor,
    unidad,
    vol_valor: volValor,
    vol_unidad: volValor != null ? volUnidad : null,
  };
}

/** Infiere el nombre del principio: usa la columna si vino, si no lo saca del
 *  nombre quitando la dosis y la forma (heurística simple). */
export function inferirPrincipio(nombre: string, principioColumna: string | null): string | null {
  const desdeColumna = (principioColumna ?? '').trim();
  if (desdeColumna) return desdeColumna.replace(/\s+/g, ' ');
  const limpio = (nombre ?? '')
    .replace(RE, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/\b(tab|tabletas?|caps?|c[aá]psulas?|jarabe|susp|suspensi[oó]n|amp|ampolla|crema|ung[uü]ento|gotas?|sol|soluci[oó]n)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio.length >= 2 ? limpio : null;
}
