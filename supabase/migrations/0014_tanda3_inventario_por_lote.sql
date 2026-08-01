-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0014 — Tanda 3 · Pieza 1: inventario por lote
-- ADN JM NEXUS · TANDA 3 (Pieza 1: TODO el esquema, una sola ventana de PAT)
-- ════════════════════════════════════════════════════════════════════
-- El sistema deja de saber solo "qué productos existen" y pasa a saber
-- "qué hay, dónde está, cuánto costó, cuándo vence y quién lo trajo".
--
-- Esta migración crea TODO el esquema de la Tanda 3 de una vez:
--   • lote — la existencia física (un producto NO tiene stock; la existencia
--     es la suma de sus lotes activos).
--   • movimiento_inventario — libro append-only INVIOLABLE de toda variación.
--   • historial_costo — libro append-only del costo por lote/proveedor.
--   • conteo_ciclico / _linea — conteos programados (Adenda II §3).
--   • discrepancia_inventario — diferencias con su valor en RD$, append-only.
--   • medicamento_oficial — catálogo DIGEMAPS de referencia (NO inventario),
--     identidad estable por registro_sanitario para carga idempotente (T3·P4).
--   • producto — campos de verificación/completitud/ubicación + la marca
--     "fuera del registro sanitario".
--   • EL CANDADO DEL OVERRIDE (bloqueo de docs/PENDIENTES.md): bajar el candado
--     heredado (molécula controlada → producto no controlado / con receta →
--     sin receta) exige MOTIVO + Dueño/Administrador + queda en audit_log.
--
-- Reglas del ADN aplicadas: dinero NUMERIC(14,2); RLS+FORCE en la misma
-- migración que crea la tabla; libros de historial INSERT/SELECT únicamente
-- (trigger de inviolabilidad, ni el administrador). Idempotente (if not exists,
-- do-blocks guardados) — se aplica dos veces sin error.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- 0) ENUMS (catálogos cerrados)
-- ════════════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from pg_type where typname='estado_lote') then
    create type public.estado_lote as enum
      ('activo','agotado','vencido','devuelto','mermado');
  end if;
  if not exists (select 1 from pg_type where typname='tipo_movimiento') then
    create type public.tipo_movimiento as enum
      ('entrada','venta','devolucion','ajuste','merma','transferencia','conteo');
  end if;
  if not exists (select 1 from pg_type where typname='motivo_merma') then
    create type public.motivo_merma as enum
      ('rotura','vencido','robo','muestra_medica','error_despacho','devolucion_cliente');
  end if;
  if not exists (select 1 from pg_type where typname='estado_verificacion') then
    create type public.estado_verificacion as enum
      ('verificado','estimado','discrepancia');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 1) PRODUCTO — verificación, completitud, ubicación, fuera de registro
-- ════════════════════════════════════════════════════════════════════
-- Regla de una sola fuente (ADN §2.1): la existencia NO se guarda en producto;
-- se suma de los lotes. Aquí solo metadatos de confianza y de ubicación.
alter table public.producto
  add column if not exists estado_verificacion       public.estado_verificacion not null default 'estimado',
  add column if not exists fecha_ultima_verificacion timestamptz,
  add column if not exists verificado_por            uuid references public.profiles(id),
  add column if not exists completitud               smallint not null default 0,  -- 0-100, mantenida por trigger
  add column if not exists punto_reorden_manual      numeric(14,3),                -- nullable, se opera en T11
  add column if not exists ubicacion_fisica_default  text,
  add column if not exists fuera_de_registro         boolean not null default false;
comment on column public.producto.estado_verificacion is 'verificado=contado · estimado=sin verificar · discrepancia=conteo no cuadró (Adenda II §3). En pantalla, estimado se muestra como "aprox.".';
comment on column public.producto.completitud is 'Porcentaje 0-100 calculado por trigger (Adenda II §1). Un producto entra incompleto y se enriquece después.';
comment on column public.producto.fuera_de_registro is 'El Dueño reconoce que el producto NO está en el registro sanitario oficial. Es información, no un error (Tanda 3).';

