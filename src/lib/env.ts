import { z } from 'zod';

/**
 * ADN JM NEXUS — VALIDACIÓN DE ENTORNO
 * ─────────────────────────────────────────────────────────────
 * Museo de Errores #4: "El código verifica la presencia [de las
 *   variables] al arrancar y falla ruidosamente."
 * Museo de Errores #6: "Validar formato de toda llave al montarla;
 *   nunca asumir que 'se ve bien'." (carácter no-ASCII invisible)
 *
 * Todas las credenciales deben ser del MISMO proyecto Supabase, en
 * una sola sentada (Museo de Errores #5). El ref del proyecto se
 * extrae de la URL y se compara para detectar mezclas.
 */

/** Detecta caracteres no-ASCII invisibles pegados por error en una llave. */
const asciiOnly = (label: string) =>
  z.string().refine((v) => /^[\x20-\x7E]+$/.test(v), {
    message: `${label} contiene caracteres no-ASCII invisibles. Vuelve a copiar la llave desde el dashboard de Supabase (Museo de Errores #6).`,
  });

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida (https://<ref>.supabase.co)')
    .refine((v) => /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(v), {
      message: 'NEXT_PUBLIC_SUPABASE_URL no tiene el formato esperado https://<ref>.supabase.co',
    }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: asciiOnly('NEXT_PUBLIC_SUPABASE_ANON_KEY').and(
    z.string().min(30, 'NEXT_PUBLIC_SUPABASE_ANON_KEY parece demasiado corta'),
  ),
  SUPABASE_SERVICE_ROLE_KEY: asciiOnly('SUPABASE_SERVICE_ROLE_KEY')
    .and(z.string().min(30, 'SUPABASE_SERVICE_ROLE_KEY parece demasiado corta'))
    .optional(),
});

const clientSchema = serverSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

function extractProjectRef(url: string): string | null {
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/);
  return m ? m[1] : null;
}

function fail(errors: string[]): never {
  const banner =
    '\n\n════════════════════════════════════════════════════════════\n' +
    '  ⛔ W.FARMACIA — CONFIGURACIÓN DE ENTORNO INVÁLIDA\n' +
    '════════════════════════════════════════════════════════════\n' +
    errors.map((e) => `  • ${e}`).join('\n') +
    '\n\n  Revisa las variables en el entorno remoto / .env.local.\n' +
    '  Todas deben ser del MISMO proyecto de Supabase (regla #5).\n' +
    '════════════════════════════════════════════════════════════\n';
  // Falla ruidosamente — el arranque se detiene aquí, no en una pantalla en blanco.
  throw new Error(banner);
}

/** Entorno validado para el SERVIDOR (incluye la service-role key opcional). */
export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  return parsed.data;
}

/** Entorno validado para el CLIENTE (solo variables públicas). */
export function getClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  return parsed.data;
}

/** Ref del proyecto Supabase (para prueba de identidad, regla #5). */
export function getProjectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? extractProjectRef(url) : null;
}
