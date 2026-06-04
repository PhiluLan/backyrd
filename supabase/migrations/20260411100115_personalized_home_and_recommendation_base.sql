-- 20260411100115_personalized_home_and_recommendation_base.sql
-- Personalisierte Home-/Recommendation-Basis für Backyrd
--
-- Ziel:
-- - zentrale User-Signale aus Favorites + Reviews + Profil aufbereiten
-- - personalisierte Home Sections serverseitig liefern
-- - kein finaler "AI recommender", sondern robuste Domain-Basis
-- - Mobile/Web/Admin konsumieren zentrale JSON-RPCs

-- ----------------------------------------
-- 1) User Preference View
-- ----------------------------------------
-- Aggregiert:
-- - Home city / country aus profile
-- - favorite cities
-- - review cities
-- - favorite categories
-- - review categories
-- - favorite moods
-- - review moods
--
-- Diese View ist absichtlich rein lesend und deterministisch.

create or replace view public.user_preference_profile_v1 as
with profile_base as (
  select
    p.id as user_id,
    p.city as profile_city,
    p.country as profile_country,
    p.locale
  from public.profiles p
),
favorite_cities as (
  select
    f.user_id,
    s.city,
    count(*)::integer as cnt
  from public.favorites f
  join public.spots s on s.id = f.spot_id
  where s.city is not null
  group by f.user_id, s.city
),
favorite_categories as (
  select
    f.user_id,
    s.category_id,
    count(*)::integer as cnt
  from public.favorites f
  join public.spots s on s.id = f.spot_id
  where s.category_id is not null
  group by f.user_id, s.category_id
),
favorite_moods as (
  select
    f.user_id,
    sm.mood_id,
    sum(sm.mood_count)::integer as cnt
  from public.favorites f
  join public.spot_moods sm on sm.spot_id = f.spot_id
  group by f.user_id, sm.mood_id
),
review_cities as (
  select
    r.user_id,
    coalesce(r.city, s.city) as city,
    count(*)::integer as cnt
  from public.reviews r
  left join public.spots s on s.id = r.spot_id
  where r.user_id is not null
    and coalesce(r.city, s.city) is not null
  group by r.user_id, coalesce(r.city, s.city)
),
review_categories as (
  select
    r.user_id,
    s.category_id,
    count(*)::integer as cnt
  from public.reviews r
  join public.spots s on s.id = r.spot_id
  where r.user_id is not null
    and s.category_id is not null
  group by r.user_id, s.category_id
),
review_moods as (
  select
    user_id,
    mood_id,
    count(*)::integer as cnt
  from (
    select
      r.user_id,
      r.mood_a_id as mood_id
    from public.reviews r
    where r.user_id is not null
      and r.mood_a_id is not null

    union all

    select
      r.user_id,
      r.mood_b_id as mood_id
    from public.reviews r
    where r.user_id is not null
      and r.mood_b_id is not null
  ) x
  group by user_id, mood_id
)
select
  pb.user_id,
  pb.profile_city,
  pb.profile_country,
  pb.locale,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'city', fc.city,
          'count', fc.cnt
        )
        order by fc.cnt desc, fc.city asc
      ),
      '[]'::jsonb
    )
    from favorite_cities fc
    where fc.user_id = pb.user_id
  ) as favorite_cities,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'city', rc.city,
          'count', rc.cnt
        )
        order by rc.cnt desc, rc.city asc
      ),
      '[]'::jsonb
    )
    from review_cities rc
    where rc.user_id = pb.user_id
  ) as review_cities,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category_id', fc.category_id,
          'count', fc.cnt
        )
        order by fc.cnt desc, fc.category_id asc
      ),
      '[]'::jsonb
    )
    from favorite_categories fc
    where fc.user_id = pb.user_id
  ) as favorite_categories,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category_id', rc.category_id,
          'count', rc.cnt
        )
        order by rc.cnt desc, rc.category_id asc
      ),
      '[]'::jsonb
    )
    from review_categories rc
    where rc.user_id = pb.user_id
  ) as review_categories,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'mood_id', fm.mood_id,
          'count', fm.cnt,
          'token', mt.token
        )
        order by fm.cnt desc, fm.mood_id asc
      ),
      '[]'::jsonb
    )
    from favorite_moods fm
    join public.mood_tokens mt on mt.id = fm.mood_id
    where fm.user_id = pb.user_id
  ) as favorite_moods,

  (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'mood_id', rm.mood_id,
          'count', rm.cnt,
          'token', mt.token
        )
        order by rm.cnt desc, rm.mood_id asc
      ),
      '[]'::jsonb
    )
    from review_moods rm
    join public.mood_tokens mt on mt.id = rm.mood_id
    where rm.user_id = pb.user_id
  ) as review_moods
from profile_base pb;

-- ----------------------------------------
-- 2) Personalisierte Discovery-Funktion
-- ----------------------------------------
-- Liefert Spot-Kandidaten mit Score-Komponenten.
-- Noch nicht "magisch", aber zentral, konsistent und ausbaubar.

