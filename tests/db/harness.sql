-- Minimal Supabase stand-ins so the migrations can run on plain Postgres + PostGIS.
-- Test-only. Never apply to a real Supabase project (it already provides all of this).
create schema if not exists extensions;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, extensions, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema extensions grant execute on functions to anon, authenticated;
