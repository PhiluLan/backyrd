-- 20260411100121_search_geo_and_ranking_polish.sql

-- ----------------------------------------
-- 1) Distance Function (Haversine)
-- ----------------------------------------

create or replace function public.calculate_distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
as $$
  select
    6371 * acos(
      cos(radians(lat1)) *
      cos(radians(lat2)) *
      cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) *
      sin(radians(lat2))
    );
$$;

-- ----------------------------------------
-- 2) Nearby Search
-- ----------------------------------------

create or replace function public.get_nearby_spots_v1(
  p_lat double precision,
  p_lng double precision,
  p_radius_km integer default 5,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_json jsonb;
begin
  with base as (
    select
      d.*,
      public.calculate_distance_km(
        p_lat,
        p_lng,
        d.lat,
        d.lng
      ) as distance_km
    from public.spot_discovery_v1 d
    where d.status = 'approved'
      and d.lat is not null
      and d.lng is not null
  ),
  filtered as (
    select *
    from base
    where distance_km <= p_radius_km
  ),
  ranked as (
    select *
    from filtered
    order by
      distance_km asc,
      review_count desc
    limit p_limit
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'slug', r.slug,
          'city', r.city,
          'distance_km', round(r.distance_km::numeric, 2),
          'review_count', r.review_count,
          'top_moods', to_jsonb(r.mood_tokens)
        )
        order by r.distance_km asc
      ),
      '[]'::jsonb
    )
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 3) Trending Score
-- ----------------------------------------

create or replace function public.calculate_trending_score_v1(
  review_count integer,
  latest_review_at timestamptz
)
returns numeric
language sql
as $$
  select
    coalesce(review_count, 0) * 1.0
    +
    case
      when latest_review_at > now() - interval '7 days' then 20
      when latest_review_at > now() - interval '30 days' then 10
      else 0
    end;
$$;

-- ----------------------------------------
-- 4) Trending Spots
-- ----------------------------------------

create or replace function public.get_trending_spots_v1(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_json jsonb;
begin
  with ranked as (
    select
      d.*,
      public.calculate_trending_score_v1(
        d.review_count,
        d.latest_review_at
      ) as trending_score
    from public.spot_discovery_v1 d
    where d.status = 'approved'
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'slug', r.slug,
          'city', r.city,
          'score', round(r.trending_score, 2),
          'review_count', r.review_count,
          'top_moods', to_jsonb(r.mood_tokens)
        )
        order by r.trending_score desc
      ),
      '[]'::jsonb
    )
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 5) Combined Discovery (FINAL)
-- ----------------------------------------

create or replace function public.get_discovery_overview_v1()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'trending', public.get_trending_spots_v1(12),
    'personalized', public.get_my_personalized_home_v1(12)
  );
end;
$$;