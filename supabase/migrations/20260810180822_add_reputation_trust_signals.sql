-- Sprint 9.6: durable Reputation Trust signals.
--
-- Reputation records trust earned through time, consistent healthy use, and
-- confirmed contribution history. It is evidence only: this migration adds no
-- ranking, reach, permission, moderation, or Distribution Trust behavior.

create table public.account_trust_reputation_detector_config (
  detector_key text primary key check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  enabled boolean not null default true,
  signal_strength numeric(5,4) not null check (signal_strength between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_reputation_milestones (
  milestone_days integer primary key check (milestone_days > 0),
  strength numeric(5,4) not null check (strength between 0 and 1),
  label text not null unique
);

create table public.account_trust_reputation_evaluation_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  last_signal_count integer not null default 0 check (last_signal_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_trust_reputation_evaluation_due_idx
  on public.account_trust_reputation_evaluation_state(next_evaluation_at,user_id);

comment on table public.account_trust_reputation_evaluation_state is
  'Daily, service-only Reputation Trust evaluation state. Reputation derives from durable canonical product and human-decision records, never popularity or invasive telemetry.';

insert into public.account_trust_signal_registry(
  signal_key,dimension,polarity,base_score_impact,reason_code,
  definition_version,default_ttl,description,metadata
) values
  ('reputation_account_tenure','reputation','supporting',4,'REPUTATION_ACCOUNT_TENURE',
   1,null,'The account reached a configured tenure milestone; age alone is modest evidence.',
   '{"detector_family":"reputation","popularity_not_used":true,"persistent_milestone":true}'::jsonb),
  ('reputation_consistent_participation','reputation','supporting',8,'REPUTATION_CONSISTENT_PARTICIPATION',
   1,interval '180 days','Healthy use remained diverse and recurring across a meaningful observation span.',
   '{"detector_family":"reputation","long_term_evidence":true,"raw_volume_not_rewarded":true}'::jsonb),
  ('reputation_quality_contributor','reputation','supporting',9,'REPUTATION_QUALITY_CONTRIBUTOR',
   1,interval '365 days','A modest, diverse contribution history remained healthy under human moderation.',
   '{"detector_family":"reputation","subjective_writing_score_not_used":true,"popularity_not_used":true}'::jsonb),
  ('reputation_trusted_review_history','reputation','supporting',10,'REPUTATION_TRUSTED_REVIEW_HISTORY',
   1,interval '365 days','A sufficiently observed Review history has a low Integrity incident ratio and no confirmed manipulation.',
   '{"detector_family":"reputation","sprint8_evidence_consumer":true,"absence_alone_not_evidence":true}'::jsonb),
  ('reputation_healthy_social','reputation','supporting',7,'REPUTATION_HEALTHY_SOCIAL',
   1,interval '180 days','Long-term social participation is diverse across actions, time, and counterparties.',
   '{"detector_family":"reputation","followers_received_not_used":true,"likes_received_not_used":true}'::jsonb),
  ('reputation_reliable_community_member','reputation','supporting',12,'REPUTATION_RELIABLE_COMMUNITY_MEMBER',
   1,interval '365 days','Several independent, long-term Reputation evidence families align.',
   '{"detector_family":"reputation","multi_family_required":true,"long_lived_but_revocable":true}'::jsonb),
  ('reputation_reliable_reporter','reputation','supporting',7,'REPUTATION_RELIABLE_REPORTER',
   1,interval '180 days','Several human-resolved reports were substantiated with no report-abuse evidence.',
   '{"detector_family":"reputation","human_resolution_required":true,"report_volume_alone_not_rewarded":true}'::jsonb),
  ('reputation_clean_history','reputation','supporting',7,'REPUTATION_CLEAN_HISTORY',
   1,interval '180 days','A mature, meaningfully observed account has no active confirmed serious-abuse history.',
   '{"detector_family":"reputation","inactivity_is_not_positive_evidence":true,"automated_suspicion_excluded":true}'::jsonb);

insert into public.account_trust_reputation_milestones(milestone_days,strength,label) values
  (30,0.20,'30d'),(90,0.30,'90d'),(180,0.40,'180d'),
  (365,0.55,'365d'),(730,0.70,'730d');

insert into public.account_trust_reputation_detector_config(
  detector_key,detector_version,signal_strength,confidence,settings
) values
  ('backyrd.reputation.account_tenure','1.0.0',1.00,1.00,
   '{"milestones_days":[30,90,180,365,730],"age_alone_is_modest":true}'::jsonb),
  ('backyrd.reputation.consistent_participation','1.0.0',0.85,0.85,
   '{"minimum_account_days":180,"window_days":365,"minimum_active_days":12,"minimum_active_months":4,"minimum_feature_families":3,"requires_decision_usage":true,"requires_spot_linked_usage":true,"revalidation_days":180}'::jsonb),
  ('backyrd.reputation.quality_contributor','1.0.0',0.85,0.90,
   '{"minimum_account_days":365,"minimum_contributions":4,"minimum_distinct_spots":3,"minimum_history_span_days":180,"maximum_confirmed_violation_ratio":0.10,"revalidation_days":365}'::jsonb),
  ('backyrd.reputation.trusted_review_history','1.0.0',0.90,0.90,
   '{"minimum_account_days":365,"minimum_reviews":5,"minimum_distinct_spots":4,"minimum_history_span_days":180,"maximum_integrity_incident_ratio":0.10,"revalidation_days":365}'::jsonb),
  ('backyrd.reputation.healthy_social','1.0.0',0.80,0.80,
   '{"minimum_account_days":180,"window_days":365,"minimum_actions":8,"minimum_counterparties":4,"minimum_active_months":3,"minimum_action_families":3,"revalidation_days":180}'::jsonb),
  ('backyrd.reputation.reliable_community_member','1.0.0',0.95,0.95,
   '{"minimum_account_days":365,"minimum_positive_families":3,"requires_contribution_family":true,"requires_clean_history":true,"revalidation_days":365}'::jsonb),
  ('backyrd.reputation.reliable_reporter','1.0.0',0.80,0.90,
   '{"minimum_account_days":180,"window_days":365,"minimum_resolved_reports":5,"minimum_actioned_reports":4,"minimum_actioned_ratio":0.75,"minimum_history_span_days":90,"maximum_abuse_events":0,"revalidation_days":180}'::jsonb),
  ('backyrd.reputation.clean_history','1.0.0',0.75,0.85,
   '{"minimum_account_days":365,"window_days":365,"minimum_active_days":12,"minimum_feature_families":3,"minimum_contributions":4,"minimum_observation_span_days":180,"confirmed_abuse_lookback_days":730,"revalidation_days":180}'::jsonb);

create or replace function public.account_trust_reputation_activity_v1(
  p_user_id uuid,p_from timestamptz,p_to timestamptz
) returns table(
  action_family text,occurred_at timestamptz,spot_id uuid,
  counterparty_id uuid,contribution_id uuid,contribution_type text
)
language sql
security definer
set search_path=public,pg_catalog
as $$
  select 'search',s.created_at,null::uuid,null::uuid,null::uuid,null::text
  from public.user_searches s where s.user_id=p_user_id and s.created_at between p_from and p_to
  union all
  select 'decision',d.created_at,null::uuid,null::uuid,null::uuid,null::text
  from public.decision_sessions d where d.user_id=p_user_id and d.created_at between p_from and p_to
  union all
  select 'favorite',f.created_at,f.spot_id,null::uuid,null::uuid,null::text
  from public.favorites f where f.user_id=p_user_id and f.created_at between p_from and p_to
  union all
  select 'review',r.created_at,r.spot_id,null::uuid,r.id,'review'
  from public.reviews r where r.user_id=p_user_id and r.created_at between p_from and p_to
  union all
  select 'moment',p.created_at,p.spot_id,null::uuid,p.id,'social_post'
  from public.social_posts p where p.user_id=p_user_id and p.status='published'
    and p.created_at between p_from and p_to
  union all
  select 'follow',f.created_at,null::uuid,f.following,null::uuid,null::text
  from public.follows f where f.follower=p_user_id and f.created_at between p_from and p_to
  union all
  select 'review_like',l.created_at,r.spot_id,r.user_id,null::uuid,null::text
  from public.review_likes l join public.reviews r on r.id=l.review_id
  where l.user_id=p_user_id and l.created_at between p_from and p_to and r.user_id is distinct from p_user_id
  union all
  select 'review_comment',c.created_at,r.spot_id,r.user_id,null::uuid,null::text
  from public.review_comments c join public.reviews r on r.id=c.review_id
  where c.user_id=p_user_id and c.created_at between p_from and p_to and r.user_id is distinct from p_user_id
  union all
  select 'social_reaction',x.created_at,p.spot_id,p.user_id,null::uuid,null::text
  from public.social_post_reactions x join public.social_posts p on p.id=x.post_id
  where x.user_id=p_user_id and x.created_at between p_from and p_to and p.user_id<>p_user_id
  union all
  select 'social_comment',c.created_at,p.spot_id,p.user_id,null::uuid,null::text
  from public.social_comments c join public.social_posts p on p.id=c.post_id
  where c.user_id=p_user_id and c.status='published'
    and c.created_at between p_from and p_to and p.user_id<>p_user_id;
$$;

create or replace function public.account_trust_schedule_reputation_user_v1(
  p_user_id uuid,p_schedule_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if p_user_id is null then return; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode='P0002';
  end if;
  insert into public.account_trust_reputation_evaluation_state(user_id,next_evaluation_at)
  values(p_user_id,coalesce(p_schedule_at,now()))
  on conflict(user_id) do update set
    next_evaluation_at=least(public.account_trust_reputation_evaluation_state.next_evaluation_at,excluded.next_evaluation_at),
    updated_at=now();
end;
$$;

create or replace function public.account_trust_refresh_reputation_signal_v1(
  p_user_id uuid,p_signal_key text,p_detector_key text,p_detector_version text,
  p_strength numeric,p_confidence numeric,p_qualifies boolean,p_as_of timestamptz,
  p_revalidation_days integer,p_evidence jsonb,p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_signal record;v_result jsonb;
begin
  for v_signal in
    select id from public.account_trust_signals
    where user_id=p_user_id and signal_key=p_signal_key and detector_key=p_detector_key
      and status='active' and expires_at is not null and expires_at<=p_as_of
    for update
  loop
    perform public.account_trust_resolve_signal_v1(v_signal.id,'reputation_revalidation_expired','expired');
  end loop;

  if not coalesce(p_qualifies,false) then
    return jsonb_build_object('emitted',false,'qualified',false);
  end if;
  if exists(
    select 1 from public.account_trust_signals
    where user_id=p_user_id and signal_key=p_signal_key and detector_key=p_detector_key
      and status='active' and (expires_at is null or expires_at>p_as_of)
  ) then
    return jsonb_build_object('emitted',false,'qualified',true,'duplicate',true);
  end if;

  v_result:=public.account_trust_emit_signal_v1(
    p_user_id,p_signal_key,p_detector_key,p_detector_version,p_strength,p_confidence,
    p_as_of,p_as_of+make_interval(days=>p_revalidation_days),
    'revalidation:'||to_char(p_as_of,'YYYY-MM-DD'),p_evidence,p_metadata);
  return jsonb_build_object('emitted',not coalesce((v_result->>'duplicate')::boolean,false),
    'qualified',true,'signal_id',v_result->'signal_id');
end;
$$;

create or replace function public.account_trust_evaluate_reputation_user_v1(
  p_user_id uuid,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_created_at timestamptz;v_age_days integer;v_config public.account_trust_reputation_detector_config%rowtype;
  v_result jsonb;v_milestone record;v_emitted integer:=0;v_window_start timestamptz;
  v_active_days integer:=0;v_active_months integer:=0;v_features integer:=0;
  v_decisions integer:=0;v_spot_actions integer:=0;v_contributions integer:=0;
  v_contribution_spots integer:=0;v_contribution_first timestamptz;v_contribution_last timestamptz;
  v_reviews integer:=0;v_review_spots integer:=0;v_review_first timestamptz;v_review_last timestamptz;
  v_integrity_reviews integer:=0;v_integrity_ratio numeric:=0;v_unresolved_high_integrity boolean:=false;
  v_confirmed_count integer:=0;v_serious_count integer:=0;v_confirmed_contribution integer:=0;
  v_confirmed_review_count integer:=0;v_abuse_lookback_days integer:=730;
  v_confirmed_review_manipulation integer:=0;v_confirmed_social integer:=0;
  v_social_actions integer:=0;v_social_counterparties integer:=0;v_social_months integer:=0;v_social_families integer:=0;
  v_report_resolved integer:=0;v_report_actioned integer:=0;v_report_abuse integer:=0;
  v_report_first timestamptz;v_report_last timestamptz;v_report_ratio numeric:=0;
  v_qualifies boolean;v_positive_families integer:=0;v_has_contribution_family boolean:=false;
  v_serious_confirmed boolean:=false;v_review_confirmed boolean:=false;v_social_confirmed boolean:=false;
  v_signal record;
begin
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'reputation_evaluation_time_invalid' using errcode='22023';
  end if;
  select coalesce(u.created_at,p.created_at) into v_created_at
  from public.profiles p left join auth.users u on u.id=p.id where p.id=p_user_id;
  if v_created_at is null then raise exception 'account_trust_user_not_found' using errcode='P0002'; end if;
  v_age_days:=greatest(0,floor(extract(epoch from (p_as_of-v_created_at))/86400)::integer);
  insert into public.account_trust_reputation_evaluation_state(user_id,next_evaluation_at)
  values(p_user_id,p_as_of) on conflict(user_id) do nothing;

  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.account_tenure' and enabled;
  if v_config.detector_key is not null then
    for v_milestone in select * from public.account_trust_reputation_milestones order by milestone_days loop
      if v_age_days>=v_milestone.milestone_days then
        v_result:=public.account_trust_emit_signal_v1(
          p_user_id,'reputation_account_tenure',v_config.detector_key,v_config.detector_version,
          v_milestone.strength,v_config.confidence,v_created_at+make_interval(days=>v_milestone.milestone_days),
          null,'milestone:'||v_milestone.milestone_days,
          jsonb_build_object('milestone_days',v_milestone.milestone_days,'label',v_milestone.label),
          '{"age_alone_is_modest":true,"popularity_not_used":true}'::jsonb);
        if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
      end if;
    end loop;
  end if;

  v_window_start:=p_as_of-interval '365 days';
  select count(distinct occurred_at::date),count(distinct date_trunc('month',occurred_at)),
    count(distinct action_family),count(*) filter(where action_family='decision'),
    count(*) filter(where spot_id is not null),count(*) filter(where contribution_id is not null),
    count(distinct spot_id) filter(where contribution_id is not null),
    min(occurred_at) filter(where contribution_id is not null),max(occurred_at) filter(where contribution_id is not null),
    count(*) filter(where contribution_type='review'),count(distinct spot_id) filter(where contribution_type='review'),
    min(occurred_at) filter(where contribution_type='review'),max(occurred_at) filter(where contribution_type='review'),
    count(*) filter(where action_family in ('follow','review_like','review_comment','social_reaction','social_comment')),
    count(distinct counterparty_id) filter(where action_family in ('follow','review_like','review_comment','social_reaction','social_comment')),
    count(distinct date_trunc('month',occurred_at)) filter(where action_family in ('follow','review_like','review_comment','social_reaction','social_comment')),
    count(distinct action_family) filter(where action_family in ('follow','review_like','review_comment','social_reaction','social_comment'))
  into v_active_days,v_active_months,v_features,v_decisions,v_spot_actions,v_contributions,
    v_contribution_spots,v_contribution_first,v_contribution_last,v_reviews,v_review_spots,v_review_first,v_review_last,
    v_social_actions,v_social_counterparties,v_social_months,v_social_families
  from public.account_trust_reputation_activity_v1(p_user_id,v_window_start,p_as_of);

  select count(distinct ci.entity_id)::integer,
    coalesce(count(distinct ci.entity_id)::numeric/nullif(v_reviews,0),0)
  into v_integrity_reviews,v_integrity_ratio
  from public.safety_signals s join public.safety_cases c on c.id=s.case_id
  join public.safety_content_items ci on ci.id=c.content_item_id
  where ci.actor_user_id=p_user_id and ci.entity_type='review' and s.provider='backyrd_integrity'
    and s.flagged is true and s.created_at<=p_as_of and ci.entity_id in
      (select contribution_id from public.account_trust_reputation_activity_v1(p_user_id,v_window_start,p_as_of)
       where contribution_type='review');
  select exists(
    select 1 from public.safety_signals s join public.safety_cases c on c.id=s.case_id
    join public.safety_content_items ci on ci.id=c.content_item_id
    where ci.actor_user_id=p_user_id and ci.entity_type='review' and s.provider='backyrd_integrity'
      and s.flagged is true and s.categories->>'risk_level'='high_risk'
      and c.case_status in ('queued','evaluating','needs_review','appealed')
  ) into v_unresolved_high_integrity;

  select coalesce((settings->>'confirmed_abuse_lookback_days')::integer,730)
  into v_abuse_lookback_days
  from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.clean_history' and enabled;
  v_abuse_lookback_days:=coalesce(v_abuse_lookback_days,730);
  with confirmed as (
    select e.*,ci.entity_type
    from public.safety_user_enforcement_events e
    left join public.safety_cases c on c.id=e.case_id
    left join public.safety_content_items ci on ci.id=c.content_item_id
    where e.user_id=p_user_id and e.event_type='violation_confirmed'
      and e.created_at between p_as_of-make_interval(days=>v_abuse_lookback_days) and p_as_of
      and not exists(select 1 from public.safety_user_enforcement_events r
        where r.case_id=e.case_id and r.event_type='violation_reversed' and r.created_at>=e.created_at)
  )
  select count(*)::integer,
    count(*) filter(where action='remove' or severity>=4 or points>=3)::integer,
    count(*) filter(where entity_type in ('review','social_post'))::integer,
    count(*) filter(where entity_type='review')::integer,
    count(*) filter(where entity_type='review' and
      (category in ('spam_fraud','fraud_and_deception','review_integrity','manipulated_reviews')
       or action='remove' or severity>=4))::integer,
    count(*) filter(where entity_type in ('social_post','social_comment'))::integer
  into v_confirmed_count,v_serious_count,v_confirmed_contribution,v_confirmed_review_count,
    v_confirmed_review_manipulation,v_confirmed_social
  from confirmed;
  v_serious_confirmed:=v_serious_count>0 or v_confirmed_count>=2;
  v_review_confirmed:=v_confirmed_review_manipulation>0 or v_confirmed_review_count>=2;
  v_social_confirmed:=v_confirmed_social>0 and v_serious_confirmed;

  -- Confirmed serious human decisions revoke relevant earned evidence. Automated
  -- Safety or Review Integrity suspicion is intentionally not consulted here.
  if v_serious_confirmed then
    for v_signal in select id from public.account_trust_signals
      where user_id=p_user_id and dimension='reputation' and status='active'
        and signal_key in ('reputation_clean_history','reputation_reliable_community_member')
      for update
    loop perform public.account_trust_resolve_signal_v1(v_signal.id,'human_confirmed_serious_abuse','revoked'); end loop;
  end if;
  if v_review_confirmed then
    for v_signal in select id from public.account_trust_signals
      where user_id=p_user_id and status='active'
        and signal_key in ('reputation_trusted_review_history','reputation_quality_contributor') for update
    loop perform public.account_trust_resolve_signal_v1(v_signal.id,'human_confirmed_review_manipulation','revoked'); end loop;
  end if;
  if v_social_confirmed then
    for v_signal in select id from public.account_trust_signals
      where user_id=p_user_id and status='active' and signal_key='reputation_healthy_social' for update
    loop perform public.account_trust_resolve_signal_v1(v_signal.id,'human_confirmed_social_abuse','revoked'); end loop;
  end if;

  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.consistent_participation' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_active_days>=(v_config.settings->>'minimum_active_days')::integer
      and v_active_months>=(v_config.settings->>'minimum_active_months')::integer
      and v_features>=(v_config.settings->>'minimum_feature_families')::integer
      and v_decisions>0 and v_spot_actions>0;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_consistent_participation',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('active_days',v_active_days,'active_months',v_active_months,'feature_families',v_features,
        'decision_actions',v_decisions,'spot_linked_actions',v_spot_actions,'window_days',365),
      '{"long_term_not_current_behaviour":true,"analytics_consent_not_required":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.quality_contributor' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_contributions>=(v_config.settings->>'minimum_contributions')::integer
      and v_contribution_spots>=(v_config.settings->>'minimum_distinct_spots')::integer
      and v_contribution_last-v_contribution_first>=make_interval(days=>(v_config.settings->>'minimum_history_span_days')::integer)
      and coalesce(v_confirmed_contribution::numeric/nullif(v_contributions,0),0)
        <=(v_config.settings->>'maximum_confirmed_violation_ratio')::numeric
      and not v_review_confirmed;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_quality_contributor',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('contribution_count',v_contributions,'distinct_spot_count',v_contribution_spots,
        'history_span_days',coalesce(floor(extract(epoch from (v_contribution_last-v_contribution_first))/86400)::integer,0),
        'confirmed_content_violation_count',v_confirmed_contribution),
      '{"likes_and_popularity_excluded":true,"subjective_quality_scoring_excluded":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.trusted_review_history' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_reviews>=(v_config.settings->>'minimum_reviews')::integer
      and v_review_spots>=(v_config.settings->>'minimum_distinct_spots')::integer
      and v_review_last-v_review_first>=make_interval(days=>(v_config.settings->>'minimum_history_span_days')::integer)
      and v_integrity_ratio<=(v_config.settings->>'maximum_integrity_incident_ratio')::numeric
      and not v_unresolved_high_integrity and not v_review_confirmed;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_trusted_review_history',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('review_count',v_reviews,'distinct_spot_count',v_review_spots,
        'history_span_days',coalesce(floor(extract(epoch from (v_review_last-v_review_first))/86400)::integer,0),
        'integrity_incident_review_count',v_integrity_reviews,'integrity_incident_ratio',round(v_integrity_ratio,4),
        'unresolved_high_risk_integrity',v_unresolved_high_integrity),
      '{"review_trust_reused":true,"absence_alone_not_evidence":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.healthy_social' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_social_actions>=(v_config.settings->>'minimum_actions')::integer
      and v_social_counterparties>=(v_config.settings->>'minimum_counterparties')::integer
      and v_social_months>=(v_config.settings->>'minimum_active_months')::integer
      and v_social_families>=(v_config.settings->>'minimum_action_families')::integer
      and not v_social_confirmed;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_healthy_social',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('social_action_count',v_social_actions,'distinct_counterparties',v_social_counterparties,
        'active_months',v_social_months,'action_families',v_social_families),
      '{"followers_received_excluded":true,"likes_received_excluded":true,"raw_volume_not_rewarded":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select count(*)::integer,count(*) filter(where report_status='resolved_actioned')::integer,
    min(coalesce(reviewed_at,updated_at)),max(coalesce(reviewed_at,updated_at))
  into v_report_resolved,v_report_actioned,v_report_first,v_report_last
  from public.safety_user_reports where reporter_user_id=p_user_id
    and report_status in ('resolved_actioned','resolved_no_violation')
    and coalesce(reviewed_at,updated_at) between v_window_start and p_as_of;
  select count(*)::integer into v_report_abuse from public.safety_report_abuse_events
  where reporter_user_id=p_user_id and event_type in
    ('duplicate_report_blocked','burst_limit_blocked','daily_limit_blocked','low_trust_restricted')
    and created_at between v_window_start and p_as_of;
  v_report_ratio:=coalesce(v_report_actioned::numeric/nullif(v_report_resolved,0),0);
  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.reliable_reporter' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_report_resolved>=(v_config.settings->>'minimum_resolved_reports')::integer
      and v_report_actioned>=(v_config.settings->>'minimum_actioned_reports')::integer
      and v_report_ratio>=(v_config.settings->>'minimum_actioned_ratio')::numeric
      and v_report_last-v_report_first>=make_interval(days=>(v_config.settings->>'minimum_history_span_days')::integer)
      and v_report_abuse<=(v_config.settings->>'maximum_abuse_events')::integer;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_reliable_reporter',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('resolved_report_count',v_report_resolved,'actioned_report_count',v_report_actioned,
        'confirmed_accuracy_ratio',round(v_report_ratio,4),'report_abuse_event_count',v_report_abuse,
        'human_resolution_required',true),'{"report_volume_alone_not_rewarded":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.clean_history' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_active_days>=(v_config.settings->>'minimum_active_days')::integer
      and v_features>=(v_config.settings->>'minimum_feature_families')::integer
      and v_contributions>=(v_config.settings->>'minimum_contributions')::integer
      and v_contribution_last-v_contribution_first>=make_interval(days=>(v_config.settings->>'minimum_observation_span_days')::integer)
      and not v_serious_confirmed;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_clean_history',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('active_days',v_active_days,'feature_families',v_features,'contribution_count',v_contributions,
        'observation_span_days',coalesce(floor(extract(epoch from (v_contribution_last-v_contribution_first))/86400)::integer,0),
        'active_confirmed_serious_abuse_count',v_serious_count),
      '{"inactivity_is_not_positive_evidence":true,"automated_suspicion_excluded":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select count(distinct signal_key)::integer,
    bool_or(signal_key in ('reputation_quality_contributor','reputation_trusted_review_history'))
  into v_positive_families,v_has_contribution_family
  from public.account_trust_signals where user_id=p_user_id and dimension='reputation'
    and signal_key not in ('reputation_account_tenure','reputation_reliable_community_member')
    and status='active' and (expires_at is null or expires_at>p_as_of);
  select * into v_config from public.account_trust_reputation_detector_config
  where detector_key='backyrd.reputation.reliable_community_member' and enabled;
  if v_config.detector_key is not null then
    v_qualifies:=v_age_days>=(v_config.settings->>'minimum_account_days')::integer
      and v_positive_families>=(v_config.settings->>'minimum_positive_families')::integer
      and coalesce(v_has_contribution_family,false)
      and exists(select 1 from public.account_trust_signals where user_id=p_user_id
        and signal_key='reputation_clean_history' and status='active' and expires_at>p_as_of)
      and not v_serious_confirmed;
    v_result:=public.account_trust_refresh_reputation_signal_v1(p_user_id,'reputation_reliable_community_member',
      v_config.detector_key,v_config.detector_version,v_config.signal_strength,v_config.confidence,v_qualifies,p_as_of,
      (v_config.settings->>'revalidation_days')::integer,
      jsonb_build_object('independent_positive_family_count',v_positive_families,
        'contribution_family_present',v_has_contribution_family,'clean_history_present',not v_serious_confirmed),
      '{"multi_family_required":true,"popularity_not_used":true}'::jsonb);
    if coalesce((v_result->>'emitted')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  return jsonb_build_object('user_id',p_user_id,'signals_emitted',v_emitted,'account_age_days',v_age_days,
    'active_days',v_active_days,'active_months',v_active_months,'feature_families',v_features,
    'contribution_count',v_contributions,'review_count',v_reviews,'integrity_incident_review_count',v_integrity_reviews,
    'confirmed_violation_count',v_confirmed_count,'confirmed_serious_abuse',v_serious_confirmed,
    'resolved_report_count',v_report_resolved,'actioned_report_count',v_report_actioned,
    'positive_reputation_families',v_positive_families);
end;
$$;

create or replace function public.account_trust_evaluate_reputation_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_state record;v_result jsonb;v_processed integer:=0;v_emitted integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then
    raise exception 'reputation_evaluation_limit_invalid' using errcode='22023';
  end if;
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'reputation_evaluation_time_invalid' using errcode='22023';
  end if;
  for v_state in select user_id from public.account_trust_reputation_evaluation_state
    where next_evaluation_at<=p_as_of order by next_evaluation_at,user_id
    limit p_limit for update skip locked
  loop
    v_result:=public.account_trust_evaluate_reputation_user_v1(v_state.user_id,p_as_of);
    update public.account_trust_reputation_evaluation_state set
      last_evaluated_at=p_as_of,next_evaluation_at=p_as_of+interval '24 hours',
      last_signal_count=coalesce((v_result->>'signals_emitted')::integer,0),updated_at=now()
    where user_id=v_state.user_id;
    v_processed:=v_processed+1;
    v_emitted:=v_emitted+coalesce((v_result->>'signals_emitted')::integer,0);
  end loop;
  return jsonb_build_object('processed',v_processed,'signals_emitted',v_emitted);
end;
$$;

create or replace function public.account_trust_initialize_reputation_profile_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.account_trust_schedule_reputation_user_v1(new.id,now());
  return new;
end;
$$;

create or replace function public.account_trust_schedule_reputation_enforcement_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.event_type in ('violation_confirmed','violation_reversed') then
    perform public.account_trust_schedule_reputation_user_v1(new.user_id,now());
  end if;
  return new;
end;
$$;

create trigger trg_account_trust_reputation_profile_v1
after insert on public.profiles for each row
execute function public.account_trust_initialize_reputation_profile_v1();

create trigger trg_account_trust_reputation_enforcement_v1
after insert on public.safety_user_enforcement_events for each row
execute function public.account_trust_schedule_reputation_enforcement_v1();

insert into public.account_trust_reputation_evaluation_state(user_id,next_evaluation_at)
select id,now() from public.profiles on conflict(user_id) do nothing;

select public.account_trust_evaluate_reputation_due_v1(10000,now());

alter table public.account_trust_reputation_detector_config enable row level security;
alter table public.account_trust_reputation_milestones enable row level security;
alter table public.account_trust_reputation_evaluation_state enable row level security;

revoke all on table public.account_trust_reputation_detector_config from public,anon,authenticated;
revoke all on table public.account_trust_reputation_milestones from public,anon,authenticated;
revoke all on table public.account_trust_reputation_evaluation_state from public,anon,authenticated;
grant select,insert,update,delete on table public.account_trust_reputation_detector_config to service_role;
grant select,insert,update,delete on table public.account_trust_reputation_milestones to service_role;
grant select,insert,update,delete on table public.account_trust_reputation_evaluation_state to service_role;

revoke all on function public.account_trust_reputation_activity_v1(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_schedule_reputation_user_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_refresh_reputation_signal_v1(uuid,text,text,text,numeric,numeric,boolean,timestamptz,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_reputation_user_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_reputation_due_v1(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_initialize_reputation_profile_v1() from public,anon,authenticated;
revoke all on function public.account_trust_schedule_reputation_enforcement_v1() from public,anon,authenticated;

grant execute on function public.account_trust_reputation_activity_v1(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.account_trust_schedule_reputation_user_v1(uuid,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_reputation_user_v1(uuid,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_reputation_due_v1(integer,timestamptz) to service_role;

comment on function public.account_trust_evaluate_reputation_user_v1(uuid,timestamptz) is
  'Sprint 9.6 non-enforcing Reputation evaluation. It rewards time-bound healthy evidence and revokes only on non-reversed human-confirmed abuse.';
comment on function public.account_trust_reputation_activity_v1(uuid,timestamptz,timestamptz) is
  'Privacy-respecting canonical product-activity projection. It excludes Analytics identity, popularity, content text, and invasive telemetry.';
