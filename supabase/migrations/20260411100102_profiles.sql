-- 20260411_000002_profiles.sql
-- Saubere Profiles-Tabelle als Basis für alle Clients

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  username citext unique,
  first_name text,
  last_name text,
  full_name text generated always as (
    trim(
      coalesce(first_name, '') || ' ' || coalesce(last_name, '')
    )
  ) stored,

  avatar_url text,
  header_photo_url text,

  city text,
  country text,
  locale text default 'de-CH',

  contact_email text,
  bio text,

  is_admin boolean not null default false,
  is_local boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_length check (
    username is null or char_length(username) between 3 and 32
  )
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_city on public.profiles(city);

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- Auto-create profile on auth user insert
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    contact_email,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    now(),
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();