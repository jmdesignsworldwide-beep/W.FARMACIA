-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0005 — Endurecimiento del alta de usuario
-- ADN JM NEXUS §2.7 (prevención de escalada de privilegios)
-- ════════════════════════════════════════════════════════════════════
-- La versión anterior de handle_new_user tomaba el rol desde el metadata
-- del usuario (raw_user_meta_data ->> 'role'). Eso es un vector de escalada
-- de privilegios: quien pudiera auto-registrarse elegiría su propio rol.
-- Es exactamente el pecado #1 del ADN (la auditoría de JM FIT).
--
-- Corrección: todo usuario nuevo nace con el MÍNIMO privilegio ('cajero').
-- La elevación de rol ocurre únicamente por UPDATE, gobernado por la política
-- RLS de profiles (solo Dueño/Administrador, y solo el Dueño asigna 'dueno').
-- El nombre sí se toma del metadata (no es sensible).
-- ════════════════════════════════════════════════════════════════════

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nombre, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    'cajero'   -- mínimo privilegio; la elevación es un UPDATE gobernado por RLS
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
