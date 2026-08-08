-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0034 — Tanda 11 · Encargos
-- ADN JM NEXUS · "no lo tengo, pero te lo consigo mañana" — el dinero que camina
-- ════════════════════════════════════════════════════════════════════
-- Pasa cien veces al mes, se anota en un papel, y la mitad de las veces el cliente
-- nunca se entera de que llegó. Aquí se registra, se convierte en demanda, y el
-- sistema avisa (WhatsApp de un clic) cuando el producto entra. El reporte de
-- encargos no atendidos = ventas perdidas medibles.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='estado_encargo') then
    create type public.estado_encargo as enum ('pendiente','pedido','llego','entregado','no_volvio');
  end if;
end $$;

create table if not exists public.encargo (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  producto_id    uuid references public.producto(id),      -- si está en catálogo
  producto_texto text,                                     -- si aún no lo está
  cliente_id     uuid references public.cliente(id),
  cliente_nombre text,
  telefono       text,
  cantidad       numeric(14,3),
  estado         public.estado_encargo not null default 'pendiente',
  nota           text,
  registrado_por uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (producto_id is not null or (producto_texto is not null and length(btrim(producto_texto)) > 0))
);
comment on table public.encargo is 'Encargo de un cliente ("te lo consigo"). Estado pendiente->pedido->llego->entregado / no_volvio. Alimenta la demanda y el reporte de ventas perdidas.';
create index if not exists idx_encargo_estado on public.encargo (estado, created_at desc);
create index if not exists idx_encargo_producto on public.encargo (producto_id);

drop trigger if exists trg_encargo_updated_at on public.encargo;
create trigger trg_encargo_updated_at before update on public.encargo
  for each row execute function app.set_updated_at();
drop trigger if exists trg_encargo_audit on public.encargo;
create trigger trg_encargo_audit after insert or update or delete on public.encargo
  for each row execute function app.audit();

alter table public.encargo enable row level security;
alter table public.encargo force row level security;
revoke all on public.encargo from anon;
grant select, insert, update on public.encargo to authenticated;
drop policy if exists encargo_select on public.encargo;
create policy encargo_select on public.encargo for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists encargo_insert on public.encargo;
create policy encargo_insert on public.encargo for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists encargo_update on public.encargo;
create policy encargo_update on public.encargo for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')))
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
