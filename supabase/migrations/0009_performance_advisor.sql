-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0009 — Fixes del Performance Advisor
-- ════════════════════════════════════════════════════════════════════
-- 1) FK sin índice de cobertura: producto.via_administracion_id.
-- 2) RLS más eficiente sin cambiar la semántica:
--    • auth_rls_initplan: envolver auth.uid()/app.has_role() en subconsulta
--      (select …) para que se evalúen UNA vez por consulta, no por fila.
--    • multiple_permissive_policies: unir las dos políticas SELECT de
--      profiles (self + admin) en una sola.
-- La semántica de acceso queda IDÉNTICA — verificada por impersonación.
-- ════════════════════════════════════════════════════════════════════

-- 1) Índice de cobertura para la FK de vía
create index if not exists idx_producto_via on public.producto (via_administracion_id);

-- 2a) profiles — unir SELECT y envolver en subconsulta
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_select on public.profiles; -- idempotencia (re-ejecutable)
create policy profiles_select on public.profiles
  for select using (
    (select auth.uid()) = id
    or (select app.has_role('dueno'))
    or ((select app.has_role('administrador')) and role <> 'dueno')
  );

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update
  using ((select app.has_role('dueno')) or ((select app.has_role('administrador')) and role <> 'dueno'))
  with check ((select app.has_role('dueno')) or ((select app.has_role('administrador')) and role <> 'dueno'));

-- 2b) audit_log — envolver has_role en la política SELECT
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select using ((select app.has_role('dueno','administrador')));

-- 2c) Catálogos de 0007 — envolver has_role (proactivo: mismo patrón)
do $$ declare t text; begin
  foreach t in array array['principio_activo','forma_farmaceutica','via_administracion'] loop
    execute format('drop policy if exists %1$s_admin_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_admin_update on public.%1$s', t);
    execute format($f$create policy %1$s_admin_insert on public.%1$s for insert to authenticated
      with check ((select app.has_role('dueno','administrador')));$f$, t);
    execute format($f$create policy %1$s_admin_update on public.%1$s for update to authenticated
      using ((select app.has_role('dueno','administrador')))
      with check ((select app.has_role('dueno','administrador')));$f$, t);
  end loop;
end $$;

-- 2d) producto — envolver has_role
drop policy if exists producto_gestor_insert on public.producto;
drop policy if exists producto_gestor_update on public.producto;
create policy producto_gestor_insert on public.producto for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
create policy producto_gestor_update on public.producto for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));

-- 2e) puente — envolver has_role
drop policy if exists ppa_gestor_insert on public.producto_principio_activo;
drop policy if exists ppa_gestor_update on public.producto_principio_activo;
drop policy if exists ppa_gestor_delete on public.producto_principio_activo;
create policy ppa_gestor_insert on public.producto_principio_activo for insert to authenticated
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
create policy ppa_gestor_update on public.producto_principio_activo for update to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')))
  with check ((select app.has_role('dueno','administrador','farmaceutico')));
create policy ppa_gestor_delete on public.producto_principio_activo for delete to authenticated
  using ((select app.has_role('dueno','administrador','farmaceutico')));
