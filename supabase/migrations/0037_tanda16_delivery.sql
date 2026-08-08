-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0037 — Tanda 16 · Delivery (entregas a domicilio)
-- ADN JM NEXUS · el motorista lleva la venta a la casa; el dinero vuelve cuadrado
-- ════════════════════════════════════════════════════════════════════
-- Una entrega nace de una venta ya hecha en caja (o de un encargo). El despachador
-- pone dirección/teléfono, marca si es CONTRA ENTREGA (se cobra en la casa) y
-- asigna un motorista. El motorista ve SOLO las suyas, las mueve en_camino →
-- entregado (y si es contra entrega, registra el cobro) o no_entregado con motivo.
-- No es un libro inviolable: es una máquina de estados operativa, pero cada
-- transición queda en audit_log.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  if not exists (select 1 from pg_type where typname='estado_entrega') then
    create type public.estado_entrega as enum ('pendiente','en_camino','entregado','no_entregado');
  end if;
end $$;

create table if not exists public.entrega (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  venta_id          uuid references public.venta(id),
  cliente_id        uuid references public.cliente(id),
  destinatario      text not null,                 -- a quién se le lleva (nombre)
  direccion         text not null,
  referencia        text,                          -- "la casa amarilla al lado del colmado"
  telefono          text,
  motorista_id      uuid references public.profiles(id),
  estado            public.estado_entrega not null default 'pendiente',
  contra_entrega    boolean not null default false,-- se cobra en destino
  monto_a_cobrar    numeric(14,2) not null default 0 check (monto_a_cobrar >= 0),
  cobrado           boolean not null default false,
  metodo_cobro      public.metodo_cobro,
  nota              text,
  motivo_no_entrega text,
  asignada_en       timestamptz,
  en_camino_en      timestamptz,
  cerrada_en        timestamptz,                   -- entregada o no_entregada
  creado_por        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.entrega is 'Entrega a domicilio de una venta. Máquina de estados operativa (no inviolable), auditada. contra_entrega = el motorista cobra en la casa.';
create index if not exists idx_entrega_motorista on public.entrega (motorista_id, estado);
create index if not exists idx_entrega_estado    on public.entrega (estado, created_at desc);

-- Triggers
drop trigger if exists trg_entrega_updated_at on public.entrega;
create trigger trg_entrega_updated_at before update on public.entrega for each row execute function app.set_updated_at();
drop trigger if exists trg_entrega_audit on public.entrega;
create trigger trg_entrega_audit after insert or update or delete on public.entrega for each row execute function app.audit();

-- RLS + FORCE
alter table public.entrega enable row level security;
alter table public.entrega force row level security;
revoke all on public.entrega from anon;
grant select, insert, update on public.entrega to authenticated;

-- SELECT: el operativo de mostrador ve todas; el motorista ve SOLO las suyas.
drop policy if exists entrega_select on public.entrega;
create policy entrega_select on public.entrega for select to authenticated
  using (
    (select app.has_role('dueno','administrador','farmaceutico','cajero'))
    or motorista_id = (select auth.uid())
  );

-- INSERT: quien despacha en mostrador (no el motorista).
drop policy if exists entrega_insert on public.entrega;
create policy entrega_insert on public.entrega for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico','cajero')));

-- UPDATE: el mostrador (asigna/edita) y el motorista asignado (mueve el estado).
drop policy if exists entrega_update on public.entrega;
create policy entrega_update on public.entrega for update to authenticated
  using (
    (select app.has_role('dueno','administrador','farmaceutico','cajero'))
    or motorista_id = (select auth.uid())
  )
  with check (
    (select app.has_role('dueno','administrador','farmaceutico','cajero'))
    or motorista_id = (select auth.uid())
  );
