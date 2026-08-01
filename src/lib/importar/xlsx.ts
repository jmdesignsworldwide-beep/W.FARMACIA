import * as zlib from 'node:zlib';

/**
 * Lector de .xlsx SIN DEPENDENCIAS (server-side). Un .xlsx es un ZIP de XML
 * (OOXML). Se lee el directorio central del ZIP, se inflan las entradas con el
 * zlib nativo de Node, y se parsea la primera hoja + los strings compartidos +
 * los estilos (para distinguir fechas seriales de números).
 *
 * Por qué a mano: el CDN de SheetJS está bloqueado por la política de egress y
 * su versión del registro npm arrastra CVEs; ExcelJS suma un vuln transitivo.
 * Cero dependencias = Fort Knox limpio. Está aislado aquí: cambiar a SheetJS
 * (si se habilita su CDN) es reimplementar solo `leerXlsx`.
 */

export type Celda = string | number | Date | null;

// ── ZIP: extrae las entradas por el directorio central ──
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('xlsx: no es un ZIP válido (falta EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset del directorio central
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    try {
      out.set(name, method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp));
    } catch {
      /* entrada ilegible: se ignora */
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function desescapar(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (_m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
    }
    return ENTIDADES[e] ?? _m;
  });
}

// Concatena todos los <t> dentro de un fragmento (maneja rich text de sharedStrings).
function textoDe(fragmento: string): string {
  let t = '';
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragmento))) t += m[1];
  return desescapar(t);
}

function sharedStrings(files: Map<string, Buffer>): string[] {
  const xml = files.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(textoDe(m[1]));
  return out;
}

// numFmtId de cada estilo (cellXfs) → para saber si un número es fecha.
const NUMFMT_FECHA = new Set([14, 15, 16, 17, 22, 30, 34, 45, 46, 47, 165, 166, 167, 168, 169]);
function estilosFecha(files: Map<string, Buffer>): boolean[] {
  const xml = files.get('xl/styles.xml')?.toString('utf8');
  if (!xml) return [];
  // formatos personalizados con y/m/d (y sin símbolo de moneda) = fecha
  const custom = new Set<number>();
  const nf = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g;
  let f: RegExpExecArray | null;
  while ((f = nf.exec(xml))) {
    const id = Number(f[1]);
    const code = f[2].toLowerCase();
    if (/[dmy]/.test(code) && !/[$€]|"rd/.test(code)) custom.add(id);
  }
  const bloque = xml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? '';
  const out: boolean[] = [];
  const xf = /<xf[^>]*numFmtId="(\d+)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = xf.exec(bloque))) {
    const id = Number(m[1]);
    out.push(NUMFMT_FECHA.has(id) || custom.has(id));
  }
  return out;
}

function colIndex(ref: string): number {
  const letras = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n - 1;
}

// Serial de Excel → Date (base 1899-12-30, absorbe el bug del año bisiesto 1900).
function serialADate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
}

function primeraHoja(files: Map<string, Buffer>): string {
  // sheet1.xml es el estándar; si no, la primera worksheet que exista.
  if (files.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml';
  for (const k of files.keys()) if (/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) return k;
  throw new Error('xlsx: no se encontró ninguna hoja');
}

/** Lee la primera hoja de un .xlsx en filas de celdas (string | number | Date | null). */
export function leerXlsx(buf: Buffer): Celda[][] {
  const files = unzip(buf);
  const shared = sharedStrings(files);
  const esFecha = estilosFecha(files);
  const xml = files.get(primeraHoja(files))!.toString('utf8');

  const filas: Celda[][] = [];
  const reRow = /<row[^>]*>([\s\S]*?)<\/row>|<row[^>]*\/>/g;
  const reCell = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rowM: RegExpExecArray | null;
  while ((rowM = reRow.exec(xml))) {
    const contenido = rowM[1] ?? '';
    const celdas: Celda[] = [];
    let cellM: RegExpExecArray | null;
    reCell.lastIndex = 0;
    while ((cellM = reCell.exec(contenido))) {
      const attrs = cellM[1];
      const cuerpo = cellM[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /t="([^"]+)"/.exec(attrs)?.[1];
      const estilo = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const col = ref ? colIndex(ref) : celdas.length;
      let valor: Celda = null;
      if (tipo === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? '');
        valor = shared[idx] ?? null;
      } else if (tipo === 'inlineStr') {
        valor = textoDe(cuerpo) || null;
      } else if (tipo === 'str') {
        valor = desescapar(/<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1] ?? '') || null;
      } else if (tipo === 'b') {
        valor = /<v>\s*1\s*<\/v>/.test(cuerpo) ? 'VERDADERO' : 'FALSO';
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
        if (raw != null && raw !== '') {
          const num = Number(raw);
          valor = esFecha[estilo] && Number.isFinite(num) ? serialADate(num) : num;
        }
      }
      while (celdas.length < col) celdas.push(null);
      celdas[col] = valor;
    }
    filas.push(celdas);
  }
  return filas;
}
