-- 20260411_000003_spots.sql
-- Kategorien + Spots als zentrales Discovery-Modul

create table if not exists public.categories (
  id bigserial primary key,
  slug text unique not null,
  name text not null,
  icon text,
  color text,
  created_at timestamptz not null default now()
);

create table if not exists public.spots (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  slug text unique,

  address text,
  city text,
  country text default 'Switzerland',

  lat double precision,
  lng double precision,

  category_id bigint references public.categories(id) on delete set null,

  description text,
  website text,
  phone text,
  email text,

  price_level integer,
  header_photo_path text,

  status text not null default 'pending',
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spots_status_check check (
    status in ('pending', 'approved', 'rejected', 'archived')
  ),
  constraint spots_price_level_check check (
    price_level is null or price_level between 1 and 5
  )
);

create index if not exists idx_spots_status on public.spots(status);
create index if not exists idx_spots_city on public.spots(city);
create index if not exists idx_spots_category_id on public.spots(category_id);
create index if not exists idx_spots_owner_id on public.spots(owner_id);
create index if not exists idx_spots_created_by on public.spots(created_by);
create index if not exists idx_spots_name_trgm on public.spots using gin (name gin_trgm_ops);
create index if not exists idx_spots_address_trgm on public.spots using gin (address gin_trgm_ops);

drop trigger if exists trg_spots_set_updated_at on public.spots;
create trigger trg_spots_set_updated_at
before update on public.spots
for each row
execute function public.set_updated_at();