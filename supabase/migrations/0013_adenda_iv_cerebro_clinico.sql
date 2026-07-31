-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0013 — El catálogo como cerebro clínico
-- ADN JM NEXUS · ADENDA IV (Pieza 1: TODO el esquema, una sola ventana)
-- ════════════════════════════════════════════════════════════════════
-- La molécula deja de ser una palabra y pasa a llevar propiedades reales que
-- los productos heredan. Esta migración crea TODO el esquema de la Adenda IV
-- de una vez (una sola ventana de PAT): catálogos nuevos, enriquecimiento de
-- principio/forma/laboratorio, el override de herencia en producto, la función
-- de fusión atómica, y el semilla clínico mínimo.
--
-- Lo que NO se arma aquí (queda en docs/PENDIENTES.md, Tanda 3):
--   • La asimetría de seguridad del override (bajar el candado exige motivo +
--     Dueño/Admin + audit). El ESQUEMA queda listo; la REGLA se arma en T3.
--   • El semilla grande de DIGEMAPS, idempotente contra `clave_semilla`.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- 1) CATÁLOGOS NUEVOS: clase terapéutica, familia alergénica, categoría
-- ════════════════════════════════════════════════════════════════════
-- Gestionables como los críticos (solo Dueño/Admin), con dedup e identidad de
-- semilla estable (`clave_semilla`: null = lo creó el Dueño; no-null = semilla
-- del sistema, distinguible y estable para que la recarga de T3 no duplique).
create table if not exists public.clase_terapeutica (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  clave_semilla      text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.clase_terapeutica is 'Clase terapéutica (Adenda IV §1/§5). clave_semilla estable para el semilla de T3.';

create table if not exists public.familia_alergenica (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  clave_semilla      text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.familia_alergenica is 'Familia alergénica (Adenda IV §2). Base de la alerta cruzada de alergia (T7). clave_semilla estable.';

create table if not exists public.categoria_comercial (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  nombre_normalizado text generated always as (app.slug(nombre)) stored,
  clave_semilla      text,
  activo             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.categoria_comercial is 'Categoría comercial (Adenda IV §5): medicamento, cuidado personal, bebé… clave_semilla estable.';

-- Índices, triggers, RLS y políticas — idénticos a los catálogos críticos.
do $$ declare t text; begin
  foreach t in array array['clase_terapeutica','familia_alergenica','categoria_comercial'] loop
    -- dedup por nombre normalizado + identidad de semilla (nulls distintos: varios null ok)
    execute format('create unique index if not exists uq_%1$s_norm on public.%1$s (nombre_normalizado);', t);
    execute format('create unique index if not exists uq_%1$s_semilla on public.%1$s (clave_semilla);', t);
    execute format('create index if not exists idx_%1$s_trgm on public.%1$s using gin (nombre_normalizado extensions.gin_trgm_ops);', t);
    -- updated_at + auditoría
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function app.set_updated_at();', t);
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
    -- RLS + FORCE
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    -- políticas: SELECT todos; INSERT/UPDATE/DELETE solo Dueño/Admin
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (true);', t);
    execute format('drop policy if exists %1$s_admin_insert on public.%1$s;', t);
    execute format($f$create policy %1$s_admin_insert on public.%1$s for insert to authenticated with check ((select app.has_role('dueno','administrador')));$f$, t);
    execute format('drop policy if exists %1$s_admin_update on public.%1$s;', t);
    execute format($f$create policy %1$s_admin_update on public.%1$s for update to authenticated using ((select app.has_role('dueno','administrador'))) with check ((select app.has_role('dueno','administrador')));$f$, t);
    execute format('drop policy if exists %1$s_admin_delete on public.%1$s;', t);
    execute format($f$create policy %1$s_admin_delete on public.%1$s for delete to authenticated using ((select app.has_role('dueno','administrador')));$f$, t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 2) PRINCIPIO ACTIVO ENRIQUECIDO (Adenda IV §1) — la molécula que sabe
-- ════════════════════════════════════════════════════════════════════
-- Estos son valores de la MOLÉCULA (fuente de verdad). El producto los hereda;
-- su override vive en `producto` (sección 5).
alter table public.principio_activo
  add column if not exists es_controlado          boolean not null default false,
  add column if not exists escala_control         text,           -- Ley 50-88 (lista/categoría)
  add column if not exists requiere_receta        boolean not null default false,
  add column if not exists clase_terapeutica_id   uuid references public.clase_terapeutica(id),
  add column if not exists es_cronico_tipico       boolean not null default false,
  add column if not exists requiere_refrigeracion boolean not null default false,
  add column if not exists familia_alergenica_id  uuid references public.familia_alergenica(id),
  add column if not exists nombre_comercial_comun text,
  add column if not exists clave_semilla          text;
create unique index if not exists uq_principio_semilla on public.principio_activo (clave_semilla);
create index if not exists idx_principio_clase   on public.principio_activo (clase_terapeutica_id);
create index if not exists idx_principio_familia on public.principio_activo (familia_alergenica_id);
comment on column public.principio_activo.es_controlado is 'Valor de la MOLÉCULA (Ley 50-88). Los productos lo heredan salvo override.';
comment on column public.principio_activo.familia_alergenica_id is 'Habilita la alerta cruzada de alergia (Adenda IV §2, se opera en T7).';

-- ════════════════════════════════════════════════════════════════════
-- 3) FORMA FARMACÉUTICA CON REGLAS (Adenda IV §3)
-- ════════════════════════════════════════════════════════════════════
alter table public.forma_farmaceutica
  add column if not exists permite_fraccionamiento boolean not null default false,
  add column if not exists requiere_refrigeracion  boolean not null default false,
  add column if not exists es_esteril              boolean not null default false,
  add column if not exists unidad_de_medida_natural text;
comment on column public.forma_farmaceutica.permite_fraccionamiento is 'La forma decide si se fracciona; el producto decide factor y precio (Adenda IV §3). Se opera en el POS (T4).';

-- ════════════════════════════════════════════════════════════════════
-- 4) LABORATORIO ENRIQUECIDO (Adenda IV §4) — fabricante ≠ droguería (T9)
-- ════════════════════════════════════════════════════════════════════
alter table public.laboratorio
  add column if not exists pais_origen       text,
  add column if not exists es_generico       boolean,
  add column if not exists calidad_percibida smallint;
alter table public.laboratorio drop constraint if exists chk_laboratorio_calidad;
alter table public.laboratorio add constraint chk_laboratorio_calidad
  check (calidad_percibida is null or calidad_percibida between 1 and 5);
comment on column public.laboratorio.calidad_percibida is 'Nota del Dueño 1-5 (hay laboratorios que el cliente rechaza). Alimenta el comparador de proveedores (Adenda I).';

-- ════════════════════════════════════════════════════════════════════
-- 5) PRODUCTO: OVERRIDE DE HERENCIA (Adenda IV §1, tres estados) + campos
-- ════════════════════════════════════════════════════════════════════
-- Regla de una sola fuente (ADN §2.1): NO se duplican columnas. Las mismas
-- es_controlado / requiere_receta pasan a tener TRES estados:
--   null  = hereda de la molécula
--   true  = sobrescrito a MÁS restrictivo (inofensivo)
--   false = sobrescrito a MENOS restrictivo (quita candado → exige motivo,
--           Dueño/Admin y audit; ESA REGLA se arma en T3, ver PENDIENTES.md)
-- actor y fecha del override NO se duplican: viven en el audit_log (inviolable).
alter table public.producto
  alter column es_controlado   drop not null,
  alter column es_controlado   drop default,
  alter column requiere_receta drop not null,
  alter column requiere_receta drop default;
