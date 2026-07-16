-- Backyrd public spot detail V1

create or replace function public.backyrd_web_spot_detail_v1(
  p_spot_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_spot as (
    select
      s.id,
      s.name,
      s.address,
      s.city,
      s.country,
      s.header_photo_path,
      s.price_level,
      s.website,
      s.phone,
      c.id as category_id,
      c.name as category_name
    from public.spots s
    left join public.categories c on c.id = s.category_id
    where s.id = p_spot_id
      and coalesce(s.status, 'approved') = 'approved'
    limit 1
  ),
  mood_rows as (
    select nullif(trim(r.mood_a), '') as mood
    from public.reviews r
    where r.spot_id = p_spot_id
      and nullif(trim(r.mood_a), '') is not null
    union all
    select nullif(trim(r.mood_b), '') as mood
    from public.reviews r
    where r.spot_id = p_spot_id
      and nullif(trim(r.mood_b), '') is not null
  ),
  mood_counts as (
    select mood, count(*)::bigint as mood_count
    from mood_rows
    group by mood
  )
  select jsonb_build_object(
    'spot',
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'address', s.address,
      'city', s.city,
      'country', s.country,
      'header_photo_path', s.header_photo_path,
      'price_level', s.price_level,
      'website', s.website,
      'phone', s.phone,
      'email', null,
      'category',
      case
        when s.category_id is null then null
        else jsonb_build_object(
          'id', s.category_id,
          'name', s.category_name
        )
      end
    ),
    'photos',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'url', sp.url
          )
          order by sp.created_at asc nulls last
        )
        from public.spot_photos sp
        where sp.spot_id = s.id
          and nullif(trim(sp.url), '') is not null
      ),
      '[]'::jsonb
    ),
    'top_moods',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'mood_id', mc.mood,
            'token', mc.mood,
            'count', mc.mood_count
          )
          order by mc.mood_count desc, mc.mood asc
        )
        from (
          select mood, mood_count
          from mood_counts
          order by mood_count desc, mood asc
          limit 8
        ) mc
      ),
      '[]'::jsonb
    ),
    'reviews',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'text', r.text,
            'mood_a', nullif(trim(r.mood_a), ''),
            'mood_b', nullif(trim(r.mood_b), ''),
            'created_at', r.created_at,
            'user', jsonb_build_object(
              'first_name', p.first_name
            ),
            'photos',
            case
              when nullif(trim(coalesce(r.photo_path, '')), '') is null
                then '[]'::jsonb
              else jsonb_build_array(
                jsonb_build_object('url', r.photo_path)
              )
            end
          )
          order by r.created_at desc
        )
        from public.reviews r
        left join public.profiles p on p.id = r.user_id
        where r.spot_id = s.id
      ),
      '[]'::jsonb
    )
  )
  from selected_spot s;
$$;

revoke all on function public.backyrd_web_spot_detail_v1(uuid)
  from public;

grant execute on function public.backyrd_web_spot_detail_v1(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
