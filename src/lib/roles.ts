/**
 * ADN JM NEXUS — ROLES
 * ─────────────────────────────────────────────────────────────
 * §2.7: "Esconder un botón no es seguridad." Cada rol se valida en
 * el SERVIDOR, en cada acción y en cada ruta. Estas definiciones son
 * la fuente de verdad compartida entre el cliente (para ocultar UI,
 * como cortesía) y el servidor (para autorizar de verdad).
 *
 * La autorización real ocurre en:
 *   1. RLS en la base de datos (políticas por rol).
 *   2. requireRole() en Server Components / Actions / Route Handlers.
 * La UI solo esconde; nunca es la barrera.
 */

export const ROLES = ['dueno', 'gerente', 'farmaceutico', 'cajero'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  dueno: 'Dueño',
  gerente: 'Gerente',
  farmaceutico: 'Farmacéutico',
  cajero: 'Cajero',
};

/** Capacidades del sistema. Se validan en servidor por acción. */
export const CAPABILITIES = [
  'ver_finanzas', // ingresos, márgenes, reportes financieros
  'ver_operacion', // caja, inventario, ventas del día
  'gestionar_inventario',
  'gestionar_proveedores',
  'gestionar_empleados',
  'despachar_controlados',
  'configurar_sistema',
  'anular_ventas',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Matriz rol → capacidades. El cajero ve lo operativo pero NO ve
 * ingresos ni reportes financieros — y eso se valida en el servidor,
 * no ocultando el enlace (§2.7).
 */
const MATRIX: Record<Role, Capability[]> = {
  dueno: [...CAPABILITIES],
  gerente: [
    'ver_finanzas',
    'ver_operacion',
    'gestionar_inventario',
    'gestionar_proveedores',
    'gestionar_empleados',
    'despachar_controlados',
    'anular_ventas',
  ],
  farmaceutico: [
    'ver_operacion',
    'gestionar_inventario',
    'gestionar_proveedores',
    'despachar_controlados',
  ],
  cajero: ['ver_operacion'],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
