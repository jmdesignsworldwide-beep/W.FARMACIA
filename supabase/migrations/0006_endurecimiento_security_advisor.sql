-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0006 — Endurecimiento (Security Advisor limpio)
-- ADN JM NEXUS §5.3 #10 (Security Advisor de Supabase limpio)
-- ════════════════════════════════════════════════════════════════════
-- Cierra los avisos del Security Advisor:
--   • function_search_path_mutable: fija search_path en las dos funciones
--     que faltaban (set_updated_at, block_mutations) — evita secuestro de
--     resolución de nombres.
--   • extension_in_public: mueve pg_trgm al schema `extensions`.
--   • rls_policy_always_true: elimina las políticas INSERT `with check (true)`.
--     No hacen falta: las inserciones del sistema ocurren desde funciones
--     SECURITY DEFINER propiedad de `postgres` (BYPASSRLS), y la API tiene el
--     INSERT revocado. Quitarlas deja la superficie sin política trivial.
-- ════════════════════════════════════════════════════════════════════

-- 1) search_path fijo en las funciones que faltaban.
alter function app.set_updated_at() set search_path = '';
alter function app.block_mutations() set search_path = '';

-- 2) pg_trgm fuera de public.
alter extension pg_trgm set schema extensions;

-- 3) Quitar las políticas INSERT triviales (los definer/BYPASSRLS ya insertan;
--    la API no puede insertar porque el grant está revocado).
drop policy if exists profiles_system_insert on public.profiles;
drop policy if exists audit_log_system_insert on public.audit_log;
