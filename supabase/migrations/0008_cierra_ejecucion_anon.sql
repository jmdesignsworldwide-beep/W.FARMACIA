-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0008 — Cierre de ejecución sin autenticar
-- Fort Knox · Pilar 9: NO endpoints sin autenticar (no "sin endpoints
-- riesgosos" — sin endpoints sin autenticar, punto).
-- ════════════════════════════════════════════════════════════════════
-- Tras 0007, varias funciones del esquema `app` quedaron con EXECUTE para
-- PUBLIC (comportamiento por defecto de Postgres), lo que incluye a `anon`
-- (sin autenticar). Ninguna función de este sistema necesita ser ejecutable
-- por `anon`: el login usa Supabase Auth, no funciones de `app`.
--
-- Se probó (Postgres local) que una columna generada exige EXECUTE del rol
-- que INSERTA — pero ese rol es siempre `authenticated` (RLS impide que
-- `anon` inserte en estas tablas). Los triggers corren como su dueño y no
-- requieren EXECUTE del llamador. Por eso:
--   • Se revoca EXECUTE a PUBLIC en TODO el esquema `app` (default-deny).
--   • Se concede EXECUTE solo a `authenticated`/`service_role`, y solo en
--     las funciones que invocan consultas, políticas RLS o columnas
--     generadas. Las funciones de trigger quedan sin concesión (no la
--     necesitan; el trigger las corre igual).
-- ════════════════════════════════════════════════════════════════════

-- Default-deny: nadie de PUBLIC (incluye anon) ejecuta funciones de `app`.
revoke execute on all functions in schema app from public;

-- Allow explícito — solo lo que de verdad se invoca fuera de un trigger:
--   • actor_role / has_role  → las políticas RLS (evaluadas como authenticated)
--   • slug / conc_norm / conc_unidad_base → columnas generadas (las evalúa quien inserta)
--   • firma_de → panel de equivalencia (app, como authenticated)
grant execute on function app.actor_role() to authenticated, service_role;
grant execute on function app.has_role(public.app_role[]) to authenticated, service_role;
grant execute on function app.slug(text) to authenticated, service_role;
grant execute on function app.conc_norm(numeric, public.unidad_concentracion, numeric, public.unidad_volumen)
  to authenticated, service_role;
grant execute on function app.conc_unidad_base(public.unidad_concentracion, public.unidad_volumen)
  to authenticated, service_role;
grant execute on function app.firma_de(uuid, uuid, uuid) to authenticated, service_role;

-- Nota: set_updated_at, audit, block_mutations, handle_new_user, set_firma y
-- poke_producto_firma son funciones de TRIGGER — se quedan sin EXECUTE para
-- nadie salvo el dueño; los triggers las ejecutan igual. anon: 0 funciones.
