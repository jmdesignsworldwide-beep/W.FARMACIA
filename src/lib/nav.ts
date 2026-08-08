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
      { href: '/productos', label: 'Productos', icon: 'Package', cap: 'gestionar_inventario' },
      { href: '/importar', label: 'Importar', icon: 'Upload', cap: 'gestionar_inventario' },
      { href: '/conteo', label: 'Conteo cíclico', icon: 'ClipboardCheck', cap: 'gestionar_inventario' },
      { href: '/caja', label: 'Caja', icon: 'ScanLine', cap: 'ver_operacion' },
      { href: '/caja-diaria', label: 'Caja diaria', icon: 'PiggyBank', cap: 'ver_operacion' },
      { href: '/cronicos', label: 'Crónicos', icon: 'CalendarClock', cap: 'ver_operacion' },
      { href: '/servicios', label: 'Servicios', icon: 'HeartPulse', cap: 'ver_operacion' },
      { href: '/inventario', label: 'Inventario', icon: 'Package', cap: 'gestionar_inventario', proximamente: true },
      { href: '/vencimientos', label: 'Vencimientos', icon: 'CalendarClock', cap: 'ver_operacion' },
      { href: '/cadena-frio', label: 'Cadena de frío', icon: 'Snowflake', cap: 'ver_operacion' },
    ],
  },
  {
    titulo: 'Farmacia',
    items: [
      { href: '/catalogos', label: 'Catálogos', icon: 'Library', cap: 'gestionar_catalogos' },
      { href: '/despacho', label: 'Despacho', icon: 'Pill', cap: 'ver_operacion', proximamente: true },
      { href: '/controlados', label: 'Controlados', icon: 'ShieldCheck', cap: 'despachar_controlados' },
      { href: '/digemaps', label: 'Carpeta DIGEMAPS', icon: 'FolderOpen', cap: 'despachar_controlados' },
      { href: '/proveedores', label: 'Proveedores', icon: 'Truck', cap: 'gestionar_proveedores' },
      { href: '/recepcion', label: 'Recepción', icon: 'PackagePlus', cap: 'gestionar_inventario' },
      { href: '/prestamos', label: 'Préstamos', icon: 'Handshake', cap: 'gestionar_inventario' },
      { href: '/visitadores', label: 'Visitadores', icon: 'Briefcase', cap: 'gestionar_inventario' },
      { href: '/compras', label: 'Compras', icon: 'ShoppingCart', cap: 'gestionar_inventario', proximamente: true },
      { href: '/encargos', label: 'Encargos', icon: 'ClipboardList', cap: 'ver_operacion' },
      { href: '/delivery', label: 'Delivery', icon: 'Bike', cap: 'operar_delivery' },
    ],
  },
  {
    titulo: 'Negocio',
    items: [
      { href: '/finanzas', label: 'Finanzas', icon: 'TrendingUp', cap: 'ver_finanzas' },
      { href: '/fiado', label: 'Fiado (por cobrar)', icon: 'HandCoins', cap: 'ver_operacion' },
      { href: '/por-pagar', label: 'Por pagar', icon: 'Receipt', cap: 'ver_finanzas' },
      { href: '/reportes', label: 'Reportes', icon: 'BarChart3', cap: 'ver_finanzas' },
      { href: '/insights', label: 'Insights', icon: 'Sparkles', cap: 'ver_finanzas', proximamente: true },
      { href: '/empleados', label: 'Empleados', icon: 'Users', cap: 'gestionar_empleados' },
      { href: '/fiscal', label: 'Fiscal (NCF)', icon: 'FileText', cap: 'configurar_sistema' },
      { href: '/ajustes', label: 'Ajustes', icon: 'Settings', cap: 'configurar_sistema', proximamente: true },
    ],
  },
];
