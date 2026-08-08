-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0027 — Tanda 7 · Servicios de farmacia
-- ADN JM NEXUS · inyectar, tomar presión, medir glucosa — nadie lo digitaliza
-- ════════════════════════════════════════════════════════════════════
-- Es ingreso real y la puerta de entrada del paciente crónico. El servicio
-- descuenta insumos del inventario (jeringa, algodón, tiras) — eso lo hace la
-- app por FEFO. La medición (presión/glucosa) vive en resultado (jsonb) para el
-- historial del paciente.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='tipo_servicio') then
    create type public.tipo_servicio as enum ('inyeccion','presion_arterial','glucometria','curacion','otro');
  end if;
end $$;

create table if not exists public.servicio (
  id                 uuid primary key default gen_random_uuid(),
  sucursal_id        uuid not null default '00000000-0000-0000-0000-000000000001'
                       references public.sucursal(id),
  tipo               public.tipo_servicio not null,
  cliente_id         uuid references public.cliente(id),          -- opcional: puede ser anónimo
  empleado_id        uuid references public.profiles(id),
  insumo_producto_id uuid references public.producto(id),         -- insumo descontado (opcional)
  insumo_lote_id     uuid references public.lote(id),
  cantidad_insumo    numeric(14,3),
  valor              numeric(14,2) not null default 0,            -- lo cobrado
  resultado          jsonb not null default '{}'::jsonb,          -- {sistolica,diastolica} · {glucosa}
  nota               text,
  caja_sesion_id     uuid references public.caja_sesion(id),      -- entra a la caja del día
  created_at         timestamptz not null default now()
);
comment on table public.servicio is 'Servicio de farmacia (inyección, presión, glucosa, curación). Descuenta insumos por FEFO (app). resultado guarda la medición para el historial del paciente. valor cobrado entra a la caja del día.';
create index if not exists idx_servicio_cliente on public.servicio (cliente_id, created_at desc);
create index if not exists idx_servicio_tipo on public.servicio (tipo, created_at desc);

drop trigger if exists trg_servicio_audit on public.servicio;
create trigger trg_servicio_audit after insert or update or delete on public.servicio
  for each row execute function app.audit();

-- RLS + FORCE: lo registra y lee el operativo (incl. cajero); sin delete por API.
alter table public.servicio enable row level security;
alter table public.servicio force row level security;
revoke all on public.servicio from anon;
grant select, insert, update on public.servicio to authenticated;
drop policy if exists servicio_select on public.servicio;
create policy servicio_select on public.servicio for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists servicio_insert on public.servicio;
create policy servicio_insert on public.servicio for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists servicio_update on public.servicio;
create policy servicio_update on public.servicio for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
