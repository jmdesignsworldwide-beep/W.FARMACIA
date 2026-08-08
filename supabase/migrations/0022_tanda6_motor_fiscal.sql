-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0022 — Tanda 6 · Motor fiscal NCF + e-CF (dormido)
-- ADN JM NEXUS · el comprobante inviolable y la secuencia que nunca repite
-- ════════════════════════════════════════════════════════════════════
-- Claves de diseño (del prompt de la Tanda 6):
--   • secuencia_fiscal: tipo, rango autorizado, siguiente número, vigencia,
--     con alerta de agotamiento anticipada (la app avisa; el dato vive aquí).
--   • comprobante como ENTIDAD PROPIA, inviolable una vez emitido: se anula con
--     nota de crédito (B04/E34), NUNCA se edita.
--   • Campos e-CF presentes pero DORMIDOS: xml, código de seguridad, fecha de
--     firma, estado DGII, respuesta del certificador. El modo lo decide una
--     bandera de configuración (configuracion.modo_fiscal); opera en NCF desde
--     el día uno.
--   • app.siguiente_ncf(tipo): asigna el número de forma ATÓMICA (bloqueo de
--     fila) — dos ventas simultáneas nunca toman el mismo NCF.
-- La plomería (pedir RNC, imprimir, WhatsApp) es app.
-- ════════════════════════════════════════════════════════════════════

-- ── 0) Enums ────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname='tipo_ncf') then
    -- B01 crédito fiscal · B02 consumidor final · B04 nota de crédito
    -- E31/E32 e-CF (crédito/consumidor) · E34 e-CF nota de crédito
    create type public.tipo_ncf as enum ('B01','B02','B04','E31','E32','E34');
  end if;
  if not exists (select 1 from pg_type where typname='estado_comprobante') then
    create type public.estado_comprobante as enum ('emitido','anulado');
  end if;
end $$;

-- ── 1) SECUENCIA_FISCAL — el rango autorizado y el próximo número ────
create table if not exists public.secuencia_fiscal (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null default '00000000-0000-0000-0000-000000000001'
                  references public.sucursal(id),
  tipo          public.tipo_ncf not null,
  rango_desde   bigint not null,
  rango_hasta   bigint not null,
  siguiente     bigint not null,
  digitos       smallint not null default 8,         -- 8 para NCF (B), 10 para e-CF (E)
  vigencia_hasta date,
  alerta_restantes integer not null default 50,      -- avisar cuando queden ≤ N
  activa        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (rango_hasta >= rango_desde),
  check (siguiente >= rango_desde),
  unique (sucursal_id, tipo, rango_desde)
);
comment on table public.secuencia_fiscal is 'Rango de comprobantes autorizado por la DGII, con el próximo número y su vigencia. La app avisa cuando quedan pocos (alerta_restantes). NO se siembran rangos: el Dueño carga los reales autorizados.';
create index if not exists idx_secuencia_tipo on public.secuencia_fiscal (sucursal_id, tipo) where activa;

-- ── 2) COMPROBANTE — entidad propia, inviolable una vez emitida ─────
create table if not exists public.comprobante (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001'
                   references public.sucursal(id),
  venta_id       uuid references public.venta(id),
  tipo           public.tipo_ncf not null,
  ncf            text not null,
  estado         public.estado_comprobante not null default 'emitido',
  rnc_receptor   text,
  nombre_receptor text,
  subtotal       numeric(14,2) not null default 0,
  itbis          numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  -- nota de crédito que lo anula (otro comprobante B04/E34); NUNCA se edita el original
  anulado_por_comprobante_id uuid references public.comprobante(id),
  emitido_por    uuid references public.profiles(id),
  emitido_en     timestamptz not null default now(),
  -- Campos e-CF DORMIDOS (Tanda 21): presentes, nullable, sin uso en modo NCF
  ecf_xml              text,
  ecf_codigo_seguridad text,
  ecf_fecha_firma      timestamptz,
  ecf_estado_dgii      text,
  ecf_respuesta_certificador jsonb,
  created_at     timestamptz not null default now(),
  unique (sucursal_id, ncf)
);
comment on table public.comprobante is 'Comprobante fiscal (NCF hoy, e-CF mañana). Inviolable una vez emitido: se anula con nota de crédito, nunca se edita. Campos ecf_* dormidos hasta la activación (Tanda 21).';
create index if not exists idx_comprobante_venta on public.comprobante (venta_id);
create index if not exists idx_comprobante_ncf   on public.comprobante (sucursal_id, ncf);

