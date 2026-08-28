-- Shared, fail-closed population for ordinary Founder/Admin Product metrics.
-- Historical rows remain untouched and diagnostic surfaces may continue to
-- query their raw source tables explicitly.
create or replace view public.admin_product_spot_universe_v2
with (security_barrier = true, security_invoker = true)
as
select s.*
from public.spots s
where s.data_origin in ('REAL', 'IMPORT', 'LEGACY')
  and s.status in ('approved', 'pending');

revoke all on public.admin_product_spot_universe_v2
from public, anon, authenticated;
grant select on public.admin_product_spot_universe_v2 to service_role;

comment on view public.admin_product_spot_universe_v2 is
  'Normal Founder/Admin Product population: REAL/IMPORT/LEGACY and approved/pending only. TEST, FIXTURE, archived, rejected and unknown origins fail closed.';

-- reviews.data_origin is canonical since 20260821170000.
create or replace view public.admin_product_reviews_v2
with (security_barrier = true, security_invoker = true)
as
select r.*
from public.reviews r
join public.admin_product_spot_universe_v2 s on s.id = r.spot_id
where r.data_origin in ('REAL', 'IMPORT', 'LEGACY');

revoke all on public.admin_product_reviews_v2
from public, anon, authenticated;
grant select on public.admin_product_reviews_v2 to service_role;

create or replace view public.admin_product_analytics_events_v2
with (security_barrier = true, security_invoker = true)
as
select e.*
from public.analytics_events e
where (
  e.spot_id is null
   or exists (
     select 1 from public.admin_product_spot_universe_v2 s
     where s.id = e.spot_id
   )
)
and (
  e.decision_id is null
  or e.event_name not like 'decision_%'
  or not exists (select 1 from public.decision_impressions raw_i where raw_i.decision_id=e.decision_id)
  or exists (
    select 1 from public.decision_impressions product_i
    join public.admin_product_spot_universe_v2 product_s on product_s.id=product_i.spot_id
    where product_i.decision_id=e.decision_id
  )
);

create or replace view public.admin_product_ml_events_v2
with (security_barrier = true, security_invoker = true)
as
select e.*
from public.backyrd_ml_events_v1 e
where (
  e.spot_id is null
   or exists (
     select 1 from public.admin_product_spot_universe_v2 s
     where s.id = e.spot_id
   )
)
and (
  e.decision_id is null
  or not exists(select 1 from public.decision_impressions raw_i where raw_i.decision_id=e.decision_id)
  or exists(select 1 from public.decision_impressions product_i join public.admin_product_spot_universe_v2 product_s on product_s.id=product_i.spot_id where product_i.decision_id=e.decision_id)
);

create or replace view public.admin_product_user_events_v2
with (security_barrier = true, security_invoker = true)
as
select e.* from public.user_events e
where lower(coalesce(e.entity_type,'')) not in ('spot','spots')
   or exists(select 1 from public.admin_product_spot_universe_v2 s where s.id=e.entity_id);

revoke all on public.admin_product_analytics_events_v2,
  public.admin_product_ml_events_v2,
  public.admin_product_user_events_v2
from public, anon, authenticated;
grant select on public.admin_product_analytics_events_v2,
  public.admin_product_ml_events_v2,
  public.admin_product_user_events_v2
to service_role;

create or replace view public.admin_product_favorites_v2
with (security_barrier = true, security_invoker = true)
as
select f.*
from public.favorites f
join public.admin_product_spot_universe_v2 s on s.id = f.spot_id;

create or replace view public.admin_product_decision_impressions_v2
with (security_barrier = true, security_invoker = true)
as
select i.*
from public.decision_impressions i
join public.admin_product_spot_universe_v2 s on s.id = i.spot_id;

create or replace view public.admin_product_decision_sessions_v2
with (security_barrier = true, security_invoker = true)
as
select ds.*
from public.decision_sessions ds
where not exists(select 1 from public.decision_impressions raw_i where raw_i.decision_id=ds.id)
   or exists(select 1 from public.admin_product_decision_impressions_v2 product_i where product_i.decision_id=ds.id);

create or replace view public.admin_product_claims_v2
with (security_barrier = true, security_invoker = true)
as
select c.*
from public.spot_claims c
join public.admin_product_spot_universe_v2 s on s.id = c.spot_id;

revoke all on public.admin_product_favorites_v2,
  public.admin_product_decision_impressions_v2,
  public.admin_product_decision_sessions_v2,
  public.admin_product_claims_v2
from public, anon, authenticated;
grant select on public.admin_product_favorites_v2,
  public.admin_product_decision_impressions_v2,
  public.admin_product_decision_sessions_v2,
  public.admin_product_claims_v2
to service_role;

create or replace view public.admin_product_social_posts_v2
with (security_barrier = true, security_invoker = true)
as
select p.*
from public.social_posts p
where p.spot_id is null
   or exists (
     select 1 from public.admin_product_spot_universe_v2 s
     where s.id = p.spot_id
   );

create or replace view public.admin_product_social_feed_events_v2
with (security_barrier = true, security_invoker = true)
as
select e.*
from public.social_feed_events e
where (
  e.spot_id is null
   or exists (
     select 1 from public.admin_product_spot_universe_v2 s
     where s.id = e.spot_id
   )
)
and (
  e.post_id is null
  or exists(select 1 from public.admin_product_social_posts_v2 p where p.id=e.post_id)
);

create or replace view public.admin_product_social_reactions_v2
with (security_barrier = true, security_invoker = true)
as
select r.*
from public.social_post_reactions r
join public.admin_product_social_posts_v2 p on p.id = r.post_id;

create or replace view public.admin_product_social_comments_v2
with (security_barrier = true, security_invoker = true)
as
select c.*
from public.social_comments c
join public.admin_product_social_posts_v2 p on p.id = c.post_id;

revoke all on public.admin_product_social_posts_v2,
  public.admin_product_social_feed_events_v2,
  public.admin_product_social_reactions_v2,
  public.admin_product_social_comments_v2
from public, anon, authenticated;
grant select on public.admin_product_social_posts_v2,
  public.admin_product_social_feed_events_v2,
  public.admin_product_social_reactions_v2,
  public.admin_product_social_comments_v2
to service_role;

