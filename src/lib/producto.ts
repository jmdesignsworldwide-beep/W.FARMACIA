import type { UnidadConcentracion, UnidadVolumen } from '@/lib/supabase/types';

/**
 * Piezas compartidas del maestro de producto (Adenda III). Las unidades de
 * concentración y volumen son catálogos CERRADOS (enum en la base): aquí
 * viven sus opciones para los selects, en el mismo orden.
 */
export const UNIDADES_CONCENTRACION: UnidadConcentracion[] = [
  'mg',
  'g',
  'mcg',
  'UI',
  '%',
  'mEq',
  'mmol',
];
export const UNIDADES_VOLUMEN: UnidadVolumen[] = ['ml', 'g'];

/** Muestra la concentración como el farmacéutico la lee: "250 mg/5 ml", "500 mg". */
export function formatConcentracion(
  valor: number | string,
  unidad: string,
  volVal?: number | string | null,
  volUnidad?: string | null,
): string {
  const base = `${valor} ${unidad}`;
  return volVal && volUnidad ? `${base}/${volVal} ${volUnidad}` : base;
}

/** Un principio activo del producto, con su concentración descompuesta (§2). */
export interface PrincipioInput {
  principio_activo_id: string;
  concentracion_valor: number;
  concentracion_unidad: UnidadConcentracion;
  concentracion_volumen_valor: number | null;
  concentracion_volumen_unidad: UnidadVolumen | null;
}

/** Lo que el formulario envía al servidor para crear un producto. */
export interface ProductoPayload {
  nombre: string;
  forma_farmaceutica_id: string | null;
  via_administracion_id: string | null;
  // Laboratorio y presentación: texto libre del selector inteligente
  // (se busca-o-crea en el servidor). Forman la identidad de DUPLICADO.
  laboratorio: string | null;
  presentacion: string | null;
  principios: PrincipioInput[];
  // Empaque / precio
  unidad_base: string | null;
  unidad_caja: string | null;
  factor_caja: number | null;
  precio_venta: number | null;
  precio_caja: number | null;
  margen_objetivo: number | null;
  // Banderas
  es_controlado: boolean;
  requiere_receta: boolean;
  exento_itbis: boolean;
  codigo_barras: string | null;
  /** El usuario confirmó crear aunque ya exista un producto DUPLICADO
   *  (misma firma clínica + mismo laboratorio + misma presentación). */
  confirmarDuplicado?: boolean;
}
