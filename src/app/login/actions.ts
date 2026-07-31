'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prewarmEquivalencia } from '@/lib/prewarm';

export interface LoginState {
  error?: string;
}

/**
 * Server Action de inicio de sesión. La validación de credenciales ocurre
 * en el servidor contra Supabase; el cliente nunca decide si entra o no
 * (§2.7). Errores explícitos, cero renderizado optimista (Museo #9).
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  if (!email || !password) {
    return { error: 'Escribe tu correo y tu contraseña.' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Correo o contraseña incorrectos.' };
  }

  // Calienta el camino del panel de equivalencia AQUÍ, donde el usuario ya
  // espera un instante tras "Entrar", para que su primer uso real esté tibio
  // (best-effort; nunca bloquea el login más allá de su tope interno).
  await prewarmEquivalencia(supabase);

  redirect(next.startsWith('/') ? next : '/dashboard');
}
