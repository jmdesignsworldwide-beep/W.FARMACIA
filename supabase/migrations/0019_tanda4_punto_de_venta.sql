-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0019 — Tanda 4 · Pieza 1: esquema del Punto de Venta
-- ADN JM NEXUS · la pantalla que decide si el sistema vive
-- ════════════════════════════════════════════════════════════════════
-- Solo ESQUEMA (Pieza 1). La plomería (FEFO, descuento de lote, movimiento
-- de venta, cobro, fraccionamiento) es la app (Piezas 2-5), sin PAT.
--
-- Claves de diseño (del prompt de la Tanda 4):
--   • cobro/pagador: una venta NO asume que el cliente pagó todo. El monto se
--     reparte entre uno o más pagadores. Eso hace que el FIADO funcione hoy y
--     la ARS entre después sin reconstruir el POS de una farmacia viva.
--   • venta_linea.costo_unitario_momento: costo CONGELADO → de ahí el margen real.
--   • monto_cubierto / monto_paciente: nullable desde hoy, listos para ARS mañana.
--   • lote_id en la línea: el lote específico despachado (FEFO, Tanda 3).
--   • Anulación con rastro: estado='anulada' + devolución al mismo lote (app);
--     nunca se borra una venta.
--   • cliente_id / caja_sesion_id / comprobante_id: huecos nullable SIN FK
--     (Tandas 5/6/7), como proveedor_id en lote.
-- ════════════════════════════════════════════════════════════════════

-- ── 0) Enums ────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname='estado_venta') then
    create type public.estado_venta as enum ('en_espera','completada','anulada');
  end if;
  if not exists (select 1 from pg_type where typname='metodo_cobro') then
    create type public.metodo_cobro as enum
      ('efectivo','transferencia','tarjeta_debito','tarjeta_credito','credito_interno');
  end if;
  if not exists (select 1 from pg_type where typname='tipo_pagador') then
    create type public.tipo_pagador as enum ('cliente','empresa','clinica','ars');
  end if;
end $$;

-- ── 1) PAGADOR — la abstracción que abre el fiado y (mañana) la ARS ──
create table if not exists public.pagador (
  id           uuid primary key default gen_random_uuid(),
  tipo         public.tipo_pagador not null default 'cliente',
  nombre       text not null,
  cliente_id   uuid,                              -- hueco Tanda 7 (sin FK aún)
  rnc          text,
  a_credito    boolean not null default false,    -- empresa/clínica que paga a crédito
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.pagador is 'Quién paga una venta. Por defecto el cliente mismo; puede ser empresa/clínica a crédito o (mañana) una ARS. La abstracción que permite el fiado hoy y la cobertura después sin reconstruir el POS.';

-- ── 2) VENTA — cabecera ─────────────────────────────────────────────
create table if not exists public.venta (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                   references public.sucursal(id),
  empleado_id    uuid references public.profiles(id),
  caja_sesion_id uuid,                            -- hueco Tanda 5 (sin FK aún)
  cliente_id     uuid,                            -- hueco Tanda 7 (nullable — la mayoría son anónimas)
  fecha          timestamptz not null default now(),
  subtotal       numeric(14,2) not null default 0,
  itbis          numeric(14,2) not null default 0,
  descuento      numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  estado         public.estado_venta not null default 'en_espera',
  anulada_motivo text,
  anulada_por    uuid references public.profiles(id),
  anulada_en     timestamptz,
  comprobante_id uuid,                            -- hueco Tanda 6 (sin FK aún)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.venta is 'Cabecera de venta. Una venta no se borra: la anulación deja rastro (estado=anulada + devolución al lote, por app). Los ceros son de arranque; el total real lo fija la app.';
create index if not exists idx_venta_sucursal_fecha on public.venta (sucursal_id, fecha desc);
create index if not exists idx_venta_empleado       on public.venta (empleado_id);
create index if not exists idx_venta_cliente        on public.venta (cliente_id);
create index if not exists idx_venta_estado         on public.venta (estado);

-- ── 3) VENTA_LINEA — el detalle (con costo congelado y huecos de cobertura) ──
create table if not exists public.venta_linea (
  id                     uuid primary key default gen_random_uuid(),
  venta_id               uuid not null references public.venta(id),
  producto_id            uuid not null references public.producto(id),
  lote_id                uuid references public.lote(id),   -- el lote despachado (FEFO)
  cantidad               numeric(14,3) not null check (cantidad > 0),
  es_fraccionada         boolean not null default false,
  precio_unitario        numeric(14,2) not null,
  descuento_linea        numeric(14,2) not null default 0,
  itbis_linea            numeric(14,2) not null default 0,
  costo_unitario_momento numeric(14,2),                      -- CONGELADO → margen real
  monto_cubierto         numeric(14,2),                      -- ARS (mañana) — nullable hoy
  monto_paciente         numeric(14,2),                      -- ARS (mañana) — nullable hoy
  created_at             timestamptz not null default now()
);
comment on table public.venta_linea is 'Detalle de venta. costo_unitario_momento congelado = margen real. monto_cubierto/monto_paciente nullable, listos para ARS sin abrir el POS. lote_id = el lote específico despachado por FEFO.';
create index if not exists idx_venta_linea_venta    on public.venta_linea (venta_id);
create index if not exists idx_venta_linea_producto on public.venta_linea (producto_id);
create index if not exists idx_venta_linea_lote     on public.venta_linea (lote_id);

