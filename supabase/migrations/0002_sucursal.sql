-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0002 — Sucursal (multi-sucursal desde el esquema)
-- Arquitectura Maestra §3.7
-- ════════════════════════════════════════════════════════════════════
-- Aunque hoy sea una sola farmacia, sucursal_id va en el esquema desde la
-- primera migración, con una sucursal por defecto. Añadir la segunda debe
-- ser crear un registro, no rehacer el sistema (lección de SK). Toda tabla
-- de negocio de las próximas tandas llevará sucursal_id apuntando aquí.
--
-- Se crea ANTES de profiles porque profiles referencia sucursal(id).
-- ════════════════════════════════════════════════════════════════════

-- ID fijo y conocido de la sucursal principal, para poder usarlo como
-- DEFAULT estable en profiles y en las tablas de negocio futuras.
create table if not exists public.sucursal (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  codigo       text unique,
  direccion    text,
  telefono     text,
  rnc          text,
  es_principal boolean not null default false,
  activa       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.sucursal is
  'Sucursales de la farmacia. sucursal_id vive en el esquema desde la migración uno (§3.7); la segunda sucursal es un registro, no un proyecto.';

create trigger trg_sucursal_updated_at
  before update on public.sucursal
  for each row execute function app.set_updated_at();

-- Sucursal por defecto, con un UUID fijo conocido para usar como DEFAULT.
insert into public.sucursal (id, nombre, codigo, es_principal)
values ('00000000-0000-0000-0000-000000000001', 'Sucursal Principal', 'PRINCIPAL', true)
on conflict (id) do nothing;

-- ── RLS + FORCE (regla #4) ──
alter table public.sucursal enable row level security;
alter table public.sucursal force row level security;

-- Todo el personal autenticado puede leer las sucursales (no es dato sensible;
-- el POS y el inventario necesitan saber en qué sucursal operan).
create policy sucursal_select_autenticado
  on public.sucursal for select
  to authenticated
  using (true);

-- La gestión de sucursales (alta/edición) es de configuración: se hará por
-- el módulo de Ajustes (Tanda 17). Por ahora la API no las muta.
revoke insert, update, delete on public.sucursal from anon, authenticated;
