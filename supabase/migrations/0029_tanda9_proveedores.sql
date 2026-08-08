-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0029 — Tanda 9 · Proveedores (expediente vivo)
-- ADN JM NEXUS · laboratorio ≠ droguería, y la política de devolución que hace
-- posible el radar de vencimientos
-- ════════════════════════════════════════════════════════════════════
-- Claves (prompt Tanda 9 + Adenda I Idea 2):
--   • Distinción laboratorio (fabrica) ≠ droguería (vende): la misma marca por
--     varias droguerías a precios distintos → de ahí sale el comparador.
--   • Política de devolución en el PROVEEDOR: acepta_devoluciones,
--     dias_minimos_vida_util_devolucion, condiciones, porcentaje_recuperacion.
--     Sin esto el radar de vencimientos (Tanda 10) no puede existir.
-- Recepción, cadena de frío, préstamos y visitadores son piezas siguientes.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='tipo_proveedor') then
    create type public.tipo_proveedor as enum ('laboratorio','drogueria','ambos');
  end if;
end $$;

create table if not exists public.proveedor (
  id                              uuid primary key default gen_random_uuid(),
  sucursal_id                     uuid not null default '00000000-0000-0000-0000-000000000001'
                                    references public.sucursal(id),
  nombre                          text not null,
  tipo                            public.tipo_proveedor not null default 'drogueria',
  contacto_nombre                 text,
  telefono                        text,
  email                           text,
  rnc                             text,
  condiciones_pago                text,
  dias_entrega                    integer,                       -- tiempo prometido (reorden)
  -- Política de devolución (Adenda I, Idea 2)
  acepta_devoluciones             boolean not null default false,
  dias_minimos_vida_util_devolucion integer,                     -- vida útil mínima para devolver
  condiciones_devolucion          text,
  porcentaje_recuperacion         numeric(5,2),                  -- % que reintegra
  activo                          boolean not null default true,
  eliminado_en                    timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);
comment on table public.proveedor is 'Proveedor: laboratorio (fabrica) o droguería (vende). La política de devolución vive aquí y alimenta el radar de vencimientos (Tanda 10).';
create index if not exists idx_proveedor_nombre on public.proveedor (nombre) where eliminado_en is null;
create index if not exists idx_proveedor_tipo on public.proveedor (tipo) where eliminado_en is null;

drop trigger if exists trg_proveedor_updated_at on public.proveedor;
create trigger trg_proveedor_updated_at before update on public.proveedor
  for each row execute function app.set_updated_at();
drop trigger if exists trg_proveedor_audit on public.proveedor;
create trigger trg_proveedor_audit after insert or update or delete on public.proveedor
  for each row execute function app.audit();

-- RLS + FORCE: lo gestiona quien tiene gestionar_proveedores (Dueño/Admin); lo
-- leen los operativos (recepción, compras). Sin delete por API (soft-delete).
alter table public.proveedor enable row level security;
alter table public.proveedor force row level security;
revoke all on public.proveedor from anon;
grant select, insert, update on public.proveedor to authenticated;
drop policy if exists proveedor_select on public.proveedor;
create policy proveedor_select on public.proveedor for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists proveedor_insert on public.proveedor;
create policy proveedor_insert on public.proveedor for insert to authenticated
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists proveedor_update on public.proveedor;
create policy proveedor_update on public.proveedor for update to authenticated
  using ((select app.has_role('dueno','administrador')))
  with check ((select app.has_role('dueno','administrador')));
