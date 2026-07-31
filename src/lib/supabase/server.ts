import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getServerEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

/**
 * Cliente de servidor (Server Components, Route Handlers, Server Actions).
 * Lee la sesión desde cookies. Toda validación de rol y permiso ocurre
 * aquí, en el servidor, en cada acción y en cada ruta (§2.7).
 */
export function createClient() {
  const cookieStore = cookies();
  const env = getServerEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component sin respuesta mutable:
            // el refresco de sesión lo maneja el middleware. Seguro ignorar.
          }
        },
      },
    },
  );
}
