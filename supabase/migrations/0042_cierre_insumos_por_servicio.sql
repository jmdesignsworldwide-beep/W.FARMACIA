-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0042 — CIERRE §5 · Insumos por tipo de servicio
-- ADN JM NEXUS · una inyección gasta jeringa + algodón + alcohol; el conteo debe cuadrar
-- ════════════════════════════════════════════════════════════════════
-- Sin esto, cada servicio prestado deja el inventario descuadrado y el conteo cíclico
-- marca discrepancia todos los meses — matando la confianza que ese módulo construyó.
-- Aquí se define QUÉ insumos gasta cada tipo de servicio; el descuento (movimiento
-- 'ajuste' por FEFO) lo hace la app al registrar el servicio.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.servicio_insumo (
  id             uuid primary key default gen_random_uuid(),
  servicio_tipo  public.tipo_servicio not null,
  producto_id    uuid not null references public.producto(id),
  cantidad       numeric(14,3) not null check (cantidad > 0),
  created_at     timestamptz not null default now(),
  unique (servicio_tipo, producto_id)
);
comment on table public.servicio_insumo is 'Qué insumos (y cuántos) consume cada tipo de servicio. La app los descuenta del inventario por FEFO al registrar el servicio, para que el conteo cíclico cuadre.';
create index if not exists idx_servicio_insumo_tipo on public.servicio_insumo (servicio_tipo);

drop trigger if exists trg_servicio_insumo_audit on public.servicio_insumo;
create trigger trg_servicio_insumo_audit after insert or update or delete on public.servicio_insumo for each row execute function app.audit();

-- RLS + FORCE: lo configura quien gestiona inventario; lo LEE el operativo (para descontar).
alter table public.servicio_insumo enable row level security;
alter table public.servicio_insumo force row level security;
revoke all on public.servicio_insumo from anon;
grant select, insert, delete on public.servicio_insumo to authenticated;
drop policy if exists servicio_insumo_select on public.servicio_insumo;
create policy servicio_insumo_select on public.servicio_insumo for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists servicio_insumo_insert on public.servicio_insumo;
create policy servicio_insumo_insert on public.servicio_insumo for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists servicio_insumo_delete on public.servicio_insumo;
create policy servicio_insumo_delete on public.servicio_insumo for delete to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
