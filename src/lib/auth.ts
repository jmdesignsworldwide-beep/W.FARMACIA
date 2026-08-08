import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can, isRole, type Capability, type Role } from '@/lib/roles';

/**
 * ADN JM NEXUS — AUTORIZACIÓN EN SERVIDOR
 * ─────────────────────────────────────────────────────────────
 * §2.7: cada rol se valida en el servidor, en cada acción y en cada
 * ruta — incluyendo intento de acceso por URL directa (§5.3 punto 5).
 *
 * Estas funciones se llaman al tope de cada Server Component / Action
 * protegida. Nunca confían en el cliente.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  nombre: string;
  role: Role;
  debeCambiarPassword: boolean;
}

/** Devuelve el usuario autenticado con su rol, o null. Valida contra Supabase. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nombre, role, debe_cambiar_password')
    .eq('id', user.id)
    .single<{ id: string; nombre: string; role: string; debe_cambiar_password: boolean | null }>();

  if (!profile || !isRole(profile.role)) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    nombre: profile.nombre,
    role: profile.role,
    debeCambiarPassword: Boolean(profile.debe_cambiar_password),
  };
}

/** Exige sesión válida; si no, redirige a login. Úsese al tope de rutas privadas. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

/** Exige una capacidad; si el rol no la tiene, redirige (bloqueo por URL directa). */
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, cap)) redirect('/dashboard?denegado=1');
  return user;
}

/** Exige uno de los roles dados. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/dashboard?denegado=1');
  return user;
}