-- ── 3) app.siguiente_ncf — asignación ATÓMICA del próximo número ────
create or replace function app.siguiente_ncf(p_tipo public.tipo_ncf, p_sucursal uuid default '00000000-0000-0000-0000-000000000001')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_num bigint;
  v_dig smallint;
begin
  -- Bloquea la fila de la secuencia activa con cupo y vigencia; serializa concurrentes.
  select id, siguiente, digitos into v_id, v_num, v_dig
  from public.secuencia_fiscal
  where sucursal_id = p_sucursal and tipo = p_tipo and activa
    and siguiente <= rango_hasta
    and (vigencia_hasta is null or vigencia_hasta >= current_date)
  order by rango_desde
  for update
  limit 1;

  if v_id is null then
    raise exception 'No hay secuencia fiscal disponible para % (agotada, vencida o sin configurar).', p_tipo;
  end if;

  update public.secuencia_fiscal set siguiente = siguiente + 1, updated_at = now() where id = v_id;
  return p_tipo::text || lpad(v_num::text, v_dig, '0');
end;
$$;
revoke all on function app.siguiente_ncf(public.tipo_ncf, uuid) from public, anon;
grant execute on function app.siguiente_ncf(public.tipo_ncf, uuid) to authenticated;

-- ── 4) Triggers: updated_at + auditoría + inviolabilidad ────────────
drop trigger if exists trg_secuencia_updated_at on public.secuencia_fiscal;
create trigger trg_secuencia_updated_at before update on public.secuencia_fiscal
  for each row execute function app.set_updated_at();

do $$ declare t text; begin
  foreach t in array array['secuencia_fiscal','comprobante'] loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

-- El comprobante es inviolable una vez emitido: INSERT/SELECT únicamente.
drop trigger if exists trg_comprobante_inviolable on public.comprobante;
create trigger trg_comprobante_inviolable before update or delete on public.comprobante
  for each row execute function app.block_mutations();

-- ── 5) RLS + FORCE + políticas ──────────────────────────────────────
-- secuencia_fiscal: la lee el operativo (para avisar y emitir); la carga/edita
-- solo Dueño/Admin (son los rangos autorizados por la DGII).
alter table public.secuencia_fiscal enable row level security;
alter table public.secuencia_fiscal force row level security;
revoke all on public.secuencia_fiscal from anon;
grant select, insert, update on public.secuencia_fiscal to authenticated;
drop policy if exists secuencia_select on public.secuencia_fiscal;
create policy secuencia_select on public.secuencia_fiscal for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists secuencia_write on public.secuencia_fiscal;
create policy secuencia_write on public.secuencia_fiscal for insert to authenticated
  with check ((select app.has_role('dueno','administrador')));
drop policy if exists secuencia_update on public.secuencia_fiscal;
create policy secuencia_update on public.secuencia_fiscal for update to authenticated
  using ((select app.has_role('dueno','administrador')))
  with check ((select app.has_role('dueno','administrador')));

-- comprobante: append-only. Emite el operativo (el POS); lo lee el operativo.
alter table public.comprobante enable row level security;
alter table public.comprobante force row level security;
revoke all on public.comprobante from anon;
grant select, insert on public.comprobante to authenticated;
drop policy if exists comprobante_select on public.comprobante;
create policy comprobante_select on public.comprobante for select to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));
drop policy if exists comprobante_insert on public.comprobante;
create policy comprobante_insert on public.comprobante for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));

-- ── 6) Semilla del modo fiscal (idempotente). NO se siembran rangos. ──
insert into public.configuracion (clave, valor, descripcion)
values ('modo_fiscal', '"ncf"'::jsonb, 'Modo del motor fiscal: "ncf" (opera hoy) o "ecf" (se activa con las credenciales de la DGII, Tanda 21).')
on conflict (clave, sucursal_id) do nothing;
