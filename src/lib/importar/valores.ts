/**
 * Parsers dominicanos de número y fecha para el importador. Aislados y sin
 * dependencias: los usa el navegador (preview) y el servidor (autoridad).
 */

export interface NumeroParseado {
  valor: number | null;
  ambiguo: boolean; // un solo separador de 3 dígitos: 1.250 podría ser 1250 o 1.25
}

/**
 * Entiende `1,250.50` y `1.250,50` como lo mismo, quita `RD$` y espacios.
 * Regla: si hay AMBOS separadores, el más a la derecha es el decimal. Si hay uno
 * solo con 3 dígitos detrás (1.250 / 1,250), es ambiguo → default miles + aviso.
 */
export function parseNumeroDominicano(raw: unknown): NumeroParseado {
  if (typeof raw === 'number') return { valor: raw, ambiguo: false };
  const s0 = String(raw ?? '').trim();
  if (!s0) return { valor: null, ambiguo: false };
  const neg = /^\(|-/.test(s0);
  const s = s0.replace(/[^\d.,]/g, '');
  if (!s) return { valor: null, ambiguo: false };
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  let valor: number;
  let ambiguo = false;
  if (dot >= 0 && comma >= 0) {
    const decSep = dot > comma ? '.' : ',';
    const miles = decSep === '.' ? ',' : '.';
    valor = Number(s.split(miles).join('').replace(decSep, '.'));
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? '.' : ',';
    const grupos = s.split(sep);
    const ultimo = grupos[grupos.length - 1];
    if (grupos.length > 2) {
      valor = Number(grupos.join('')); // 1.250.000 → miles repetidos
    } else if (ultimo.length === 3) {
      ambiguo = true; // 1.250 / 1,250 → default miles
      valor = Number(grupos.join(''));
    } else {
      valor = Number(s.replace(sep, '.')); // 1,5 · 12,75 · 95.00 → decimal
    }
  } else {
    valor = Number(s);
  }
  if (!Number.isFinite(valor)) return { valor: null, ambiguo: false };
  return { valor: neg ? -Math.abs(valor) : valor, ambiguo };
}

/** ¿El archivo mezcla convenciones (algún valor coma-decimal y otro punto-decimal)? */
export function conveccionAmbigua(crudos: unknown[]): boolean {
  let comaDecimal = false;
  let puntoDecimal = false;
  for (const c of crudos) {
    const s = String(c ?? '');
    const dot = s.lastIndexOf('.');
    const comma = s.lastIndexOf(',');
    if (dot >= 0 && comma >= 0) {
      if (dot > comma) puntoDecimal = true;
      else comaDecimal = true;
    }
  }
  return comaDecimal && puntoDecimal;
}

export type FormatoFecha = 'dmy' | 'mdy';

export interface FechaParseada {
  fecha: Date | null;
  iso: string | null; // AAAA-MM-DD
  ambiguo: boolean; // ambos grupos ≤ 12: no se sabe si DD/MM o MM/DD
}

/**
 * Fecha DD/MM/AAAA (default dominicano), con guiones o puntos, año de 2 o 4
 * dígitos, y `Date` directa (viene del serial de Excel). Si ambos grupos son
 * ≤ 12, es ambigua: usa `formato` (que la UI decide UNA vez para todo el archivo).
 */
export function parseFechaDominicana(raw: unknown, formato: FormatoFecha = 'dmy'): FechaParseada {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { fecha: raw, iso: raw.toISOString().slice(0, 10), ambiguo: false };
  }
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!m) return { fecha: null, iso: null, ambiguo: false };
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  let dia: number;
  let mes: number;
  let anio: number;
  let ambiguo = false;
  if (m[1].length === 4) {
    anio = a; mes = b; dia = c; // AAAA/MM/DD
  } else {
    anio = c < 100 ? 2000 + c : c;
    if (a > 12) { dia = a; mes = b; }
    else if (b > 12) { mes = a; dia = b; }
    else {
      ambiguo = true;
      if (formato === 'mdy') { mes = a; dia = b; } else { dia = a; mes = b; }
    }
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return { fecha: null, iso: null, ambiguo: false };
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return { fecha: d, iso: d.toISOString().slice(0, 10), ambiguo };
}
