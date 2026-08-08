-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0036 — Tanda 15 · Fiado y cuentas por cobrar/pagar
-- ADN JM NEXUS · el fiado del barrio es real; y su espejo, lo que se le debe al lab
-- ════════════════════════════════════════════════════════════════════
-- El fiado usa el modelo de pagador que ya existe: una venta a crédito genera un
-- cobro metodo='credito_interno' con su pagador. El saldo = cobros a crédito −
-- abonos. Cuentas por pagar es el espejo, y alimenta el pronóstico de flujo de caja.
-- ════════════════════════════════════════════════════════════════════

alter table public.pagador add column if not exists limite_credito numeric(14,2);
alter table public.pagador add column if not exists telefono text;
comment on column public.pagador.limite_credito is 'Límite de crédito del pagador (fiado). La app avisa al acercarse.';

create table if not exists public.abono (
  id             uuid primary key default gen_random_uuid(),
  pagador_id     uuid not null references public.pagador(id),
  monto          numeric(14,2) not null check (monto > 0),
  fecha          date not null default current_date,
  metodo         public.metodo_cobro not null default 'efectivo',
  nota           text,
  registrado_por uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
comment on table public.abono is 'Abono (pago parcial) de un pagador contra su saldo de fiado. Append-only en la práctica.';
create index if not exists idx_abono_pagador on public.abono (pagador_id, fecha desc);

do $$ begin
  if not exists (select 1 from pg_type where typname='estado_cxp') then
    create type public.estado_cxp as enum ('pendiente','pagada');
  end if;
end $$;

create table if not exists public.cuenta_por_pagar (
  id               uuid primary key default gen_random_uuid(),
  sucursal_id      uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  proveedor_id     uuid references public.proveedor(id),
  recepcion_id     uuid references public.recepcion(id),
  monto            numeric(14,2) not null check (monto > 0),
  fecha_emision    date not null default current_date,
  fecha_vencimiento date,
  estado           public.estado_cxp not null default 'pendiente',
  nota             text,
  registrado_por   uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.cuenta_por_pagar is 'Lo que la farmacia le debe a cada proveedor, con fecha. Alimenta el pronóstico de flujo de caja.';
create index if not exists idx_cxp_estado on public.cuenta_por_pagar (estado, fecha_vencimiento);

-- Triggers
drop trigger if exists trg_abono_audit on public.abono;
create trigger trg_abono_audit after insert or update or delete on public.abono for each row execute function app.audit();
drop trigger if exists trg_cxp_updated_at on public.cuenta_por_pagar;
create trigger trg_cxp_updated_at before update on public.cuenta_por_pagar for each row execute function app.set_updated_at();
drop trigger if exists trg_cxp_audit on public.cuenta_por_pagar;
create trigger trg_cxp_audit after insert or update or delete on public.cuenta_por_pagar for each row execute function app.audit();

-- RLS + FORCE
alter table public.abono enable row level security;
alter table public.abono force row level security;
revoke all on public.abono from anon;
grant select, insert on public.abono to authenticated;
drop policy if exists abono_select on public.abono;
create policy abono_select on public.abono for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists abono_insert on public.abono;
create policy abono_insert on public.abono for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));

alter table public.cuenta_por_pagar enable row level security;
alter table public.cuenta_por_pagar force row level security;
revoke all on public.cuenta_por_pagar from anon;
grant select, insert, update on public.cuenta_por_pagar to authenticated;
drop policy if exists cxp_select on public.cuenta_por_pagar;
create policy cxp_select on public.cuenta_por_pagar for select to authenticated
  using ((select app.has_role('dueno','administrador')));
drop policy if exists cxp_write on public.cuenta_por_pagar;
create policy cxp_write on public.cuenta_por_pagar for insert to authenticated
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists cxp_update on public.cuenta_por_pagar;
create policy cxp_update on public.cuenta_por_pagar for update to authenticated
  using ((select app.has_role('dueno','administrador')))
  with check ((select app.has_role('dueno','administrador')));
