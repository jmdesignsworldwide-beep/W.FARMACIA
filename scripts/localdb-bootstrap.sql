-- Shim de compatibilidad Supabase para pruebas locales (NO va al repo).
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema extensions to anon, authenticated, service_role;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
-- auth.uid() configurable por GUC app.uid para simular usuarios en pruebas.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.uid', true),'')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
