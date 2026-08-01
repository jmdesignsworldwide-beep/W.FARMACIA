import type { Celda } from './xlsx';
import { CAMPOS, normalizarEncabezado, puntajeEncabezado, sugerirMapeo } from './mapeo';
import { parseFechaDominicana, parseNumeroDominicano, type FormatoFecha } from './valores';

export type EstadoFila = 'ok' | 'aviso' | 'error' | 'basura';

export interface ProductoImp {
  nombre: string;
  principio: string | null;
  precio: number | null;
  laboratorio: string | null;
  codigo_barras: string | null;
  registro_sanitario: string | null;
}
export interface LoteImp {
  cantidad: number | null;
  vencimiento: string | null; // ISO
  costo: number | null;
  numero_lote: string | null;
}
export interface FilaProcesada {
  fila: number; // 1-based en el archivo
  estado: EstadoFila;
  mensajes: string[];
  producto: ProductoImp | null;
  lote: LoteImp | null;
}
export interface ResultadoImport {
  indiceEncabezado: number;
  headers: string[];
  mapeo: Array<string | ''>;
  filas: FilaProcesada[];
  resumen: { total: number; ok: number; aviso: number; error: number; basura: number; productos: number; lotes: number };
  ambiguedad: { numero: boolean; fecha: boolean };
}

const texto = (c: Celda): string => (c == null ? '' : String(c)).trim();

/** La fila-encabezado es la de mayor puntaje de mapeo en las primeras 15. */
export function detectarEncabezado(filas: Celda[][]): number {
  let mejor = -1;
  let mejorPuntaje = 1; // exige al menos 2 columnas reconocidas
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const p = puntajeEncabezado(filas[i]);
    if (p > mejorPuntaje) { mejorPuntaje = p; mejor = i; }
  }
  return mejor;
}

function esBasura(fila: Celda[], headerNorm: string[]): string | null {
  const celdas = fila.map(texto);
  if (celdas.every((c) => c === '')) return 'fila vacía';
  const noVacias = celdas.filter((c) => c !== '');
  const primera = normalizarEncabezado(celdas[0] ?? '');
  if (/^(sub)?total/.test(primera) && noVacias.length <= 3) return 'fila de totales';
  // encabezado repetido: coincide en ≥2 columnas con el encabezado normalizado
  const coincidencias = celdas.filter((c, i) => c && normalizarEncabezado(c) === headerNorm[i]).length;
  if (coincidencias >= 2) return 'encabezado repetido';
  return null;
}

export interface OpcionesProcesar {
  mapeo?: Array<string | ''>;
  indiceEncabezado?: number;
  formatoFecha?: FormatoFecha;
}

export function procesar(filas: Celda[][], opciones: OpcionesProcesar = {}): ResultadoImport {
  const indiceEncabezado = opciones.indiceEncabezado ?? detectarEncabezado(filas);
  const headerFila = indiceEncabezado >= 0 ? filas[indiceEncabezado] : [];
  const headers = headerFila.map(texto);
  const headerNorm = headers.map(normalizarEncabezado);
  const mapeo = opciones.mapeo ?? sugerirMapeo(headerFila);
  const formatoFecha = opciones.formatoFecha ?? 'dmy';
  const col = (key: string) => mapeo.indexOf(key);

  const out: FilaProcesada[] = [];
  const ambig = { numero: false, fecha: false };
  const desde = indiceEncabezado >= 0 ? indiceEncabezado + 1 : 0;

  for (let i = desde; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;
    const basura = esBasura(fila, headerNorm);
    if (basura) {
      out.push({ fila: numeroFila, estado: 'basura', mensajes: [basura], producto: null, lote: null });
      continue;
    }
    const val = (key: string): Celda => { const c = col(key); return c >= 0 ? fila[c] ?? null : null; };
    const mensajes: string[] = [];

    const nombre = texto(val('nombre')).replace(/\s+/g, ' ');
    if (!nombre || nombre.length < 2) {
      out.push({ fila: numeroFila, estado: 'error', mensajes: ['Sin nombre de producto — no se puede crear'], producto: null, lote: null });
      continue;
    }

    const precioP = parseNumeroDominicano(val('precio'));
    if (precioP.ambiguo) { ambig.numero = true; mensajes.push('Precio con formato ambiguo (1.250 ¿son 1250 o 1.25?)'); }

    const producto: ProductoImp = {
      nombre,
      principio: texto(val('principio')).replace(/\s+/g, ' ') || null,
      precio: precioP.valor,
      laboratorio: texto(val('laboratorio')).replace(/\s+/g, ' ') || null,
      codigo_barras: texto(val('codigo_barras')) || null,
      registro_sanitario: texto(val('registro_sanitario')) || null,
    };

    // ¿Trae lote? (cantidad / vencimiento / costo / número de lote)
    const cantidadP = parseNumeroDominicano(val('cantidad'));
    if (cantidadP.ambiguo) { ambig.numero = true; mensajes.push('Cantidad con formato ambiguo'); }
    const costoP = parseNumeroDominicano(val('costo'));
    const fechaP = parseFechaDominicana(val('vencimiento'), formatoFecha);
    if (fechaP.ambiguo) { ambig.fecha = true; mensajes.push('Fecha ambigua (¿DD/MM o MM/DD?)'); }
    const numeroLote = texto(val('numero_lote')) || null;
    const traeLote =
      cantidadP.valor != null || costoP.valor != null || fechaP.iso != null || numeroLote != null;
    const lote: LoteImp | null = traeLote
      ? { cantidad: cantidadP.valor, vencimiento: fechaP.iso, costo: costoP.valor, numero_lote: numeroLote }
      : null;

    // Incompletos (Adenda II §1): entran igual, en ámbar.
    if (!producto.principio) mensajes.push('Sin principio activo');
    if (producto.precio == null) mensajes.push('Sin precio');
    if (lote && lote.vencimiento == null) mensajes.push('Lote sin vencimiento');
    if (lote && lote.costo == null) mensajes.push('Lote sin costo');
    if (!lote) mensajes.push('Solo catálogo (sin lote)');

    const estado: EstadoFila = mensajes.length === 0 ? 'ok' : 'aviso';
    out.push({ fila: numeroFila, estado, mensajes, producto, lote });
  }

  const resumen = {
    total: out.length,
    ok: out.filter((f) => f.estado === 'ok').length,
    aviso: out.filter((f) => f.estado === 'aviso').length,
    error: out.filter((f) => f.estado === 'error').length,
    basura: out.filter((f) => f.estado === 'basura').length,
    productos: out.filter((f) => f.producto).length,
    lotes: out.filter((f) => f.lote).length,
  };
  void CAMPOS; // referenciado para el tipado del mapeo aguas arriba
  return { indiceEncabezado, headers, mapeo, filas: out, resumen, ambiguedad: ambig };
}
