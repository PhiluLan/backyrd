-- 20260411_000001_init_extensions.sql
-- Basis-Extensions + gemeinsame Helper-Funktionen

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- optional: sichere aktuelle user id als helper
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;