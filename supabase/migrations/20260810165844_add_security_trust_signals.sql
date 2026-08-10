-- Sprint 9.4: privacy-respecting Security Trust signals.
--
-- This layer detects conservative account-compromise patterns from existing,
-- legitimate Auth and consented Analytics metadata. It introduces no IP,
-- location, user-agent, browser fingerprint, behavioural telemetry, punishment,
-- ranking, visibility, Distribution Trust, or forced-session side effect.

create table public.account_trust_security_detector_config (
  detector_key text primary key check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  enabled boolean not null default true,
  signal_strength numeric(5,4) not null check (signal_strength between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'login_success','login_failed','password_reset_requested',
    'session_invalidated','sensitive_change'
  )),
  source text not null check (source in (
    'trusted_auth_adapter','backyrd_session_adapter'
  )),
  source_event_hash text not null check (source_event_hash ~ '^[0-9a-f]{64}$'),
  context_hash text check (context_hash is null or context_hash ~ '^[0-9a-f]{64}$'),
  change_kind text check (change_kind is null or change_kind in (
    'password','email','phone','security_settings','identity'
  )),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source,source_event_hash),
  check (
    (event_type='sensitive_change' and change_kind is not null)
    or (event_type<>'sensitive_change' and change_kind is null)
  )
);

create index account_trust_security_events_user_time_idx
  on public.account_trust_security_events(user_id,occurred_at desc,event_type);

