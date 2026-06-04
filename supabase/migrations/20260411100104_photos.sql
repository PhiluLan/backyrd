-- 20260411_000004_photos.sql
-- Klare Trennung zwischen Spot-Fotos und Review-Fotos

create table if not exists public.spot_photos (
  id bigserial primary key,
  spot_id uuid not null references public.spots(id) on delete cascade,
  url text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_spot_photos_spot_id on public.spot_photos(spot_id);
create index if not exists idx_spot_photos_uploaded_by on public.spot_photos(uploaded_by);

create table if not exists public.review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null,
  url text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_review_photos_review_id on public.review_photos(review_id);
create index if not exists idx_review_photos_uploaded_by on public.review_photos(uploaded_by);