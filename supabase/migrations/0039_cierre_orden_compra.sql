-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0039 — CIERRE §3.2 · Orden de compra
-- ADN JM NEXUS · de la alerta de stock bajo al WhatsApp del suplidor, en dos clics
-- ════════════════════════════════════════════════════════════════════
-- La orden nace de la alerta de reabastecimiento, agrupada por proveedor. Su
-- fecha_envio es de donde sale "cuánto tardó en llegar" (ficha de cumplimiento).
-- El mínimo por producto vive en producto.punto_reorden_manual (ya existe desde 0014).
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='estado_orden_compra') then
    create type public.estado_orden_compra as enum ('borrador','enviada','recibida_parcial','recibida','cancelada');
  end if;
end $$;

create table if not exists public.orden_compra (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  proveedor_id   uuid references public.proveedor(id),
  estado         public.estado_orden_compra not null default 'borrador',
  fecha_envio    timestamptz,                 -- de aquí sale "cuánto tardó"
  nota           text,
  creado_por     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.orden_compra is 'Orden de compra a un proveedor. fecha_envio alimenta los días reales de entrega (ficha de cumplimiento).';
create index if not exists idx_orden_compra_estado on public.orden_compra (estado, created_at desc);
create index if not exists idx_orden_compra_prov on public.orden_compra (proveedor_id, created_at desc);

create table if not exists public.orden_compra_linea (
  id                uuid primary key default gen_random_uuid(),
  orden_id          uuid not null references public.orden_compra(id),
  producto_id       uuid not null references public.producto(id),
  cantidad_pedida   numeric(14,3) not null check (cantidad_pedida > 0),
  precio_esperado   numeric(14,2),
  created_at        timestamptz not null default now()
);
comment on table public.orden_compra_linea is 'Renglón de una orden de compra: cantidad pedida y precio esperado (último de ese proveedor).';
create index if not exists idx_orden_linea on public.orden_compra_linea (orden_id);

-- Triggers
drop trigger if exists trg_orden_compra_updated_at on public.orden_compra;
create trigger trg_orden_compra_updated_at before update on public.orden_compra for each row execute function app.set_updated_at();
drop trigger if exists trg_orden_compra_audit on public.orden_compra;
create trigger trg_orden_compra_audit after insert or update or delete on public.orden_compra for each row execute function app.audit();
drop trigger if exists trg_orden_linea_audit on public.orden_compra_linea;
create trigger trg_orden_linea_audit after insert or update or delete on public.orden_compra_linea for each row execute function app.audit();

-- RLS + FORCE: gestiona el inventario (Dueño/Admin/Farmacéutico).
alter table public.orden_compra enable row level security;
alter table public.orden_compra force row level security;
revoke all on public.orden_compra from anon;
grant select, insert, update on public.orden_compra to authenticated;
drop policy if exists orden_compra_select on public.orden_compra;
create policy orden_compra_select on public.orden_compra for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists orden_compra_insert on public.orden_compra;
create policy orden_compra_insert on public.orden_compra for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists orden_compra_update on public.orden_compra;
create policy orden_compra_update on public.orden_compra for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

alter table public.orden_compra_linea enable row level security;
alter table public.orden_compra_linea force row level security;
revoke all on public.orden_compra_linea from anon;
grant select, insert on public.orden_compra_linea to authenticated;
drop policy if exists orden_linea_select on public.orden_compra_linea;
create policy orden_linea_select on public.orden_compra_linea for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists orden_linea_insert on public.orden_compra_linea;
create policy orden_linea_insert on public.orden_compra_linea for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
