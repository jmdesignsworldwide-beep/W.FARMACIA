-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0031 — Tanda 9 · Recepción con conteo contra factura
-- ADN JM NEXUS · el control nace en la puerta, no en un reporte
-- ════════════════════════════════════════════════════════════════════
-- Cantidad recibida vs pedida · precio facturado vs cotizado · lote y vencimiento
-- de cada renglón · toda discrepancia registrada permanentemente. Al confirmar,
-- la app crea el lote, el movimiento 'entrada' y el historial de costo, y calcula
-- la deriva de costo. La ficha de cumplimiento del proveedor se calcula de aquí.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.recepcion (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null default '00000000-0000-0000-0000-000000000001' references public.sucursal(id),
  proveedor_id   uuid references public.proveedor(id),
  factura_numero text,
  fecha          date not null default current_date,
  notas          text,
  confirmada     boolean not null default false,
  recibido_por   uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.recepcion is 'Cabecera de recepción de mercancía contra factura. Al confirmar (app) se crean los lotes, movimientos de entrada e historial de costo.';
create index if not exists idx_recepcion_proveedor on public.recepcion (proveedor_id, fecha desc);

create table if not exists public.recepcion_linea (
  id                 uuid primary key default gen_random_uuid(),
  recepcion_id       uuid not null references public.recepcion(id),
  producto_id        uuid not null references public.producto(id),
  cantidad_pedida    numeric(14,3),
  cantidad_recibida  numeric(14,3) not null check (cantidad_recibida >= 0),
  precio_cotizado    numeric(14,2),
  precio_facturado   numeric(14,2),
  numero_lote        text,
  fecha_vencimiento  date,
  -- discrepancias, calculadas y guardadas permanentemente
  discrepancia_cantidad numeric(14,3) generated always as (coalesce(cantidad_recibida,0) - coalesce(cantidad_pedida,0)) stored,
  discrepancia_precio   numeric(14,2) generated always as (coalesce(precio_facturado,0) - coalesce(precio_cotizado,0)) stored,
  lote_id            uuid references public.lote(id),   -- el lote creado al confirmar
  created_at         timestamptz not null default now()
);
comment on table public.recepcion_linea is 'Renglón de recepción: recibido vs pedido, facturado vs cotizado, lote y vencimiento. Las discrepancias quedan permanentes y alimentan la ficha de cumplimiento del proveedor.';
create index if not exists idx_recepcion_linea_recepcion on public.recepcion_linea (recepcion_id);
create index if not exists idx_recepcion_linea_producto  on public.recepcion_linea (producto_id);

drop trigger if exists trg_recepcion_updated_at on public.recepcion;
create trigger trg_recepcion_updated_at before update on public.recepcion
  for each row execute function app.set_updated_at();
do $$ declare t text; begin
  foreach t in array array['recepcion','recepcion_linea'] loop
    execute format('drop trigger if exists trg_%1$s_audit on public.%1$s;', t);
    execute format('create trigger trg_%1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit();', t);
  end loop;
end $$;

-- RLS + FORCE: la recepción la hace quien gestiona inventario.
do $$ declare t text; begin
  foreach t in array array['recepcion','recepcion_linea'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update on public.%I to authenticated;', t);
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format($f$create policy %1$s_select on public.%1$s for select to authenticated using ((select app.has_role('dueno','administrador','farmaceutico','cajero')));$f$, t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format($f$create policy %1$s_insert on public.%1$s for insert to authenticated with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format($f$create policy %1$s_update on public.%1$s for update to authenticated using ((select app.has_role('dueno','administrador','farmaceutico'))) with check ((select app.has_role('dueno','administrador','farmaceutico')));$f$, t);
  end loop;
end $$;
