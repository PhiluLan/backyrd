-- 20260411100120_social_feed_and_following_signals.sql

-- ----------------------------------------
-- 1) Activity View (Reviews als Social Signal)
-- ----------------------------------------

create or replace view public.social_activity_v1 as
select
  r.id as review_id,
  r.user_id,
  r.spot_id,
  r.created_at,
  s.name as spot_name,
  s.slug as spot_slug,
  s.city as spot_city,
  p.first_name,
  p.last_name,
  p.full_name,
  p.avatar_url
from public.reviews r
join public.spots s on s.id = r.spot_id
left join public.profiles p on p.id = r.user_id
where r.moderation_status = 'visible';

-- ----------------------------------------
-- 2) Following Feed
-- ----------------------------------------

create or replace function public.get_following_feed_v1(
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_limit integer;
  v_offset integer;
  result_json jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset := greatest(0, coalesce(p_offset, 0));

  with following as (
    select f.following
    from public.follows f
    where f.follower = v_user_id
  ),
  feed as (
    select sa.*
    from public.social_activity_v1 sa
    join following f on f.following = sa.user_id
  ),
  paged as (
    select *
    from feed
    order by created_at desc
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'review_id', p.review_id,
          'created_at', p.created_at,
          'spot', jsonb_build_object(
            'id', p.spot_id,
            'name', p.spot_name,
            'slug', p.spot_slug,
            'city', p.spot_city
          ),
          'user', jsonb_build_object(
            'id', p.user_id,
            'first_name', p.first_name,
            'full_name', p.full_name,
            'avatar_url', p.avatar_url
          )
        )
        order by p.created_at desc
      ),
      '[]'::jsonb
    )
  )
  into result_json;

  return result_json;
end;
$$;

-- ----------------------------------------
-- 3) "Friends visited this place"
-- ----------------------------------------

create or replace function public.get_social_proof_for_spot_v1(
  p_spot_id uuid
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
    return jsonb_build_object('friends', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'friends',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'user_id', r.user_id,
            'first_name', p.first_name,
            'avatar_url', p.avatar_url,
            'review_id', r.id,
            'created_at', r.created_at
          )
          order by r.created_at desc
        ),
        '[]'::jsonb
      )
      from public.reviews r
      join public.follows f on f.following = r.user_id
      left join public.profiles p on p.id = r.user_id
      where f.follower = v_user_id
        and r.spot_id = p_spot_id
        and r.moderation_status = 'visible'
    )
  );
end;
$$;