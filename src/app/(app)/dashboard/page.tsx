import { requireUser } from '@/lib/auth';
import { can } from '@/lib/roles';
import { DashboardClient } from './DashboardClient';

/**
 * Dashboard ordenado por URGENCIA, no por categoría (§1.6): el dueño abre
 * el sistema y ve lo que arde, no un menú. Los KPIs financieros solo se
 * calculan y envían si el rol tiene 'ver_finanzas' — la barrera es el
 * servidor, no ocultar el enlace (§2.7). El cajero nunca recibe ingresos.
 *
 * El sistema arranca vacío: cifras reales en cero y estados vacíos premium
 * (§1.4) — nada simulado, cero datos ficticios (§5.3 #3).
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const verFinanzas = can(user.role, 'ver_finanzas');

  // Plomería real: cuando existan las tablas de ventas/lotes, estas cifras
  // se leerán de Supabase aquí. Por ahora, ceros honestos (sistema vacío).
  const kpis = {
    ventasHoy: 0,
    ticketsHoy: 0,
    margenHoy: 0,
    capitalDormido: 0,
  };

  return (
    <DashboardClient
      nombre={user.nombre}
      verFinanzas={verFinanzas}
      kpis={kpis}
    />
  );
}
