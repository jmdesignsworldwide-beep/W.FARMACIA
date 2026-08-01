/** Campos destino del importador y el mapeo adaptativo desde los encabezados. */

export interface Campo {
  key: string;
  label: string;
  entidad: 'producto' | 'lote';
  sinonimos: string[];
}

export const CAMPOS: Campo[] = [
  { key: 'nombre', label: 'Nombre', entidad: 'producto', sinonimos: ['nombre', 'descripcion', 'producto', 'articulo', 'item', 'detalle'] },
  { key: 'principio', label: 'Principio activo', entidad: 'producto', sinonimos: ['principio', 'activo', 'molecula', 'generico', 'sustancia', 'principio activo'] },
  { key: 'precio', label: 'Precio de venta', entidad: 'producto', sinonimos: ['precio', 'p venta', 'pventa', 'venta', 'pvp', 'precio venta'] },
  { key: 'laboratorio', label: 'Laboratorio', entidad: 'producto', sinonimos: ['laboratorio', 'lab', 'marca', 'fabricante'] },
  { key: 'codigo_barras', label: 'Código de barras', entidad: 'producto', sinonimos: ['codigo', 'barras', 'ean', 'upc', 'sku', 'codigo barras', 'codigo de barras'] },
  { key: 'registro_sanitario', label: 'Registro sanitario', entidad: 'producto', sinonimos: ['registro', 'sanitario', 'registro sanitario', 'digemaps'] },
  { key: 'cantidad', label: 'Cantidad', entidad: 'lote', sinonimos: ['cantidad', 'cant', 'existencia', 'stock', 'unidades', 'qty', 'exist'] },
  { key: 'vencimiento', label: 'Vencimiento', entidad: 'lote', sinonimos: ['vence', 'vencimiento', 'caducidad', 'expira', 'exp', 'f vencimiento', 'fecha vencimiento'] },
  { key: 'costo', label: 'Costo', entidad: 'lote', sinonimos: ['costo', 'p compra', 'pcompra', 'compra', 'costo unitario'] },
  { key: 'numero_lote', label: 'Número de lote', entidad: 'lote', sinonimos: ['lote', 'numero lote', 'n lote', 'batch', 'no lote'] },
];

export function normalizarEncabezado(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Propone campo por columna leyendo los encabezados. Cada campo se usa una vez. */
export function sugerirMapeo(headers: unknown[]): Array<string | ''> {
  const usados = new Set<string>();
  return headers.map((h) => {
    const hn = normalizarEncabezado(String(h ?? ''));
    if (!hn) return '';
    for (const c of CAMPOS) {
      if (usados.has(c.key)) continue;
      if (c.sinonimos.some((sn) => hn === sn || hn.includes(sn))) {
        usados.add(c.key);
        return c.key;
      }
    }
    return '';
  });
}

/** Cuántas columnas de una fila-encabezado candidata mapean a un campo conocido. */
export function puntajeEncabezado(fila: unknown[]): number {
  return sugerirMapeo(fila).filter(Boolean).length;
}
