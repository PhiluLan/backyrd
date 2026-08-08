-- 20260411100111_rpc_discovery.sql
-- Discovery/Search Layer für Backyrd
--
-- Ziel:
-- - zentrale, denormalisierte Discovery-Sicht
-- - Such-/Filter-RPC für Web, Mobile und Admin
-- - besseres Home-Ranking (popular != newest)
-- - additive Migration, keine destruktiven Änderungen

-- ----------------------------------------
-- 1) Zusätzliche Indizes für Discovery/Search
-- ----------------------------------------

create index if not exists idx_spots_city_trgm
  on public.spots using gin (city gin_trgm_ops);

create index if not exists idx_spots_description_trgm
  on public.spots using gin (description gin_trgm_ops);

create index if not exists idx_categories_name_trgm
  on public.categories using gin (name gin_trgm_ops);

create index if not exists idx_categories_slug_trgm
  on public.categories using gin (slug gin_trgm_ops);

create index if not exists idx_mood_tokens_token_trgm
  on public.mood_tokens using gin ((token::text) gin_trgm_ops);

create index if not exists idx_reviews_mood_a_id
  on public.reviews(mood_a_id);

create index if not exists idx_reviews_mood_b_id
  on public.reviews(mood_b_id);

create index if not exists idx_reviews_spot_created_at
  on public.reviews(spot_id, created_at desc);

-- ----------------------------------------
-- 2) Discovery-View
-- ----------------------------------------
-- Diese View ist die zentrale lesbare Grundlage für Search/Home/Explore.
-- Keine Client-App soll sich dafür Tabellen zusammensuchen müssen.

create or replace view public.spot_discovery_v1 as
with review_stats as (
  select
    r.spot_id,
    count(*)::integer as review_count,
    max(r.created_at) as latest_review_at
  from public.reviews r
  group by r.spot_id
),
top_moods as (
  select
    sm.spot_id,
    array_remove(array_agg(mt.token::text order by sm.rank asc nulls last, sm.mood_count desc), null) as mood_tokens
  from public.spot_moods sm
  join public.mood_tokens mt on mt.id = sm.mood_id
  group by sm.spot_id
),
cover_photo as (
  select distinct on (sp.spot_id)
    sp.spot_id,
    sp.url
  from public.spot_photos sp
  order by sp.spot_id, sp.created_at desc
)
select
  s.id,
  s.name,
  s.slug,
  s.address,
  s.city,
  s.country,
  s.lat,
  s.lng,
  s.category_id,
  c.slug as category_slug,
  c.name as category_name,
  c.icon as category_icon,
  c.color as category_color,
  s.description,
  s.website,
  s.phone,
  s.email,
  s.price_level,
  s.header_photo_path,
  s.status,
  s.owner_id,
  s.created_by,
  s.created_at,
  s.updated_at,

  coalesce(cp.url, s.header_photo_path) as cover_photo_url,
  coalesce(rs.review_count, 0) as review_count,
  rs.latest_review_at,
  coalesce(tm.mood_tokens, array[]::text[]) as mood_tokens,

  trim(
    concat_ws(
      ' ',
      s.name,
      s.address,
      s.city,
      s.country,
      c.name,
      c.slug,
      s.description,
      array_to_string(coalesce(tm.mood_tokens, array[]::text[]), ' ')
    )
  ) as search_text
from public.spots s
left join public.categories c on c.id = s.category_id
left join review_stats rs on rs.spot_id = s.id
left join top_moods tm on tm.spot_id = s.id
left join cover_photo cp on cp.spot_id = s.id;

-- ----------------------------------------
-- 3) Search / Discovery RPC
-- ----------------------------------------
-- Rückgabe absichtlich als JSONB, passend zum bisherigen RPC-Stil.
--
-- Filter:
-- - p_query: freie Suche
-- - p_city: exakter/ILIKE City-Filter
-- - p_category_slug: Kategorie
-- - p_moods: Mood-Filter (matcht ANY overlap)
-- - p_limit / p_offset: Pagination
--
-- Ranking:
-- - Text-Relevanz
-- - Mood-Overlap
-- - Review-Count
-- - Recency

