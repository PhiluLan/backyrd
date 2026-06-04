create or replace function public.get_trending_spots_v1(p_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_limit integer := greatest(coalesce(p_limit, 12), 1);
begin
  return (
    with ranked as (
      select
        d.*,
        public.calculate_trending_score_v1(
          d.review_count,
          d.latest_review_at
        ) as trending_score
      from public.spot_discovery_v1 d
      where d.status = 'approved'
    ),
    limited as (
      select *
      from ranked
      order by trending_score desc nulls last
      limit v_limit
    )
    select jsonb_build_object(
      'items',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'name', l.name,
            'slug', l.slug,
            'city', l.city,
            'score', round((l.trending_score)::numeric, 2),
            'review_count', l.review_count,
            'top_moods', to_jsonb(l.mood_tokens)
          )
          order by l.trending_score desc nulls last
        ),
        '[]'::jsonb
      )
    )
    from limited l
  );
end;
$function$;