alter table public.producto
  add column if not exists motivo_control        text,   -- razón si baja el candado de controlado
  add column if not exists motivo_receta         text,   -- razón si baja el candado de receta
  add column if not exists registro_sanitario    text,   -- registro DIGEMAPS del producto
  add column if not exists categoria_comercial_id uuid references public.categoria_comercial(id);
create index if not exists idx_producto_categoria on public.producto (categoria_comercial_id);
comment on column public.producto.es_controlado is 'Tres estados: null=hereda de la molécula; true=más restrictivo; false=menos restrictivo (bajar el candado exige motivo+Dueño/Admin+audit, T3).';

-- ════════════════════════════════════════════════════════════════════
-- 6) FUSIONAR ENTRADAS (Adenda IV §8) — atómico, con rastro, sin elevar
-- ════════════════════════════════════════════════════════════════════
-- Reasigna todos los productos de una entrada duplicada a otra y borra la
-- vieja, en UNA transacción. SECURITY INVOKER: corre con la sesión del usuario
-- (no dispara el WARN del Advisor que evitamos en 0012). Valida el rol, y como
-- corre como el usuario, la RLS y la auditoría aplican con su actor real.
create or replace function public.fusionar_catalogo(p_tipo text, p_origen uuid, p_destino uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare v_reasignados integer := 0;
begin
  if p_origen = p_destino then
    raise exception 'No se puede fusionar una entrada consigo misma' using errcode = '22023';
  end if;
  if not (select app.has_role('dueno', 'administrador')) then
    raise exception 'No autorizado para fusionar catálogos' using errcode = '42501';
  end if;

  if p_tipo = 'principio_activo' then
    -- si un producto ya tiene el destino, quitar el renglón del origen (evita
    -- chocar con unique(producto_id, principio_activo_id)); el resto se reasigna
    delete from public.producto_principio_activo o
     where o.principio_activo_id = p_origen
       and exists (select 1 from public.producto_principio_activo d
                   where d.producto_id = o.producto_id and d.principio_activo_id = p_destino);
    update public.producto_principio_activo set principio_activo_id = p_destino where principio_activo_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.principio_activo where id = p_origen;

  elsif p_tipo = 'forma_farmaceutica' then
    update public.producto set forma_farmaceutica_id = p_destino where forma_farmaceutica_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.forma_farmaceutica where id = p_origen;

  elsif p_tipo = 'via_administracion' then
    update public.producto set via_administracion_id = p_destino where via_administracion_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.via_administracion where id = p_origen;

  elsif p_tipo = 'laboratorio' then
    update public.producto set laboratorio_id = p_destino where laboratorio_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.laboratorio where id = p_origen;

  elsif p_tipo = 'presentacion' then
    update public.producto set presentacion_id = p_destino where presentacion_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.presentacion where id = p_origen;

  elsif p_tipo = 'clase_terapeutica' then
    update public.principio_activo set clase_terapeutica_id = p_destino where clase_terapeutica_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.clase_terapeutica where id = p_origen;

  elsif p_tipo = 'familia_alergenica' then
    update public.principio_activo set familia_alergenica_id = p_destino where familia_alergenica_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.familia_alergenica where id = p_origen;

  elsif p_tipo = 'categoria_comercial' then
    update public.producto set categoria_comercial_id = p_destino where categoria_comercial_id = p_origen;
    get diagnostics v_reasignados = row_count;
    delete from public.categoria_comercial where id = p_origen;

  else
    raise exception 'Catálogo no fusionable: %', p_tipo using errcode = '22023';
  end if;

  return v_reasignados;
end $$;
comment on function public.fusionar_catalogo(text, uuid, uuid) is
  'Fusiona dos entradas de catálogo (Adenda IV §8): reasigna todos los productos del origen al destino y borra el origen, atómico. SECURITY INVOKER + valida Dueño/Admin; rastro por auditoría con actor real.';
revoke execute on function public.fusionar_catalogo(text, uuid, uuid) from public, anon;
grant execute on function public.fusionar_catalogo(text, uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 7) SEMILLA CLÍNICA MÍNIMA (Adenda IV §6) — que no llegue vacío
-- ════════════════════════════════════════════════════════════════════
-- Vocabulario REAL (no artefacto de prueba, no se purga). Marcado con
-- clave_semilla estable → la recarga de T3 es idempotente contra ella.
insert into public.familia_alergenica (nombre, clave_semilla) values
  ('Penicilinas', 'penicilinas'), ('Cefalosporinas', 'cefalosporinas'),
  ('Sulfonamidas', 'sulfonamidas'), ('AINEs', 'aines'),
  ('Macrólidos', 'macrolidos'), ('Quinolonas', 'quinolonas'),
  ('Tetraciclinas', 'tetraciclinas')
on conflict (clave_semilla) do nothing;

insert into public.clase_terapeutica (nombre, clave_semilla) values
  ('Antihipertensivo', 'antihipertensivo'), ('Antibiótico', 'antibiotico'),
  ('Analgésico', 'analgesico'), ('Antidiabético', 'antidiabetico'),
  ('Antiinflamatorio', 'antiinflamatorio'), ('Antihistamínico', 'antihistaminico'),
  ('Antiácido', 'antiacido'), ('Broncodilatador', 'broncodilatador'),
  ('Ansiolítico', 'ansiolitico'), ('Antipirético', 'antipiretico')
on conflict (clave_semilla) do nothing;

insert into public.categoria_comercial (nombre, clave_semilla) values
  ('Medicamento', 'medicamento'), ('Cuidado personal', 'cuidado_personal'),
  ('Bebé', 'bebe'), ('Ortopedia', 'ortopedia'), ('Belleza', 'belleza')
on conflict (clave_semilla) do nothing;

-- Fraccionamiento: los sólidos orales obvios se fraccionan; el resto lo afina
-- el Dueño en la pantalla (Pieza 4). Solo se tocan si aún están en el default.
update public.forma_farmaceutica set permite_fraccionamiento = true
  where nombre_normalizado in ('tableta', 'capsula') and permite_fraccionamiento = false;
