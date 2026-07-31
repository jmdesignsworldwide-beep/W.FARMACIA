-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0007 — Modelo del producto y equivalencia segura
-- ADN JM NEXUS · ADENDA III (se lee antes de la Tanda 2) · Adenda I Idea 6
-- ════════════════════════════════════════════════════════════════════
-- El corazón clínico del sistema. Un modelo flojo aquí NO falla ruidoso:
-- recomienda mal en silencio mientras la pantalla se ve impecable. Por eso
-- todo esto va en la PRIMERA migración de la Tanda 2 — no se retrofitea
-- después de cargar miles de productos.
--
-- Decisiones (Adenda III §3, con ruling del Dueño):
--   • Unidad de concentración = ENUM FIJO. Desviación consciente del §4:
--     cada unidad carga un factor de conversión que el sistema DEBE conocer;
--     dejar que se añadan unidades sin factor rompería la equivalencia en
--     silencio. Añadir una unidad nueva (rarísimo en química) es una
--     migración, no un dato. (mg·g·mcg·UI·%·mEq·mmol)
--   • Forma y vía en producto = NULLABLE, por el arranque progresivo de la
--     Adenda II: un producto incompleto se carga y se vende, pero su firma
--     de equivalencia queda incompleta y NO matchea hasta completarse.
--     Incompleto = no apto para equivalencia. Correcto y seguro.
--
-- Patrón de la casa (§5.3 #4): RLS + FORCE en la misma migración que crea
-- la tabla; auditoría y updated_at por trigger; nada de colores/typos a mano.
-- ════════════════════════════════════════════════════════════════════

-- unaccent no hace falta: normalizamos con translate (IMMUTABLE), lo que
-- permite usar la normalización en columnas generadas e índices únicos.

-- ── Helper: normalización de texto para dedup e índices (IMMUTABLE) ──
create or replace function app.slug(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(trim(translate(
    coalesce(t, ''),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUNaeiouun'
  )));
$$;

-- ════════════════════════════════════════════════════════════════════
-- ENUMS CERRADOS (Adenda III §2, §3) — a prueba de typos peligrosos
-- ════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_type where typname = 'unidad_concentracion') then
    create type public.unidad_concentracion as enum
      ('mg', 'g', 'mcg', 'UI', '%', 'mEq', 'mmol');
  end if;
  if not exists (select 1 from pg_type where typname = 'unidad_volumen') then
    create type public.unidad_volumen as enum ('ml', 'g');
  end if;
end $$;

-- ── Normalización de concentración (Adenda III §2) — IMMUTABLE ──
-- Colapsa unidades a una base comparable. Masa → mcg. UI/%/mEq/mmol no
-- tienen conversión de dimensión: se conservan en su unidad (factor 1) y
-- la unidad_base los distingue. Con volumen, se divide por el volumen.
create or replace function app.conc_norm(
  valor numeric,
  unidad public.unidad_concentracion,
  vol_valor numeric,
  vol_unidad public.unidad_volumen
) returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when valor is null then null
    else (
      valor * case unidad
        when 'mcg' then 1
        when 'mg'  then 1000
        when 'g'   then 1000000
        else 1  -- UI, %, mEq, mmol: sin conversión de dimensión
      end
    ) / nullif(coalesce(vol_valor, 1), 0)
  end;
$$;

-- Unidad base resultante (para comparar solo lo comparable).
create or replace function app.conc_unidad_base(
  unidad public.unidad_concentracion,
  vol_unidad public.unidad_volumen
) returns text
language sql
immutable
set search_path = ''
as $$
  select (
    case unidad
      when 'mcg' then 'mcg' when 'mg' then 'mcg' when 'g' then 'mcg'
      else unidad::text
    end
  ) || case when vol_unidad is null then '' else '/' || vol_unidad::text end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- CATÁLOGOS CONTROLADOS (Adenda III §3, §4)
-- Solo Dueño/Administrador añaden valores; nunca desde el form de producto,
-- nunca automático. SELECT para todo el personal (POS y búsqueda).
-- ════════════════════════════════════════════════════════════════════

-- ── Principio activo (catálogo maestro) ──
create table if not exists public.principio_activo (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  sinonimos          text[] not null default '{}',   -- Adenda III §1: para búsqueda
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.principio_activo is
  'Catálogo maestro de principios activos (Adenda III §1). Gestionable solo por Dueño/Administrador. La equivalencia se arma sobre este catálogo.';
create unique index if not exists uq_principio_norm on public.principio_activo (nombre_normalizado);
create index if not exists idx_principio_nombre_trgm
  on public.principio_activo using gin (nombre_normalizado extensions.gin_trgm_ops);

-- ── Forma farmacéutica (catálogo gestionable controlado) ──
create table if not exists public.forma_farmaceutica (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.forma_farmaceutica is
  'Formas farmacéuticas (Adenda III §3). Catálogo controlado: solo Dueño/Administrador, con dedup por nombre normalizado.';
create unique index if not exists uq_forma_norm on public.forma_farmaceutica (nombre_normalizado);

-- ── Vía de administración (catálogo cerrado, SEPARADO de la forma) ──
-- Adenda III §3: unas gotas oftálmicas y unas óticas NO son intercambiables.
create table if not exists public.via_administracion (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.via_administracion is
  'Vía de administración (Adenda III §3). Campo SEPARADO de la forma. Catálogo cerrado; solo Dueño/Administrador añade.';
create unique index if not exists uq_via_norm on public.via_administracion (nombre_normalizado);

-- ════════════════════════════════════════════════════════════════════
-- PRODUCTO y la RELACIÓN muchos-a-muchos con concentración por renglón
-- ════════════════════════════════════════════════════════════════════
-- El producto es COMPARTIDO (catálogo global de la cadena), NO por sucursal:
-- no lleva sucursal_id. La EXISTENCIA sí es por sucursal y vive en la tabla
-- de inventario (existencia_sucursal) de la Tanda 3, con (producto_id,
-- sucursal_id, existencia, estado_verificacion…). Así la segunda sucursal es
-- un registro de stock, no un producto duplicado.
create table if not exists public.producto (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  nombre_normalizado    text generated always as (app.slug(nombre)) stored,
  forma_farmaceutica_id uuid references public.forma_farmaceutica(id),  -- nullable (arranque progresivo)
  via_administracion_id uuid references public.via_administracion(id),  -- nullable
  -- ── Empaque y precio (unidad base y de caja con factor y precio independiente) ──
  unidad_base           text,                    -- unidad de venta al detalle (ej. "Tableta", "Unidad")
  unidad_caja           text,                    -- unidad de empaque/caja (ej. "Caja")
  factor_caja           numeric check (factor_caja is null or factor_caja > 0),  -- unidades base por caja
  precio_venta          numeric(14,2),           -- RD$ por unidad base (§2.6); nullable por carga mínima
  precio_caja           numeric(14,2),           -- RD$ por caja, precio independiente
  margen_objetivo       numeric(6,2),            -- Idea 4: margen objetivo (%) para inteligencia de precio
  -- ── Banderas farmacéuticas / fiscales ──
  es_controlado         boolean not null default false,   -- medicamento controlado (libro de controlados)
  requiere_receta       boolean not null default false,   -- venta bajo receta
  exento_itbis          boolean not null default false,   -- ITBIS 18% con exentos (§2.6)
  codigo_barras         text,                             -- EAN/UPC (escáner, camino principal — Adenda II §4)
  -- ── Equivalencia e identidad ──
  firma_equivalencia    text,                    -- mantenida por trigger (§6)
  activo                boolean not null default true,
  eliminado_en          timestamptz,             -- soft-delete (§2.6)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.producto is
  'Producto comercial COMPARTIDO por toda la cadena (sin sucursal_id). Su identidad clínica (principios + concentración) vive en producto_principio_activo; la existencia es por sucursal (Tanda 3). firma_equivalencia se calcula por trigger (Adenda III §6).';
create index if not exists idx_producto_forma_via
  on public.producto (forma_farmaceutica_id, via_administracion_id);           -- Adenda III §6
create index if not exists idx_producto_firma on public.producto (firma_equivalencia);  -- §6: comparación
create unique index if not exists uq_producto_codigo_barras
  on public.producto (codigo_barras) where codigo_barras is not null;          -- escáner
create index if not exists idx_producto_nombre_trgm
  on public.producto using gin (nombre_normalizado extensions.gin_trgm_ops);

-- ── Puente: un renglón por principio activo, con SU concentración ──
create table if not exists public.producto_principio_activo (
  id                            uuid primary key default gen_random_uuid(),
  producto_id                   uuid not null references public.producto(id) on delete cascade,
  principio_activo_id           uuid not null references public.principio_activo(id) on delete restrict,
  concentracion_valor           numeric not null check (concentracion_valor > 0),
  concentracion_unidad          public.unidad_concentracion not null,
  concentracion_volumen_valor   numeric check (concentracion_volumen_valor > 0),
  concentracion_volumen_unidad  public.unidad_volumen,
  -- calculadas (Adenda III §2): lo ÚNICO que se indexa y compara
  concentracion_normalizada     numeric generated always as (
    app.conc_norm(concentracion_valor, concentracion_unidad,
                  concentracion_volumen_valor, concentracion_volumen_unidad)
  ) stored,
  unidad_base                   text generated always as (
    app.conc_unidad_base(concentracion_unidad, concentracion_volumen_unidad)
  ) stored,
  orden                         integer not null default 1,   -- orden estable de despliegue
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (producto_id, principio_activo_id),                  -- un principio no se repite en un producto
  -- volumen: o van los dos campos, o ninguno
  constraint volumen_completo check (
    (concentracion_volumen_valor is null) = (concentracion_volumen_unidad is null)
  )
);
comment on table public.producto_principio_activo is
  'Puente producto↔principio activo (Adenda III §1). Cada renglón lleva su concentración. Simple = 1 renglón; combinado = 2-3. La concentración normalizada es lo que se compara.';
create index if not exists idx_ppa_equiv
  on public.producto_principio_activo (principio_activo_id, concentracion_normalizada, unidad_base);  -- §6
create index if not exists idx_ppa_producto on public.producto_principio_activo (producto_id);

-- ════════════════════════════════════════════════════════════════════
-- FIRMA DE EQUIVALENCIA (Adenda III §5, §6)
-- Firma = conjunto ORDENADO de (principio, concentración normalizada, unidad
-- base) + forma + vía. Dos productos con la misma firma son equivalentes:
-- una sola comparación, instantánea (<500ms, presupuesto Adenda II).
-- Si falta concentración/forma/vía, la firma queda incompleta ('?'/'') y el
-- producto NO matchea como equivalente — que es exactamente lo correcto.
-- ════════════════════════════════════════════════════════════════════
create or replace function app.firma_de(p_producto uuid, p_forma uuid, p_via uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select string_agg(clave, '|' order by clave)
    from (
      select ppa.principio_activo_id::text || ':'
             || coalesce(ppa.concentracion_normalizada::text, '?')
             || coalesce(ppa.unidad_base, '') as clave
      from public.producto_principio_activo ppa
      where ppa.producto_id = p_producto
    ) s
  ), '')
  || '#' || coalesce(p_forma::text, '')
  || '#' || coalesce(p_via::text, '');
$$;

-- Producto: recalcula su firma en cada INSERT/UPDATE (barato, misma fila).
create or replace function app.set_firma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.firma_equivalencia :=
    app.firma_de(new.id, new.forma_farmaceutica_id, new.via_administracion_id);
  return new;
end;
$$;
create trigger trg_producto_firma
  before insert or update on public.producto
  for each row execute function app.set_firma();

-- Puente: al cambiar los principios/concentraciones, "toca" el producto para
-- que su trigger recalcule la firma. Un solo camino de cálculo, sin recursión.
create or replace function app.poke_producto_firma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.producto_id, old.producto_id);
begin
  update public.producto set updated_at = now() where id = v_id;
  return null;
end;
$$;
create trigger trg_ppa_firma
  after insert or update or delete on public.producto_principio_activo
  for each row execute function app.poke_producto_firma();

-- ════════════════════════════════════════════════════════════════════
-- updated_at + AUDITORÍA (§2.2) en todas las tablas nuevas
-- ════════════════════════════════════════════════════════════════════
create trigger trg_principio_updated_at before update on public.principio_activo
  for each row execute function app.set_updated_at();
create trigger trg_principio_audit after insert or update or delete on public.principio_activo
  for each row execute function app.audit();

create trigger trg_forma_updated_at before update on public.forma_farmaceutica
  for each row execute function app.set_updated_at();
create trigger trg_forma_audit after insert or update or delete on public.forma_farmaceutica
  for each row execute function app.audit();

create trigger trg_via_updated_at before update on public.via_administracion
  for each row execute function app.set_updated_at();
create trigger trg_via_audit after insert or update or delete on public.via_administracion
  for each row execute function app.audit();

create trigger trg_producto_updated_at before update on public.producto
  for each row execute function app.set_updated_at();
create trigger trg_producto_audit after insert or update or delete on public.producto
  for each row execute function app.audit();

create trigger trg_ppa_updated_at before update on public.producto_principio_activo
  for each row execute function app.set_updated_at();
create trigger trg_ppa_audit after insert or update or delete on public.producto_principio_activo
  for each row execute function app.audit();

-- ════════════════════════════════════════════════════════════════════
-- RLS + FORCE (regla #4) y políticas por rol
-- ════════════════════════════════════════════════════════════════════

-- ── Catálogos controlados: SELECT todos; añadir/editar solo Dueño/Admin ──
do $$
declare t text;
begin
  foreach t in array array['principio_activo','forma_farmaceutica','via_administracion']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    -- la gestión de catálogos NO borra por API (se usa el flag activo)
    execute format('revoke delete on public.%I from anon, authenticated;', t);
    execute format($f$create policy %1$s_select on public.%1$s
      for select to authenticated using (true);$f$, t);
    execute format($f$create policy %1$s_admin_insert on public.%1$s
      for insert to authenticated with check (app.has_role('dueno','administrador'));$f$, t);
    execute format($f$create policy %1$s_admin_update on public.%1$s
      for update to authenticated
      using (app.has_role('dueno','administrador'))
      with check (app.has_role('dueno','administrador'));$f$, t);
  end loop;
end $$;

-- ── Producto: SELECT todo el personal; gestión (alta/edición) por quienes
--    tienen gestionar_inventario (Dueño/Admin/Farmacéutico). No DELETE por API. ──
alter table public.producto enable row level security;
alter table public.producto force row level security;
revoke delete on public.producto from anon, authenticated;
create policy producto_select on public.producto
  for select to authenticated using (true);
create policy producto_gestor_insert on public.producto
  for insert to authenticated
  with check (app.has_role('dueno','administrador','farmaceutico'));
create policy producto_gestor_update on public.producto
  for update to authenticated
  using (app.has_role('dueno','administrador','farmaceutico'))
  with check (app.has_role('dueno','administrador','farmaceutico'));

-- ── Puente: SELECT todo el personal; INSERT/UPDATE/DELETE por gestores.
--    Aquí DELETE sí es real: editar los principios de un producto borra
--    renglones. Se permite a los gestores, y queda auditado. ──
alter table public.producto_principio_activo enable row level security;
alter table public.producto_principio_activo force row level security;
create policy ppa_select on public.producto_principio_activo
  for select to authenticated using (true);
create policy ppa_gestor_insert on public.producto_principio_activo
  for insert to authenticated
  with check (app.has_role('dueno','administrador','farmaceutico'));
create policy ppa_gestor_update on public.producto_principio_activo
  for update to authenticated
  using (app.has_role('dueno','administrador','farmaceutico'))
  with check (app.has_role('dueno','administrador','farmaceutico'));
create policy ppa_gestor_delete on public.producto_principio_activo
  for delete to authenticated
  using (app.has_role('dueno','administrador','farmaceutico'));

-- ════════════════════════════════════════════════════════════════════
-- SEED — vocabulario inicial (los catálogos gestionables nacen poblados)
-- ════════════════════════════════════════════════════════════════════
insert into public.via_administracion (nombre) values
  ('Oral'), ('Tópica'), ('Oftálmica'), ('Ótica'), ('Nasal'),
  ('Rectal'), ('Vaginal'), ('Inyectable'), ('Inhalatoria')
on conflict do nothing;

insert into public.forma_farmaceutica (nombre) values
  ('Tableta'), ('Cápsula'), ('Jarabe'), ('Suspensión'), ('Inyectable'),
  ('Crema'), ('Ungüento'), ('Gotas'), ('Supositorio'), ('Óvulo'),
  ('Parche'), ('Inhalador'), ('Gel'), ('Solución'), ('Polvo')
on conflict do nothing;

-- ════════════════════════════════════════════════════════════════════
-- ENDURECIMIENTO DE EJECUCIÓN (criterio §5.3 #10 / 0006)
-- ════════════════════════════════════════════════════════════════════
-- search_path fijo ('') ya viene en cada función de arriba. Falta cerrar
-- la ejecución: las funciones SECURITY DEFINER (que se saltan RLS) NO deben
-- ser ejecutables por anon/public. Los triggers corren como su dueño y no
-- requieren EXECUTE del llamador, así que revocarlo no los afecta.
--   • firma_de: la usa la app (panel de equivalencia) como authenticated.
--   • set_firma / poke_producto_firma: solo se invocan por trigger.
revoke execute on function app.firma_de(uuid, uuid, uuid) from public;
revoke execute on function app.set_firma() from public;
revoke execute on function app.poke_producto_firma() from public;
grant execute on function app.firma_de(uuid, uuid, uuid) to authenticated, service_role;
-- Las funciones IMMUTABLE puras (app.slug, app.conc_norm, app.conc_unidad_base)
-- no acceden a datos ni RLS; se dejan con EXECUTE público para no romper la
-- evaluación de las columnas generadas.
