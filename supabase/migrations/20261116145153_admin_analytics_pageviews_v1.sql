create function public.admin_analytics_pageviews_v1(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to > now() + interval '5 minutes'
    or p_to - p_from > interval '370 days' then
    raise exception 'invalid_date_range' using errcode = '22023';
  end if;

  return (
    with views as materialized (
      select occurred_at, user_id,
        case
          when screen_name in ('web:/','web:/places','web:/discover','web:/search','web:/decision','web:/moments',
            'web:/events','web:/booking','web:/spots/:id','web:/events/:id','web:/moments/:id') then screen_name
          when screen_name in ('home','feed','map','wohin','decision','places','moments','moment/:id','spot/:id',
            'search','discover','events','events/:id','booking','profile','settings','favorites','spot/new',
            'review/new','new-spot','journey') then screen_name
        end known_screen
      from public.analytics_events
      where event_name = 'screen_view' and occurred_at >= p_from and occurred_at < p_to
    ), per_day as (
      select (occurred_at at time zone 'Europe/Zurich')::date as day, count(*) as screen_views
      from views group by 1
    ), daily as (
      select tick.day::date as day, coalesce(per_day.screen_views, 0) as screen_views
      from generate_series(
        (p_from at time zone 'Europe/Zurich')::date::timestamp,
        ((p_to - interval '1 microsecond') at time zone 'Europe/Zurich')::date::timestamp,
        interval '1 day'
      ) tick(day)
      left join per_day on per_day.day = tick.day::date
    ), pages as (
      select known_screen as screen_name, count(*) as views, count(distinct user_id) as users
      from views where known_screen is not null group by 1
    )
    select jsonb_build_object(
      'kpis', jsonb_build_object('screen_views', count(*), 'viewers', count(distinct user_id)),
      'daily', (select coalesce(jsonb_agg(to_jsonb(daily) order by day), '[]'::jsonb) from daily),
      'pages', (select coalesce(jsonb_agg(to_jsonb(pages) order by views desc, screen_name), '[]'::jsonb) from pages)
    ) from views
  );
end;
$$;

revoke all on function public.admin_analytics_pageviews_v1(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_analytics_pageviews_v1(timestamptz, timestamptz)
  to authenticated;

comment on function public.admin_analytics_pageviews_v1(timestamptz, timestamptz) is
  'Admin-only aggregate of measured views by Zurich day and allowlisted App or Web page group.';