-- ── 4) COBRO — el monto repartido entre pagadores (pago mixto, fiado, ARS) ──
create table if not exists public.cobro (
  id          uuid primary key default gen_random_uuid(),
  venta_id    uuid not null references public.venta(id),
  metodo      public.metodo_cobro not null,
  monto       numeric(14,2) not null,
  pagador_id  uuid references public.pagador(id),  -- nullable: efectivo anónimo no exige pagador
  referencia  text,                                -- # de transferencia / autorización de tarjeta
  created_at  timestamptz not null default now()
);
comment on table public.cobro is 'Cada porción del pago de una venta, con su método y su pagador. Pago mixto = varias filas. Fiado = pagador a_credito. ARS (mañana) = pagador tipo ars.';
create index if not exists idx_cobro_venta   on public.cobro (venta_id);
create index if not exists idx_cobro_pagador on public.cobro (pagador_id);

-- ── 5) VENTA_EN_ESPERA — carritos aparcados (F8), el mostrador real ──
create table if not exists public.venta_en_espera (
  id           uuid primary key default gen_random_uuid(),
  sucursal_id  uuid not null default '00000000-0000-0000-0000-000000000001'
                 references public.sucursal(id),
  empleado_id  uuid references public.profiles(id),
  etiqueta     text,                              -- nombre o referencia del carrito
  carrito      jsonb not null default '[]'::jsonb, -- líneas en curso (aún no es venta)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.venta_en_espera is 'Carrito aparcado (F8): varios vivos a la vez, con etiqueta. No es una venta hasta que se cobra; el carrito vive como jsonb para no ensuciar venta/venta_linea.';
create index if not exists idx_espera_sucursal on public.venta_en_espera (sucursal_id, empleado_id);

-- ── 6) Triggers: updated_at + auditoría ─────────────────────────────
do $$ declare t text; begin
  foreach t in array array['pagador','venta','venta_linea','cobro','venta_en_espera'] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    -- venta_linea y cobro no tienen updated_at (append-only en la práctica); se saltan
    if t in ('pagador','venta','venta_en_espera') then
      execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function app.set_updated_at();', t);
    end if;
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

-- ── 7) RLS + FORCE + políticas ──────────────────────────────────────
-- El POS lo usa el CAJERO. Vende (venta/venta_linea/cobro/espera) todo el
-- operativo incl. cajero. El costo (venta_linea.costo_unitario_momento) se
-- oculta al cajero por SELECCIÓN de columnas en la app (RLS es por fila).
-- Nada se borra por API (la anulación deja rastro).

-- pagador: lo gestionan los operativos; lo leen todos los que venden.
alter table public.pagador enable row level security;
alter table public.pagador force row level security;
revoke all on public.pagador from anon;
grant select, insert, update on public.pagador to authenticated;
drop policy if exists pagador_select on public.pagador;
create policy pagador_select on public.pagador for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists pagador_write on public.pagador;
create policy pagador_write on public.pagador for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists pagador_update on public.pagador;
create policy pagador_update on public.pagador for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- venta / venta_linea / cobro / venta_en_espera: vende el operativo (incl. cajero).
do $$ declare t text; begin
  foreach t in array array['venta','venta_linea','cobro','venta_en_espera'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    -- sin DELETE: nada se borra por API
    execute format('grant select, insert, update on public.%I to authenticated;', t);
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$create policy %1$s_select on public.%1$s for select to authenticated using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format($f$create policy %1$s_update on public.%1$s for update to authenticated using ((select app.has_role('dueno','administrador','farmaceutico','cajero'))) with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
  end loop;
end $$;