-- ── El CANDADO del override (docs/PENDIENTES.md · Tanda 3) ──
-- La herencia molécula→producto: producto.es_controlado / requiere_receta con
--   null  = hereda de la molécula (lo MÁS restrictivo de sus principios)
--   true  = subir el candado  (más restrictivo)  → SIN fricción
--   false = bajar el candado  (menos restrictivo) → exige motivo + Dueño/Admin
-- El motivo es un hecho de negocio y vive en producto; el actor y la fecha ya
-- quedan en audit_log (trigger trg_producto_audit). Aquí se ARMA la asimetría.

-- Integridad dura, siempre: marcar a mano un candado en false EXIGE su motivo.
-- (No depende del rol ni de la molécula: un false sin motivo no se guarda nunca.)
alter table public.producto drop constraint if exists chk_motivo_control;
alter table public.producto add constraint chk_motivo_control
  check (es_controlado is distinct from false
         or (motivo_control is not null and length(btrim(motivo_control)) > 0));
alter table public.producto drop constraint if exists chk_motivo_receta;
alter table public.producto add constraint chk_motivo_receta
  check (requiere_receta is distinct from false
         or (motivo_receta is not null and length(btrim(motivo_receta)) > 0));

-- ¿Alguno de los principios del producto trae el candado puesto en la molécula?
create or replace function app.molecula_candado(p_producto uuid)
returns table (controlado boolean, requiere_receta boolean)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(bool_or(pa.es_controlado), false),
    coalesce(bool_or(pa.requiere_receta), false)
  from public.producto_principio_activo ppa
  join public.principio_activo pa on pa.id = ppa.principio_activo_id
  where ppa.producto_id = p_producto;
$$;

-- Trigger que hace cumplir la asimetría: solo Dueño/Admin puede BAJAR un candado
-- que la molécula trae puesto. Subirlo o heredarlo (null) no pide nada.
create or replace function app.enforce_override_candado()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_mol record;
  v_baja_controlado boolean;
  v_baja_receta     boolean;
begin
  -- Solo interesa cuando ESTE cambio pone un candado en false (bajarlo).
  v_baja_controlado := new.es_controlado is false
    and (tg_op = 'INSERT' or old.es_controlado is distinct from false);
  v_baja_receta := new.requiere_receta is false
    and (tg_op = 'INSERT' or old.requiere_receta is distinct from false);

  if not (v_baja_controlado or v_baja_receta) then
    return new;  -- subir el candado, heredar (null) o no tocarlo: sin fricción
  end if;

  select * into v_mol from app.molecula_candado(new.id);

  -- Bajar un candado que la molécula trae puesto = solo Dueño/Administrador.
  -- (El motivo ya lo garantizan los CHECK de arriba; aquí va el rol.)
  if v_baja_controlado and coalesce(v_mol.controlado, false)
     and not app.has_role('dueno','administrador') then
    raise exception 'Bajar el candado de CONTROLADO (la molécula lo trae puesto) solo lo hace el Dueño o el Administrador, con motivo. Queda en la bitácora.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_baja_receta and coalesce(v_mol.requiere_receta, false)
     and not app.has_role('dueno','administrador') then
    raise exception 'Bajar el candado de RECETA (la molécula lo exige) solo lo hace el Dueño o el Administrador, con motivo. Queda en la bitácora.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_producto_override on public.producto;
create trigger trg_producto_override
  before insert or update on public.producto
  for each row execute function app.enforce_override_candado();

