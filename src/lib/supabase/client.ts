'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getClientEnv } from '@/lib/env';
import type { Database } from '@/lib/supabase/types';

/**
 * Cliente de navegador. Usa la anon key (pública). La seguridad real
 * vive en RLS + validación de rol en servidor (§2.7), NUNCA en el
 * cliente. Esconder un botón no es seguridad.
 */
export function createClient() {
  const env = getClientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
