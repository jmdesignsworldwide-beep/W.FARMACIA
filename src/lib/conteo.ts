/**
 * Conteo cíclico y calibración de confianza (Adenda II §3 · §Innovación 5).
 *
 * Piezas compartidas entre el servidor y el cliente. La lógica que toca los
 * libros (movimiento `conteo`, discrepancia) vive en el server action; aquí
 * solo constantes, tipos y helpers puros.
 */

/**
 * Umbral en RD$ por encima del cual una corrección de conteo deja de ser "un
 * clic": exige **motivo** y autorización de **Dueño/Administrador** (condición
 * de Marien — que un empleado no borre una fortuna de inventario con un clic).
 * Es un solo número, fácil de ajustar.
 */
export const UMBRAL_DISCREPANCIA_RD = 5000;

/** Cuántos productos entran en la lista diaria (5 minutos, no un inventario general). */
export const TAMANO_LISTA_DIARIA = 15;

/** Días sin verificar tras los cuales un producto vuelve a ser candidato. */
export const DIAS_REVERIFICAR = 30;

export type EstadoVerificacion = 'verificado' | 'estimado' | 'discrepancia';

/** Un movimiento reciente, lo mínimo para proponer una causa. */
export interface MovimientoReciente {
  tipo: string; // tipo_movimiento
  cantidad: number;
  motivo_tipificado: string | null;
  ocurrido_en: string;
}

const ETIQUETA_MERMA: Record<string, string> = {
  rotura: 'rotura',
  vencido: 'vencimiento',
  robo: 'robo',
  muestra_medica: 'muestra médica',
  error_despacho: 'error de despacho',
  devolucion_cliente: 'devolución de cliente',
};

/**
 * Propone una causa probable de la diferencia revisando los movimientos
 * recientes (§Innovación 5). Es una PROPUESTA: la confirma el humano. Nunca
 * afirma, solo orienta — y si no hay señal, lo dice en vez de inventar una.
 *
 * @param movimientos recientes del producto/lote (más nuevos primero)
 * @param diferencia  contada − sistema (negativa = falta; positiva = sobra)
 */
export function proponerCausa(movimientos: MovimientoReciente[], diferencia: number): string {
  if (diferencia === 0) return 'Sin diferencia.';
  const falta = diferencia < 0;

  if (falta) {
    const merma = movimientos.find((m) => m.tipo === 'merma');
    if (merma) {
      const et = merma.motivo_tipificado ? ETIQUETA_MERMA[merma.motivo_tipificado] ?? merma.motivo_tipificado : 'merma';
      return `Posible ${et}: hay una merma reciente registrada. Revisar si cubre la diferencia.`;
    }
    const despacho = movimientos.find((m) => m.tipo === 'error_despacho' || (m.tipo === 'venta' && m.cantidad < 0));
    if (despacho) return 'Posible salida no cuadrada (venta o despacho reciente). Revisar los movimientos del día.';
    return 'Falta existencia sin movimiento que lo explique: posible salida no registrada (merma o despacho sin anotar). Revisar.';
  }

  // sobra
  const devol = movimientos.find((m) => m.tipo === 'devolucion');
  if (devol) return 'Posible devolución reciente aún no reflejada en la existencia. Revisar.';
  const entrada = movimientos.find((m) => m.tipo === 'entrada');
  if (entrada) return 'Posible entrada reciente contada de más o duplicada. Revisar la última recepción.';
  return 'Sobra existencia sin movimiento que lo explique: posible entrada no registrada o error de conteo previo. Revisar.';
}

/** Etiqueta y tono de un estado de verificación, para la UI. */
export function tonoVerificacion(estado: EstadoVerificacion): { etiqueta: string; tono: 'ok' | 'aviso' | 'alerta' } {
  if (estado === 'verificado') return { etiqueta: 'Verificado', tono: 'ok' };
  if (estado === 'discrepancia') return { etiqueta: 'Discrepancia', tono: 'alerta' };
  return { etiqueta: 'Estimado (aprox.)', tono: 'aviso' };
}
