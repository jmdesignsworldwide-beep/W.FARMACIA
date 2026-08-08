-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0032 — Tanda 9 · Préstamos entre farmacias
-- ADN JM NEXUS · la farmacia de la esquina presta mercancía, y se olvida
-- ════════════════════════════════════════════════════════════════════
-- Registro de préstamo dado o recibido: qué, cuánto, a/de quién, cuándo. Estado
-- pendiente/devuelto. Ajusta el inventario correctamente (movimiento transferencia,
-- NO venta ni merma). Alerta de préstamo viejo sin devolver (app).
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='tipo_prestamo') then
    create type public.tipo_prestamo as enum ('dado','recibido');
  end if;
  if not exists (select 1 from pg_type where typname='estado_prestamo') then
    create type public.estado_prestamo as enum ('pendiente','devuelto');
  end if;
end $$;

create table if not exists public.prestamo (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  tipo          public.tipo_prestamo not null,
  producto_id   uuid not null references public.producto(id),
  cantidad      numeric(14,3) not null check (cantidad > 0),
  contraparte   text not null,                       -- la otra farmacia
  estado        public.estado_prestamo not null default 'pendiente',
  lote_id       uuid references public.lote(id),     -- lote afectado (para revertir al devolver)
  fecha         date not null default current_date,
  fecha_devolucion date,
  nota          text,
  registrado_por uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.prestamo is 'Préstamo de mercancía dado o recibido entre farmacias. Ajusta inventario con movimiento transferencia (no venta ni merma). La app avisa de préstamos viejos sin devolver.';
create index if not exists idx_prestamo_estado on public.prestamo (estado, fecha);

drop trigger if exists trg_prestamo_updated_at on public.prestamo;
create trigger trg_prestamo_updated_at before update on public.prestamo
  for each row execute function app.set_updated_at();
drop trigger if exists trg_prestamo_audit on public.prestamo;
create trigger trg_prestamo_audit after insert or update or delete on public.prestamo
  for each row execute function app.audit();

alter table public.prestamo enable row level security;
alter table public.prestamo force row level security;
revoke all on public.prestamo from anon;
grant select, insert, update on public.prestamo to authenticated;
drop policy if exists prestamo_select on public.prestamo;
create policy prestamo_select on public.prestamo for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists prestamo_insert on public.prestamo;
create policy prestamo_insert on public.prestamo for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists prestamo_update on public.prestamo;
create policy prestamo_update on public.prestamo for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