-- ── Completitud (Adenda II §1): se calcula igual que la firma, en set_firma ──
-- 8 señales de igual peso. La identidad clínica (tener ≥1 principio) es una de
-- ellas. Se recalcula al cambiar el producto y al cambiar sus principios (el
-- trigger trg_ppa_firma ya "pokea" el producto).
create or replace function app.set_firma()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare v_señales int := 0; v_tiene_ppa boolean;
begin
  new.firma_equivalencia :=
    app.firma_de(new.id, new.forma_farmaceutica_id, new.via_administracion_id);
  new.firma_molecula :=
    app.molecula_de(new.id, new.forma_farmaceutica_id, new.via_administracion_id);

  v_tiene_ppa := exists (select 1 from public.producto_principio_activo where producto_id = new.id);
  v_señales := v_señales
    + (v_tiene_ppa)::int
    + (new.forma_farmaceutica_id is not null)::int
    + (new.via_administracion_id is not null)::int
    + (new.precio_venta is not null and new.precio_venta > 0)::int
    + (new.laboratorio_id is not null)::int
    + (new.presentacion_id is not null)::int
    + (coalesce(btrim(new.registro_sanitario), '') <> '' or new.fuera_de_registro)::int
    + (coalesce(btrim(new.codigo_barras), '') <> '')::int;
  new.completitud := round(100.0 * v_señales / 8.0);
  return new;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- 2) LOTE — la existencia física
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.lote (
  id                uuid primary key default gen_random_uuid(),
  producto_id       uuid not null references public.producto(id),
  sucursal_id       uuid not null default '00000000-0000-0000-0000-000000000001'
                      references public.sucursal(id),
  numero_lote       text,                                    -- puede venir vacío (Adenda II §1)
  fecha_vencimiento date,                                    -- nullable, se pide con insistencia
  cantidad_actual   numeric(14,3) not null default 0,        -- en UNIDAD BASE, siempre
  costo_unitario    numeric(14,2),                           -- costo de ESTE lote, no del producto
  proveedor_id      uuid,                                    -- sin FK hasta la Tanda 9
  fecha_recepcion   timestamptz not null default now(),
  ubicacion_fisica  text,                                    -- Pasillo / estante / gaveta
  estado            public.estado_lote not null default 'activo',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.lote is 'Existencia física por producto/sucursal. La existencia de un producto es la SUMA de sus lotes activos — nunca se guarda un stock en producto.';
create index if not exists idx_lote_producto on public.lote (producto_id);
create index if not exists idx_lote_sucursal on public.lote (sucursal_id);
create index if not exists idx_lote_estado   on public.lote (estado);
create index if not exists idx_lote_venc     on public.lote (fecha_vencimiento);
-- FEFO (T4): el lote que vence primero, entre los que tienen existencia.
create index if not exists idx_lote_fefo on public.lote (producto_id, fecha_vencimiento)
  where estado = 'activo' and cantidad_actual > 0;

drop trigger if exists trg_lote_updated_at on public.lote;
create trigger trg_lote_updated_at before update on public.lote
  for each row execute function app.set_updated_at();
drop trigger if exists trg_lote_audit on public.lote;
create trigger trg_lote_audit after insert or update or delete on public.lote
  for each row execute function app.audit();

-- ════════════════════════════════════════════════════════════════════
-- 3) MOVIMIENTO_INVENTARIO — libro append-only, INVIOLABLE
-- ════════════════════════════════════════════════════════════════════
-- Toda variación de existencia genera un movimiento. Nunca se edita ni se
-- borra: se emite uno contrario. El costo del momento se CONGELA aquí.
create table if not exists public.movimiento_inventario (
  id                     uuid primary key default gen_random_uuid(),
  lote_id                uuid references public.lote(id),
  producto_id            uuid not null references public.producto(id),
  sucursal_id            uuid not null default '00000000-0000-0000-0000-000000000001'
                           references public.sucursal(id),
  tipo                   public.tipo_movimiento not null,
  cantidad               numeric(14,3) not null,             -- positiva o negativa
  cantidad_resultante    numeric(14,3),                      -- saldo del lote tras el movimiento
  costo_unitario_momento numeric(14,2),                      -- costo congelado
  motivo                 text,
  motivo_tipificado      public.motivo_merma,                -- rotura/vencido/robo/… (§Innovación 4)
  empleado_id            uuid references public.profiles(id),
  referencia             text,                               -- venta, orden de compra, conteo
  ocurrido_en            timestamptz not null default now()
);
comment on table public.movimiento_inventario is 'Libro inviolable (§2.2) de toda variación de existencia. INSERT/SELECT únicamente; para corregir se emite un movimiento contrario.';
create index if not exists idx_mov_lote      on public.movimiento_inventario (lote_id);
create index if not exists idx_mov_producto  on public.movimiento_inventario (producto_id, ocurrido_en desc);
create index if not exists idx_mov_tipo      on public.movimiento_inventario (tipo);
create index if not exists idx_mov_referencia on public.movimiento_inventario (referencia);
drop trigger if exists trg_mov_inviolable on public.movimiento_inventario;
create trigger trg_mov_inviolable
  before update or delete on public.movimiento_inventario
  for each row execute function app.block_mutations();