create or replace function public.get_personalized_candidates_v1(
  p_user_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  result_json jsonb;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 100), 300));

  with pref as (
    select *
    from public.user_preference_profile_v1 upp
    where upp.user_id = p_user_id
    limit 1
  ),
  reviewed_spots as (
    select distinct r.spot_id
    from public.reviews r
    where r.user_id = p_user_id
  ),
  favorite_spots as (
    select distinct f.spot_id
    from public.favorites f
    where f.user_id = p_user_id
  ),
  fav_category_weights as (
    select
      (x->>'category_id')::bigint as category_id,
      (x->>'count')::integer as cnt
    from pref p,
    lateral jsonb_array_elements(p.favorite_categories) x
  ),
  review_category_weights as (
    select
      (x->>'category_id')::bigint as category_id,
      (x->>'count')::integer as cnt
    from pref p,
    lateral jsonb_array_elements(p.review_categories) x
  ),
  fav_mood_weights as (
    select
      (x->>'mood_id')::bigint as mood_id,
      (x->>'count')::integer as cnt
    from pref p,
    lateral jsonb_array_elements(p.favorite_moods) x
  ),
  review_mood_weights as (
    select
      (x->>'mood_id')::bigint as mood_id,
      (x->>'count')::integer as cnt
    from pref p,
    lateral jsonb_array_elements(p.review_moods) x
  ),
  base as (
    select
      d.*,

      case
        when exists (
          select 1 from favorite_spots fs where fs.spot_id = d.id
        ) then 1 else 0
      end as is_favorite,

      case
        when exists (
          select 1 from reviewed_spots rs where rs.spot_id = d.id
        ) then 1 else 0
      end as has_reviewed,

      case
        when exists (
          select 1
          from pref p
          where p.profile_city is not null
            and lower(coalesce(d.city, '')) = lower(p.profile_city)
        ) then 1 else 0
      end as matches_profile_city,

      coalesce((
        select max((x->>'count')::integer)
        from pref p,
        lateral jsonb_array_elements(p.favorite_cities) x
        where lower(coalesce(x->>'city', '')) = lower(coalesce(d.city, ''))
      ), 0) as favorite_city_weight,

      coalesce((
        select max((x->>'count')::integer)
        from pref p,
        lateral jsonb_array_elements(p.review_cities) x
        where lower(coalesce(x->>'city', '')) = lower(coalesce(d.city, ''))
      ), 0) as review_city_weight,

      coalesce((
        select max(fc.cnt)
        from fav_category_weights fc
        where fc.category_id = d.category_id
      ), 0) as favorite_category_weight,

      coalesce((
        select max(rc.cnt)
        from review_category_weights rc
        where rc.category_id = d.category_id
      ), 0) as review_category_weight,

      coalesce((
        select sum(fm.cnt)::integer
        from public.spot_moods sm
        join fav_mood_weights fm on fm.mood_id = sm.mood_id
        where sm.spot_id = d.id
      ), 0) as favorite_mood_weight,

      coalesce((
        select sum(rm.cnt)::integer
        from public.spot_moods sm
        join review_mood_weights rm on rm.mood_id = sm.mood_id
        where sm.spot_id = d.id
      ), 0) as review_mood_weight
    from public.spot_discovery_v1 d
    where d.status = 'approved'
  ),
  scored as (
    select
      b.*,
      (
        case when b.is_favorite = 1 then 1000 else 0 end
        + case when b.has_reviewed = 1 then 150 else 0 end
        + case when b.matches_profile_city = 1 then 35 else 0 end
        + least(b.favorite_city_weight, 20) * 3.0
        + least(b.review_city_weight, 20) * 2.0
        + least(b.favorite_category_weight, 20) * 4.0
        + least(b.review_category_weight, 20) * 3.0
        + least(b.favorite_mood_weight, 50) * 1.8
        + least(b.review_mood_weight, 50) * 1.2
        + least(b.review_count, 100) * 0.7
        + case
            when b.latest_review_at is not null and b.latest_review_at > now() - interval '30 days' then 8
            when b.latest_review_at is not null and b.latest_review_at > now() - interval '90 days' then 4
            else 0
          end
      ) as personalized_score
    from base b
  ),
  ranked as (
    select *
    from scored
    order by
      personalized_score desc,
      review_count desc,
      latest_review_at desc nulls last,
      created_at desc
    limit v_limit
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'name', r.name,
            'slug', r.slug,
            'address', r.address,
            'city', r.city,
            'country', r.country,
            'category', jsonb_build_object(
              'id', r.category_id,
              'slug', r.category_slug,
              'name', r.category_name,
              'icon', r.category_icon,
              'color', r.category_color
            ),
            'description', r.description,
            'price_level', r.price_level,
            'cover_photo_url', r.cover_photo_url,
            'review_count', r.review_count,
            'latest_review_at', r.latest_review_at,
            'top_moods', to_jsonb(r.mood_tokens),
            'score', round(r.personalized_score::numeric, 3),
            'signals', jsonb_build_object(
              'is_favorite', r.is_favorite,
              'has_reviewed', r.has_reviewed,
              'matches_profile_city', r.matches_profile_city,
              'favorite_city_weight', r.favorite_city_weight,
              'review_city_weight', r.review_city_weight,
              'favorite_category_weight', r.favorite_category_weight,
              'review_category_weight', r.review_category_weight,
              'favorite_mood_weight', r.favorite_mood_weight,
              'review_mood_weight', r.review_mood_weight
            )
          )
          order by
            r.personalized_score desc,
            r.review_count desc,
            r.latest_review_at desc nulls last,
            r.created_at desc
        )
        from ranked r
      ),
      '[]'::jsonb
    )
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 3) Personalisierte Home Sections
-- ----------------------------------------
-- Liefert:
-- - for_you
-- - your_city
-- - based_on_favorites
-- - trending
--
-- Wenn p_user_id null ist:
-- -> fallback auf get_home_sections_v2

