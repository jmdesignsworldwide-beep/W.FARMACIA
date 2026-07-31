-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0010 — Laboratorio y presentación (no críticos)
-- ADN JM NEXUS · ADENDA III §3
-- ════════════════════════════════════════════════════════════════════
-- Separa EQUIVALENCIA CLÍNICA de DUPLICADO DE INVENTARIO:
--   • Equivalencia = firma clínica (principios+concentración+forma+vía).
--     Genfar y Rowe del mismo Losartán 50mg SON equivalentes (correcto).
--   • Duplicado = firma clínica + laboratorio + presentación. Es el mismo
--     producto cargado dos veces.
-- Laboratorio y presentación NO son campos críticos de seguridad (§3): aquí
-- SÍ aplica el selector inteligente con auto-guardado (patrón Edwin). Por eso
-- su INSERT lo puede hacer quien gestiona inventario (no solo Dueño/Admin).
-- ════════════════════════════════════════════════════════════════════

-- ── Catálogos gestionables no críticos ──
create table if not exists public.laboratorio (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.laboratorio is
  'Laboratorio/marca (Adenda III §3). No crítico: selector inteligente con auto-guardado. Forma parte de la identidad de DUPLICADO, no de la equivalencia clínica.';
create unique index if not exists uq_laboratorio_norm on public.laboratorio (nombre_normalizado);
create index if not exists idx_laboratorio_nombre_trgm
  on public.laboratorio using gin (nombre_normalizado extensions.gin_trgm_ops);

create table if not exists public.presentacion (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.presentacion is
  'Presentación comercial (ej. "Caja x 30") (Adenda III §3). No crítico: selector inteligente con auto-guardado. Parte de la identidad de duplicado.';
create unique index if not exists uq_presentacion_norm on public.presentacion (nombre_normalizado);
create index if not exists idx_presentacion_nombre_trgm
  on public.presentacion using gin (nombre_normalizado extensions.gin_trgm_ops);

-- ── producto: referencias a laboratorio y presentación (nullable) ──
alter table public.producto
  add column if not exists laboratorio_id uuid references public.laboratorio(id),
  add column if not exists presentacion_id uuid references public.presentacion(id);

-- Índice para la detección de DUPLICADO: firma + laboratorio + presentación.
create index if not exists idx_producto_duplicado
  on public.producto (firma_equivalencia, laboratorio_id, presentacion_id);

-- ── updated_at + auditoría ──
create trigger trg_laboratorio_updated_at before update on public.laboratorio
  for each row execute function app.set_updated_at();
create trigger trg_laboratorio_audit after insert or update or delete on public.laboratorio
  for each row execute function app.audit();
create trigger trg_presentacion_updated_at before update on public.presentacion
  for each row execute function app.set_updated_at();
create trigger trg_presentacion_audit after insert or update or delete on public.presentacion
  for each row execute function app.audit();

-- ── RLS + FORCE (regla #4) ──
-- SELECT: todo el personal. INSERT/UPDATE: quien gestiona inventario
-- (Dueño/Admin/Farmacéutico) — auto-guardado del selector inteligente.
-- No crítico: no exige Dueño/Admin como los catálogos clínicos.
do $$ declare t text; begin
  foreach t in array array['laboratorio','presentacion'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke delete on public.%I from anon, authenticated;', t);
    execute format($f$create policy %1$s_select on public.%1$s
      for select to authenticated using (true);$f$, t);
    execute format($f$create policy %1$s_gestor_insert on public.%1$s
      for insert to authenticated
      with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
    execute format($f$create policy %1$s_gestor_update on public.%1$s
      for update to authenticated
      using ((select app.has_role('dueno','administrador','farmaceutico')))
      with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
  end loop;
end $$;