create or replace function public.founder_core_kpis_v2(
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql stable security definer
set search_path = public, auth, pg_catalog
as $$
declare v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'invalid_kpi_time' using errcode = '22023';
  end if;

  with activity as (
    select user_id, occurred_at
    from public.admin_product_analytics_events_v2
    union all
    select user_id, created_at from public.admin_product_decision_sessions_v2
    union all
    select user_id, created_at from public.admin_product_reviews_v2
  )
  select jsonb_build_object(
    'as_of', p_as_of,
    'wau', (select count(distinct user_id) from activity
      where user_id is not null and occurred_at >= p_as_of - interval '7 days' and occurred_at < p_as_of),
    'mau', (select count(distinct user_id) from activity
      where user_id is not null and occurred_at >= p_as_of - interval '30 days' and occurred_at < p_as_of),
    'decisions_week', (select count(*) from public.admin_product_decision_sessions_v2
      where created_at >= p_as_of - interval '7 days' and created_at < p_as_of),
    'basel_launch_ready_spots', (select count(*) from public.admin_product_spot_universe_v2
      where status = 'approved' and lower(coalesce(city, '')) in ('basel', 'basel-stadt')),
    'open_trust_alerts', (select count(*) from public.safety_cases
      where case_status in ('queued', 'evaluating', 'needs_review', 'appealed', 'failed')),
    'decision_success', jsonb_build_object(
      'status', 'data_not_ready', 'value', null,
      'reason', 'No canonical real-world decision outcome contract is reliable enough for launch reporting.'
    ),
    'universe', jsonb_build_object(
      'key', 'admin_product_spot_universe_v2',
      'mode', 'product_only',
      'calculated_at', statement_timestamp()
    )
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.founder_data_health_v2()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'approved_spots', (select count(*) from public.admin_product_spot_universe_v2 where status = 'approved'),
    'approved_basel_spots', (select count(*) from public.admin_product_spot_universe_v2 where status = 'approved' and lower(coalesce(city, '')) in ('basel', 'basel-stadt')),
    'approved_basel_spots_missing_photo', (select count(*) from public.admin_product_spot_universe_v2 s where s.status='approved' and lower(coalesce(s.city,'')) in ('basel','basel-stadt')
      and nullif(btrim(s.header_photo_path),'') is null
      and not exists(select 1 from public.spot_photos p where p.spot_id=s.id and nullif(btrim(p.url),'') is not null)
      and (nullif(btrim(s.google_place_id),'') is null or not coalesce(s.google_photo_enabled,true))),
    'decision_outcome_contract', 'data_not_ready',
    'calculated_at', now(),
    'universe', 'admin_product_spot_universe_v2'
  );
end;
$$;

revoke all on function public.founder_core_kpis_v2(timestamptz),
  public.founder_data_health_v2()
from public, anon;
grant execute on function public.founder_core_kpis_v2(timestamptz),
  public.founder_data_health_v2()
to authenticated, service_role;

create or replace function public.founder_launch_overview_v2()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_catalog
as $$
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'readiness', public.founder_calculate_launch_readiness_v1(),
    'kpis', public.founder_core_kpis_v2(now()),
    'data_health', public.founder_data_health_v2(),
    'trust_health', public.founder_trust_health_v1(),
    'blockers', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb)
      from (
        select gate_key as key, title, priority, status, owner, source_type, updated_at
        from public.founder_launch_gates
        where priority = 'P0' and status in ('open', 'in_progress', 'verify')
        order by updated_at desc limit 8
      ) x
    ),
    'recently_verified', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.verification_date desc), '[]'::jsonb)
      from (
        select gate_key as key, title, verification_date, verification_note
        from public.founder_launch_gates where status = 'verified'
        order by verification_date desc nulls last limit 6
      ) x
    ),
    'history', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]'::jsonb)
      from (
        select readiness_percent, launch_status, p0_remaining, created_at
        from public.founder_launch_readiness_history
        order by created_at desc limit 20
      ) x
    )
  );
end;
$$;

revoke all on function public.founder_launch_overview_v2() from public, anon;
grant execute on function public.founder_launch_overview_v2() to authenticated, service_role;

