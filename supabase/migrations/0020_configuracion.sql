-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0020 — Configuración (ajustes por sucursal)
-- ════════════════════════════════════════════════════════════════════
-- Nace del cierre de la Tanda 3: el umbral de discrepancia del conteo debe ser
-- CONFIGURABLE desde Ajustes, no una constante — "una farmacia grande y una
-- pequeña no tienen el mismo umbral, y este sistema se vende a muchas".
--
-- Tabla clave-valor por sucursal (null de sucursal = valor por defecto de la
-- cadena). Solo Dueño/Admin la edita; todos los operativos la leen (el POS y el
-- conteo consultan sus valores). Se junta en la ventana de PAT del esquema del
-- POS (0019) para no abrir otra.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.configuracion (
  id           uuid primary key default gen_random_uuid(),
  clave        text not null,
  sucursal_id  uuid not null default '00000000-0000-0000-0000-000000000001'
                 references public.sucursal(id),
  valor        jsonb not null,
  descripcion  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (clave, sucursal_id)
);
comment on table public.configuracion is 'Ajustes clave-valor por sucursal (Dueño/Admin edita, operativos leen). Ej.: umbral_discrepancia_conteo. Un valor ausente para una sucursal cae al valor por defecto del código.';
create index if not exists idx_config_clave on public.configuracion (clave);

drop trigger if exists trg_configuracion_updated_at on public.configuracion;
create trigger trg_configuracion_updated_at before update on public.configuracion
  for each row execute function app.set_updated_at();
drop trigger if exists trg_configuracion_audit on public.configuracion;
create trigger trg_configuracion_audit after insert or update or delete on public.configuracion
  for each row execute function app.audit();

-- Semilla idempotente: el umbral de discrepancia del conteo (RD$5,000 por defecto).
insert into public.configuracion (clave, valor, descripcion)
values (
  'umbral_discrepancia_conteo',
  '5000'::jsonb,
  'Umbral en RD$ por encima del cual una corrección de conteo exige motivo y autorización de Dueño/Administrador.'
)
on conflict (clave, sucursal_id) do nothing;

-- RLS + FORCE: lee el operativo; edita solo Dueño/Admin.
alter table public.configuracion enable row level security;
alter table public.configuracion force row level security;
revoke all on public.configuracion from anon;
grant select, insert, update, delete on public.configuracion to authenticated;
drop policy if exists config_select on public.configuracion;
create policy config_select on public.configuracion for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists config_admin_write on public.configuracion;
create policy config_admin_write on public.configuracion for insert to authenticated
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists config_admin_update on public.configuracion;
create policy config_admin_update on public.configuracion for update to authenticated
  using ((select app.has_role('dueno','administrador')))
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists config_admin_delete on public.configuracion;
create policy config_admin_delete on public.configuracion for delete to authenticated
  using ((select app.has_role('dueno','administrador')));
