-- Backyrd public web read-only RPCs
-- Corrected version: review images use reviews.photo_path.
-- The table public.spot_photos has no review_id column in the current schema.

create or replace function public.backyrd_web_city_spots_v1(
  p_city text,
  p_limit integer default 12
)
returns table (
  spot_id uuid,
  name text,
  city text,
  category_name text,
  photo_url text,
  top_moods text[],
  review_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with review_stats as (
    select
      r.spot_id,
      count(*)::bigint as review_count
    from public.reviews r
    group by r.spot_id
  ),
  mood_rows as (
    select r.spot_id, nullif(trim(r.mood_a), '') as mood
    from public.reviews r
    where nullif(trim(r.mood_a), '') is not null

    union all

    select r.spot_id, nullif(trim(r.mood_b), '') as mood
    from public.reviews r
    where nullif(trim(r.mood_b), '') is not null
  ),
  mood_counts as (
    select
      mr.spot_id,
      mr.mood,
      count(*) as mood_count
    from mood_rows mr
    group by mr.spot_id, mr.mood
  ),
  top_moods as (
    select
      ranked.spot_id,
      array_agg(ranked.mood order by ranked.mood_count desc, ranked.mood)
        filter (where ranked.mood_rank <= 3) as top_moods
    from (
      select
        mc.*,
        row_number() over (
          partition by mc.spot_id
          order by mc.mood_count desc, mc.mood
        ) as mood_rank
      from mood_counts mc
    ) ranked
    group by ranked.spot_id
  )
  select
    s.id as spot_id,
    s.name,
    s.city,
    c.name as category_name,
    coalesce(
      nullif(s.header_photo_path, ''),
      photo.url
    ) as photo_url,
    coalesce(tm.top_moods, array[]::text[]) as top_moods,
    coalesce(rs.review_count, 0)::bigint as review_count
  from public.spots s
  left join public.categories c on c.id = s.category_id
  left join review_stats rs on rs.spot_id = s.id
  left join top_moods tm on tm.spot_id = s.id
  left join lateral (
    select sp.url
    from public.spot_photos sp
    where sp.spot_id = s.id
      and nullif(sp.url, '') is not null
    order by sp.created_at asc nulls last
    limit 1
  ) photo on true
  where lower(trim(coalesce(s.city, ''))) = lower(trim(p_city))
    and coalesce(s.status, 'approved') = 'approved'
  order by
    case when coalesce(rs.review_count, 0) > 0 then 0 else 1 end,
    coalesce(rs.review_count, 0) desc,
    s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$$;

create or replace function public.backyrd_web_top_spots_v1(
  p_city text default 'Basel',
  p_limit integer default 6
)
returns table (
  spot_id uuid,
  name text,
  city text,
  category_name text,
  photo_url text,
  top_moods text[],
  review_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.backyrd_web_city_spots_v1(
    p_city,
    greatest(1, least(coalesce(p_limit, 6), 12))
  )
  where cardinality(top_moods) > 0
  order by review_count desc, name asc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$$;

create or replace function public.backyrd_web_top_moments_v1(
  p_limit integer default 5
)
returns table (
  review_id uuid,
  spot_id uuid,
  spot_name text,
  city text,
  first_name text,
  text text,
  mood_a text,
  mood_b text,
  photo_url text,
  likes_count bigint,
  comments_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with likes as (
    select
      rl.review_id,
      count(*)::bigint as likes_count
    from public.review_likes rl
    group by rl.review_id
  ),
  comments as (
    select
      rc.review_id,
      count(*)::bigint as comments_count
    from public.review_comments rc
    group by rc.review_id
  )
  select
    r.id as review_id,
    r.spot_id,
    s.name as spot_name,
    s.city,
    p.first_name,
    r.text,
    nullif(trim(r.mood_a), '') as mood_a,
    nullif(trim(r.mood_b), '') as mood_b,
    nullif(trim(r.photo_path), '') as photo_url,
    coalesce(l.likes_count, 0)::bigint as likes_count,
    coalesce(cm.comments_count, 0)::bigint as comments_count,
    r.created_at
  from public.reviews r
  join public.spots s on s.id = r.spot_id
  left join public.profiles p on p.id = r.user_id
  left join likes l on l.review_id = r.id
  left join comments cm on cm.review_id = r.id
  where r.created_at >= now() - interval '7 days'
    and coalesce(s.status, 'approved') = 'approved'
    and (
      nullif(trim(coalesce(r.text, '')), '') is not null
      or nullif(trim(coalesce(r.photo_path, '')), '') is not null
    )
  order by
    (
      coalesce(l.likes_count, 0) * 3
      + coalesce(cm.comments_count, 0) * 5
      + case
          when nullif(trim(coalesce(r.photo_path, '')), '') is not null
          then 2
          else 0
        end
      + greatest(
          0,
          7 - floor(extract(epoch from (now() - r.created_at)) / 86400)
        )
    ) desc,
    r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.backyrd_web_city_spots_v1(text, integer)
  from public;
revoke all on function public.backyrd_web_top_spots_v1(text, integer)
  from public;
revoke all on function public.backyrd_web_top_moments_v1(integer)
  from public;

grant execute on function public.backyrd_web_city_spots_v1(text, integer)
  to anon, authenticated;

grant execute on function public.backyrd_web_top_spots_v1(text, integer)
  to anon, authenticated;

grant execute on function public.backyrd_web_top_moments_v1(integer)
  to anon, authenticated;
