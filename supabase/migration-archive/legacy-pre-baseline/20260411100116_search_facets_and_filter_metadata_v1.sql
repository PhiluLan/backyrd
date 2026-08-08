-- 20260411100116_search_facets_and_filter_metadata_v1.sql
-- Search Facets + Filter Metadata für Backyrd
--
-- Ziel:
-- - dynamische Filter-Counts für UI
-- - basiert auf spot_discovery_v1
-- - gleiche Filter wie search_discovery_v1
-- - kein Client muss Counts selbst berechnen

-- ----------------------------------------
-- 1) Facet-Funktion
-- ----------------------------------------

create or replace function public.get_search_facets_v1(
  p_query text default null,
  p_city text default null,
  p_category_slug text default null,
  p_moods text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text;
  result_json jsonb;
begin
  v_query := nullif(trim(p_query), '');

  with base as (
    select *
    from public.spot_discovery_v1 d
    where d.status = 'approved'

      -- city filter
      and (
        p_city is null
        or lower(coalesce(d.city, '')) = lower(p_city)
      )

      -- category filter
      and (
        p_category_slug is null
        or lower(coalesce(d.category_slug, '')) = lower(p_category_slug)
      )

      -- mood filter
      and (
        p_moods is null
        or exists (
          select 1
          from unnest(d.mood_tokens) m
          where lower(m) = any(select lower(x) from unnest(p_moods) x)
        )
      )

      -- search query
      and (
        v_query is null
        or d.search_text % v_query
        or lower(d.search_text) like '%' || lower(v_query) || '%'
      )
  ),

  -- ----------------------------------------
  -- Cities
  -- ----------------------------------------
  city_facets as (
    select
      b.city,
      count(*)::integer as cnt
    from base b
    where b.city is not null
    group by b.city
    order by cnt desc, b.city asc
    limit 20
  ),

  -- ----------------------------------------
  -- Categories
  -- ----------------------------------------
  category_facets as (
    select
      b.category_id,
      b.category_slug,
      b.category_name,
      b.category_icon,
      b.category_color,
      count(*)::integer as cnt
    from base b
    where b.category_id is not null
    group by
      b.category_id,
      b.category_slug,
      b.category_name,
      b.category_icon,
      b.category_color
    order by cnt desc
    limit 20
  ),

  -- ----------------------------------------
  -- Mood Facets
  -- ----------------------------------------
  mood_expanded as (
    select
      unnest(b.mood_tokens) as token
    from base b
  ),
  mood_facets as (
    select
      mt.id as mood_id,
      mt.token,
      count(*)::integer as cnt
    from mood_expanded me
    join public.mood_tokens mt on lower(mt.token::text) = lower(me.token)
    group by mt.id, mt.token
    order by cnt desc
    limit 30
  )

  select jsonb_build_object(
    'cities',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'city', c.city,
            'count', c.cnt
          )
        )
        from city_facets c
      ),
      '[]'::jsonb
    ),

    'categories',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.category_id,
            'slug', c.category_slug,
            'name', c.category_name,
            'icon', c.category_icon,
            'color', c.category_color,
            'count', c.cnt
          )
        )
        from category_facets c
      ),
      '[]'::jsonb
    ),

    'moods',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', m.mood_id,
            'token', m.token,
            'count', m.cnt
          )
        )
        from mood_facets m
      ),
      '[]'::jsonb
    )
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 2) Search V2 mit Facets integriert
-- ----------------------------------------

create or replace function public.search_discovery_v2(
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
  items_json jsonb;
  facets_json jsonb;
begin
  items_json := public.search_discovery_v1(
    p_query := p_query,
    p_city := p_city,
    p_category_slug := p_category_slug,
    p_moods := p_moods,
    p_limit := p_limit,
    p_offset := p_offset
  );

  facets_json := public.get_search_facets_v1(
    p_query := p_query,
    p_city := p_city,
    p_category_slug := p_category_slug,
    p_moods := p_moods
  );

  return jsonb_build_object(
    'items', coalesce(items_json->'items', '[]'::jsonb),
    'total', coalesce(items_json->'total', 0),
    'limit', coalesce(items_json->'limit', p_limit),
    'offset', coalesce(items_json->'offset', p_offset),
    'facets', facets_json
  );
end;
$$;

-- ----------------------------------------
-- 3) Debug Helper
-- ----------------------------------------

create or replace function public.debug_search_facets_v1()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_search_facets_v1(
    p_query := null,
    p_city := null,
    p_category_slug := null,
    p_moods := null
  );
$$;