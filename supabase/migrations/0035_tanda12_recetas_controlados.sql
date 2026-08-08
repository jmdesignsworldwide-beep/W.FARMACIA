-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0035 — Tanda 12 · Recetas y controlados
-- ADN JM NEXUS · el libro de controlados inviolable, con su farmacéutico
-- ════════════════════════════════════════════════════════════════════
--   • receta: médico, exequátur, paciente, fecha, medicamento, cantidad,
--     indicaciones, imagen (receta por WhatsApp). Alerta de vencida/duplicada (app).
--   • libro_controlado: cada despacho de un controlado con su farmacéutico
--     responsable y su lote. INVIOLABLE (INSERT/SELECT). Trazabilidad por lote.
--   • Alerta de patrón sospechoso: se calcula en la app (mismo paciente/mismo
--     controlado antes de tiempo), se MUESTRA — no bloquea.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.receta (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  medico_nombre  text,
  medico_exequatur text,
  paciente_cliente_id uuid references public.cliente(id),
  paciente_nombre text,
  fecha          date not null default current_date,
  medicamento    text,
  producto_id    uuid references public.producto(id),
  cantidad       numeric(14,3),
  indicaciones   text,
  imagen_url     text,                              -- foto de la receta (WhatsApp)
  registrado_por uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.receta is 'Receta: médico, exequátur, paciente, medicamento, indicaciones. imagen_url = foto recibida por WhatsApp. La app avisa de recetas vencidas o duplicadas.';
create index if not exists idx_receta_paciente on public.receta (paciente_cliente_id, fecha desc);

create table if not exists public.libro_controlado (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  producto_id     uuid not null references public.producto(id),
  lote_id         uuid references public.lote(id),
  cantidad        numeric(14,3) not null check (cantidad > 0),
  receta_id       uuid references public.receta(id),
  paciente_nombre text,
  venta_id        uuid references public.venta(id),
  farmaceutico_id uuid references public.profiles(id),   -- responsable
  despachado_en   timestamptz not null default now()
);
comment on table public.libro_controlado is 'Libro de controlados INVIOLABLE: cada despacho con su farmacéutico responsable, lote y receta. Solo INSERT/SELECT (trigger block_mutations).';
create index if not exists idx_libro_controlado_producto on public.libro_controlado (producto_id, despachado_en desc);
create index if not exists idx_libro_controlado_paciente on public.libro_controlado (paciente_nombre);

-- Triggers
drop trigger if exists trg_receta_updated_at on public.receta;
create trigger trg_receta_updated_at before update on public.receta
  for each row execute function app.set_updated_at();
do $$ declare t text; begin
  foreach t in array array['receta','libro_controlado'] loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;
-- El libro de controlados es inviolable.
drop trigger if exists trg_libro_controlado_inviolable on public.libro_controlado;
create trigger trg_libro_controlado_inviolable before update or delete on public.libro_controlado
  for each row execute function app.block_mutations();

-- RLS + FORCE
alter table public.receta enable row level security;
alter table public.receta force row level security;
revoke all on public.receta from anon;
grant select, insert, update on public.receta to authenticated;
drop policy if exists receta_select on public.receta;
create policy receta_select on public.receta for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists receta_insert on public.receta;
create policy receta_insert on public.receta for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists receta_update on public.receta;
create policy receta_update on public.receta for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- libro_controlado: lo despacha quien puede despachar controlados; lo leen los
-- que auditan (Dueño/Admin/Farmacéutico). Append-only, sin update/delete por API.
alter table public.libro_controlado enable row level security;
alter table public.libro_controlado force row level security;
revoke all on public.libro_controlado from anon;
grant select, insert on public.libro_controlado to authenticated;
drop policy if exists libro_controlado_select on public.libro_controlado;
create policy libro_controlado_select on public.libro_controlado for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
drop policy if exists libro_controlado_insert on public.libro_controlado;
create policy libro_controlado_insert on public.libro_controlado for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
