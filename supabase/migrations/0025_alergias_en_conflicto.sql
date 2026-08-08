-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0025 — Detección de choques de alergia (POS)
-- ════════════════════════════════════════════════════════════════════
-- Función que el POS llama al identificar al cliente: dado el cliente y los
-- productos del carrito, devuelve cuáles chocan con una alergia registrada,
-- comparando por FAMILIA (alérgico a Amoxicilina → Ampicilina choca) o por el
-- principio exacto. La interrupción y el registro de la decisión los hace la app.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.alergias_en_conflicto(p_cliente uuid, p_productos uuid[])
returns table (producto_id uuid, producto_nombre text, familia text, familia_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct pr.id, pr.nombre, fa.nombre, fa.id
  from public.producto pr
  join public.producto_principio_activo ppa on ppa.producto_id = pr.id
  join public.principio_activo pa on pa.id = ppa.principio_activo_id
  join public.cliente_alergia ca on ca.cliente_id = p_cliente
    and (ca.familia_alergenica_id = pa.familia_alergenica_id or ca.principio_activo_id = pa.id)
  left join public.familia_alergenica fa on fa.id = pa.familia_alergenica_id
  where pr.id = any(p_productos);
$$;
revoke all on function public.alergias_en_conflicto(uuid, uuid[]) from public, anon;
grant execute on function public.alergias_en_conflicto(uuid, uuid[]) to authenticated;