create table public.account_trust_security_evaluation_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  last_signal_count integer not null default 0 check (last_signal_count>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_trust_security_evaluation_due_idx
  on public.account_trust_security_evaluation_state(next_evaluation_at,user_id);

comment on table public.account_trust_security_events is
  'Service-only, data-minimized Auth security events. Raw identifiers, IPs, locations, user agents and Auth payloads are never stored.';
comment on table public.account_trust_security_detector_config is
  'Versioned conservative Security Trust thresholds. Signals indicate review confidence, never proof of compromise.';

insert into public.account_trust_signal_registry(
  signal_key,dimension,polarity,base_score_impact,reason_code,
  definition_version,default_ttl,description,metadata
) values
  ('security_new_device','security','risk',-3,'SECURITY_NEW_DEVICE',
   1,interval '7 days','A previously unseen consented installation appeared after established installation history.',
   '{"detector_family":"security","signal_interpretation":"low_confidence_not_proof","privacy_basis":"existing_opt_in_analytics"}'::jsonb),
  ('security_new_environment','security','risk',-3,'SECURITY_NEW_ENVIRONMENT',
   1,interval '7 days','A previously unseen coarse authenticated platform/OS family appeared.',
   '{"detector_family":"security","signal_interpretation":"low_confidence_not_proof","privacy_basis":"existing_opt_in_analytics"}'::jsonb),
  ('security_unusual_login_pattern','security','risk',-10,'SECURITY_UNUSUAL_LOGIN_PATTERN',
   1,interval '7 days','Authenticated session activity crossed conservative context-diversity and volume thresholds.',
   '{"detector_family":"security","signal_interpretation":"indicator_not_proof","privacy_basis":"existing_opt_in_analytics"}'::jsonb),
  ('security_failed_login_pattern','security','risk',-12,'SECURITY_FAILED_LOGIN_PATTERN',
   1,interval '3 days','A trusted Auth adapter recorded repeated failed login attempts in a short window.',
   '{"detector_family":"security","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('security_password_reset_cluster','security','risk',-8,'SECURITY_PASSWORD_RESET_CLUSTER',
   1,interval '7 days','Repeated password-recovery requests occurred within an unusual window.',
   '{"detector_family":"security","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('security_session_instability','security','risk',-10,'SECURITY_SESSION_INSTABILITY',
   1,interval '3 days','Several session invalidation events occurred in a short window.',
   '{"detector_family":"security","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('security_sudden_account_change','security','risk',-12,'SECURITY_SUDDEN_ACCOUNT_CHANGE',
   1,interval '14 days','Several distinct sensitive account-change categories occurred together.',
   '{"detector_family":"security","signal_interpretation":"indicator_not_proof"}'::jsonb),
  ('security_takeover_pattern','security','risk',-20,'SECURITY_TAKEOVER_PATTERN',
   1,interval '14 days','At least three independent Security evidence families aligned.',
   '{"detector_family":"security","signal_interpretation":"high_confidence_indicator_not_proof","multi_signal_required":true}'::jsonb);

insert into public.account_trust_security_detector_config(
  detector_key,detector_version,signal_strength,confidence,settings
) values
  ('backyrd.security.new_device','1.0.0',0.30,0.45,
   '{"lookback_days":7,"minimum_prior_devices":1,"positive_history_strength_multiplier":0.50,"requires_active_optional_analytics_consent":true}'::jsonb),
  ('backyrd.security.new_environment','1.0.0',0.25,0.40,
   '{"lookback_days":7,"minimum_prior_environments":1,"positive_history_strength_multiplier":0.50,"coarse_fields":["platform","os_major"],"requires_active_optional_analytics_consent":true}'::jsonb),
  ('backyrd.security.unusual_login_pattern','1.0.0',0.65,0.70,
   '{"window_hours":12,"minimum_authenticated_sessions":8,"minimum_distinct_contexts":4,"requires_active_optional_analytics_consent":true}'::jsonb),
  ('backyrd.security.failed_login_pattern','1.0.0',0.70,0.80,
   '{"window_minutes":15,"minimum_failures":5,"source":"trusted_auth_adapter"}'::jsonb),
  ('backyrd.security.password_reset_cluster','1.0.0',0.55,0.70,
   '{"window_hours":24,"minimum_requests":3,"single_reset_is_normal":true}'::jsonb),
  ('backyrd.security.session_instability','1.0.0',0.60,0.70,
   '{"window_hours":2,"minimum_invalidations":4,"single_logout_is_normal":true}'::jsonb),
  ('backyrd.security.sudden_account_change','1.0.0',0.70,0.80,
   '{"window_hours":24,"minimum_distinct_change_kinds":3,"supported_change_kinds":["password","email","phone","security_settings","identity"]}'::jsonb),
  ('backyrd.security.takeover_pattern','1.0.0',0.90,0.90,
   '{"window_hours":24,"minimum_evidence_families":3,"requires_context_family":true,"requires_auth_risk_family":true}'::jsonb);

create or replace function public.account_trust_security_hash_context_v1(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path=extensions,pg_catalog
as $$
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then
    raise exception 'security_context_value_required' using errcode='22023';
  end if;
  return encode(extensions.digest(convert_to(p_value,'UTF8'),'sha256'),'hex');
end;
$$;

create or replace function public.account_trust_record_security_event_v1(
  p_user_id uuid,
  p_event_type text,
  p_source text,
  p_source_event_id text,
  p_occurred_at timestamptz default now(),
  p_context_hash text default null,
  p_change_kind text default null
) returns uuid
language plpgsql
security definer
set search_path=public,extensions,pg_catalog
as $$
declare v_id uuid;v_source_hash text;
begin
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode='P0002';
  end if;
  if p_event_type not in('login_success','login_failed','password_reset_requested','session_invalidated','sensitive_change') then
    raise exception 'security_event_type_invalid' using errcode='22023';
  end if;
  if p_source not in('trusted_auth_adapter','backyrd_session_adapter') then
    raise exception 'security_event_source_invalid' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_source_event_id,'')),'') is null then
    raise exception 'security_source_event_id_required' using errcode='22023';
  end if;
  if p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'security_event_time_invalid' using errcode='22023';
  end if;
  if p_context_hash is not null and p_context_hash!~'^[0-9a-f]{64}$' then
    raise exception 'security_context_hash_invalid' using errcode='22023';
  end if;
  if (p_event_type='sensitive_change')<>(p_change_kind is not null)
     or (p_change_kind is not null and p_change_kind not in('password','email','phone','security_settings','identity')) then
    raise exception 'security_change_kind_invalid' using errcode='22023';
  end if;
  v_source_hash:=encode(extensions.digest(convert_to(p_source||':'||p_source_event_id,'UTF8'),'sha256'),'hex');
  insert into public.account_trust_security_events(
    user_id,event_type,source,source_event_hash,context_hash,change_kind,occurred_at
  ) values(p_user_id,p_event_type,p_source,v_source_hash,p_context_hash,p_change_kind,p_occurred_at)
  on conflict(source,source_event_hash) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.account_trust_security_events
    where source=p_source and source_event_hash=v_source_hash
      and user_id=p_user_id and event_type=p_event_type
      and context_hash is not distinct from p_context_hash
      and change_kind is not distinct from p_change_kind
      and occurred_at=p_occurred_at;
    if v_id is null then
      raise exception 'security_source_event_conflict' using errcode='23505';
    end if;
  end if;
  insert into public.account_trust_security_evaluation_state(user_id,next_evaluation_at)
  values(p_user_id,least(p_occurred_at,now()))
  on conflict(user_id) do update set
    next_evaluation_at=least(public.account_trust_security_evaluation_state.next_evaluation_at,excluded.next_evaluation_at),
    updated_at=now();
  return v_id;
