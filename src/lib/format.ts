import { BRAND } from '@/lib/tokens';

/**
 * ADN JM NEXUS — FORMATO DOMINICANO
 * ─────────────────────────────────────────────────────────────
 * §2.6: RD$, ITBIS 18% con distinción de exentos, fechas DD/MM/AAAA,
 * redondeo consistente al peso en TODOS los módulos (si el POS
 * redondea distinto al panel financiero, el cliente pierde la
 * confianza en el sistema completo — Marjos).
 *
 * Toda cifra de dinero se guarda como NUMERIC(14,2) en la base y se
 * maneja aquí en centavos-seguros para no arrastrar errores de float.
 */

/** Redondeo consistente al peso (2 decimales) — el ÚNICO redondeo del sistema. */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const pesoFormatter = new Intl.NumberFormat(BRAND.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** RD$ 1,234.56 — siempre con símbolo y dos decimales, tabular. */
export function formatMoney(n: number | null | undefined): string {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return `${BRAND.currencySymbol} ${pesoFormatter.format(roundMoney(value))}`;
}

/** 1,234.56 sin símbolo — para columnas donde el símbolo va aparte. */
export function formatNumber(n: number | null | undefined, decimals = 0): string {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat(BRAND.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * ITBIS 18%. `base` es el monto gravable. Devuelve base, impuesto y total.
 * Los productos exentos pasan `exento: true` y no acumulan impuesto (§2.6).
 */
export function itbis(base: number, exento = false) {
  const gravable = roundMoney(base);
  const impuesto = exento ? 0 : roundMoney(gravable * BRAND.itbisRate);
  return {
    base: gravable,
    impuesto,
    total: roundMoney(gravable + impuesto),
    tasa: exento ? 0 : BRAND.itbisRate,
  };
}

/** Fecha DD/MM/AAAA (§2.6). Acepta Date o ISO string. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Días entre hoy y una fecha (negativo = ya pasó). Para el radar de vencimientos. */
export function daysUntil(d: Date | string, today = new Date()): number {
  const date = typeof d === 'string' ? new Date(d) : d;
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86_400_000);
}

/**
 * Validación de cédula dominicana (11 dígitos, algoritmo de Luhn módulo 10).
 * §2.6: cédula/RNC validados.
 */
export function isValidCedula(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let prod = Number(digits[i]) * weights[i];
    if (prod > 9) prod -= 9;
    sum += prod;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[10]);
}

/** RNC dominicano: 9 dígitos (empresas). Validación de longitud/estructura. */
export function isValidRnc(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 9 || digits.length === 11; // RNC 9 · cédula-RNC 11
}

/** Formatea cédula 000-0000000-0. */
export function formatCedula(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
}
