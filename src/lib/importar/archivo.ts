import { leerXlsx, type Celda } from './xlsx';
import { parseCsv } from './csv';

export interface ArchivoParseado {
  filas: Celda[][];
  tipo: 'xlsx' | 'csv';
  detalle: string;
}

/** Detecta xlsx (por extensión o firma ZIP `PK`) o CSV, y devuelve las filas crudas. */
export function parseArchivo(nombre: string, datos: Buffer): ArchivoParseado {
  const esXlsx = /\.xlsx$/i.test(nombre) || (datos.length > 1 && datos[0] === 0x50 && datos[1] === 0x4b);
  if (esXlsx) {
    return { filas: leerXlsx(datos), tipo: 'xlsx', detalle: 'Excel (.xlsx)' };
  }
  const { filas, separador } = parseCsv(datos.toString('utf8'));
  return { filas, tipo: 'csv', detalle: `CSV (separador detectado: ${separador})` };
}
