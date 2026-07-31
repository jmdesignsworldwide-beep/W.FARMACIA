import { redirect } from 'next/navigation';

/** La raíz siempre lleva al dashboard; el middleware desvía a /login si no hay sesión. */
export default function Home() {
  redirect('/dashboard');
}