-- ════════════════════════════════════════════════════════════════════
-- 4) HISTORIAL_COSTO — libro append-only del costo (Adenda I, Idea 4)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.historial_costo (
  id                   uuid primary key default gen_random_uuid(),
  producto_id          uuid not null references public.producto(id),
  proveedor_id         uuid,                                 -- sin FK hasta la Tanda 9
  lote_id              uuid references public.lote(id),
  costo                numeric(14,2) not null,
  variacion_porcentual numeric(7,2),                         -- contra el costo anterior
  fecha                timestamptz not null default now()
);
comment on table public.historial_costo is 'Libro inviolable del costo por lote/proveedor (Adenda I, Idea 4). Alimenta la alerta de deriva de costo (T3·P5).';
create index if not exists idx_histcosto_producto on public.historial_costo (producto_id, fecha desc);
drop trigger if exists trg_histcosto_inviolable on public.historial_costo;
create trigger trg_histcosto_inviolable
  before update or delete on public.historial_costo
  for each row execute function app.block_mutations();

-- ════════════════════════════════════════════════════════════════════
-- 5) CONTEO CÍCLICO y sus líneas (Adenda II §3)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.conteo_ciclico (
  id           uuid primary key default gen_random_uuid(),
  sucursal_id  uuid not null default '00000000-0000-0000-0000-000000000001'
                 references public.sucursal(id),
  empleado_id  uuid references public.profiles(id),
  fecha        timestamptz not null default now(),
  estado       text not null default 'planificado'
                 check (estado in ('planificado','en_proceso','cerrado')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.conteo_ciclico is 'Conteo cíclico programado (Adenda II §3): 10-15 productos al día, priorizados por valor × velocidad. Calibra la confianza sin cerrar la farmacia.';

create table if not exists public.conteo_ciclico_linea (
  id               uuid primary key default gen_random_uuid(),
  conteo_id        uuid not null references public.conteo_ciclico(id) on delete cascade,
  producto_id      uuid not null references public.producto(id),
  lote_id          uuid references public.lote(id),
  cantidad_sistema numeric(14,3),                            -- lo que decía el sistema
  cantidad_contada numeric(14,3),                            -- lo que se contó (nullable hasta contar)
  diferencia       numeric(14,3) generated always as (cantidad_contada - cantidad_sistema) stored,
  valor_diferencia numeric(14,2),                            -- en RD$
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.conteo_ciclico_linea is 'Línea de conteo. Conteo a ciegas: la app no muestra cantidad_sistema mientras se cuenta; se revela después (Adenda II §3).';
create index if not exists idx_conteo_linea_conteo   on public.conteo_ciclico_linea (conteo_id);
create index if not exists idx_conteo_linea_producto on public.conteo_ciclico_linea (producto_id);

do $$ declare t text; begin
  foreach t in array array['conteo_ciclico','conteo_ciclico_linea'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function app.set_updated_at();', t);
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════
-- 6) DISCREPANCIA_INVENTARIO — append-only (§Innovación 5)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.discrepancia_inventario (
  id               uuid primary key default gen_random_uuid(),
  producto_id      uuid not null references public.producto(id),
  lote_id          uuid references public.lote(id),
  conteo_id        uuid references public.conteo_ciclico(id),
  diferencia       numeric(14,3) not null,
  valor            numeric(14,2),                            -- en RD$
  causa_sugerida   text,                                     -- la propone el sistema
  causa_confirmada text,                                     -- la confirma el humano
  empleado_id      uuid references public.profiles(id),
  fecha            timestamptz not null default now()
);
comment on table public.discrepancia_inventario is 'Diferencia de conteo con su valor en RD$, permanente (append-only). El sistema sugiere la causa revisando los movimientos recientes (§Innovación 5).';
create index if not exists idx_discrepancia_producto on public.discrepancia_inventario (producto_id, fecha desc);
drop trigger if exists trg_discrepancia_inviolable on public.discrepancia_inventario;
create trigger trg_discrepancia_inviolable
  before update or delete on public.discrepancia_inventario
  for each row execute function app.block_mutations();

-- ════════════════════════════════════════════════════════════════════
-- 7) MEDICAMENTO_OFICIAL — catálogo DIGEMAPS de REFERENCIA (no inventario)
-- ════════════════════════════════════════════════════════════════════
-- Es un catálogo de referencia: un medicamento oficial NO es un producto de
-- Wilkins hasta que él lo agregue. Alimenta el buscador de autocompletado del
-- formulario. Identidad estable por registro_sanitario para que el semilla
-- grande (T3·P4) sea idempotente y no duplique (docs/PENDIENTES.md).
create table if not exists public.medicamento_oficial (
  id                  uuid primary key default gen_random_uuid(),
  registro_sanitario  text not null,                         -- identidad estable (DIGEMAPS)
  nombre_comercial    text not null,
  nombre_normalizado  text generated always as (app.slug(nombre_comercial)) stored,
  principio_activo    text,                                  -- texto de referencia (denormalizado)
  concentracion       text,
  forma_farmaceutica  text,
  via_administracion  text,
  laboratorio         text,
  requiere_receta     boolean,                               -- base regulatoria (lista de venta libre)
  clave_semilla       text,                                  -- estable para recarga del semilla
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.medicamento_oficial is 'Catálogo oficial DIGEMAPS de REFERENCIA (no inventario). Identidad estable por registro_sanitario para carga idempotente del semilla grande (T3·P4). Distinguible de lo que crea Wilkins.';
create unique index if not exists uq_medoficial_registro on public.medicamento_oficial (registro_sanitario);
create unique index if not exists uq_medoficial_semilla  on public.medicamento_oficial (clave_semilla);
create index if not exists idx_medoficial_trgm on public.medicamento_oficial
  using gin (nombre_normalizado extensions.gin_trgm_ops);
drop trigger if exists trg_medoficial_updated_at on public.medicamento_oficial;
create trigger trg_medoficial_updated_at before update on public.medicamento_oficial
  for each row execute function app.set_updated_at();
drop trigger if exists trg_medoficial_audit on public.medicamento_oficial;
create trigger trg_medoficial_audit after insert or update or delete on public.medicamento_oficial
  for each row execute function app.audit();

-- ════════════════════════════════════════════════════════════════════
-- 8) RLS + FORCE + políticas (regla #4, en esta misma migración)
-- ════════════════════════════════════════════════════════════════════
-- Roles (lib/roles.ts): gestionar_inventario = dueño/admin/farmacéutico ·
-- ver_operacion (leer inventario) = +cajero · ver_finanzas (costo) = dueño/admin.
-- El ocultamiento POR COLUMNA (costo al cajero en `lote`) es app-side: en
-- Supabase todos comparten el rol DB `authenticated`, así que RLS separa por
-- FILA (app.has_role) y la app selecciona solo las columnas permitidas por rol.

-- lote: leen los operativos (incl. cajero, para existencia y ubicación);
-- escriben los de inventario; no se borra por API (baja por estado).
alter table public.lote enable row level security;
alter table public.lote force row level security;
revoke all on public.lote from anon;
grant select, insert, update on public.lote to authenticated;
drop policy if exists lote_select on public.lote;
create policy lote_select on public.lote for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists lote_inv_insert on public.lote;
create policy lote_inv_insert on public.lote for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists lote_inv_update on public.lote;
create policy lote_inv_update on public.lote for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- movimiento_inventario: append-only. Leen dueño/admin/farmacéutico (trae
-- costo, fuera del cajero); insertan los de inventario; UPDATE/DELETE bloqueado
-- por trigger y sin grant.
alter table public.movimiento_inventario enable row level security;
alter table public.movimiento_inventario force row level security;
revoke all on public.movimiento_inventario from anon;
grant select, insert on public.movimiento_inventario to authenticated;
drop policy if exists mov_select on public.movimiento_inventario;
create policy mov_select on public.movimiento_inventario for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists mov_insert on public.movimiento_inventario;
create policy mov_insert on public.movimiento_inventario for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- historial_costo: financiero puro. Solo Dueño/Admin lee; insertan los de
-- inventario (al recibir mercancía). Append-only.
alter table public.historial_costo enable row level security;
alter table public.historial_costo force row level security;
revoke all on public.historial_costo from anon;
grant select, insert on public.historial_costo to authenticated;
drop policy if exists histcosto_select on public.historial_costo;
create policy histcosto_select on public.historial_costo for select to authenticated
  using ((select app.has_role('dueno','administrador')));
drop policy if exists histcosto_insert on public.historial_costo;
create policy histcosto_insert on public.historial_costo for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- conteo_ciclico y _linea: los de inventario gestionan; leen los mismos.
do $$ declare t text; begin
  foreach t in array array['conteo_ciclico','conteo_ciclico_linea'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$create policy %1$s_select on public.%1$s for select to authenticated using ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format($f$create policy %1$s_update on public.%1$s for update to authenticated using ((select app.has_role('dueno','administrador','farmaceutico'))) with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format($f$create policy %1$s_delete on public.%1$s for delete to authenticated using ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
  end loop;
end $$;

-- discrepancia_inventario: append-only, trae valor en RD$. Solo Dueño/Admin lee;
-- insertan los de inventario (al cerrar un conteo).
alter table public.discrepancia_inventario enable row level security;
alter table public.discrepancia_inventario force row level security;
revoke all on public.discrepancia_inventario from anon;
grant select, insert on public.discrepancia_inventario to authenticated;
drop policy if exists discrepancia_select on public.discrepancia_inventario;
create policy discrepancia_select on public.discrepancia_inventario for select to authenticated
  using ((select app.has_role('dueno','administrador')));
drop policy if exists discrepancia_insert on public.discrepancia_inventario;
create policy discrepancia_insert on public.discrepancia_inventario for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- medicamento_oficial: referencia. Todo autenticado la LEE (alimenta el buscador,
-- también en el POS); solo Dueño/Admin la mantiene (el semilla entra por migración).
alter table public.medicamento_oficial enable row level security;
alter table public.medicamento_oficial force row level security;
revoke all on public.medicamento_oficial from anon;
grant select, insert, update, delete on public.medicamento_oficial to authenticated;
drop policy if exists medoficial_select on public.medicamento_oficial;
create policy medoficial_select on public.medicamento_oficial for select to authenticated
  using (true);
drop policy if exists medoficial_admin_insert on public.medicamento_oficial;
create policy medoficial_admin_insert on public.medicamento_oficial for insert to authenticated
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists medoficial_admin_update on public.medicamento_oficial;
create policy medoficial_admin_update on public.medicamento_oficial for update to authenticated
  using ((select app.has_role('dueno','administrador')))
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists medoficial_admin_delete on public.medicamento_oficial;
create policy medoficial_admin_delete on public.medicamento_oficial for delete to authenticated
  using ((select app.has_role('dueno','administrador')));

-- Recalcula la completitud de los productos ya existentes (el default era 0).
update public.producto set updated_at = now();
