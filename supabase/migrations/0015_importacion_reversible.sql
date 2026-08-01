-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0015 — Importación masiva reversible
-- ADN JM NEXUS · TANDA 3 · Pieza 3 (esquema de la reversibilidad)
-- ════════════════════════════════════════════════════════════════════
-- La importación masiva (Excel/CSV) es la vía real para cargar la farmacia.
-- "Un error de carga masiva sin marcha atrás es una catástrofe": cada
-- importación tiene identidad, y lo que crea queda MARCADO para poder
-- deshacerla completa en sus primeras 24 horas.
--
-- Esta migración es solo el esquema de la reversibilidad:
--   • `importacion` — la corrida: quién, archivo, conteos, estado, mapeo
--     recordado, y cuándo/quién la deshizo.
--   • `producto.importacion_id` / `lote.importacion_id` — la marca de origen,
--     para revertir exactamente lo que esa corrida creó.
-- El procesamiento en servidor, la validación por fila, el deshacer y el
-- reporte son la capa de app (misma Pieza 3). Sin `false → null` aquí: esa
-- migración de datos va en la ventana del override (docs/PENDIENTES.md).
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='estado_importacion') then
    create type public.estado_importacion as enum
      ('pendiente','procesando','completada','deshecha','error');
  end if;
end $$;

create table if not exists public.importacion (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null default '00000000-0000-0000-0000-000000000001'
                      references public.sucursal(id),
  empleado_id       uuid references public.profiles(id),
  archivo_nombre    text,
  archivo_tipo      text,                                    -- xlsx | csv
  estado            public.estado_importacion not null default 'pendiente',
  filas_total       integer not null default 0,
  filas_procesadas  integer not null default 0,
  filas_ok          integer not null default 0,
  filas_error       integer not null default 0,
  productos_creados integer not null default 0,
  lotes_creados     integer not null default 0,
  -- El mapeo de columnas que usó (encabezado del archivo → campo del sistema).
  -- Se recuerda para proponerlo en la próxima importación.
  mapeo             jsonb,
  -- Decisiones tomadas una vez para todo el archivo (formato de fecha, etc.).
  opciones          jsonb,
  deshecha_en       timestamptz,
  deshecha_por      uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.importacion is 'Una corrida de importación masiva (Tanda 3 · Pieza 3). Lo que crea queda marcado con su id para poder deshacerla completa en 24h. `mapeo` se recuerda para la próxima.';
create index if not exists idx_importacion_estado on public.importacion (estado);
create index if not exists idx_importacion_empleado on public.importacion (empleado_id);
create index if not exists idx_importacion_creada on public.importacion (created_at desc);

-- Marca de origen en lo que la importación crea (nullable: lo normal no viene de importar).
alter table public.producto add column if not exists importacion_id uuid references public.importacion(id);
alter table public.lote     add column if not exists importacion_id uuid references public.importacion(id);
create index if not exists idx_producto_importacion on public.producto (importacion_id);
create index if not exists idx_lote_importacion     on public.lote (importacion_id);
comment on column public.producto.importacion_id is 'Corrida de importación que creó este producto (null = alta manual). Habilita el deshacer de 24h.';

drop trigger if exists trg_importacion_updated_at on public.importacion;
create trigger trg_importacion_updated_at before update on public.importacion
  for each row execute function app.set_updated_at();
drop trigger if exists trg_importacion_audit on public.importacion;
create trigger trg_importacion_audit after insert or update or delete on public.importacion
  for each row execute function app.audit();

-- ── RLS + FORCE (regla #4) ──
-- Importar es gestionar inventario (dueño/admin/farmacéutico); no se borra por
-- API (el "deshacer" es una operación con rastro, no un DELETE de la corrida).
alter table public.importacion enable row level security;
alter table public.importacion force row level security;
revoke all on public.importacion from anon;
grant select, insert, update on public.importacion to authenticated;
drop policy if exists importacion_select on public.importacion;
create policy importacion_select on public.importacion for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists importacion_insert on public.importacion;
create policy importacion_insert on public.importacion for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists importacion_update on public.importacion;
create policy importacion_update on public.importacion for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
