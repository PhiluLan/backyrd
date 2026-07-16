-- Backyrd public moments V2
-- Shows the strongest five reviews from the last seven days.
-- No approved-status or content filter, so newly created Moments are not hidden.

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

revoke all on function public.backyrd_web_top_moments_v1(integer)
  from public;

grant execute on function public.backyrd_web_top_moments_v1(integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
