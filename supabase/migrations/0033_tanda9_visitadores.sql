-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0033 — Tanda 9 · Visitadores médicos y muestras
-- ADN JM NEXUS · el visitador deja muestras y toma pedidos
-- ════════════════════════════════════════════════════════════════════
-- Muestras médicas entran al inventario MARCADAS como muestra, NO se venden, y se
-- descuentan cuando se entregan. lote.es_muestra las distingue; el FEFO del cobro
-- las excluye (parche en la app).
-- ════════════════════════════════════════════════════════════════════

alter table public.lote add column if not exists es_muestra boolean not null default false;
comment on column public.lote.es_muestra is 'Lote de muestra médica: entra al inventario pero NO se vende (el cobro lo excluye del FEFO).';
create index if not exists idx_lote_muestra on public.lote (es_muestra) where es_muestra;

create table if not exists public.visita_medica (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  laboratorio    text not null,
  visitador      text,
  fecha          date not null default current_date,
  notas          text,
  registrado_por uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
comment on table public.visita_medica is 'Visita de un visitador médico: laboratorio, visitador, fecha. Las muestras que deja entran como lotes es_muestra.';
create index if not exists idx_visita_fecha on public.visita_medica (sucursal_id, fecha desc);

drop trigger if exists trg_visita_audit on public.visita_medica;
create trigger trg_visita_audit after insert or update or delete on public.visita_medica
  for each row execute function app.audit();

alter table public.visita_medica enable row level security;
alter table public.visita_medica force row level security;
revoke all on public.visita_medica from anon;
grant select, insert, update on public.visita_medica to authenticated;
drop policy if exists visita_select on public.visita_medica;
create policy visita_select on public.visita_medica for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists visita_insert on public.visita_medica;
create policy visita_insert on public.visita_medica for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists visita_update on public.visita_medica;
create policy visita_update on public.visita_medica for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