create or replace function public.search_discovery_v1(
  p_query text default null,
  p_city text default null,
  p_category_slug text default null,
  p_moods text[] default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_query := nullif(trim(p_query), '');
  v_limit := greatest(1, least(coalesce(p_limit, 24), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  with base as (
    select
      d.*,

      case
        when v_query is null then 0::double precision
        else greatest(
          similarity(coalesce(d.name, ''), v_query),
          similarity(coalesce(d.city, ''), v_query),
          similarity(coalesce(d.address, ''), v_query),
          similarity(coalesce(d.category_name, ''), v_query),
          similarity(coalesce(d.description, ''), v_query),
          similarity(coalesce(d.search_text, ''), v_query)
        )
      end as text_rank,

      case
        when v_query is null then 0
        when lower(coalesce(d.name, '')) = lower(v_query) then 120
        when lower(coalesce(d.name, '')) like lower(v_query) || '%' then 80
        when lower(coalesce(d.name, '')) like '%' || lower(v_query) || '%' then 50
        when lower(coalesce(d.city, '')) like '%' || lower(v_query) || '%' then 20
        when lower(coalesce(d.category_name, '')) like '%' || lower(v_query) || '%' then 20
        when lower(coalesce(d.search_text, '')) like '%' || lower(v_query) || '%' then 10
        else 0
      end as exactness_bonus,

      case
        when p_moods is null or cardinality(p_moods) = 0 then 0
        else (
          select count(*)::integer
          from unnest(coalesce(d.mood_tokens, array[]::text[])) as spot_mood(token)
          where lower(spot_mood.token) = any (
            select lower(x) from unnest(p_moods) as x
          )
        )
      end as mood_overlap
    from public.spot_discovery_v1 d
    where d.status = 'approved'
      and (
        p_city is null
        or trim(p_city) = ''
        or lower(coalesce(d.city, '')) = lower(trim(p_city))
        or lower(coalesce(d.city, '')) like '%' || lower(trim(p_city)) || '%'
      )
      and (
        p_category_slug is null
        or trim(p_category_slug) = ''
        or lower(coalesce(d.category_slug, '')) = lower(trim(p_category_slug))
      )
      and (
        p_moods is null
        or cardinality(p_moods) = 0
        or exists (
          select 1
          from unnest(coalesce(d.mood_tokens, array[]::text[])) as spot_mood(token)
          where lower(spot_mood.token) = any (
            select lower(x) from unnest(p_moods) as x
          )
        )
      )
      and (
        v_query is null
        or d.search_text % v_query
        or lower(coalesce(d.search_text, '')) like '%' || lower(v_query) || '%'
      )
  ),
  ranked as (
    select
      b.*,
      (
        b.exactness_bonus::double precision
        + (b.text_rank * 100.0)
        + (least(b.mood_overlap, 5) * 15.0)
        + (least(b.review_count, 50) * 0.8)
        + case
            when b.latest_review_at is not null and b.latest_review_at > now() - interval '30 days' then 8
            when b.latest_review_at is not null and b.latest_review_at > now() - interval '90 days' then 4
            else 0
          end
      ) as score
    from base b
  ),
  total_count as (
    select count(*)::integer as total
    from ranked
  ),
  paged as (
    select *
    from ranked
    order by
      score desc,
      review_count desc,
      latest_review_at desc nulls last,
      created_at desc
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'slug', p.slug,
            'address', p.address,
            'city', p.city,
            'country', p.country,
            'lat', p.lat,
            'lng', p.lng,
            'category', jsonb_build_object(
              'id', p.category_id,
              'slug', p.category_slug,
              'name', p.category_name,
              'icon', p.category_icon,
              'color', p.category_color
            ),
            'description', p.description,
            'price_level', p.price_level,
            'header_photo_path', p.header_photo_path,
            'cover_photo_url', p.cover_photo_url,
            'review_count', p.review_count,
            'latest_review_at', p.latest_review_at,
            'top_moods', to_jsonb(p.mood_tokens),
            'score', round(p.score::numeric, 3)
          )
          order by
            p.score desc,
            p.review_count desc,
            p.latest_review_at desc nulls last,
            p.created_at desc
        )
        from paged p
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_count), 0),
    'limit',
    v_limit,
    'offset',
    v_offset
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 4) Verbesserter Home-RPC
-- ----------------------------------------
-- v1 hatte popular und newest faktisch gleich.
-- v2 trennt das sauber:
-- - popular: review_count / recency
-- - newest: created_at
-- - favorites: userbezogen

create or replace function public.get_home_sections_v2(
  p_user_id uuid default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  popular_json jsonb;
  newest_json jsonb;
  favorites_json jsonb;
begin
  v_limit := greatest(1, least(coalesce(p_limit, 12), 50));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'slug', d.slug,
        'address', d.address,
        'city', d.city,
        'country', d.country,
        'price_level', d.price_level,
        'category_name', d.category_name,
        'header_photo_path', d.header_photo_path,
        'cover_photo_url', d.cover_photo_url,
        'review_count', d.review_count,
        'top_moods', to_jsonb(d.mood_tokens)
      )
      order by
        d.review_count desc,
        d.latest_review_at desc nulls last,
        d.created_at desc
    ),
    '[]'::jsonb
  )
  into popular_json
  from (
    select *
    from public.spot_discovery_v1
    where status = 'approved'
    order by
      review_count desc,
      latest_review_at desc nulls last,
      created_at desc
    limit v_limit
  ) d;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'slug', d.slug,
        'address', d.address,
        'city', d.city,
        'country', d.country,
        'price_level', d.price_level,
        'category_name', d.category_name,
        'header_photo_path', d.header_photo_path,
        'cover_photo_url', d.cover_photo_url,
        'review_count', d.review_count,
        'top_moods', to_jsonb(d.mood_tokens)
      )
      order by d.created_at desc
    ),
    '[]'::jsonb
  )
  into newest_json
  from (
    select *
    from public.spot_discovery_v1
    where status = 'approved'
    order by created_at desc
    limit v_limit
  ) d;

  if p_user_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'name', d.name,
          'slug', d.slug,
          'address', d.address,
          'city', d.city,
          'country', d.country,
          'price_level', d.price_level,
          'category_name', d.category_name,
          'header_photo_path', d.header_photo_path,
          'cover_photo_url', d.cover_photo_url,
          'review_count', d.review_count,
          'top_moods', to_jsonb(d.mood_tokens)
        )
        order by f.created_at desc
      ),
      '[]'::jsonb
    )
    into favorites_json
    from (
      select f.*
      from public.favorites f
      where f.user_id = p_user_id
      order by f.created_at desc
      limit v_limit
    ) f
    join public.spot_discovery_v1 d on d.id = f.spot_id
    where d.status = 'approved';
  else
    favorites_json := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'popular', coalesce(popular_json, '[]'::jsonb),
    'newest', coalesce(newest_json, '[]'::jsonb),
    'favorites', coalesce(favorites_json, '[]'::jsonb)
  );
end;
$$;