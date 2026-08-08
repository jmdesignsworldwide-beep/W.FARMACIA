-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0028 — Tanda 8 · Expediente del empleado
-- ADN JM NEXUS · el regente con su licencia vigente, o hay problema con DIGEMAPS
-- ════════════════════════════════════════════════════════════════════
-- Amplía profiles con el expediente: contacto de emergencia, foto, cédula, fecha
-- de ingreso, dirección; y para el regente farmacéutico, número de exequátur y
-- VENCIMIENTO de licencia (la app avisa con anticipación). Los 5 roles y sus
-- políticas ya existen (0003). No se abren nuevas políticas: profiles ya tiene
-- select para autenticados y update solo Dueño/Admin.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists cedula text;
alter table public.profiles add column if not exists contacto_emergencia_nombre text;
alter table public.profiles add column if not exists contacto_emergencia_telefono text;
alter table public.profiles add column if not exists foto_url text;
alter table public.profiles add column if not exists fecha_ingreso date;
alter table public.profiles add column if not exists direccion text;
alter table public.profiles add column if not exists exequatur text;              -- regente
alter table public.profiles add column if not exists licencia_vencimiento date;   -- regente

comment on column public.profiles.exequatur is 'Número de exequátur del regente farmacéutico.';
comment on column public.profiles.licencia_vencimiento is 'Vencimiento de la licencia del regente. La app avisa con anticipación (DIGEMAPS).';

create index if not exists idx_profiles_licencia on public.profiles (licencia_vencimiento) where licencia_vencimiento is not null;
