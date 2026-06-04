-- 20260411100106_moods.sql
-- Mood-Tokens + Spot-Mood-Aggregationen

create table if not exists public.mood_tokens (
  id bigserial primary key,
  token citext not null unique,
  locale text default 'de-CH',
  valid boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.spot_moods (
  id bigserial primary key,
  spot_id uuid not null references public.spots(id) on delete cascade,
  mood_id bigint not null references public.mood_tokens(id) on delete cascade,
  mood_count integer not null default 1,
  rank integer,
  source text default 'review_aggregate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint spot_moods_unique unique (spot_id, mood_id)
);

create index if not exists idx_spot_moods_spot_id on public.spot_moods(spot_id);
create index if not exists idx_spot_moods_mood_id on public.spot_moods(mood_id);
create index if not exists idx_spot_moods_rank on public.spot_moods(rank);

drop trigger if exists trg_spot_moods_set_updated_at on public.spot_moods;
create trigger trg_spot_moods_set_updated_at
before update on public.spot_moods
for each row
execute function public.set_updated_at();

create or replace view public.spot_moods_agg as
select
  sm.spot_id,
  sm.mood_id,
  mt.token,
  sm.mood_count,
  sm.rank,
  sm.updated_at
from public.spot_moods sm
join public.mood_tokens mt on mt.id = sm.mood_id;