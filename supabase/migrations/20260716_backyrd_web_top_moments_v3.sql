-- Backyrd public Moments V4
-- Returns the strongest public Moments from the last seven days.
-- Moment images are resolved from public.review_photos because reviews.photo_path is unused.

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
    coalesce(nullif(trim(s.name), ''), 'Backyrd Spot') as spot_name,
    s.city,
    p.first_name,
    nullif(trim(coalesce(r.text, '')), '') as text,
    nullif(trim(coalesce(r.mood_a, '')), '') as mood_a,
    nullif(trim(coalesce(r.mood_b, '')), '') as mood_b,
    review_photo.url as photo_url,
    coalesce(l.likes_count, 0)::bigint as likes_count,
    coalesce(cm.comments_count, 0)::bigint as comments_count,
    r.created_at
  from public.reviews r
  join public.spots s on s.id = r.spot_id
  left join public.profiles p on p.id = r.user_id
  left join likes l on l.review_id = r.id
  left join comments cm on cm.review_id = r.id
  left join lateral (
    select rp.url
    from public.review_photos rp
    where rp.review_id = r.id
      and nullif(trim(coalesce(rp.url, '')), '') is not null
    order by rp.created_at asc nulls last, rp.id asc
    limit 1
  ) review_photo on true
  where r.created_at >= now() - interval '7 days'
  order by
    (
      coalesce(l.likes_count, 0) * 3
      + coalesce(cm.comments_count, 0) * 5
      + case when review_photo.url is not null then 2 else 0 end
      + greatest(
          0,
          7 - floor(extract(epoch from (now() - r.created_at)) / 86400)
        )
    ) desc,
    r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

revoke all on function public.backyrd_web_top_moments_v1(integer)
  from public;

grant execute on function public.backyrd_web_top_moments_v1(integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
