-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0003 — Bitácora de auditoría inviolable
-- ADN JM NEXUS §2.2 (historial inviolable a nivel de base de datos)
-- ════════════════════════════════════════════════════════════════════
-- audit_log es INSERT y SELECT únicamente. El trigger de inviolabilidad
-- bloquea UPDATE y DELETE en la base — incluso para roles con BYPASSRLS
-- (postgres/service_role): ni el administrador puede alterar la bitácora.
-- Es la columna vertebral de la trazabilidad: el libro de controlados y el
-- registro fiscal se apoyarán en este mismo patrón.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  operacion   text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id uuid,
  actor_id    uuid references auth.users(id),
  datos       jsonb not null,
  ocurrido_en timestamptz not null default now()
);

comment on table public.audit_log is
  'Bitácora inviolable (§2.2). INSERT/SELECT únicamente; UPDATE y DELETE bloqueados por trigger a nivel de base — ni el administrador puede alterarla.';

create index if not exists idx_audit_log_tabla on public.audit_log (tabla, ocurrido_en desc);
create index if not exists idx_audit_log_registro on public.audit_log (registro_id);
create index if not exists idx_audit_log_actor on public.audit_log (actor_id);

-- ── INVIOLABILIDAD (§2.2): bloquear toda modificación posterior ──
-- Actúa incluso sobre postgres/service_role (que saltan RLS): la garantía
-- de "ni el administrador puede" vive en el trigger, no solo en RLS.
create trigger trg_audit_log_inviolable
  before update or delete on public.audit_log
  for each row execute function app.block_mutations();

-- ── RLS + FORCE (regla #4) ──
alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

-- La API no muta la bitácora. El INSERT llega solo desde el trigger definer
-- app.audit(); UPDATE/DELETE, además, los bloquea el trigger de inviolabilidad.
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- Lectura: solo dueño y gerente.
create policy audit_log_admin_select
  on public.audit_log for select
  using (app.has_role('dueno', 'gerente'));

-- INSERT: alcanzable únicamente por app.audit() (definer). El INSERT de la
-- API está revocado; with check (true) permite el registro bajo FORCE RLS.
create policy audit_log_system_insert
  on public.audit_log for insert
  with check (true);