create or replace function public.admin_founder_overview_v2(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql stable security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_duration interval;
  v_prev_from timestamptz;
  v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(), false) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  v_duration := p_to - p_from;
  v_prev_from := p_from - v_duration;

  with activity as (
    select user_id, created_at as occurred_at, 'review_created'::text as event_name
    from public.admin_product_reviews_v2
    union all select user_id, created_at, 'decision_started' from public.admin_product_decision_sessions_v2
    union all select user_id, created_at, event_type from public.admin_product_user_events_v2
    union all select user_id, created_at, event_type from public.admin_product_ml_events_v2
    union all select user_id, created_at, event_type from public.admin_product_social_feed_events_v2
    union all select user_id, occurred_at, event_name from public.admin_product_analytics_events_v2
  ), current_active as (
    select count(distinct user_id)::int value from activity
    where user_id is not null and occurred_at >= p_from and occurred_at < p_to
  ), previous_active as (
    select count(distinct user_id)::int value from activity
    where user_id is not null and occurred_at >= v_prev_from and occurred_at < p_from
  ), mau as (
    select count(distinct user_id)::int value from activity
    where user_id is not null and occurred_at >= p_to - interval '30 days' and occurred_at < p_to
  ), dau as (
    select count(distinct user_id)::int value from activity
    where user_id is not null and occurred_at >= p_to - interval '1 day' and occurred_at < p_to
  ), daily as (
    select d.day,
      count(distinct a.user_id)::int active_users,
      count(*) filter(where a.event_name='review_created')::int reviews,
      count(*) filter(where a.event_name='decision_started')::int decisions,
      count(*) filter(where a.event_name='screen_view')::int screen_views
    from generate_series(date_trunc('day',p_from),date_trunc('day',p_to-interval '1 second'),interval '1 day') d(day)
    left join activity a on a.occurred_at>=d.day and a.occurred_at<d.day+interval '1 day'
    group by d.day order by d.day
  ), decision_stats as (
    select
      (select count(*) from public.admin_product_decision_sessions_v2 where created_at>=p_from and created_at<p_to)::int sessions,
      (select count(*) from public.admin_product_decision_impressions_v2 where created_at>=p_from and created_at<p_to)::int impressions,
      (select count(*) from public.admin_product_ml_events_v2 where event_type='decision_open' and created_at>=p_from and created_at<p_to)::int opens,
      (select count(*) from public.admin_product_ml_events_v2 where event_type='decision_like' and created_at>=p_from and created_at<p_to)::int likes,
      (select count(*) from public.admin_product_ml_events_v2 where event_type='decision_dislike' and created_at>=p_from and created_at<p_to)::int dislikes
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to,'previous_from',v_prev_from,'previous_to',p_from),
    'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only','calculated_at',statement_timestamp()),
    'kpis',jsonb_build_object(
      'signups',(select count(*) from auth.users where created_at>=p_from and created_at<p_to and deleted_at is null),
      'signups_previous',(select count(*) from auth.users where created_at>=v_prev_from and created_at<p_from and deleted_at is null),
      'activated_users',(select count(*) from public.profiles where profile_onboarding_completed_at>=p_from and profile_onboarding_completed_at<p_to),
      'activated_users_previous',(select count(*) from public.profiles where profile_onboarding_completed_at>=v_prev_from and profile_onboarding_completed_at<p_from),
      'active_users',(select value from current_active),'active_users_previous',(select value from previous_active),
      'dau',(select value from dau),'mau',(select value from mau),
      'stickiness',case when(select value from mau)>0 then round((select value from dau)::numeric/(select value from mau)*100,1) else 0 end,
      'reviews',(select count(*) from public.admin_product_reviews_v2 where created_at>=p_from and created_at<p_to),
      'reviews_previous',(select count(*) from public.admin_product_reviews_v2 where created_at>=v_prev_from and created_at<p_from),
      'reviews_per_active_user',case when(select value from current_active)>0 then round((select count(*) from public.admin_product_reviews_v2 where created_at>=p_from and created_at<p_to)::numeric/(select value from current_active),2) else 0 end,
      'partner_spots',(select count(*) from public.admin_product_spot_universe_v2 where owner_id is not null),
      'pending_claims',(select count(*) from public.admin_product_claims_v2 where status='pending'),
      'errors',(select count(*) from public.analytics_errors where occurred_at>=p_from and occurred_at<p_to),
      'screen_views',(select count(*) from public.admin_product_analytics_events_v2 where event_name='screen_view' and occurred_at>=p_from and occurred_at<p_to),
      'spot_opens',(select count(*) from public.admin_product_analytics_events_v2 where event_name in('spot_opened','spot_detail_opened') and occurred_at>=p_from and occurred_at<p_to)
    ),
    'decision',(select to_jsonb(decision_stats) from decision_stats),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',day,'active_users',active_users,'reviews',reviews,'decisions',decisions,'screen_views',screen_views) order by day) from daily),'[]'::jsonb),
    'top_screens',coalesce((select jsonb_agg(x order by(x->>'views')::int desc) from(select jsonb_build_object('screen_name',screen_name,'views',count(*),'users',count(distinct user_id))x from public.admin_product_analytics_events_v2 where event_name='screen_view' and occurred_at>=p_from and occurred_at<p_to and screen_name is not null group by screen_name order by count(*) desc limit 10)q),'[]'::jsonb),
    'top_spots',coalesce((select jsonb_agg(x order by(x->>'views')::int desc) from(select jsonb_build_object('spot_id',e.spot_id,'name',max(s.name),'views',count(*),'users',count(distinct e.user_id))x from public.admin_product_analytics_events_v2 e join public.admin_product_spot_universe_v2 s on s.id=e.spot_id where e.event_name in('spot_opened','spot_detail_opened') and e.occurred_at>=p_from and e.occurred_at<p_to group by e.spot_id order by count(*) desc limit 10)q),'[]'::jsonb),
    'latest_errors',coalesce((select jsonb_agg(to_jsonb(q) order by q.occurred_at desc) from(select id,message,severity,screen_name,app_version,occurred_at from public.analytics_errors where occurred_at>=p_from and occurred_at<p_to order by occurred_at desc limit 8)q),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_founder_overview_v2(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_founder_overview_v2(timestamptz,timestamptz) to authenticated,service_role;

create or replace function public.admin_growth_intelligence_v2(
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql stable security definer
set search_path = public, auth, pg_catalog
as $$
declare v_result jsonb;
begin
  if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>=p_to then raise exception 'invalid_date_range' using errcode='22023'; end if;

  with core_events as (
    select e.user_id,e.event_name,e.occurred_at,e.session_id
    from public.admin_product_analytics_events_v2 e
    where e.user_id is not null and e.occurred_at<p_to
      and e.event_name in(
        'app_opened','app_foregrounded','screen_view','spot_opened','spot_detail_opened',
        'decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened',
        'profile_favorite_spot_opened','nearby_spot_opened','decision_started','decision_completed',
        'decision_like','decision_dislike','review_started','review_submitted','profile_updated',
        'feed_like_added','feed_comments_opened','spot_favorited'
      )
  ), first_value as (
    select u.id user_id,u.created_at registered_at,
      min(e.occurred_at) filter(where e.event_name in(
        'spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened',
        'feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened',
        'nearby_spot_opened','decision_started','decision_completed','review_submitted'
      )) first_value_at,
      min(e.occurred_at) filter(where e.event_name='decision_started') first_decision_at,
      min(e.occurred_at) filter(where e.event_name='review_submitted') first_review_at
    from auth.users u left join core_events e on e.user_id=u.id and e.occurred_at>=u.created_at
    group by u.id,u.created_at
  ), cohort_users as (
    select * from first_value where registered_at>=p_from and registered_at<p_to
  ), active_in_range as (
    select distinct user_id from core_events where occurred_at>=p_from and occurred_at<p_to
  ), daily_series as (
    select generate_series(date_trunc('day',p_from),date_trunc('day',p_to-interval '1 millisecond'),interval '1 day')::date metric_date
  ), daily_growth as (
    select d.metric_date,
      (select count(*) from auth.users u where u.created_at>=d.metric_date::timestamptz and u.created_at<(d.metric_date+1)::timestamptz) registrations,
      (select count(*) from first_value f where f.first_value_at>=d.metric_date::timestamptz and f.first_value_at<(d.metric_date+1)::timestamptz) activations,
      (select count(distinct e.user_id) from core_events e where e.occurred_at>=d.metric_date::timestamptz and e.occurred_at<(d.metric_date+1)::timestamptz) active_users,
      (select count(*) from public.admin_product_reviews_v2 r where r.created_at>=d.metric_date::timestamptz and r.created_at<(d.metric_date+1)::timestamptz) reviews,
      (select count(*) from public.admin_product_analytics_events_v2 e where e.event_name='decision_started' and e.occurred_at>=d.metric_date::timestamptz and e.occurred_at<(d.metric_date+1)::timestamptz) decisions
    from daily_series d
  ), weekly_cohorts as (
    select date_trunc('week',f.registered_at)::date cohort_week,count(*) cohort_size,
      count(*) filter(where f.first_value_at is not null and f.first_value_at<f.registered_at+interval '7 days') activated,
      count(*) filter(where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '1 day' and e.occurred_at<f.registered_at+interval '2 days')) d1_retained,
      count(*) filter(where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '7 days' and e.occurred_at<f.registered_at+interval '8 days')) d7_retained,
      count(*) filter(where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '30 days' and e.occurred_at<f.registered_at+interval '31 days')) d30_retained
    from first_value f where f.registered_at>=p_from and f.registered_at<p_to
    group by 1 order by 1
  ), funnel as (
    select 1 step_order,'Registriert'::text step_name,count(*)::bigint users from cohort_users
    union all select 2,'Aktiviert',count(*)::bigint from cohort_users where first_value_at is not null and first_value_at<registered_at+interval '7 days'
    union all select 3,'Erste Decision',count(*)::bigint from cohort_users where first_decision_at is not null
    union all select 4,'Erster Review',count(*)::bigint from cohort_users where first_review_at is not null
    union all select 5,'Zurückgekehrt D7',count(*)::bigint from cohort_users f where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '7 days' and e.occurred_at<f.registered_at+interval '8 days')
  ), acquisition as (
    select coalesce(nullif(e.properties->>'source',''),nullif(e.properties->>'channel',''),'Direkt / unbekannt') source,count(distinct e.user_id) users
    from public.admin_product_analytics_events_v2 e
    where e.user_id is not null and e.occurred_at>=p_from and e.occurred_at<p_to and e.event_name in('app_opened','screen_view')
    group by 1 order by users desc limit 12
  )
  select jsonb_build_object(
    'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only','calculated_at',statement_timestamp()),
    'summary',jsonb_build_object(
      'registrations',(select count(*) from auth.users u where u.created_at>=p_from and u.created_at<p_to),
      'activated',(select count(*) from cohort_users where first_value_at is not null and first_value_at<registered_at+interval '7 days'),
      'active_users',(select count(*) from active_in_range),
      'returning_users',(select count(*) from active_in_range a where exists(select 1 from core_events e where e.user_id=a.user_id and e.occurred_at<p_from)),
      'new_active_users',(select count(*) from active_in_range a where not exists(select 1 from core_events e where e.user_id=a.user_id and e.occurred_at<p_from)),
      'activation_rate',coalesce(round((select count(*) from cohort_users where first_value_at is not null and first_value_at<registered_at+interval '7 days')*100.0/nullif((select count(*) from cohort_users),0),1),0),
      'median_time_to_value_minutes',coalesce((select round(percentile_cont(0.5) within group(order by extract(epoch from(first_value_at-registered_at))/60.0)::numeric,1) from cohort_users where first_value_at is not null and first_value_at>=registered_at),0),
      'd1_retention',coalesce(round((select count(*) from cohort_users f where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '1 day' and e.occurred_at<f.registered_at+interval '2 days'))*100.0/nullif((select count(*) from cohort_users where registered_at<p_to-interval '2 days'),0),1),0),
      'd7_retention',coalesce(round((select count(*) from cohort_users f where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '7 days' and e.occurred_at<f.registered_at+interval '8 days'))*100.0/nullif((select count(*) from cohort_users where registered_at<p_to-interval '8 days'),0),1),0),
      'd30_retention',coalesce(round((select count(*) from cohort_users f where exists(select 1 from core_events e where e.user_id=f.user_id and e.occurred_at>=f.registered_at+interval '30 days' and e.occurred_at<f.registered_at+interval '31 days'))*100.0/nullif((select count(*) from cohort_users where registered_at<p_to-interval '31 days'),0),1),0)
    ),
    'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.metric_date) from daily_growth d),'[]'::jsonb),
    'cohorts',coalesce((select jsonb_agg(to_jsonb(c) order by c.cohort_week) from weekly_cohorts c),'[]'::jsonb),
    'funnel',coalesce((select jsonb_agg(to_jsonb(f) order by f.step_order) from funnel f),'[]'::jsonb),
    'acquisition',coalesce((select jsonb_agg(to_jsonb(a)) from acquisition a),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_growth_intelligence_v2(timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_growth_intelligence_v2(timestamptz,timestamptz) to authenticated,service_role;

create or replace function public.admin_users_intelligence_v2(
  p_from timestamptz,p_to timestamptz,p_limit integer default 250,
  p_offset integer default 0,p_search text default null
) returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_catalog
as $$
declare v_result jsonb;
begin
 if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
 with base as (
  select u.id user_id,u.email,p.display_name,p.username,p.avatar_url,p.city,u.created_at registered_at,
   greatest(e.last_at,se.last_at,rv.last_at,ds.last_at) last_active_at,
   coalesce(se.sessions,0) sessions,coalesce(e.screen_views,0) screen_views,coalesce(e.spot_opens,0) spot_opens,
   coalesce(ds.decisions,0) decisions,coalesce(rv.reviews,0) reviews,
   (exists(select 1 from public.admin_product_analytics_events_v2 ax where ax.user_id=u.id and ax.occurred_at<u.created_at+interval '7 days' and ax.event_name in('spot_opened','spot_detail_opened','decision_started','review_submitted'))
    or exists(select 1 from public.admin_product_reviews_v2 rx where rx.user_id=u.id and rx.created_at<u.created_at+interval '7 days')) activated,
   se.platform,se.app_version
  from auth.users u
  left join public.profiles p on p.id=u.id
  left join lateral(select max(x.occurred_at)last_at,
    count(*)filter(where x.event_name='screen_view'and x.occurred_at>=p_from and x.occurred_at<p_to)screen_views,
    count(*)filter(where x.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened')and x.occurred_at>=p_from and x.occurred_at<p_to)spot_opens
    from public.admin_product_analytics_events_v2 x where x.user_id=u.id)e on true
  left join lateral(select max(x.last_seen_at)last_at,count(*)filter(where x.started_at>=p_from and x.started_at<p_to)sessions,
    (array_agg(x.platform order by x.last_seen_at desc)filter(where x.platform is not null))[1]platform,
    (array_agg(x.app_version order by x.last_seen_at desc)filter(where x.app_version is not null))[1]app_version
    from public.analytics_sessions x where x.user_id=u.id)se on true
  left join lateral(select max(x.created_at)last_at,count(*)filter(where x.created_at>=p_from and x.created_at<p_to)reviews
    from public.admin_product_reviews_v2 x where x.user_id=u.id)rv on true
  left join lateral(select max(x.created_at)last_at,count(*)filter(where x.created_at>=p_from and x.created_at<p_to)decisions
    from public.admin_product_decision_sessions_v2 x where x.user_id=u.id)ds on true
  where u.deleted_at is null and (p_search is null or concat_ws(' ',u.email,p.display_name,p.username,p.city,u.id::text) ilike '%'||p_search||'%')
 ), page as (
  select * from base order by coalesce(last_active_at,registered_at) desc
  limit greatest(1,least(coalesce(p_limit,250),1000)) offset greatest(coalesce(p_offset,0),0)
 )
 select jsonb_build_object(
  'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only','calculated_at',statement_timestamp()),
  'summary',jsonb_build_object('registered',(select count(*) from base),'active',(select count(*) from base where last_active_at>=p_from and last_active_at<p_to),'activated',(select count(*) from base where activated),'sessions',(select coalesce(sum(sessions),0) from base)),
  'total',(select count(*) from base),
  'users',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;

create or replace function public.admin_user_detail_intelligence_v2(
 p_user_id uuid,p_from timestamptz,p_to timestamptz
) returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_catalog
as $$
declare v_result jsonb;
begin
 if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
 select jsonb_build_object(
  'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only','calculated_at',statement_timestamp()),
  'user',(select to_jsonb(x) from(select u.id user_id,u.email,p.display_name,p.username,p.avatar_url,p.city,p.country,u.created_at registered_at,
    (select max(z.t) from(values((select max(e.occurred_at) from public.admin_product_analytics_events_v2 e where e.user_id=u.id)),((select max(s.last_seen_at) from public.analytics_sessions s where s.user_id=u.id)),((select max(rv.created_at) from public.admin_product_reviews_v2 rv where rv.user_id=u.id)))z(t))last_active_at,
    (select platform from public.analytics_sessions where user_id=u.id order by last_seen_at desc limit 1)platform,
    (select app_version from public.analytics_sessions where user_id=u.id order by last_seen_at desc limit 1)app_version
    from auth.users u left join public.profiles p on p.id=u.id where u.id=p_user_id)x),
  'metrics',jsonb_build_object(
    'sessions',(select count(*) from public.analytics_sessions where user_id=p_user_id and started_at>=p_from and started_at<p_to),
    'screen_views',(select count(*) from public.admin_product_analytics_events_v2 where user_id=p_user_id and event_name='screen_view' and occurred_at>=p_from and occurred_at<p_to),
    'spot_opens',(select count(*) from public.admin_product_analytics_events_v2 where user_id=p_user_id and spot_id is not null and occurred_at>=p_from and occurred_at<p_to),
    'decisions',(select count(*) from public.admin_product_decision_sessions_v2 where user_id=p_user_id and created_at>=p_from and created_at<p_to),
    'reviews',(select count(*) from public.admin_product_reviews_v2 where user_id=p_user_id and created_at>=p_from and created_at<p_to),
    'favorites',(select count(*) from public.admin_product_favorites_v2 where user_id=p_user_id)
  ),
  'timeline',coalesce((select jsonb_agg(to_jsonb(t) order by occurred_at desc) from(
    select 'event'::text kind,e.event_name name,e.screen_name,e.spot_id,s.name spot_name,e.occurred_at,e.properties
    from public.admin_product_analytics_events_v2 e left join public.admin_product_spot_universe_v2 s on s.id=e.spot_id
    where e.user_id=p_user_id and e.occurred_at>=p_from and e.occurred_at<p_to
    union all
    select 'review','review_created',null,r.spot_id,s.name,r.created_at,jsonb_build_object('review_id',r.id)
    from public.admin_product_reviews_v2 r join public.admin_product_spot_universe_v2 s on s.id=r.spot_id
    where r.user_id=p_user_id and r.created_at>=p_from and r.created_at<p_to
  )t limit 300),'[]'::jsonb)
 ) into v_result;
 return v_result;
end;
$$;

revoke all on function public.admin_users_intelligence_v2(timestamptz,timestamptz,integer,integer,text),
 public.admin_user_detail_intelligence_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_users_intelligence_v2(timestamptz,timestamptz,integer,integer,text),
 public.admin_user_detail_intelligence_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;

create or replace function public.admin_decision_intelligence_v2(
 p_from timestamptz,p_to timestamptz,p_limit integer default 100
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare v_result jsonb;
begin
 if not coalesce(public.admin_is_admin_v1(),false) then raise exception 'admin_required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>=p_to then raise exception 'invalid_period' using errcode='22023'; end if;
 with ev as(
  select * from public.admin_product_analytics_events_v2 where occurred_at>=p_from and occurred_at<p_to and event_name like 'decision_%'
 ),sessions as(
  select decision_id,min(occurred_at)started_at,(array_agg(user_id order by occurred_at desc)filter(where user_id is not null))[1]user_id,
   max(properties->>'query')query,max(properties->>'input_mode')input_mode,max(properties->>'model_version')model_version,
   count(*)filter(where event_name='decision_spot_impression')impressions,count(*)filter(where event_name='decision_like')likes,
   count(*)filter(where event_name='decision_dislike')dislikes,count(*)filter(where event_name in('decision_spot_opened','decision_open'))opens,
   count(*)filter(where event_name='decision_remixed')remixes,count(*)filter(where event_name in('decision_empty','decision_no_results'))empty_results
  from ev group by decision_id
 ),daily as(
  select date_trunc('day',occurred_at)::date metric_day,count(*)filter(where event_name='decision_started')sessions,
   count(*)filter(where event_name='decision_spot_impression')impressions,count(*)filter(where event_name='decision_like')likes,
   count(*)filter(where event_name='decision_dislike')dislikes,count(*)filter(where event_name in('decision_spot_opened','decision_open'))opens
  from ev group by 1
 ),queries as(
  select coalesce(nullif(properties->>'query',''),'Ohne Query')query,count(distinct coalesce(decision_id::text,session_id::text))sessions,
   count(*)filter(where event_name='decision_spot_impression')impressions,count(*)filter(where event_name='decision_like')likes,
   count(*)filter(where event_name='decision_dislike')dislikes,count(*)filter(where event_name in('decision_spot_opened','decision_open'))opens,
   count(*)filter(where event_name in('decision_empty','decision_no_results'))empty_results
  from ev group by 1 order by sessions desc limit greatest(1,least(coalesce(p_limit,100),500))
 ),spot_metrics as(
  select e.spot_id,s.name,count(*)filter(where e.event_name='decision_spot_impression')impressions,
   count(*)filter(where e.event_name='decision_like')likes,count(*)filter(where e.event_name='decision_dislike')dislikes,
   count(*)filter(where e.event_name in('decision_spot_opened','decision_open'))opens
  from ev e join public.admin_product_spot_universe_v2 s on s.id=e.spot_id where e.spot_id is not null
  group by e.spot_id,s.name order by impressions desc limit 50
 ),models as(
  select coalesce(nullif(properties->>'model_version',''),'unknown')model_version,count(distinct coalesce(decision_id::text,session_id::text))sessions,
   count(*)filter(where event_name='decision_spot_impression')impressions,count(*)filter(where event_name='decision_like')likes,
   count(*)filter(where event_name='decision_dislike')dislikes,count(*)filter(where event_name in('decision_spot_opened','decision_open'))opens
  from ev group by 1 order by sessions desc
 )select jsonb_build_object(
  'summary',jsonb_build_object('sessions',(select count(*)from ev where event_name='decision_started'),
   'unique_users',(select count(distinct user_id)from ev where user_id is not null),'impressions',(select count(*)from ev where event_name='decision_spot_impression'),
   'likes',(select count(*)from ev where event_name='decision_like'),'dislikes',(select count(*)from ev where event_name='decision_dislike'),
   'opens',(select count(*)from ev where event_name in('decision_spot_opened','decision_open')),'remixes',(select count(*)from ev where event_name='decision_remixed'),
   'empty_results',(select count(*)from ev where event_name in('decision_empty','decision_no_results'))),
  'daily',coalesce((select jsonb_agg(to_jsonb(x)order by metric_day)from daily x),'[]'::jsonb),
  'queries',coalesce((select jsonb_agg(to_jsonb(x))from queries x),'[]'::jsonb),
  'spots',coalesce((select jsonb_agg(to_jsonb(x))from spot_metrics x),'[]'::jsonb),
  'models',coalesce((select jsonb_agg(to_jsonb(x))from models x),'[]'::jsonb),
  'sessions',coalesce((select jsonb_agg(to_jsonb(x)order by started_at desc)from(select * from sessions order by started_at desc limit 100)x),'[]'::jsonb),
  'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only'))into v_result;
 return v_result;
end$$;

create or replace function public.admin_decision_session_v2(p_decision_id uuid)returns jsonb
language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare v_result jsonb;
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 select jsonb_build_object(
  'session',(select to_jsonb(x)from(select ds.id,ds.user_id,ds.city,ds.mood_a_text,ds.mood_b_text,ds.created_at,p.display_name,p.username
   from public.admin_product_decision_sessions_v2 ds left join public.profiles p on p.id=ds.user_id where ds.id=p_decision_id)x),
  'events',coalesce((select jsonb_agg(to_jsonb(x)order by occurred_at)from(select e.id,e.event_name,e.occurred_at,e.screen_name,e.spot_id,s.name spot_name,e.properties
   from public.admin_product_analytics_events_v2 e left join public.admin_product_spot_universe_v2 s on s.id=e.spot_id where e.decision_id=p_decision_id)x),'[]'::jsonb),
  'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only'))into v_result;
 return v_result;
end$$;

revoke all on function public.admin_decision_intelligence_v2(timestamptz,timestamptz,integer),
 public.admin_decision_session_v2(uuid) from public,anon;
grant execute on function public.admin_decision_intelligence_v2(timestamptz,timestamptz,integer),
 public.admin_decision_session_v2(uuid) to authenticated,service_role;

create or replace function public.admin_get_taxonomy_overview_v2()
returns table(id uuid,slug text,node_type text,parent_id uuid,parent_label text,label_de text,label_en text,
 icon text,color text,sort_order integer,is_active boolean,is_owner_selectable boolean,is_system boolean,
 ml_weight numeric,category_ids uuid[],category_names text[],synonyms_count bigint,spots_count bigint,updated_at timestamptz)
language plpgsql stable security definer set search_path=public,auth,pg_catalog as $$
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 return query select n.id,n.slug,n.node_type,n.parent_id,coalesce(pt.label,pn.slug),coalesce(de.label,n.slug),
  coalesce(en.label,de.label,n.slug),n.icon,n.color,n.sort_order,n.is_active,n.is_owner_selectable,n.is_system,n.ml_weight,
  coalesce(cat.ids,'{}'::uuid[]),coalesce(cat.names,'{}'::text[]),coalesce(syn.cnt,0),coalesce(st.cnt,0),n.updated_at
 from public.taxonomy_nodes n
 left join public.taxonomy_node_translations de on de.taxonomy_node_id=n.id and de.locale='de'
 left join public.taxonomy_node_translations en on en.taxonomy_node_id=n.id and en.locale='en'
 left join public.taxonomy_nodes pn on pn.id=n.parent_id
 left join public.taxonomy_node_translations pt on pt.taxonomy_node_id=pn.id and pt.locale='de'
 left join lateral(select array_agg(c.id order by c.name)ids,array_agg(c.name order by c.name)names
  from public.taxonomy_node_categories nc join public.categories c on c.id=nc.category_id where nc.taxonomy_node_id=n.id)cat on true
 left join lateral(select count(*)::bigint cnt from public.taxonomy_synonyms x where x.taxonomy_node_id=n.id)syn on true
 left join lateral(select count(distinct x.spot_id)::bigint cnt from public.spot_taxonomies x
  join public.admin_product_spot_universe_v2 s on s.id=x.spot_id where x.taxonomy_node_id=n.id)st on true
 order by n.node_type,n.sort_order,coalesce(de.label,n.slug);
end$$;

create or replace function public.admin_concepts_overview_v2()
returns table(id bigint,label text,label_norm text,primary_cluster_id integer,primary_cluster_name text,spots_count bigint,tokens_count bigint)
language plpgsql stable security definer set search_path=public,auth,pg_catalog as $$
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 return query select c.id,c.label,c.label_norm,c.primary_cluster_id,cl.name,
  (select count(*)from public.spot_mood_concepts smc join public.admin_product_spot_universe_v2 s on s.id=smc.spot_id where smc.concept_id=c.id),
  (select count(*)from public.mood_token_concepts mtc where mtc.concept_id=c.id)
 from public.mood_concepts c left join public.mood_clusters cl on cl.id=c.primary_cluster_id;
end$$;

revoke all on function public.admin_get_taxonomy_overview_v2(),public.admin_concepts_overview_v2()from public,anon;
grant execute on function public.admin_get_taxonomy_overview_v2(),public.admin_concepts_overview_v2()to authenticated,service_role;

create or replace function public.get_spot_claim_queue_v3(p_status text default 'pending',p_limit integer default 50)
returns table(claim_id bigint,claim_status text,spot_id uuid,spot_name text,spot_city text,spot_address text,user_id uuid,
 claimant_name text,claimant_role text,business_email text,business_domain text,email_verified_at timestamptz,
 domain_match_score numeric,domain_match_reason text,note text,submitted_at timestamptz,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare v_status text:=nullif(trim(coalesce(p_status,'')),'');v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 return query select sc.id,sc.status,sc.spot_id,s.name,s.city,s.address,sc.user_id,sc.claimant_name,sc.claimant_role,
  sc.business_email,sc.business_domain,sc.email_verified_at,sc.domain_match_score,sc.domain_match_reason,sc.note,
  sc.submitted_at,sc.created_at,sc.updated_at
 from public.admin_product_claims_v2 sc join public.admin_product_spot_universe_v2 s on s.id=sc.spot_id
 where v_status is null or sc.status=v_status
 order by case when sc.status='pending'then 0 else 1 end,sc.submitted_at desc nulls last,sc.created_at desc limit v_limit;
end$$;

create or replace function public.admin_get_spot_owner_moderation_queue_v2(p_status text default null,p_limit integer default 200)
returns table(event_id uuid,spot_id uuid,spot_name text,changed_by uuid,changed_by_name text,change_area text,change_source text,
 old_data jsonb,new_data jsonb,moderation_status text,risk_flags text[],validation_warnings text[],moderation_note text,created_at timestamptz)
language plpgsql security definer set search_path=public,auth,pg_catalog as $$
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 return query select e.id,e.spot_id,s.name,e.changed_by,
  coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.display_name,p.username,e.changed_by::text),
  e.change_area,e.change_source,e.old_data,e.new_data,e.moderation_status,e.risk_flags,e.validation_warnings,e.moderation_note,e.created_at
 from public.spot_owner_change_events e join public.admin_product_spot_universe_v2 s on s.id=e.spot_id
 left join public.profiles p on p.id=e.changed_by
 where p_status is null or e.moderation_status=lower(trim(p_status))
 order by case when e.moderation_status='flagged'then 0 else 1 end,e.created_at desc
 limit greatest(1,least(coalesce(p_limit,200),1000));
end$$;

revoke all on function public.get_spot_claim_queue_v3(text,integer),
 public.admin_get_spot_owner_moderation_queue_v2(text,integer)from public,anon;
grant execute on function public.get_spot_claim_queue_v3(text,integer),
 public.admin_get_spot_owner_moderation_queue_v2(text,integer)to authenticated,service_role;

create or replace function public.admin_moments_intelligence_v2(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare v_result jsonb;
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>=p_to then raise exception 'invalid_period' using errcode='22023';end if;
 with posts_in_period as(select * from public.admin_product_social_posts_v2 where created_at>=p_from and created_at<p_to),
 reactions_in_period as(select * from public.admin_product_social_reactions_v2 where created_at>=p_from and created_at<p_to),
 comments_in_period as(select * from public.admin_product_social_comments_v2 where created_at>=p_from and created_at<p_to),
 feed_events as(select * from public.admin_product_social_feed_events_v2 where created_at>=p_from and created_at<p_to),
 analytics_feed as(select * from public.admin_product_analytics_events_v2 where occurred_at>=p_from and occurred_at<p_to and event_name like 'feed_%'),
 daily as(
  select d.metric_day,
   (select count(*)::int from posts_in_period p where p.created_at>=d.metric_day and p.created_at<d.metric_day+interval'1 day')posts,
   (select count(*)::int from reactions_in_period x where x.reaction_type='like' and x.created_at>=d.metric_day and x.created_at<d.metric_day+interval'1 day')likes,
   (select count(*)::int from comments_in_period x where x.created_at>=d.metric_day and x.created_at<d.metric_day+interval'1 day')comments,
   (select count(*)::int from reactions_in_period x where x.reaction_type='save' and x.created_at>=d.metric_day and x.created_at<d.metric_day+interval'1 day')saves,
   (select count(*)::int from analytics_feed x where x.event_name='feed_post_shared' and x.occurred_at>=d.metric_day and x.occurred_at<d.metric_day+interval'1 day')shares,
   (select count(distinct user_id)::int from feed_events x where x.user_id is not null and x.created_at>=d.metric_day and x.created_at<d.metric_day+interval'1 day')active_users
  from(select generate_series(date_trunc('day',p_from),date_trunc('day',p_to-interval'1 second'),interval'1 day')metric_day)d
 ),top_posts as(
  select p.id post_id,p.user_id,coalesce(nullif(trim(concat_ws(' ',pr.first_name,pr.last_name)),''),pr.display_name,pr.username,'Backyrd User')creator_name,
   p.caption,p.created_at,p.like_count,p.comment_count,p.save_count,p.status,p.visibility,p.source_type,s.name spot_name,
   (select count(*)::int from analytics_feed a where a.entity_id::text=p.id::text and a.event_name='feed_post_shared')shares,
   (coalesce(p.like_count,0)+coalesce(p.comment_count,0)*2+coalesce(p.save_count,0)*2)::int engagement_score
  from posts_in_period p left join public.profiles pr on pr.id::text=p.user_id::text
  left join public.admin_product_spot_universe_v2 s on s.id::text=p.spot_id::text
  order by engagement_score desc,p.created_at desc limit 25
 ),creators as(
  select p.user_id,coalesce(nullif(trim(concat_ws(' ',pr.first_name,pr.last_name)),''),pr.display_name,pr.username,'Backyrd User')creator_name,
   count(*)::int posts,sum(coalesce(p.like_count,0))::int likes,sum(coalesce(p.comment_count,0))::int comments,
   sum(coalesce(p.save_count,0))::int saves,(sum(coalesce(p.like_count,0))+sum(coalesce(p.comment_count,0))*2+sum(coalesce(p.save_count,0))*2)::int engagement_score
  from posts_in_period p left join public.profiles pr on pr.id::text=p.user_id::text group by p.user_id,creator_name
  order by engagement_score desc,posts desc limit 20
 ),modes as(
  select coalesce(nullif(context->>'feed_mode',''),'unknown')feed_mode,count(*)::int events,count(distinct user_id)::int users
  from feed_events group by 1 order by 2 desc
 ),event_types as(
  select event_type,count(*)::int events,count(distinct user_id)::int users from feed_events group by event_type order by events desc
 )select jsonb_build_object(
  'summary',jsonb_build_object('posts',(select count(*)::int from posts_in_period),'creators',(select count(distinct user_id)::int from posts_in_period),
   'likes',(select count(*)::int from reactions_in_period where reaction_type='like'),'comments',(select count(*)::int from comments_in_period),
   'saves',(select count(*)::int from reactions_in_period where reaction_type='save'),'shares',(select count(*)::int from analytics_feed where event_name='feed_post_shared'),
   'feed_users',(select count(distinct user_id)::int from feed_events where user_id is not null),'feed_events',(select count(*)::int from feed_events),
   'engagement_rate',(select case when count(*)>0 then round(sum(coalesce(like_count,0)+coalesce(comment_count,0)+coalesce(save_count,0))::numeric/count(*),2)else 0 end from posts_in_period)),
  'daily',coalesce((select jsonb_agg(to_jsonb(x)order by metric_day)from daily x),'[]'::jsonb),
  'top_posts',coalesce((select jsonb_agg(to_jsonb(x))from top_posts x),'[]'::jsonb),
  'creators',coalesce((select jsonb_agg(to_jsonb(x))from creators x),'[]'::jsonb),
  'feed_modes',coalesce((select jsonb_agg(to_jsonb(x))from modes x),'[]'::jsonb),
  'event_types',coalesce((select jsonb_agg(to_jsonb(x))from event_types x),'[]'::jsonb),
  'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only'))into v_result;
 return v_result;
end$$;

revoke all on function public.admin_moments_intelligence_v2(timestamptz,timestamptz)from public,anon;
grant execute on function public.admin_moments_intelligence_v2(timestamptz,timestamptz)to authenticated,service_role;

create or replace function public.admin_partners_intelligence_v2(
 p_from timestamptz,p_to timestamptz,p_limit integer default 100,p_search text default null
)returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare v_result jsonb;
begin
 if not coalesce(public.admin_is_admin_v1(),false)then raise exception 'admin_required' using errcode='42501';end if;
 with partner_spots as(
  select s.id,s.name,s.city,s.status,s.owner_id,s.header_photo_path,
   coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(p.display_name,''),
    case when p.username is not null then '@'||p.username else null end,s.owner_id::text)owner_name,
   p.username owner_username,p.avatar_url owner_avatar
  from public.admin_product_spot_universe_v2 s left join public.profiles p on p.id::text=s.owner_id::text
  where s.owner_id is not null and(p_search is null or trim(p_search)='' or
   concat_ws(' ',s.name,s.city,p.first_name,p.last_name,p.display_name,p.username,s.owner_id::text)ilike'%'||trim(p_search)||'%')
 ),event_rollup as(
  select e.spot_id::text spot_id_text,
   count(*)filter(where e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened'))views,
   count(distinct e.user_id)filter(where e.event_name in('spot_opened','spot_detail_opened','decision_spot_opened','map_spot_opened','feed_spot_opened','profile_spot_opened','profile_favorite_spot_opened','nearby_spot_opened'))unique_users,
   count(*)filter(where e.event_name='decision_spot_impression')decision_impressions,
   count(*)filter(where e.event_name='decision_spot_opened')decision_opens,
   count(*)filter(where e.event_name='spot_route_clicked')route_clicks,
   count(*)filter(where e.event_name='spot_website_clicked')website_clicks,
   count(*)filter(where e.event_name='spot_phone_clicked')phone_clicks,max(e.occurred_at)last_activity
  from public.admin_product_analytics_events_v2 e where e.occurred_at>=p_from and e.occurred_at<p_to and e.spot_id is not null group by e.spot_id::text
 ),review_rollup as(
  select r.spot_id::text spot_id_text,count(*)reviews from public.admin_product_reviews_v2 r
  where r.created_at>=p_from and r.created_at<p_to group by r.spot_id::text
 ),rows_data as(
  select ps.id spot_id,ps.name,ps.city,ps.status,ps.owner_id,ps.owner_name,ps.owner_username,ps.owner_avatar,ps.header_photo_path,
   coalesce(er.views,0)views,coalesce(er.unique_users,0)unique_users,coalesce(er.decision_impressions,0)decision_impressions,
   coalesce(er.decision_opens,0)decision_opens,case when coalesce(er.decision_impressions,0)>0 then round(coalesce(er.decision_opens,0)*100.0/er.decision_impressions,1)else 0 end decision_ctr,
   coalesce(rr.reviews,0)reviews,coalesce(er.route_clicks,0)route_clicks,coalesce(er.website_clicks,0)website_clicks,
   coalesce(er.phone_clicks,0)phone_clicks,coalesce(er.route_clicks,0)+coalesce(er.website_clicks,0)+coalesce(er.phone_clicks,0)intent_actions,er.last_activity
  from partner_spots ps left join event_rollup er on er.spot_id_text=ps.id::text left join review_rollup rr on rr.spot_id_text=ps.id::text
 ),limited_rows as(
  select * from rows_data order by intent_actions desc,views desc,name limit greatest(1,least(coalesce(p_limit,100),500))
 ),owner_rollup as(
  select owner_id,max(owner_name)owner_name,count(*)spots,sum(views)views,sum(unique_users)unique_users,sum(intent_actions)intent_actions,sum(reviews)reviews
  from rows_data group by owner_id order by intent_actions desc,views desc limit 50
 ),claim_counts as(
  select status,count(*)claims from public.admin_product_claims_v2 where created_at>=p_from and created_at<p_to group by status
 )select jsonb_build_object(
  'summary',jsonb_build_object('partner_spots',(select count(*)from partner_spots),'active_owners',(select count(distinct owner_id)from partner_spots),
   'views',coalesce((select sum(views)from rows_data),0),'unique_users',coalesce((select sum(unique_users)from rows_data),0),
   'reviews',coalesce((select sum(reviews)from rows_data),0),'intent_actions',coalesce((select sum(intent_actions)from rows_data),0),
   'route_clicks',coalesce((select sum(route_clicks)from rows_data),0),'website_clicks',coalesce((select sum(website_clicks)from rows_data),0),
   'phone_clicks',coalesce((select sum(phone_clicks)from rows_data),0),
   'pending_claims',(select count(*)from public.admin_product_claims_v2 where status='pending'),
   'approved_claims_period',(select count(*)from public.admin_product_claims_v2 where status='approved'and updated_at>=p_from and updated_at<p_to)),
  'partners',coalesce((select jsonb_agg(to_jsonb(x))from limited_rows x),'[]'::jsonb),
  'owners',coalesce((select jsonb_agg(to_jsonb(x))from owner_rollup x),'[]'::jsonb),
  'claims',coalesce((select jsonb_agg(to_jsonb(x))from claim_counts x),'[]'::jsonb),
  'universe',jsonb_build_object('key','admin_product_spot_universe_v2','mode','product_only'))into v_result;
 return v_result;
end$$;

revoke all on function public.admin_partners_intelligence_v2(timestamptz,timestamptz,integer,text)from public,anon;
grant execute on function public.admin_partners_intelligence_v2(timestamptz,timestamptz,integer,text)to authenticated,service_role;
