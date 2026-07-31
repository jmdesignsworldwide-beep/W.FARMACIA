import type { Capability } from '@/lib/roles';

/**
 * Definición única de navegación (§2.1: cada cosa vive en un solo lugar).
 * Cada ítem declara la capacidad que exige; la barra lateral filtra por
 * el rol del usuario COMO CORTESÍA — la autorización real ocurre en cada
 * ruta en el servidor (§2.7).
 *
 * Los módulos marcados `proximamente` son el mapa de las próximas tandas
 * y se muestran atenuados: el dueño ve hacia dónde va su sistema.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: string; // nombre de ícono lucide (se resuelve en el componente)
  cap?: Capability;
  proximamente?: boolean;
}

export interface NavGroup {
  titulo: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    titulo: 'Operación',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
      { href: '/caja', label: 'Caja', icon: 'ScanLine', cap: 'ver_operacion', proximamente: true },
      { href: '/inventario', label: 'Inventario', icon: 'Package', cap: 'gestionar_inventario', proximamente: true },
      { href: '/vencimientos', label: 'Vencimientos', icon: 'CalendarClock', cap: 'ver_operacion', proximamente: true },
    ],
  },
  {
    titulo: 'Farmacia',
    items: [
      { href: '/despacho', label: 'Despacho', icon: 'Pill', cap: 'ver_operacion', proximamente: true },
      { href: '/controlados', label: 'Controlados', icon: 'ShieldCheck', cap: 'despachar_controlados', proximamente: true },
      { href: '/proveedores', label: 'Proveedores', icon: 'Truck', cap: 'gestionar_proveedores', proximamente: true },
      { href: '/compras', label: 'Compras', icon: 'ShoppingCart', cap: 'gestionar_inventario', proximamente: true },
    ],
  },
  {
    titulo: 'Negocio',
    items: [
      { href: '/finanzas', label: 'Finanzas', icon: 'TrendingUp', cap: 'ver_finanzas', proximamente: true },
      { href: '/insights', label: 'Insights', icon: 'Sparkles', cap: 'ver_finanzas', proximamente: true },
      { href: '/empleados', label: 'Empleados', icon: 'Users', cap: 'gestionar_empleados', proximamente: true },
      { href: '/ajustes', label: 'Ajustes', icon: 'Settings', cap: 'configurar_sistema', proximamente: true },
    ],
  },
];
