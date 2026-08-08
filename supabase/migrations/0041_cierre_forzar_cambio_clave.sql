-- ════════════════════════════════════════════════════════════════════
-- W.FARMACIA · Migración 0041 — CIERRE §4.3 · Forzar cambio de clave al 1er ingreso
-- ADN JM NEXUS · la clave temporal muere en el primer login; no circula por WhatsApp
-- ════════════════════════════════════════════════════════════════════
-- Un usuario nuevo entra con clave temporal y el sistema lo OBLIGA a cambiarla antes
-- de navegar. El Dueño (que ya existe) no se ve afectado: la columna nace en false y
-- solo los usuarios NUEVOS (creados tras esta migración) arrancan en true.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists debe_cambiar_password boolean not null default false;
comment on column public.profiles.debe_cambiar_password is 'Si es true, el sistema obliga a cambiar la clave antes de navegar (clave temporal de alta). §4.3.';

-- El alta de un usuario nuevo lo marca para cambio obligatorio de clave.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, nombre, role, debe_cambiar_password)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'cajero'),
    true   -- clave temporal → debe cambiarla en el primer ingreso
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El usuario marca su propia clave como cambiada (SECURITY DEFINER: no necesita
-- permiso de UPDATE directo sobre profiles; solo puede tocar SU fila y SOLO esta bandera).
create or replace function app.marcar_clave_cambiada()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set debe_cambiar_password = false where id = auth.uid();
end;
$$;
revoke all on function app.marcar_clave_cambiada() from public, anon;
grant execute on function app.marcar_clave_cambiada() to authenticated;

-- Wrapper público para PostgREST (el esquema app no se expone por REST).
create or replace function public.marcar_clave_cambiada()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$ select app.marcar_clave_cambiada(); $$;
revoke all on function public.marcar_clave_cambiada() from public, anon;
grant execute on function public.marcar_clave_cambiada() to authenticated;