end;
$$;

create or replace function public.account_trust_security_event_inventory_v1(
  p_user_id uuid,p_from timestamptz,p_to timestamptz
) returns table(
  event_type text,event_hash text,context_hash text,change_kind text,
  occurred_at timestamptz,source text
)
language sql
stable
security definer
set search_path=public,auth,extensions,pg_catalog
as $$
  select e.event_type,e.source_event_hash,e.context_hash,e.change_kind,e.occurred_at,e.source
  from public.account_trust_security_events e
  where e.user_id=p_user_id and e.occurred_at between p_from and p_to
  union all
  select
    case a.action
      when 'user_recovery_requested' then 'password_reset_requested'
      when 'token_revoked' then 'session_invalidated'
      else 'sensitive_change'
    end,
    encode(extensions.digest(convert_to('supabase_auth_audit:'||a.id::text,'UTF8'),'sha256'),'hex'),
    null::text,
    case a.action
      when 'user_updated_password' then 'password'
      when 'identity_unlinked' then 'identity'
      when 'factor_unenrolled' then 'security_settings'
      when 'factor_deleted' then 'security_settings'
      when 'generate_recovery_codes' then 'security_settings'
      when 'recovery_codes_deleted' then 'security_settings'
      else null
    end,
    a.created_at,
    'supabase_auth_audit'
  from (
    select l.id,l.created_at,
      lower(coalesce(l.payload::jsonb->>'action',l.payload::jsonb#>>'{auth_event,action}')) action,
      coalesce(l.payload::jsonb->>'actor_id',l.payload::jsonb#>>'{auth_event,actor_id}') actor_id
    from auth.audit_log_entries l
    where l.created_at between p_from and p_to
  ) a
  where a.actor_id=p_user_id::text
    and a.action in(
      'user_recovery_requested','token_revoked','user_updated_password',
      'factor_unenrolled','factor_deleted','identity_unlinked',
      'generate_recovery_codes','recovery_codes_deleted'
    );
$$;

create or replace function public.account_trust_evaluate_security_user_v1(
  p_user_id uuid,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,auth,extensions,pg_catalog
as $$
declare
  v_created_at timestamptz;v_config public.account_trust_security_detector_config%rowtype;
  v_result jsonb;v_emitted integer:=0;v_candidate record;v_positive_history boolean:=false;
  v_strength numeric;v_sessions integer:=0;v_contexts integer:=0;v_failures integer:=0;
  v_resets integer:=0;v_invalidations integer:=0;v_change_kinds integer:=0;
  v_context_family boolean:=false;v_login_family boolean:=false;v_recovery_family boolean:=false;
  v_session_family boolean:=false;v_change_family boolean:=false;v_family_count integer:=0;
begin
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'security_evaluation_time_invalid' using errcode='22023';
  end if;
  select created_at into v_created_at from auth.users where id=p_user_id and deleted_at is null;
  if v_created_at is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode='P0002';
  end if;
  v_positive_history:=p_as_of>=v_created_at+interval '90 days'
    or exists(select 1 from public.account_trust_signals
      where user_id=p_user_id and polarity='supporting' and status='active'
        and (expires_at is null or expires_at>p_as_of));

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.new_device' and enabled;
  if v_config.detector_key is not null
     and public.user_has_active_consent_v1(p_user_id,'optional_product_analytics') then
    for v_candidate in
      select a.technical_identity_hash,a.first_observed_at,
        (select count(*) from public.account_trust_identity_installation_accounts prior
         where prior.user_id=a.user_id and prior.first_observed_at<a.first_observed_at)::integer prior_count
      from public.account_trust_identity_installation_accounts a
      where a.user_id=p_user_id
        and a.first_observed_at between p_as_of-make_interval(days=>(v_config.settings->>'lookback_days')::integer) and p_as_of
        and (select count(*) from public.account_trust_identity_installation_accounts prior
          where prior.user_id=a.user_id and prior.first_observed_at<a.first_observed_at)
          >=(v_config.settings->>'minimum_prior_devices')::integer
      order by a.first_observed_at
    loop
      v_strength:=v_config.signal_strength*case when v_positive_history
        then (v_config.settings->>'positive_history_strength_multiplier')::numeric else 1 end;
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_new_device',v_config.detector_key,v_config.detector_version,
        v_strength,v_config.confidence,v_candidate.first_observed_at,null,
        'device:'||v_candidate.technical_identity_hash,
        jsonb_build_object('technical_identity_hash',v_candidate.technical_identity_hash,
          'prior_known_device_count',v_candidate.prior_count,
          'positive_history_reduction_applied',v_positive_history,'raw_identifier_excluded',true),
        '{"signal_interpretation":"low_confidence_not_proof"}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end loop;
  end if;

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.new_environment' and enabled;
  if v_config.detector_key is not null
     and public.user_has_active_consent_v1(p_user_id,'optional_product_analytics') then
    for v_candidate in
      with environments as (
        select public.account_trust_security_hash_context_v1(
          lower(btrim(i.platform))||'|os_major:'||coalesce(substring(i.os_version from '[0-9]+'),'unknown')
        ) environment_hash,min(a.first_observed_at) first_observed_at
        from public.account_trust_identity_installation_accounts a
        join public.analytics_installations i
          on i.user_id=a.user_id
         and public.account_trust_security_hash_context_v1(i.installation_id::text)=a.technical_identity_hash
        where a.user_id=p_user_id and nullif(btrim(i.platform),'') is not null
        group by 1
      )
      select e.environment_hash,e.first_observed_at,
        (select count(*) from environments prior where prior.first_observed_at<e.first_observed_at)::integer prior_count
      from environments e
      where e.first_observed_at between p_as_of-make_interval(days=>(v_config.settings->>'lookback_days')::integer) and p_as_of
        and (select count(*) from environments prior where prior.first_observed_at<e.first_observed_at)
          >=(v_config.settings->>'minimum_prior_environments')::integer
      order by e.first_observed_at
    loop
      v_strength:=v_config.signal_strength*case when v_positive_history
        then (v_config.settings->>'positive_history_strength_multiplier')::numeric else 1 end;
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_new_environment',v_config.detector_key,v_config.detector_version,
        v_strength,v_config.confidence,v_candidate.first_observed_at,null,
        'environment:'||v_candidate.environment_hash,
        jsonb_build_object('environment_hash',v_candidate.environment_hash,
          'prior_known_environment_count',v_candidate.prior_count,
          'coarse_environment_only',true,'positive_history_reduction_applied',v_positive_history),
        '{"signal_interpretation":"low_confidence_not_proof"}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end loop;
  end if;

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.unusual_login_pattern' and enabled;
  if v_config.detector_key is not null
     and public.user_has_active_consent_v1(p_user_id,'optional_product_analytics') then
    select count(*)::integer,count(distinct s.installation_id)::integer
    into v_sessions,v_contexts from public.analytics_sessions s
    where s.user_id=p_user_id and s.installation_id is not null
      and s.started_at between p_as_of-make_interval(hours=>(v_config.settings->>'window_hours')::integer) and p_as_of;
    if v_sessions>=(v_config.settings->>'minimum_authenticated_sessions')::integer
       and v_contexts>=(v_config.settings->>'minimum_distinct_contexts')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_unusual_login_pattern',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'login_pattern:'||to_char(p_as_of,'YYYY-MM-DD-HH24'),
        jsonb_build_object('authenticated_session_count',v_sessions,'distinct_context_count',v_contexts,
          'window_hours',(v_config.settings->>'window_hours')::integer,'raw_context_excluded',true),
        '{"signal_interpretation":"indicator_not_proof"}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.failed_login_pattern' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer into v_failures
    from public.account_trust_security_event_inventory_v1(
      p_user_id,p_as_of-make_interval(mins=>(v_config.settings->>'window_minutes')::integer),p_as_of)
    where event_type='login_failed';
    if v_failures>=(v_config.settings->>'minimum_failures')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_failed_login_pattern',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'failed_login:'||to_char(p_as_of,'YYYY-MM-DD-HH24-MI'),
        jsonb_build_object('failed_attempt_count',v_failures,
          'window_minutes',(v_config.settings->>'window_minutes')::integer,'credentials_excluded',true),
        '{"signal_interpretation":"indicator_not_proof"}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.password_reset_cluster' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer into v_resets
    from public.account_trust_security_event_inventory_v1(
      p_user_id,p_as_of-make_interval(hours=>(v_config.settings->>'window_hours')::integer),p_as_of)
    where event_type='password_reset_requested';
    if v_resets>=(v_config.settings->>'minimum_requests')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_password_reset_cluster',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'reset_cluster:'||to_char(p_as_of,'YYYY-MM-DD'),
        jsonb_build_object('reset_request_count',v_resets,
          'window_hours',(v_config.settings->>'window_hours')::integer),
        '{"signal_interpretation":"indicator_not_proof","single_reset_is_normal":true}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.session_instability' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer into v_invalidations
    from public.account_trust_security_event_inventory_v1(
      p_user_id,p_as_of-make_interval(hours=>(v_config.settings->>'window_hours')::integer),p_as_of)
    where event_type='session_invalidated';
    if v_invalidations>=(v_config.settings->>'minimum_invalidations')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_session_instability',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'session_instability:'||to_char(p_as_of,'YYYY-MM-DD-HH24'),
        jsonb_build_object('session_invalidation_count',v_invalidations,
          'window_hours',(v_config.settings->>'window_hours')::integer),
        '{"signal_interpretation":"indicator_not_proof","single_logout_is_normal":true}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.sudden_account_change' and enabled;
  if v_config.detector_key is not null then
    select count(distinct change_kind)::integer into v_change_kinds
    from public.account_trust_security_event_inventory_v1(
      p_user_id,p_as_of-make_interval(hours=>(v_config.settings->>'window_hours')::integer),p_as_of)
    where event_type='sensitive_change' and change_kind is not null;
    if v_change_kinds>=(v_config.settings->>'minimum_distinct_change_kinds')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'security_sudden_account_change',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,
        'account_change:'||to_char(p_as_of,'YYYY-MM-DD'),
        jsonb_build_object('distinct_change_kind_count',v_change_kinds,
          'window_hours',(v_config.settings->>'window_hours')::integer,'sensitive_values_excluded',true),
        '{"signal_interpretation":"indicator_not_proof"}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select
    bool_or(signal_key in('security_new_device','security_new_environment')),
    bool_or(signal_key in('security_unusual_login_pattern','security_failed_login_pattern')),
    bool_or(signal_key='security_password_reset_cluster'),
    bool_or(signal_key='security_session_instability'),
    bool_or(signal_key='security_sudden_account_change')
  into v_context_family,v_login_family,v_recovery_family,v_session_family,v_change_family
  from public.account_trust_signals
  where user_id=p_user_id and dimension='security' and status='active'
    and signal_key<>'security_takeover_pattern'
    and observed_at between p_as_of-interval '24 hours' and p_as_of
    and (expires_at is null or expires_at>p_as_of);
  v_family_count:=(case when coalesce(v_context_family,false) then 1 else 0 end)
    +(case when coalesce(v_login_family,false) then 1 else 0 end)
    +(case when coalesce(v_recovery_family,false) then 1 else 0 end)
    +(case when coalesce(v_session_family,false) then 1 else 0 end)
    +(case when coalesce(v_change_family,false) then 1 else 0 end);
  select * into v_config from public.account_trust_security_detector_config
  where detector_key='backyrd.security.takeover_pattern' and enabled;
  if v_config.detector_key is not null
     and v_family_count>=(v_config.settings->>'minimum_evidence_families')::integer
     and coalesce(v_context_family,false)
     and (coalesce(v_login_family,false) or coalesce(v_recovery_family,false)
       or coalesce(v_session_family,false) or coalesce(v_change_family,false)) then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'security_takeover_pattern',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,p_as_of,null,
      'takeover_pattern:'||to_char(p_as_of,'YYYY-MM-DD'),
      jsonb_build_object('aligned_evidence_family_count',v_family_count,
        'context_change_present',v_context_family,'login_anomaly_present',v_login_family,
        'recovery_anomaly_present',v_recovery_family,'session_instability_present',v_session_family,
        'sensitive_change_present',v_change_family),
      '{"signal_interpretation":"high_confidence_indicator_not_proof","multi_signal_required":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  return jsonb_build_object('user_id',p_user_id,'signals_emitted',v_emitted,
    'failed_login_count',v_failures,'password_reset_count',v_resets,
    'session_invalidation_count',v_invalidations,'distinct_change_kind_count',v_change_kinds,
    'aligned_evidence_family_count',v_family_count);
end;
$$;

create or replace function public.account_trust_evaluate_security_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_state record;v_result jsonb;v_processed integer:=0;v_emitted integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then
    raise exception 'security_evaluation_limit_invalid' using errcode='22023';
  end if;
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'security_evaluation_time_invalid' using errcode='22023';
  end if;
  for v_state in select user_id from public.account_trust_security_evaluation_state
    where next_evaluation_at<=p_as_of order by next_evaluation_at,user_id
    limit p_limit for update skip locked
  loop
    v_result:=public.account_trust_evaluate_security_user_v1(v_state.user_id,p_as_of);
    update public.account_trust_security_evaluation_state
    set last_evaluated_at=p_as_of,next_evaluation_at=p_as_of+interval '6 hours',
      last_signal_count=coalesce((v_result->>'signals_emitted')::integer,0),updated_at=now()
    where user_id=v_state.user_id;
    v_processed:=v_processed+1;
    v_emitted:=v_emitted+coalesce((v_result->>'signals_emitted')::integer,0);
  end loop;
  return jsonb_build_object('processed',v_processed,'signals_emitted',v_emitted);
end;
$$;

create or replace function public.account_trust_schedule_security_user_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user_id uuid;
begin
  v_user_id:=case tg_table_name
    when 'profiles' then nullif(to_jsonb(new)->>'id','')::uuid
    else nullif(to_jsonb(new)->>'user_id','')::uuid
  end;
  if v_user_id is not null then
    insert into public.account_trust_security_evaluation_state(user_id,next_evaluation_at)
    values(v_user_id,now()) on conflict(user_id) do update
      set next_evaluation_at=least(public.account_trust_security_evaluation_state.next_evaluation_at,excluded.next_evaluation_at),
          updated_at=now();
  end if;
  return new;
end;
$$;

insert into public.account_trust_security_evaluation_state(user_id,next_evaluation_at)
select id,now() from public.profiles on conflict(user_id) do nothing;

create trigger trg_account_trust_schedule_security_profile_v1
after insert on public.profiles for each row
execute function public.account_trust_schedule_security_user_v1();

create trigger trg_account_trust_schedule_security_installation_v1
after insert or update of user_id,last_seen_at on public.analytics_installations
for each row execute function public.account_trust_schedule_security_user_v1();

create trigger trg_account_trust_schedule_security_session_v1
after insert on public.analytics_sessions for each row
execute function public.account_trust_schedule_security_user_v1();

select public.account_trust_evaluate_security_due_v1(10000,now());

alter table public.account_trust_security_detector_config enable row level security;
alter table public.account_trust_security_events enable row level security;
alter table public.account_trust_security_evaluation_state enable row level security;
revoke all on table public.account_trust_security_detector_config from public,anon,authenticated;
revoke all on table public.account_trust_security_events from public,anon,authenticated;
revoke all on table public.account_trust_security_evaluation_state from public,anon,authenticated;
grant select,insert,update,delete on table public.account_trust_security_detector_config to service_role;
grant select,insert,update,delete on table public.account_trust_security_events to service_role;
grant select,insert,update,delete on table public.account_trust_security_evaluation_state to service_role;

revoke all on function public.account_trust_security_hash_context_v1(text) from public,anon,authenticated;
revoke all on function public.account_trust_record_security_event_v1(uuid,text,text,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.account_trust_security_event_inventory_v1(uuid,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_security_user_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_security_due_v1(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_schedule_security_user_v1() from public,anon,authenticated;
grant execute on function public.account_trust_security_hash_context_v1(text) to service_role;
grant execute on function public.account_trust_record_security_event_v1(uuid,text,text,text,timestamptz,text,text) to service_role;
grant execute on function public.account_trust_security_event_inventory_v1(uuid,timestamptz,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_security_user_v1(uuid,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_security_due_v1(integer,timestamptz) to service_role;

comment on function public.account_trust_record_security_event_v1(uuid,text,text,text,timestamptz,text,text) is
  'Service-only data-minimized ingestion for trusted Auth events that cannot be safely derived from public application state.';
comment on function public.account_trust_evaluate_security_user_v1(uuid,timestamptz) is
  'Sprint 9.4 non-enforcing Security Trust aggregation. Signals indicate possible compromise and never prove malicious intent.';
