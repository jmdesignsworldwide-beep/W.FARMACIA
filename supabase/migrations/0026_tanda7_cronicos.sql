-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0026 — Tanda 7 · Tratamientos crónicos
-- ADN JM NEXUS · la farmacia como negocio de suscripción
-- ════════════════════════════════════════════════════════════════════
-- Los crónicos son 40-60% de la facturación: cada uno es un evento recurrente
-- con fecha. Se detectan solos (3 compras del mismo principio) → el sistema
-- PROPONE, el farmacéutico confirma con un clic. Estado: al día / por vencer /
-- atrasado / abandonado (los tres primeros se computan de proxima_fecha; el
-- último es una bandera). WhatsApp de un clic lo hace la app.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='cronico_estado') then
    create type public.cronico_estado as enum ('activo','abandonado');
  end if;
end $$;

create table if not exists public.tratamiento_cronico (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.cliente(id),
  principio_activo_id uuid not null references public.principio_activo(id),
  producto_id         uuid references public.producto(id),   -- la marca habitual (opcional)
  ciclo_dias          integer not null default 30 check (ciclo_dias > 0),
  ultima_compra       date,
  proxima_fecha       date,
  estado              public.cronico_estado not null default 'activo',
  confirmado_por      uuid references public.profiles(id),
  confirmado_en       timestamptz,
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (cliente_id, principio_activo_id)
);
comment on table public.tratamiento_cronico is 'Tratamiento crónico de un paciente (un principio recurrente). Se detecta solo (3+ compras) y lo confirma el farmacéutico. proxima_fecha da al día/por vencer/atrasado; abandonado es bandera.';
create index if not exists idx_cronico_cliente on public.tratamiento_cronico (cliente_id);
create index if not exists idx_cronico_proxima on public.tratamiento_cronico (proxima_fecha) where estado = 'activo';

-- Detección automática: clientes con 3+ compras del mismo principio, aún no marcados.
create or replace function public.candidatos_cronicos()
returns table (
  cliente_id uuid, cliente_nombre text, principio_activo_id uuid, principio_nombre text,
  compras bigint, primera date, ultima date, intervalo_promedio numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.cliente_id, cl.nombre, pa.id, pa.nombre,
         count(distinct v.id) as compras,
         min(v.fecha)::date as primera,
         max(v.fecha)::date as ultima,
         case when count(distinct v.id) > 1
              then round((max(v.fecha)::date - min(v.fecha)::date)::numeric / (count(distinct v.id) - 1))
              else null end as intervalo_promedio
  from public.venta v
  join public.venta_linea vl on vl.venta_id = v.id
  join public.producto_principio_activo ppa on ppa.producto_id = vl.producto_id
  join public.principio_activo pa on pa.id = ppa.principio_activo_id
  join public.cliente cl on cl.id = v.cliente_id
  where v.cliente_id is not null and v.estado = 'completada'
  group by v.cliente_id, cl.nombre, pa.id, pa.nombre
  having count(distinct v.id) >= 3
     and not exists (
       select 1 from public.tratamiento_cronico tc
       where tc.cliente_id = v.cliente_id and tc.principio_activo_id = pa.id
     );
$$;
revoke all on function public.candidatos_cronicos() from public, anon;
grant execute on function public.candidatos_cronicos() to authenticated;

-- Triggers
drop trigger if exists trg_cronico_updated_at on public.tratamiento_cronico;
create trigger trg_cronico_updated_at before update on public.tratamiento_cronico
  for each row execute function app.set_updated_at();
drop trigger if exists trg_cronico_audit on public.tratamiento_cronico;
create trigger trg_cronico_audit after insert or update or delete on public.tratamiento_cronico
  for each row execute function app.audit();

-- RLS + FORCE: lo lee el operativo (el POS muestra el estado); lo confirma/edita farmacéutico+.
alter table public.tratamiento_cronico enable row level security;
alter table public.tratamiento_cronico force row level security;
revoke all on public.tratamiento_cronico from anon;
grant select, insert, update on public.tratamiento_cronico to authenticated;
drop policy if exists cronico_select on public.tratamiento_cronico;
create policy cronico_select on public.tratamiento_cronico for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists cronico_write on public.tratamiento_cronico;
create policy cronico_write on public.tratamiento_cronico for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists cronico_update on public.tratamiento_cronico;
create policy cronico_update on public.tratamiento_cronico for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
