-- Sprint 9.2: non-invasive Behaviour Trust signals.
--
-- Only existing Backyrd product actions are evaluated. This migration adds no
-- telemetry and performs no punishment, enforcement, ranking, or distribution.

create table public.account_trust_behaviour_detector_config (
  detector_key text primary key check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  enabled boolean not null default true,
  signal_strength numeric(5,4) not null check (signal_strength between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_behaviour_evaluation_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  last_signal_count integer not null default 0 check (last_signal_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_trust_behaviour_evaluation_due_idx
  on public.account_trust_behaviour_evaluation_state (next_evaluation_at, user_id);

comment on table public.account_trust_behaviour_detector_config is
  'Versioned Sprint 9.2 detector configuration. Settings change only through reviewed migrations.';
comment on table public.account_trust_behaviour_evaluation_state is
  'Scheduling state only; no raw behaviour, content, pointer, pixel, touch, or keystroke data.';

insert into public.account_trust_signal_registry (
  signal_key, dimension, polarity, base_score_impact, reason_code,
  definition_version, default_ttl, description, metadata
) values
  ('behaviour_search_usage', 'behaviour', 'supporting', 4, 'BEHAVIOUR_SEARCH_USAGE',
   1, null, 'Search usage occurred naturally across multiple days.',
   '{"detector_family":"behaviour","signal_interpretation":"supporting_evidence"}'::jsonb),
  ('behaviour_decision_usage', 'behaviour', 'supporting', 5, 'BEHAVIOUR_DECISION_USAGE',
   1, null, 'The account used the Decision Engine across multiple days.',
   '{"detector_family":"behaviour","signal_interpretation":"supporting_evidence"}'::jsonb),
  ('behaviour_spot_exploration', 'behaviour', 'supporting', 4, 'BEHAVIOUR_SPOT_EXPLORATION',
   1, null, 'The account explored distinct Spot details across multiple days.',
   '{"detector_family":"behaviour","signal_interpretation":"supporting_evidence","source":"optional_product_analytics"}'::jsonb),
  ('behaviour_returning_user', 'behaviour', 'supporting', 5, 'BEHAVIOUR_RETURNING_USER',
   1, null, 'The account returned across distinct sessions and days.',
   '{"detector_family":"behaviour","signal_interpretation":"supporting_evidence","source":"optional_product_analytics"}'::jsonb),
  ('behaviour_natural_reviews', 'behaviour', 'supporting', 6, 'BEHAVIOUR_NATURAL_REVIEWS',
   1, null, 'Reviews were preceded by existing Decision, Spot, Map, or Route interactions.',
   '{"detector_family":"behaviour","signal_interpretation":"supporting_evidence"}'::jsonb),
  ('behaviour_review_only', 'behaviour', 'risk', -12, 'BEHAVIOUR_REVIEW_ONLY',
   1, interval '30 days', 'A mature account repeatedly reviewed without other recorded core product usage.',
   '{"detector_family":"behaviour","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('behaviour_action_velocity', 'behaviour', 'risk', -16, 'BEHAVIOUR_ACTION_VELOCITY',
   1, interval '7 days', 'Several distinct high-value product actions occurred at extreme velocity.',
   '{"detector_family":"behaviour","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('behaviour_single_purpose', 'behaviour', 'risk', -10, 'BEHAVIOUR_SINGLE_PURPOSE',
   1, interval '30 days', 'A mature account repeatedly performed only one product action type.',
   '{"detector_family":"behaviour","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('behaviour_feature_diversity', 'behaviour', 'supporting', 6, 'BEHAVIOUR_FEATURE_DIVERSITY',
   1, null, 'The account used several distinct Backyrd product features.',
   '{"detector_family":"behaviour","signal_interpretation":"supporting_evidence"}'::jsonb),
  ('behaviour_dormant_pattern', 'behaviour', 'risk', -8, 'BEHAVIOUR_DORMANT_PATTERN',
   1, interval '30 days', 'A young account submitted one review and showed no return activity after seven days.',
   '{"detector_family":"behaviour","signal_interpretation":"indicator_not_proof"}'::jsonb);

insert into public.account_trust_behaviour_detector_config (
  detector_key, detector_version, signal_strength, confidence, settings
) values
  ('backyrd.behaviour.search_usage', '1.0.0', 0.80, 0.85,
   '{"window_days":30,"minimum_actions":3,"minimum_distinct_days":2}'::jsonb),
  ('backyrd.behaviour.decision_usage', '1.0.0', 0.85, 0.90,
   '{"window_days":30,"minimum_actions":3,"minimum_distinct_days":2}'::jsonb),
  ('backyrd.behaviour.spot_exploration', '1.0.0', 0.75, 0.80,
   '{"window_days":30,"minimum_distinct_spots":5,"minimum_distinct_days":2,"requires_optional_analytics":true}'::jsonb),
  ('backyrd.behaviour.returning_user', '1.0.0', 0.90, 0.90,
   '{"window_days":60,"minimum_sessions":3,"minimum_distinct_days":3,"minimum_span_days":7,"requires_optional_analytics":true}'::jsonb),
  ('backyrd.behaviour.natural_reviews', '1.0.0', 0.85, 0.85,
   '{"window_days":90,"minimum_reviews":2,"interaction_lookback_days":30}'::jsonb),
  ('backyrd.behaviour.review_only', '1.0.0', 0.55, 0.65,
   '{"window_days":30,"minimum_account_age_days":14,"minimum_reviews":5,"minimum_review_days":3,"maximum_other_core_actions":0,"requires_complete_optional_analytics_window":true}'::jsonb),
  ('backyrd.behaviour.action_velocity', '1.0.0', 0.65, 0.70,
   '{"lookback_days":7,"bucket_minutes":10,"minimum_actions":50,"minimum_action_types":3,"maximum_dominant_share":0.80,"reviews_excluded":true}'::jsonb),
  ('backyrd.behaviour.single_purpose', '1.0.0', 0.50, 0.65,
   '{"window_days":30,"minimum_account_age_days":14,"minimum_actions":12,"maximum_action_types":1,"requires_complete_optional_analytics_window":true}'::jsonb),
  ('backyrd.behaviour.feature_diversity', '1.0.0', 0.90, 0.90,
   '{"window_days":30,"minimum_actions":6,"minimum_feature_types":4}'::jsonb),
  ('backyrd.behaviour.dormant_pattern', '1.0.0', 0.45, 0.60,
   '{"minimum_account_age_days":7,"maximum_account_age_days":30,"initial_window_hours":24,"suspicious_action":"review","required_action_count":1,"maximum_return_actions":0,"requires_complete_optional_analytics_window":true}'::jsonb);

create or replace function public.account_trust_behaviour_action_inventory_v1(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns table (action_type text, occurred_at timestamptz, spot_id uuid, source text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'search', s.created_at, null::uuid, 'user_searches'
  from public.user_searches s
  where s.user_id = p_user_id
    and nullif(btrim(coalesce(s.query, '')), '') is not null
    and s.created_at >= p_from and s.created_at <= p_to
  union all
  select 'decision', d.created_at, null::uuid, 'decision_sessions'
  from public.decision_sessions d
  where d.user_id = p_user_id and d.created_at >= p_from and d.created_at <= p_to
  union all
  select 'favorite', f.created_at, f.spot_id, 'favorites'
  from public.favorites f
  where f.user_id = p_user_id and f.created_at >= p_from and f.created_at <= p_to
  union all
  select 'review', r.created_at, r.spot_id, 'reviews'
  from public.reviews r
  where r.user_id = p_user_id and r.created_at >= p_from and r.created_at <= p_to
  union all
  select 'moment', p.created_at, p.spot_id, 'social_posts'
  from public.social_posts p
  where p.user_id = p_user_id and p.source_type = 'manual'
    and p.status <> 'deleted' and p.created_at >= p_from and p.created_at <= p_to
  union all
  select
    case
      when e.event_name in ('map_marker_opened', 'map_spot_opened') then 'map'
      when e.event_name = 'spot_route_clicked' then 'route'
      else 'spot_open'
    end,
    e.occurred_at,
    e.spot_id,
    'analytics_events'
  from public.analytics_events e
  where e.user_id = p_user_id
    and e.occurred_at >= p_from and e.occurred_at <= p_to
    and e.event_name in (
      'spot_opened', 'spot_detail_opened', 'decision_spot_opened',
      'feed_spot_opened', 'profile_spot_opened',
      'profile_favorite_spot_opened', 'nearby_spot_opened',
      'map_marker_opened', 'map_spot_opened', 'spot_route_clicked'
    );
$$;

create or replace function public.account_trust_evaluate_behaviour_user_v1(
  p_user_id uuid,
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_created_at timestamptz;
  v_config public.account_trust_behaviour_detector_config%rowtype;
  v_result jsonb;
  v_emitted integer := 0;
  v_search_count integer := 0;
  v_search_days integer := 0;
  v_decision_count integer := 0;
  v_decision_days integer := 0;
  v_spot_count integer := 0;
  v_spot_days integer := 0;
  v_review_count integer := 0;
  v_review_days integer := 0;
  v_other_core_count integer := 0;
  v_action_count integer := 0;
  v_action_types integer := 0;
  v_dominant_share numeric := 0;
  v_dominant_type text;
  v_feature_types integer := 0;
  v_session_count integer := 0;
  v_session_days integer := 0;
  v_session_span interval := interval '0 seconds';
  v_natural_reviews integer := 0;
  v_velocity_start timestamptz;
  v_velocity_count integer := 0;
  v_velocity_types integer := 0;
  v_velocity_dominant numeric := 0;
  v_lifetime_actions integer := 0;
  v_lifetime_reviews integer := 0;
  v_return_actions integer := 0;
  v_optional_analytics_complete boolean := false;
begin
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'behaviour_evaluation_time_invalid' using errcode = '22023';
  end if;
  select u.created_at into v_created_at
  from auth.users u where u.id = p_user_id and u.deleted_at is null;
  if v_created_at is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode = 'P0002';
  end if;

  with actions as (
    select * from public.account_trust_behaviour_action_inventory_v1(
      p_user_id, greatest(v_created_at, p_as_of - interval '90 days'), p_as_of
    )
  )
  select
    count(*) filter (where action_type = 'search' and occurred_at >= p_as_of - interval '30 days'),
    count(distinct occurred_at::date) filter (where action_type = 'search' and occurred_at >= p_as_of - interval '30 days'),
    count(*) filter (where action_type = 'decision' and occurred_at >= p_as_of - interval '30 days'),
    count(distinct occurred_at::date) filter (where action_type = 'decision' and occurred_at >= p_as_of - interval '30 days'),
    count(distinct spot_id) filter (where action_type in ('spot_open', 'map') and occurred_at >= p_as_of - interval '30 days'),
    count(distinct occurred_at::date) filter (where action_type in ('spot_open', 'map') and occurred_at >= p_as_of - interval '30 days'),
    count(*) filter (where action_type = 'review' and occurred_at >= p_as_of - interval '30 days'),
    count(distinct occurred_at::date) filter (where action_type = 'review' and occurred_at >= p_as_of - interval '30 days'),
    count(*) filter (where action_type <> 'review' and occurred_at >= p_as_of - interval '30 days'),
    count(*) filter (where occurred_at >= p_as_of - interval '30 days'),
    count(distinct action_type) filter (where occurred_at >= p_as_of - interval '30 days')
  into
    v_search_count, v_search_days, v_decision_count, v_decision_days,
    v_spot_count, v_spot_days, v_review_count, v_review_days,
    v_other_core_count, v_action_count, v_action_types
  from actions;

  select coalesce(max(x.action_count)::numeric / nullif(sum(x.action_count), 0), 0),
         count(*) filter (where x.action_count > 0),
         (array_agg(x.action_type order by x.action_count desc, x.action_type))[1]
  into v_dominant_share, v_feature_types, v_dominant_type
  from (
    select action_type, count(*)::integer as action_count
    from public.account_trust_behaviour_action_inventory_v1(
      p_user_id, greatest(v_created_at, p_as_of - interval '30 days'), p_as_of
    )
    group by action_type
  ) x;

  select count(*), count(distinct s.started_at::date),
         coalesce(max(s.started_at) - min(s.started_at), interval '0 seconds')
  into v_session_count, v_session_days, v_session_span
  from public.analytics_sessions s
  where s.user_id = p_user_id
    and s.started_at >= p_as_of - interval '60 days' and s.started_at <= p_as_of;

  select count(*) into v_natural_reviews
  from public.reviews r
  where r.user_id = p_user_id
    and r.created_at >= p_as_of - interval '90 days' and r.created_at <= p_as_of
    and (
      exists (
        select 1 from public.backyrd_decision_review_links_v1 l
        where l.review_id = r.id and l.user_id = p_user_id
      )
      or exists (
        select 1 from public.analytics_events e
        where e.user_id = p_user_id and e.spot_id = r.spot_id
          and e.event_name in (
            'spot_opened','spot_detail_opened','decision_spot_opened',
            'map_marker_opened','map_spot_opened','spot_route_clicked'
          )
          and e.occurred_at between r.created_at - interval '30 days' and r.created_at
      )
      or exists (
        select 1
        from public.decision_impressions i
        join public.decision_sessions d on d.id = i.decision_id
        where d.user_id = p_user_id and i.spot_id = r.spot_id
          and i.created_at between r.created_at - interval '30 days' and r.created_at
      )
    );

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.action_velocity' and enabled;
  with high_value as (
    select action_type, occurred_at,
           date_bin(
             make_interval(mins => coalesce((v_config.settings->>'bucket_minutes')::integer, 10)),
             occurred_at,
             timestamptz '2000-01-01 00:00:00+00'
           ) as bucket_start
    from public.account_trust_behaviour_action_inventory_v1(
      p_user_id,
      greatest(v_created_at, p_as_of - make_interval(days => coalesce((v_config.settings->>'lookback_days')::integer, 7))),
      p_as_of
    )
    where action_type in ('decision','favorite','moment','spot_open','map','route')
  ), per_type as (
    select bucket_start, action_type, count(*)::integer as type_count
    from high_value group by bucket_start, action_type
  ), buckets as (
    select bucket_start, sum(type_count)::integer as total_count,
           count(*)::integer as type_count,
           max(type_count)::numeric / nullif(sum(type_count), 0) as dominant_share
    from per_type group by bucket_start
  )
  select b.bucket_start, b.total_count, b.type_count, b.dominant_share
  into v_velocity_start, v_velocity_count, v_velocity_types, v_velocity_dominant
  from buckets b
  where v_config.detector_key is not null
    and b.total_count >= (v_config.settings->>'minimum_actions')::integer
    and b.type_count >= (v_config.settings->>'minimum_action_types')::integer
    and b.dominant_share <= (v_config.settings->>'maximum_dominant_share')::numeric
  order by b.total_count desc, b.bucket_start
  limit 1;

  if p_as_of >= v_created_at + interval '7 days'
     and p_as_of <= v_created_at + interval '30 days' then
    select count(*), count(*) filter (where action_type = 'review'),
           count(*) filter (where occurred_at > v_created_at + interval '24 hours')
    into v_lifetime_actions, v_lifetime_reviews, v_return_actions
    from public.account_trust_behaviour_action_inventory_v1(p_user_id, v_created_at, p_as_of);
  end if;

  -- Missing or partial analytics consent means unknown behaviour, not risk.
  -- Absence-based detectors run only when the full window was observable.
  select exists (
    select 1
    from public.user_consents c
    where c.user_id = p_user_id
      and c.purpose_key = 'optional_product_analytics'
      and c.status = 'granted'
      and c.granted_at <= greatest(v_created_at, p_as_of - interval '30 days')
  ) into v_optional_analytics_complete;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.search_usage' and enabled;
  if v_config.detector_key is not null
     and v_search_count >= (v_config.settings->>'minimum_actions')::integer
     and v_search_days >= (v_config.settings->>'minimum_distinct_days')::integer then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_search_usage',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'search_usage:v1',
      jsonb_build_object('action_count', v_search_count, 'distinct_days', v_search_days, 'window_days', 30),
      '{"content_excluded":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.decision_usage' and enabled;
  if v_config.detector_key is not null
     and v_decision_count >= (v_config.settings->>'minimum_actions')::integer
     and v_decision_days >= (v_config.settings->>'minimum_distinct_days')::integer then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_decision_usage',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'decision_usage:v1',
      jsonb_build_object('action_count', v_decision_count, 'distinct_days', v_decision_days, 'window_days', 30), '{}');
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.spot_exploration' and enabled;
  if v_config.detector_key is not null
     and v_spot_count >= (v_config.settings->>'minimum_distinct_spots')::integer
     and v_spot_days >= (v_config.settings->>'minimum_distinct_days')::integer then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_spot_exploration',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'spot_exploration:v1',
      jsonb_build_object('distinct_spots', v_spot_count, 'distinct_days', v_spot_days, 'window_days', 30),
      '{"source":"optional_product_analytics"}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.returning_user' and enabled;
  if v_config.detector_key is not null
     and v_session_count >= (v_config.settings->>'minimum_sessions')::integer
     and v_session_days >= (v_config.settings->>'minimum_distinct_days')::integer
     and v_session_span >= make_interval(days => (v_config.settings->>'minimum_span_days')::integer) then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_returning_user',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'returning_user:v1',
      jsonb_build_object('session_count', v_session_count, 'distinct_days', v_session_days,
        'span_days', floor(extract(epoch from v_session_span) / 86400)),
      '{"source":"optional_product_analytics"}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.natural_reviews' and enabled;
  if v_config.detector_key is not null
     and v_natural_reviews >= (v_config.settings->>'minimum_reviews')::integer then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_natural_reviews',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'natural_reviews:v1',
      jsonb_build_object('supported_review_count', v_natural_reviews, 'window_days', 90,
        'accepted_contexts', jsonb_build_array('decision','spot','map','route')), '{}');
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.review_only' and enabled;
  if v_config.detector_key is not null
     and v_optional_analytics_complete
     and p_as_of >= v_created_at + make_interval(days => (v_config.settings->>'minimum_account_age_days')::integer)
     and v_review_count >= (v_config.settings->>'minimum_reviews')::integer
     and v_review_days >= (v_config.settings->>'minimum_review_days')::integer
     and v_other_core_count <= (v_config.settings->>'maximum_other_core_actions')::integer then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_review_only',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'review_only:' || to_char(p_as_of, 'YYYY-MM'),
      jsonb_build_object('review_count', v_review_count, 'review_days', v_review_days,
        'other_core_action_count', v_other_core_count, 'window_days', 30),
      '{"signal_interpretation":"indicator_not_proof","optional_analytics_window_complete":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.action_velocity' and enabled;
  if v_config.detector_key is not null and v_velocity_start is not null then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_action_velocity',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null,
      'velocity:' || extract(epoch from v_velocity_start)::bigint::text,
      jsonb_build_object('action_count', v_velocity_count, 'action_types', v_velocity_types,
        'dominant_share', round(v_velocity_dominant, 4),
        'bucket_minutes', (v_config.settings->>'bucket_minutes')::integer),
      '{"reviews_excluded":true,"signal_interpretation":"indicator_not_proof"}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.single_purpose' and enabled;
  if v_config.detector_key is not null
     and v_optional_analytics_complete
     and p_as_of >= v_created_at + make_interval(days => (v_config.settings->>'minimum_account_age_days')::integer)
     and v_action_count >= (v_config.settings->>'minimum_actions')::integer
     and v_action_types <= (v_config.settings->>'maximum_action_types')::integer
     and v_dominant_type in ('review','moment') then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_single_purpose',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'single_purpose:' || to_char(p_as_of, 'YYYY-MM'),
      jsonb_build_object('action_count', v_action_count, 'action_types', v_action_types,
        'dominant_share', round(v_dominant_share, 4), 'dominant_action_type', v_dominant_type,
        'window_days', (v_config.settings->>'window_days')::integer),
      '{"signal_interpretation":"indicator_not_proof"}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.feature_diversity' and enabled;
  if v_config.detector_key is not null
     and v_action_count >= (v_config.settings->>'minimum_actions')::integer
     and v_feature_types >= (v_config.settings->>'minimum_feature_types')::integer then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_feature_diversity',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null, 'feature_diversity:v1',
      jsonb_build_object('action_count', v_action_count, 'feature_types', v_feature_types, 'window_days', 30), '{}');
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  select * into v_config from public.account_trust_behaviour_detector_config
  where detector_key = 'backyrd.behaviour.dormant_pattern' and enabled;
  if v_config.detector_key is not null
     and v_optional_analytics_complete
     and p_as_of >= v_created_at + make_interval(days => (v_config.settings->>'minimum_account_age_days')::integer)
     and p_as_of <= v_created_at + make_interval(days => (v_config.settings->>'maximum_account_age_days')::integer)
     and v_lifetime_actions = (v_config.settings->>'required_action_count')::integer
     and v_lifetime_reviews = (v_config.settings->>'required_action_count')::integer
     and v_return_actions <= (v_config.settings->>'maximum_return_actions')::integer
     and v_session_days <= 1 then
    v_result := public.account_trust_emit_signal_v1(p_user_id, 'behaviour_dormant_pattern',
      v_config.detector_key, v_config.detector_version, v_config.signal_strength,
      v_config.confidence, p_as_of, null,
      'dormant:' || extract(epoch from v_created_at)::bigint::text,
      jsonb_build_object('account_age_days', floor(extract(epoch from (p_as_of-v_created_at))/86400),
        'initial_action', 'review', 'return_action_count', v_return_actions),
      '{"signal_interpretation":"indicator_not_proof"}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted := v_emitted + 1; end if;
  end if;

  return jsonb_build_object('user_id', p_user_id, 'signals_emitted', v_emitted,
    'observed_action_count_30d', v_action_count, 'observed_feature_types_30d', v_feature_types);
end;
$$;

create or replace function public.account_trust_evaluate_behaviour_due_v1(
  p_limit integer default 1000,
  p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_state record;
  v_result jsonb;
  v_processed integer := 0;
  v_emitted integer := 0;
  v_next interval;
begin
  if p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception 'behaviour_evaluation_limit_invalid' using errcode = '22023';
  end if;
  if p_as_of is null or p_as_of > now() + interval '5 minutes' then
    raise exception 'behaviour_evaluation_time_invalid' using errcode = '22023';
  end if;

  for v_state in
    select s.user_id
    from public.account_trust_behaviour_evaluation_state s
    where s.next_evaluation_at <= p_as_of
    order by s.next_evaluation_at, s.user_id
    limit p_limit
    for update skip locked
  loop
    v_result := public.account_trust_evaluate_behaviour_user_v1(v_state.user_id, p_as_of);
    v_next := case when (v_result->>'observed_action_count_30d')::integer > 0
      then interval '1 day' else interval '7 days' end;
    update public.account_trust_behaviour_evaluation_state
    set last_evaluated_at = p_as_of,
        next_evaluation_at = p_as_of + v_next,
        last_signal_count = coalesce((v_result->>'signals_emitted')::integer, 0),
        updated_at = now()
    where user_id = v_state.user_id;
    v_processed := v_processed + 1;
    v_emitted := v_emitted + coalesce((v_result->>'signals_emitted')::integer, 0);
  end loop;
  return jsonb_build_object('processed', v_processed, 'signals_emitted', v_emitted);
end;
$$;

create or replace function public.account_trust_schedule_behaviour_profile_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.account_trust_behaviour_evaluation_state(user_id, next_evaluation_at)
  values (new.id, now()) on conflict (user_id) do nothing;
  return new;
end;
$$;

insert into public.account_trust_behaviour_evaluation_state(user_id, next_evaluation_at)
select p.id, now() from public.profiles p
on conflict (user_id) do nothing;

create trigger trg_account_trust_schedule_behaviour_profile_v1
after insert on public.profiles
for each row execute function public.account_trust_schedule_behaviour_profile_v1();

select public.account_trust_evaluate_behaviour_due_v1(10000, now());

alter table public.account_trust_behaviour_detector_config enable row level security;
alter table public.account_trust_behaviour_evaluation_state enable row level security;
revoke all on table public.account_trust_behaviour_detector_config from public, anon, authenticated;
revoke all on table public.account_trust_behaviour_evaluation_state from public, anon, authenticated;
grant select, insert, update, delete on table public.account_trust_behaviour_detector_config to service_role;
grant select, insert, update, delete on table public.account_trust_behaviour_evaluation_state to service_role;

revoke all on function public.account_trust_behaviour_action_inventory_v1(uuid,timestamptz,timestamptz)
  from public, anon, authenticated;
revoke all on function public.account_trust_evaluate_behaviour_user_v1(uuid,timestamptz)
  from public, anon, authenticated;
revoke all on function public.account_trust_evaluate_behaviour_due_v1(integer,timestamptz)
  from public, anon, authenticated;
revoke all on function public.account_trust_schedule_behaviour_profile_v1()
  from public, anon, authenticated;
grant execute on function public.account_trust_behaviour_action_inventory_v1(uuid,timestamptz,timestamptz)
  to service_role;
grant execute on function public.account_trust_evaluate_behaviour_user_v1(uuid,timestamptz)
  to service_role;
grant execute on function public.account_trust_evaluate_behaviour_due_v1(integer,timestamptz)
  to service_role;

comment on function public.account_trust_evaluate_behaviour_user_v1(uuid,timestamptz) is
  'Sprint 9.2 service-only aggregation of existing product actions into non-enforcing Behaviour Trust signals.';