create or replace function public.get_personalized_home_v1(
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
  v_profile_city text;
  for_you_json jsonb;
  your_city_json jsonb;
  based_on_favorites_json jsonb;
  trending_json jsonb;
begin
  v_limit := greatest(1, least(coalesce(p_limit, 12), 50));

  if p_user_id is null then
    return public.get_home_sections_v2(null, v_limit);
  end if;

  select p.city
  into v_profile_city
  from public.profiles p
  where p.id = p_user_id
  limit 1;

  select coalesce(
    jsonb_agg(item order by (item->>'score')::numeric desc),
    '[]'::jsonb
  )
  into for_you_json
  from (
    select item
    from jsonb_array_elements(
      coalesce(public.get_personalized_candidates_v1(p_user_id, v_limit * 3)->'items', '[]'::jsonb)
    ) item
    limit v_limit
  ) x;

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
  into your_city_json
  from (
    select *
    from public.spot_discovery_v1 d
    where d.status = 'approved'
      and v_profile_city is not null
      and lower(coalesce(d.city, '')) = lower(v_profile_city)
    order by
      d.review_count desc,
      d.latest_review_at desc nulls last,
      d.created_at desc
    limit v_limit
  ) d;

  select coalesce(
    jsonb_agg(item order by (item->>'score')::numeric desc),
    '[]'::jsonb
  )
  into based_on_favorites_json
  from (
    select item
    from jsonb_array_elements(
      coalesce(public.get_personalized_candidates_v1(p_user_id, v_limit * 4)->'items', '[]'::jsonb)
    ) item
    where coalesce((item->'signals'->>'favorite_category_weight')::integer, 0) > 0
       or coalesce((item->'signals'->>'favorite_mood_weight')::integer, 0) > 0
       or coalesce((item->'signals'->>'favorite_city_weight')::integer, 0) > 0
    limit v_limit
  ) x;

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
  into trending_json
  from (
    select *
    from public.spot_discovery_v1 d
    where d.status = 'approved'
    order by
      d.review_count desc,
      d.latest_review_at desc nulls last,
      d.created_at desc
    limit v_limit
  ) d;

  return jsonb_build_object(
    'for_you', coalesce(for_you_json, '[]'::jsonb),
    'your_city', coalesce(your_city_json, '[]'::jsonb),
    'based_on_favorites', coalesce(based_on_favorites_json, '[]'::jsonb),
    'trending', coalesce(trending_json, '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------
-- 4) Auth-bezogener Wrapper
-- ----------------------------------------
-- Praktisch für Mobile/Web:
-- kein p_user_id im Client erforderlich

create or replace function public.get_my_personalized_home_v1(
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return public.get_home_sections_v2(null, p_limit);
  end if;

  return public.get_personalized_home_v1(v_user_id, p_limit);
end;
$$;

-- ----------------------------------------
-- 5) Debug-/Analyse-RPC
-- ----------------------------------------
-- Zeigt die Preference-Basis eines Users transparent an

create or replace function public.get_user_preference_profile_v1(
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  result_json jsonb;
begin
  v_user_id := coalesce(p_user_id, auth.uid());

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select jsonb_build_object(
    'user_id', upp.user_id,
    'profile_city', upp.profile_city,
    'profile_country', upp.profile_country,
    'locale', upp.locale,
    'favorite_cities', upp.favorite_cities,
    'review_cities', upp.review_cities,
    'favorite_categories', upp.favorite_categories,
    'review_categories', upp.review_categories,
    'favorite_moods', upp.favorite_moods,
    'review_moods', upp.review_moods
  )
  into result_json
  from public.user_preference_profile_v1 upp
  where upp.user_id = v_user_id
  limit 1;

  return coalesce(
    result_json,
    jsonb_build_object(
      'user_id', v_user_id,
      'profile_city', null,
      'profile_country', null,
      'locale', null,
      'favorite_cities', '[]'::jsonb,
      'review_cities', '[]'::jsonb,
      'favorite_categories', '[]'::jsonb,
      'review_categories', '[]'::jsonb,
      'favorite_moods', '[]'::jsonb,
      'review_moods', '[]'::jsonb
    )
  );
end;
$$;