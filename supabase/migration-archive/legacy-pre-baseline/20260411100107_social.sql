-- 20260411100107_social.sql
-- Favorites + Follows als Social Basis

create table if not exists public.favorites (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint favorites_unique unique (user_id, spot_id)
);

create index if not exists idx_favorites_user_id on public.favorites(user_id);
create index if not exists idx_favorites_spot_id on public.favorites(spot_id);

create table if not exists public.follows (
  id bigserial primary key,
  follower uuid not null references public.profiles(id) on delete cascade,
  following uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint follows_unique unique (follower, following),
  constraint follows_no_self_follow check (follower <> following)
);

create index if not exists idx_follows_follower on public.follows(follower);
create index if not exists idx_follows_following on public.follows(following);