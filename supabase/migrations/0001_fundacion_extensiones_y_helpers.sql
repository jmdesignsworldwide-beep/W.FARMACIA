-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0001 — Fundación: extensiones y helpers
-- ADN JM NEXUS §2.2, §2.6, §2.7
-- ════════════════════════════════════════════════════════════════════
-- Esta migración instala la infraestructura de seguridad e integridad
-- sobre la que se montan todas las tablas del sistema:
--   • Trigger de updated_at.
--   • Función de rol del solicitante para políticas RLS (SECURITY DEFINER).
--   • Trigger de INVIOLABILIDAD para tablas de historial (§2.2):
--     bloquea UPDATE y DELETE en la base — ni el administrador puede alterarlas.
--   • Trigger genérico de auditoría.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- búsqueda difusa (selector inteligente)

-- Esquema de utilidades internas, fuera del alcance de la API pública.
create schema if not exists app;

-- ── Enum de roles: CINCO roles (Arquitectura Maestra §1, espeja roles.ts) ──
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'dueno', 'administrador', 'farmaceutico', 'cajero', 'motorista'
    );
  end if;
end $$;

-- ── updated_at automático ──
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Nota: las funciones de rol app.actor_role() / app.has_role() se definen
-- en 0002, después de crear public.profiles — una función `language sql`
-- valida su cuerpo al crearse y no puede referenciar una tabla inexistente.

-- ────────────────────────────────────────────────────────────────────
-- §2.2 — INVIOLABILIDAD A NIVEL DE BASE DE DATOS
-- Tablas de historial, auditoría y libros fiscales/controlados son
-- INSERT y SELECT únicamente. Este trigger bloquea toda modificación
-- posterior, incluso para el rol de servicio. Ni el administrador puede.
-- ────────────────────────────────────────────────────────────────────
create or replace function app.block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Registro inviolable (ADN §2.2): % en % está prohibido. Este historial es INSERT/SELECT únicamente.',
    tg_op, tg_table_name
    using errcode = 'insufficient_privilege';
  return null;
end;
$$;

-- ────────────────────────────────────────────────────────────────────
-- Auditoría genérica — soft-delete + audit_log en toda tabla de
-- producción (§2.6). Registra INSERT/UPDATE/DELETE con el actor.
-- La tabla audit_log se crea en 0003 (por eso el trigger comprueba).
-- ────────────────────────────────────────────────────────────────────
create or replace function app.audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_row   jsonb;
begin
  v_row := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.audit_log (tabla, operacion, registro_id, actor_id, datos)
  values (
    tg_table_name,
    tg_op,
    coalesce((v_row ->> 'id'), null)::uuid,
    v_actor,
    v_row
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$$;
