-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0024 — Tanda 7 · Clientes y alergias (núcleo)
-- ADN JM NEXUS · el expediente y la ALERTA CRUZADA que ninguna farmacia tiene
-- ════════════════════════════════════════════════════════════════════
-- Claves de diseño (del prompt de la Tanda 7 y Adenda IV §2):
--   • cliente: la mayoría de ventas son anónimas. El cliente se identifica por
--     TELÉFONO (lo único que todo el mundo se sabe). fecha_nacimiento habilita el
--     descuento de ley. Nunca se traba una venta pidiendo datos.
--   • cliente_alergia: alergia a un principio o a una FAMILIA. La alerta compara
--     la FAMILIA, no la molécula: alérgico a Amoxicilina → Ampicilina interrumpe
--     (misma familia Penicilinas).
--   • alerta_alergia_evento: registro INVIOLABLE de quién vio la alerta, qué
--     decidió y por qué. La decisión es del que tiene la licencia.
-- Crónicos y servicios de farmacia son piezas siguientes de la Tanda 7.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='decision_alergia') then
    create type public.decision_alergia as enum ('no_despachado','despachado_con_confirmacion');
  end if;
end $$;

-- ── 1) CLIENTE — expediente ligero, identificado por teléfono ───────
create table if not exists public.cliente (
  id                  uuid primary key default gen_random_uuid(),
  sucursal_id         uuid not null default '00000000-0000-0000-0000-000000000001'
                        references public.sucursal(id),
  nombre              text not null,
  telefono            text,
  cedula              text,
  fecha_nacimiento    date,                 -- habilita el descuento de ley (352-98)
  direccion           text,
  referencia_direccion text,                -- "la casa amarilla al lado del colmado"
  notas               text,
  eliminado_en        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.cliente is 'Expediente de cliente. La mayoría de ventas son anónimas; el cliente se identifica por teléfono cuando importa (crónico, fiado, delivery, descuento de ley). fecha_nacimiento habilita el descuento de ley.';
create index if not exists idx_cliente_telefono on public.cliente (telefono) where eliminado_en is null;
create index if not exists idx_cliente_cedula   on public.cliente (cedula)   where eliminado_en is null;

-- ── 2) CLIENTE_ALERGIA — a un principio o a una familia entera ──────
create table if not exists public.cliente_alergia (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references public.cliente(id),
  principio_activo_id   uuid references public.principio_activo(id),
  familia_alergenica_id uuid references public.familia_alergenica(id),
  nota                  text,
  registrado_por        uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  -- al menos uno de los dos: principio o familia
  check (principio_activo_id is not null or familia_alergenica_id is not null)
);
comment on table public.cliente_alergia is 'Alergia del paciente: a un principio activo específico o a una familia entera. La alerta cruzada compara la familia.';
create index if not exists idx_cliente_alergia_cliente on public.cliente_alergia (cliente_id);

-- ── 3) ALERTA_ALERGIA_EVENTO — decisión registrada, INVIOLABLE ──────
create table if not exists public.alerta_alergia_evento (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references public.cliente(id),
  producto_id           uuid references public.producto(id),
  familia_alergenica_id uuid references public.familia_alergenica(id),
  decision              public.decision_alergia not null,
  motivo                text,
  decidido_por          uuid references public.profiles(id),
  created_at            timestamptz not null default now()
);
comment on table public.alerta_alergia_evento is 'Registro inviolable de cada alerta cruzada mostrada: quién la vio, qué decidió y por qué. No se edita ni se borra.';
create index if not exists idx_alerta_evento_cliente on public.alerta_alergia_evento (cliente_id);

-- ── 4) Triggers ─────────────────────────────────────────────────────
drop trigger if exists trg_cliente_updated_at on public.cliente;
create trigger trg_cliente_updated_at before update on public.cliente
  for each row execute function app.set_updated_at();

do $$ declare t text; begin
  foreach t in array array['cliente','cliente_alergia','alerta_alergia_evento'] loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

drop trigger if exists trg_alerta_evento_inviolable on public.alerta_alergia_evento;
create trigger trg_alerta_evento_inviolable before update or delete on public.alerta_alergia_evento
  for each row execute function app.block_mutations();

-- ── 5) RLS + FORCE + políticas ──────────────────────────────────────
-- cliente: lo gestiona el operativo (el cajero identifica en el POS). Sin delete
-- por API (soft-delete). cliente_alergia: dato clínico → lo escribe farmacéutico+.
-- alerta_alergia_evento: append-only, lo escribe quien despacha.
alter table public.cliente enable row level security;
alter table public.cliente force row level security;
revoke all on public.cliente from anon;
grant select, insert, update on public.cliente to authenticated;
drop policy if exists cliente_select on public.cliente;
create policy cliente_select on public.cliente for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists cliente_insert on public.cliente;
create policy cliente_insert on public.cliente for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists cliente_update on public.cliente;
create policy cliente_update on public.cliente for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')))
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));

alter table public.cliente_alergia enable row level security;
alter table public.cliente_alergia force row level security;
revoke all on public.cliente_alergia from anon;
grant select, insert, update on public.cliente_alergia to authenticated;
drop policy if exists cliente_alergia_select on public.cliente_alergia;
create policy cliente_alergia_select on public.cliente_alergia for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists cliente_alergia_write on public.cliente_alergia;
create policy cliente_alergia_write on public.cliente_alergia for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists cliente_alergia_update on public.cliente_alergia;
create policy cliente_alergia_update on public.cliente_alergia for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

alter table public.alerta_alergia_evento enable row level security;
alter table public.alerta_alergia_evento force row level security;
revoke all on public.alerta_alergia_evento from anon;
grant select, insert on public.alerta_alergia_evento to authenticated;
drop policy if exists alerta_evento_select on public.alerta_alergia_evento;
create policy alerta_evento_select on public.alerta_alergia_evento for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists alerta_evento_insert on public.alerta_alergia_evento;
create policy alerta_evento_insert on public.alerta_alergia_evento for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
