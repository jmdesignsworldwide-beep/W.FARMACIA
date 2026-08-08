import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { CambiarClaveForm } from './CambiarClaveForm';

export const dynamic = 'force-dynamic';

export default async function CambiarClavePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  // Si ya no debe cambiarla, no tiene nada que hacer aquí.
  if (!user.debeCambiarPassword) redirect('/dashboard');
  return <CambiarClaveForm nombre={user.nombre} />;
}
