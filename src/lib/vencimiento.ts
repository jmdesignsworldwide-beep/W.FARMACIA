import type { Tone } from '@/lib/tokens';
import { daysUntil } from '@/lib/format';

/**
 * Semáforo de vencimiento — CONSISTENTE EN TODO EL SISTEMA (ADN, exigencias
 * visuales de la Tanda 3): verde >180 días · ámbar 90–180 · naranja 30–90 ·
 * rojo <30 · gris vencido. Vive aquí para que el maestro de productos, el POS y
 * el conteo cíclico usen exactamente los mismos cortes y colores.
 *
 * Nota: el "naranja" no es un tono semántico propio del sistema (los tonos son
 * success/warning/danger/accent/info). Se mapea el tramo 30–90 a `warning` con
 * una etiqueta propia; el color exacto lo da el tono, no un hex improvisado.
 */
export type NivelVencimiento = 'sano' | 'vigilar' | 'proximo' | 'critico' | 'vencido' | 'sin_fecha';

export interface Vencimiento {
  nivel: NivelVencimiento;
  tone: Tone;
  etiqueta: string;
  dias: number | null;
}

export function vencimientoDeDias(dias: number | null): Vencimiento {
  if (dias === null) return { nivel: 'sin_fecha', tone: 'accent', etiqueta: 'Sin fecha', dias: null };
  if (dias < 0) return { nivel: 'vencido', tone: 'danger', etiqueta: 'Vencido', dias };
  if (dias < 30) return { nivel: 'critico', tone: 'danger', etiqueta: `Vence en ${dias} d`, dias };
  if (dias < 90) return { nivel: 'proximo', tone: 'warning', etiqueta: `Vence en ${dias} d`, dias };
  if (dias <= 180) return { nivel: 'vigilar', tone: 'warning', etiqueta: `${dias} d`, dias };
  return { nivel: 'sano', tone: 'success', etiqueta: `${dias} d`, dias };
}

/** A partir de una fecha ISO (o null). El "más próximo" ya viene calculado aguas arriba. */
export function vencimientoDeFecha(fechaIso: string | null): Vencimiento {
  if (!fechaIso) return vencimientoDeDias(null);
  return vencimientoDeDias(daysUntil(fechaIso));
}
