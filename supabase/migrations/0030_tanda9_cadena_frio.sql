-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0030 — Tanda 9 · Cadena de frío
-- ADN JM NEXUS · en la nevera hay insulina de RD$3,000 y aquí se va la luz
-- ════════════════════════════════════════════════════════════════════
-- Si la nevera pasa X horas sin corriente, esa insulina puede estar perdida y
-- nadie lo sabe. Se sigue vendiendo. A un diabético. Esto lo impide:
--   • producto.requiere_refrigeracion (override; hereda de la forma si es null).
--   • lectura_temperatura (2x/día, con quién la tomó).
--   • apagon (inicio, retorno, duración); si excede el umbral configurable, la
--     app marca los lotes refrigerados en_revision_frio y BLOQUEA su despacho.
--   • lote.en_revision_frio + revision_motivo → el cobro rechaza esos lotes hasta
--     que el farmacéutico los libere.
-- ════════════════════════════════════════════════════════════════════

alter table public.producto add column if not exists requiere_refrigeracion boolean;  -- override; null = hereda de la forma
comment on column public.producto.requiere_refrigeracion is 'Override de refrigeración; si es null, hereda de forma_farmaceutica.requiere_refrigeracion.';

alter table public.lote add column if not exists en_revision_frio boolean not null default false;
alter table public.lote add column if not exists revision_motivo text;
create index if not exists idx_lote_en_revision on public.lote (en_revision_frio) where en_revision_frio;

create table if not exists public.lectura_temperatura (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  valor_celsius numeric(5,2) not null,
  fuera_de_rango boolean not null default false,
  nota          text,
  tomada_por    uuid references public.profiles(id),
  tomada_en     timestamptz not null default now()
);
comment on table public.lectura_temperatura is 'Registro de temperatura de la nevera (2x/día). Lo que pide DIGEMAPS y lo que protege al paciente.';
create index if not exists idx_lectura_temp_fecha on public.lectura_temperatura (sucursal_id, tomada_en desc);

create table if not exists public.apagon (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  inicio         timestamptz not null,
  retorno        timestamptz,
  duracion_horas numeric(6,2),
  umbral_excedido boolean not null default false,
  lotes_afectados integer not null default 0,
  nota           text,
  registrado_por uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.apagon is 'Registro de apagón (inicio/retorno/duración). Si excede el umbral, la app marca los lotes refrigerados en revisión y bloquea su despacho.';
create index if not exists idx_apagon_fecha on public.apagon (sucursal_id, inicio desc);

drop trigger if exists trg_apagon_updated_at on public.apagon;
create trigger trg_apagon_updated_at before update on public.apagon
  for each row execute function app.set_updated_at();
do $$ declare t text; begin
  foreach t in array array['lectura_temperatura','apagon'] loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

-- RLS + FORCE: registra y lee el operativo (incl. cajero toma temperatura).
do $$ declare t text; begin
  foreach t in array array['lectura_temperatura','apagon'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update on public.%I to authenticated;', t);
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$create policy %1$s_select on public.%1$s for select to authenticated using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format($f$create policy %1$s_update on public.%1$s for update to authenticated using ((select app.has_role('dueno','administrador','farmaceutico'))) with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
  end loop;
end $$;

-- Config: umbral del apagón (horas) y rango de la nevera (°C). Idempotente.
insert into public.configuracion (clave, valor, descripcion) values
  ('umbral_apagon_horas', '2'::jsonb, 'Horas de apagón por encima de las cuales los lotes refrigerados pasan a revisión y se bloquea su despacho.'),
  ('nevera_temp_min', '2'::jsonb, 'Temperatura mínima aceptable de la nevera (°C).'),
  ('nevera_temp_max', '8'::jsonb, 'Temperatura máxima aceptable de la nevera (°C).')
on conflict (clave, sucursal_id) do nothing;
