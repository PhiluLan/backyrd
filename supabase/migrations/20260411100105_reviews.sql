-- 20260411100105_reviews.sql
-- Reviews als zentrales User-generated Content Modul

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),

  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,

  text text,
  mood_a text,
  mood_b text,

  mood_a_id bigint,
  mood_b_id bigint,

  city text,
  photo_path text, -- legacy fallback only, nicht mehr primäre Wahrheit

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reviews_spot_id on public.reviews(spot_id);
create index if not exists idx_reviews_user_id on public.reviews(user_id);
create index if not exists idx_reviews_created_at on public.reviews(created_at desc);
create index if not exists idx_reviews_mood_a on public.reviews(mood_a);
create index if not exists idx_reviews_mood_b on public.reviews(mood_b);

drop trigger if exists trg_reviews_set_updated_at on public.reviews;
create trigger trg_reviews_set_updated_at
before update on public.reviews
for each row
execute function public.set_updated_at();

-- Jetzt review_photos sauber an reviews anbinden
alter table public.review_photos
  drop constraint if exists review_photos_review_id_fkey;

alter table public.review_photos
  add constraint review_photos_review_id_fkey
  foreign key (review_id)
  references public.reviews(id)
  on delete cascade;