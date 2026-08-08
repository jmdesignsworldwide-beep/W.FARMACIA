-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0021 — Tanda 5 · Caja diaria
-- ADN JM NEXUS · el turno del cajero: apertura, arqueo, egresos, cierre
-- ════════════════════════════════════════════════════════════════════
-- Claves de diseño (del prompt de la Tanda 5):
--   • caja_sesion: un turno con monto inicial declarado y cierre con diferencia
--     calculada y REGISTRADA PERMANENTEMENTE. Cada cajero responde por el suyo.
--   • Arqueo por denominación dominicana (billetes y monedas uno por uno) →
--     caja_arqueo, append-only.
--   • Egresos de caja con motivo y autorización → caja_egreso, append-only.
--   • Cierre comparativo (Adenda II §2): total_metodo_viejo, el total del método
--     viejo para cotejar. Si cuadra dos semanas, la confianza se ganó con evidencia.
--   • Modo de arranque marcado (es_arranque) con fecha de corte (fecha_corte).
--   • Enlaza venta.caja_sesion_id (hueco de 0019) ahora que caja_sesion existe.
-- La plomería (calcular esperado, cuadrar, resumen de turno) es app.
-- ════════════════════════════════════════════════════════════════════

-- ── 0) Enum ─────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname='caja_estado') then
    create type public.caja_estado as enum ('abierta','cerrada');
  end if;
end $$;

-- ── 1) CAJA_SESION — el turno ───────────────────────────────────────
create table if not exists public.caja_sesion (
  id                      uuid primary key default gen_random_uuid(),
  sucursal_id             uuid not null default '00000000-0000-0000-0000-000000000001'
                            references public.sucursal(id),
  empleado_id             uuid references public.profiles(id),
  estado                  public.caja_estado not null default 'abierta',
  abierta_en              timestamptz not null default now(),
  monto_inicial           numeric(14,2) not null default 0,
  cerrada_en              timestamptz,
  monto_declarado_cierre  numeric(14,2),            -- lo contado en el arqueo
  total_esperado          numeric(14,2),            -- inicial + ventas efectivo − egresos (app)
  diferencia              numeric(14,2),            -- declarado − esperado (app)
  total_metodo_viejo      numeric(14,2),            -- cierre comparativo (Adenda II §2)
  es_arranque             boolean not null default false,
  fecha_corte             date,
  notas_cierre            text,
  cerrada_por             uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
comment on table public.caja_sesion is 'Turno de caja de un cajero: apertura con monto inicial, cierre con diferencia calculada y registrada. Cada cajero responde por el suyo. total_metodo_viejo = cierre comparativo (Adenda II §2).';
create index if not exists idx_caja_sesion_sucursal on public.caja_sesion (sucursal_id, abierta_en desc);
create index if not exists idx_caja_sesion_empleado on public.caja_sesion (empleado_id);
create index if not exists idx_caja_sesion_estado   on public.caja_sesion (estado);

-- ── 2) CAJA_ARQUEO — conteo por denominación dominicana (append-only) ──
create table if not exists public.caja_arqueo (
  id             uuid primary key default gen_random_uuid(),
  caja_sesion_id uuid not null references public.caja_sesion(id),
  denominacion   numeric(14,2) not null,            -- 2000,1000,500,200,100,50,25,10,5,1
  cantidad       integer not null default 0 check (cantidad >= 0),
  subtotal       numeric(14,2) generated always as (denominacion * cantidad) stored,
  created_at     timestamptz not null default now()
);
comment on table public.caja_arqueo is 'Arqueo del cierre: cuántos billetes/monedas de cada denominación dominicana se contaron. Append-only.';
create index if not exists idx_caja_arqueo_sesion on public.caja_arqueo (caja_sesion_id);

-- ── 3) CAJA_EGRESO — salidas de efectivo con motivo y autorización ──
create table if not exists public.caja_egreso (
  id             uuid primary key default gen_random_uuid(),
  caja_sesion_id uuid not null references public.caja_sesion(id),
  monto          numeric(14,2) not null check (monto > 0),
  motivo         text not null,
  autorizado_por uuid references public.profiles(id),  -- Dueño/Admin (validado en app)
  empleado_id    uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
comment on table public.caja_egreso is 'Salida de efectivo de la caja durante el turno, con motivo y autorización. Append-only: no se edita ni se borra.';
create index if not exists idx_caja_egreso_sesion on public.caja_egreso (caja_sesion_id);

-- ── 4) Enlazar venta.caja_sesion_id (hueco de 0019) ─────────────────
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='fk_venta_caja_sesion'
  ) then
    alter table public.venta
      add constraint fk_venta_caja_sesion
      foreign key (caja_sesion_id) references public.caja_sesion(id);
  end if;
end $$;

-- ── 5) Triggers: updated_at + auditoría + inviolabilidad ────────────
drop trigger if exists trg_caja_sesion_updated_at on public.caja_sesion;
create trigger trg_caja_sesion_updated_at before update on public.caja_sesion
  for each row execute function app.set_updated_at();

do $$ declare t text; begin
  foreach t in array array['caja_sesion','caja_arqueo','caja_egreso'] loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

-- Los libros de arqueo y egreso son inviolables (INSERT/SELECT únicamente).
do $$ declare t text; begin
  foreach t in array array['caja_arqueo','caja_egreso'] loop
    execute format('drop trigger if exists trg_%1$s_inviolable on public.%1$s;', t);
    execute format('create trigger trg_%1$s_inviolable before update or delete on public.%1$s for each row execute function app.block_mutations();', t);
  end loop;
end $$;

-- ── 6) RLS + FORCE + políticas ──────────────────────────────────────
-- El turno lo abre/cierra el operativo (incl. cajero). El egreso lo autoriza
-- Dueño/Admin (barrera en app; la fila la puede insertar el cajero con la
-- autorización registrada). Nada se borra por API.

-- caja_sesion: mutable (cierre actualiza). select + insert + update para operativo.
alter table public.caja_sesion enable row level security;
alter table public.caja_sesion force row level security;
revoke all on public.caja_sesion from anon;
grant select, insert, update on public.caja_sesion to authenticated;
drop policy if exists caja_sesion_select on public.caja_sesion;
create policy caja_sesion_select on public.caja_sesion for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists caja_sesion_insert on public.caja_sesion;
create policy caja_sesion_insert on public.caja_sesion for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists caja_sesion_update on public.caja_sesion;
create policy caja_sesion_update on public.caja_sesion for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')))
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));

-- caja_arqueo / caja_egreso: append-only. select + insert para operativo.
do $$ declare t text; begin
  foreach t in array array['caja_arqueo','caja_egreso'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert on public.%I to authenticated;', t);
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$create policy %1$s_select on public.%1$s for select to authenticated using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
  end loop;
end $$;
