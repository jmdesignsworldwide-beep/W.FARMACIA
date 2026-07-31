-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0002 — Perfiles y roles
-- ADN JM NEXUS §2.7 (roles con validación real en servidor)
-- ════════════════════════════════════════════════════════════════════
-- RLS + FORCE se activan en ESTA MISMA migración que crea la tabla
-- (regla de cierre §5.3 #4). Ni el dueño de la tabla escapa a RLS.
--
-- Modelo de acceso:
--   • INSERT de perfiles: SOLO por el trigger de alta (handle_new_user),
--     que corre como definer. Se REVOCA el INSERT a la API (anon/authenticated)
--     para que nadie inserte perfiles a mano; el rol se ajusta luego por UPDATE.
--   • UPDATE: solo dueño/gerente (gestionar_empleados). La escalada de
--     privilegios se previene: solo el dueño puede asignar/mantener 'dueno'.
--   • DELETE: prohibido por API (soft-delete vía eliminado_en).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  role         public.app_role not null default 'cajero',
  telefono     text,
  activo       boolean not null default true,
  eliminado_en timestamptz,                       -- soft-delete (§2.6)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de cada usuario y su rol. Fuente de verdad para RLS y para requireRole() en servidor.';

-- ── Funciones de rol para RLS (aquí, ya con public.profiles disponible) ──
-- SECURITY DEFINER para leer profiles sin caer en recursión de RLS.
-- (Se evita el nombre `current_role`, palabra reservada de SQL.)
create or replace function app.actor_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function app.has_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.actor_role() = any(roles), false);
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

-- Auditoría de cambios de perfil (altas, cambios de rol, bajas).
create trigger trg_profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function app.audit();

-- ── RLS + FORCE (regla #4) ──
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- La API (anon/authenticated) no inserta ni borra perfiles directamente.
revoke insert, delete on public.profiles from anon, authenticated;

-- Lectura: cada quien su propio perfil; dueño/gerente ven todos.
create policy profiles_self_select
  on public.profiles for select
  using (id = auth.uid());

create policy profiles_admin_select
  on public.profiles for select
  using (app.has_role('dueno', 'gerente'));

-- INSERT: alcanzable únicamente por el trigger definer (el INSERT de la
-- API está revocado arriba). with check (true) permite el alta del sistema
-- bajo FORCE RLS sin abrir la puerta a inserciones manuales.
create policy profiles_system_insert
  on public.profiles for insert
  with check (true);

-- UPDATE: solo dueño/gerente. Solo el dueño puede dejar/poner el rol 'dueno'
-- (previene la escalada de privilegios de la auditoría de JM FIT, §2.7).
create policy profiles_admin_update
  on public.profiles for update
  using (app.has_role('dueno', 'gerente'))
  with check (
    app.has_role('dueno', 'gerente')
    and (role <> 'dueno' or app.has_role('dueno'))
  );

-- ── Alta automática de perfil al crear el usuario en auth ──
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nombre, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'cajero')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
