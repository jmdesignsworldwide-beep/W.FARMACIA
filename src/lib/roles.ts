/**
 * ADN JM NEXUS — ROLES
 * ─────────────────────────────────────────────────────────────
 * §2.7 + Arquitectura Maestra §1: CINCO roles. Cada uno se valida en
 * el SERVIDOR, en cada acción y en cada ruta. Esconder un botón no es
 * seguridad — la autorización real ocurre en:
 *   1. RLS en la base de datos (políticas por rol).
 *   2. requireRole()/requireCapability() en Server Components/Actions.
 *
 * Tabla de roles (Arquitectura Maestra §1):
 *   • Dueño         — todo, incluido el panel financiero completo.
 *   • Administrador — todo lo operativo + reportes + gestión de usuarios.
 *                     NO altera el historial inviolable (bloqueado en la base
 *                     para todos) y NO ve ni modifica la cuenta del dueño (RLS).
 *   • Farmacéutico  — despacho, recetas, controlados, inventario, clientes,
 *                     vencimientos. NO ve ingresos, márgenes ni finanzas.
 *   • Cajero        — POS, caja del turno, consulta de inventario y clientes.
 *                     NO ve costos, márgenes ni panel financiero.
 *   • Motorista     — SOLO sus órdenes de delivery y el cobro en destino.
 *                     Vista herméticamente cerrada.
 */

export const ROLES = [
  'dueno',
  'administrador',
  'farmaceutico',
  'cajero',
  'motorista',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  dueno: 'Dueño',
  administrador: 'Administrador',
  farmaceutico: 'Farmacéutico',
  cajero: 'Cajero',
  motorista: 'Motorista',
};

/** Capacidades del sistema. Se validan en servidor por acción. */
export const CAPABILITIES = [
  'ver_finanzas', // ingresos, márgenes, costos, reportes financieros
  'ver_operacion', // caja, inventario, ventas del día, clientes
  'gestionar_inventario',
  'gestionar_catalogos', // catálogos críticos (principio activo, forma, vía) — Adenda III §4: solo Dueño/Admin
  'gestionar_proveedores',
  'gestionar_empleados',
  'despachar_controlados',
  'configurar_sistema',
  'anular_ventas',
  'operar_delivery', // órdenes de delivery y cobro en destino
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Matriz rol → capacidades.
 *
 * Dueño y Administrador comparten las capacidades de la aplicación; lo que
 * los separa es estructural y vive fuera de esta matriz: el historial es
 * inviolable para todos (trigger en la base, §2.2) y el Administrador no
 * puede ver ni modificar la fila del Dueño (política RLS en profiles).
 *
 * El Cajero ve lo operativo pero NO finanzas — barrera de servidor, no
 * ocultar el enlace (§2.7). El Motorista es hermético: solo delivery.
 */
const MATRIX: Record<Role, Capability[]> = {
  dueno: [...CAPABILITIES],
  administrador: [...CAPABILITIES],
  farmaceutico: ['ver_operacion', 'gestionar_inventario', 'despachar_controlados'],
  cajero: ['ver_operacion'],
  motorista: ['operar_delivery'],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** El rol con vista herméticamente cerrada (solo su módulo). */
export function esHermetico(role: Role): boolean {
  return role === 'motorista';
}
