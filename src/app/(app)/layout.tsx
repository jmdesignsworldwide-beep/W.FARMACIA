import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/layout/Sidebar';
import { WelcomeCinematic } from '@/components/brand/WelcomeCinematic';

/**
 * Layout de la aplicación autenticada. requireUser() valida la sesión en
 * el servidor y redirige a /login si no hay (§2.7, bloqueo por URL directa).
 * Monta la bienvenida cinematográfica (una vez por sesión, a prueba de fallos).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <WelcomeCinematic nombre={user.nombre} />
      <Sidebar role={user.role} nombre={user.nombre} />
      <main className="min-w-0 flex-1 bg-canvas">{children}</main>
    </div>
  );
}
