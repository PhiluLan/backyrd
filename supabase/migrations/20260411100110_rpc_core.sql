-- 20260411100110_rpc_core.sql
-- Erste zentrale Domain-RPCs:
-- - get_spot_detail_v1
-- - get_home_sections_v1
-- - match_mood_v1

create or replace function public.match_mood_v1(input text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text;
  matched_id bigint;
begin
  clean := lower(trim(input));

  if clean is null or clean = '' then
    return null;
  end if;

  select id
  into matched_id
  from public.mood_tokens
  where lower(token::text) = clean
  limit 1;

  if matched_id is not null then
    return matched_id;
  end if;

  insert into public.mood_tokens (token, locale, valid)
  values (clean, 'de-CH', true)
  returning id into matched_id;

  return matched_id;
end;
$$;

create or replace function public.get_spot_detail_v1(p_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  spot_json jsonb;
  photos_json jsonb;
  reviews_json jsonb;
  moods_json jsonb;
begin
  select jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'address', s.address,
    'city', s.city,
    'country', s.country,
    'lat', s.lat,
    'lng', s.lng,
    'description', s.description,
    'website', s.website,
    'phone', s.phone,
    'email', s.email,
    'price_level', s.price_level,
    'header_photo_path', s.header_photo_path,
    'status', s.status,
    'category', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'icon', c.icon,
      'color', c.color
    )
  )
  into spot_json
  from public.spots s
  left join public.categories c on c.id = s.category_id
  where s.id = p_spot_id
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sp.id,
        'url', sp.url,
        'created_at', sp.created_at
      )
      order by sp.created_at desc
    ),
    '[]'::jsonb
  )
  into photos_json
  from public.spot_photos sp
  where sp.spot_id = p_spot_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'text', r.text,
        'mood_a', r.mood_a,
        'mood_b', r.mood_b,
        'created_at', r.created_at,
        'user', jsonb_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'avatar_url', p.avatar_url
        ),
        'photos', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', rp.id,
                'url', rp.url,
                'created_at', rp.created_at
              )
              order by rp.created_at asc
            ),
            '[]'::jsonb
          )
          from public.review_photos rp
          where rp.review_id = r.id
        )
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into reviews_json
  from public.reviews r
  left join public.profiles p on p.id = r.user_id
  where r.spot_id = p_spot_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'mood_id', sm.mood_id,
        'token', mt.token,
        'mood_count', sm.mood_count,
        'rank', sm.rank
      )
      order by sm.rank asc nulls last, sm.mood_count desc
    ),
    '[]'::jsonb
  )
  into moods_json
  from public.spot_moods sm
  join public.mood_tokens mt on mt.id = sm.mood_id
  where sm.spot_id = p_spot_id;

  return jsonb_build_object(
    'spot', coalesce(spot_json, '{}'::jsonb),
    'photos', coalesce(photos_json, '[]'::jsonb),
    'reviews', coalesce(reviews_json, '[]'::jsonb),
    'top_moods', coalesce(moods_json, '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_home_sections_v1(
  p_user_id uuid default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  popular_json jsonb;
  newest_json jsonb;
  favorites_json jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'address', s.address,
        'city', s.city,
        'country', s.country,
        'price_level', s.price_level,
        'category_name', c.name,
        'header_photo_path', s.header_photo_path,
        'photo_url', (
          select sp.url
          from public.spot_photos sp
          where sp.spot_id = s.id
          order by sp.created_at desc
          limit 1
        )
      )
    ),
    '[]'::jsonb
  )
  into popular_json
  from (
    select s.*
    from public.spots s
    where s.status = 'approved'
    order by s.created_at desc
    limit p_limit
  ) s
  left join public.categories c on c.id = s.category_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'address', s.address,
        'city', s.city,
        'country', s.country,
        'price_level', s.price_level,
        'category_name', c.name,
        'header_photo_path', s.header_photo_path,
        'photo_url', (
          select sp.url
          from public.spot_photos sp
          where sp.spot_id = s.id
          order by sp.created_at desc
          limit 1
        )
      )
    ),
    '[]'::jsonb
  )
  into newest_json
  from (
    select s.*
    from public.spots s
    where s.status = 'approved'
    order by s.created_at desc
    limit p_limit
  ) s
  left join public.categories c on c.id = s.category_id;

  if p_user_id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'address', s.address,
          'city', s.city,
          'country', s.country,
          'price_level', s.price_level,
          'category_name', c.name,
          'header_photo_path', s.header_photo_path,
          'photo_url', (
            select sp.url
            from public.spot_photos sp
            where sp.spot_id = s.id
            order by sp.created_at desc
            limit 1
          )
        )
      ),
      '[]'::jsonb
    )
    into favorites_json
    from public.favorites f
    join public.spots s on s.id = f.spot_id
    left join public.categories c on c.id = s.category_id
    where f.user_id = p_user_id
    limit p_limit;
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