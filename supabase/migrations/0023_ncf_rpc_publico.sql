-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0023 — Envoltorio público de app.siguiente_ncf
-- ════════════════════════════════════════════════════════════════════
-- app.siguiente_ncf (0022) vive en el esquema `app`, que PostgREST no expone.
-- El POS necesita asignar el NCF por RPC desde la app → un envoltorio en `public`
-- que delega en la función atómica. Misma seguridad: SECURITY DEFINER con
-- search_path fijo y execute revocado a anon.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.siguiente_ncf(
  p_tipo public.tipo_ncf,
  p_sucursal uuid default '00000000-0000-0000-0000-000000000001'
)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select app.siguiente_ncf(p_tipo, p_sucursal);
$$;

revoke all on function public.siguiente_ncf(public.tipo_ncf, uuid) from public, anon;
grant execute on function public.siguiente_ncf(public.tipo_ncf, uuid) to authenticated;
