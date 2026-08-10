-- Sprint 9.5: Owner Trust signals.
--
-- Owner Trust measures long-term platform-partner reliability. It does not
-- judge business quality and performs no claim, moderation, ranking,
-- visibility, distribution, or enforcement action.

create table public.account_trust_owner_detector_config (
  detector_key text primary key check (detector_key ~ '^[a-z][a-z0-9_.-]*$'),
  detector_version text not null,
  enabled boolean not null default true,
  signal_strength numeric(5,4) not null check (signal_strength between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_trust_owner_milestones (
  milestone_days integer primary key check (milestone_days > 0),
  strength numeric(5,4) not null check (strength between 0 and 1),
  label text not null unique
);

create table public.account_trust_owner_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'core_information_changed',
    'document_issue_confirmed',
    'information_contradiction_confirmed',
    'ownership_inconsistency_confirmed'
  )),
  source_kind text not null check (source_kind ~ '^[a-z][a-z0-9_.-]*$'),
  source_reference_hash text not null check (source_reference_hash ~ '^[0-9a-f]{64}$'),
  change_kind text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id,event_type,source_kind,source_reference_hash),
  check (change_kind is null or change_kind ~ '^[a-z][a-z0-9_]*$')
);

create index account_trust_owner_events_user_time_idx
  on public.account_trust_owner_events(user_id,occurred_at desc,event_type);

create table public.account_trust_owner_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_reference_hash text not null check (request_reference_hash ~ '^[0-9a-f]{64}$'),
  request_type text not null check (request_type in (
    'verification','required_correction','required_information','mandatory_confirmation'
  )),
  requested_at timestamptz not null,
  due_at timestamptz not null,
  responded_at timestamptz,
  status text not null check (status in ('open','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,request_reference_hash),
  check (due_at > requested_at),
  check (responded_at is null or responded_at >= requested_at),
  check ((status = 'completed' and responded_at is not null) or status <> 'completed')
);

create index account_trust_owner_requests_user_due_idx
  on public.account_trust_owner_requests(user_id,due_at desc,status);

create table public.account_trust_owner_evaluation_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  observation_started_at timestamptz not null default now(),
  last_evaluated_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  last_signal_count integer not null default 0 check (last_signal_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index account_trust_owner_evaluation_due_idx
  on public.account_trust_owner_evaluation_state(next_evaluation_at,user_id);

comment on table public.account_trust_owner_events is
  'Data-minimized service evidence for Owner Trust. Raw documents, business values, notes, and request identifiers are never stored here.';
comment on table public.account_trust_owner_requests is
  'Service-only lifecycle metadata for required Owner requests; no message body or submitted information is duplicated.';
comment on table public.account_trust_owner_evaluation_state is
  'Owner Trust scheduling and observation horizon. Historical stability is never assumed before observation begins.';

insert into public.account_trust_signal_registry(
  signal_key,dimension,polarity,base_score_impact,reason_code,
  definition_version,default_ttl,description,metadata
) values
  ('owner_verified','owner','supporting',8,'OWNER_VERIFIED',
   1,null,'The account completed an approved and email-verified Spot ownership claim.',
   '{"detector_family":"owner","signal_interpretation":"verified_platform_relationship"}'::jsonb),
  ('owner_profile_complete','owner','supporting',5,'OWNER_PROFILE_COMPLETE',
   1,null,'A verified owned Spot has the required operational identity, location, and contact information.',
   '{"detector_family":"owner","signal_interpretation":"supporting_evidence"}'::jsonb),
  ('owner_long_term_verified','owner','supporting',8,'OWNER_LONG_TERM_VERIFIED',
   1,null,'The account reached a configured verified-owner tenure milestone.',
   '{"detector_family":"owner","signal_interpretation":"supporting_milestone"}'::jsonb),
  ('owner_stable_information','owner','supporting',7,'OWNER_STABLE_INFORMATION',
   1,null,'Core Owner information remained consistent through a complete observation period.',
   '{"detector_family":"owner","signal_interpretation":"supporting_milestone"}'::jsonb),
  ('owner_responsive','owner','supporting',6,'OWNER_RESPONSIVE',
   1,null,'The Owner completed enough required platform requests within the expected response window.',
   '{"detector_family":"owner","signal_interpretation":"supporting_milestone"}'::jsonb),
  ('owner_repeated_claim_abuse','owner','risk',-12,'OWNER_REPEATED_CLAIM_ABUSE',
   1,interval '180 days','Several distinct rejected or revoked claims across Spots formed a repeated invalid-claim pattern.',
   '{"detector_family":"owner","signal_interpretation":"indicator_not_proof","single_rejected_claim_is_normal":true}'::jsonb),
  ('owner_document_quality','owner','risk',-9,'OWNER_DOCUMENT_QUALITY',
   1,interval '90 days','Trusted review recorded repeated distinct ownership-document quality issues.',
   '{"detector_family":"owner","signal_interpretation":"indicator_not_proof","single_document_correction_is_normal":true}'::jsonb),
  ('owner_data_instability','owner','risk',-11,'OWNER_DATA_INSTABILITY',
   1,interval '90 days','Core identity information changed or contradicted repeatedly across multiple categories.',
   '{"detector_family":"owner","signal_interpretation":"indicator_not_proof","ordinary_maintenance_excluded":true}'::jsonb),
  ('owner_neglect','owner','risk',-9,'OWNER_NEGLECT',
   1,interval '60 days','Several required platform requests remained overdue beyond a grace period.',
   '{"detector_family":"owner","signal_interpretation":"indicator_not_proof","single_missed_request_is_normal":true}'::jsonb),
  ('owner_trust_pattern','owner','risk',-20,'OWNER_TRUST_PATTERN',
   1,interval '180 days','At least three independent Owner Trust risk families aligned.',
   '{"detector_family":"owner","signal_interpretation":"high_confidence_indicator_not_proof","multi_signal_required":true}'::jsonb);

insert into public.account_trust_owner_milestones(milestone_days,strength,label) values
  (30,0.35,'30d'),(90,0.55,'90d'),(180,0.75,'180d'),(365,1.00,'365d');

insert into public.account_trust_owner_detector_config(
  detector_key,detector_version,signal_strength,confidence,settings
) values
  ('backyrd.owner.verified','1.0.0',1.00,1.00,
   '{"requires_approved_claim":true,"requires_verified_business_email":true,"requires_current_spot_ownership":true}'::jsonb),
  ('backyrd.owner.profile_complete','1.0.0',0.80,0.85,
   '{"required_spot_fields":["name","address","city","country"],"minimum_contact_channels":1,"contact_channels":["website","phone","email"],"requires_verified_business_email":true}'::jsonb),
  ('backyrd.owner.long_term_verified','1.0.0',1.00,0.95,
   '{"milestones_days":[30,90,180,365],"requires_current_spot_ownership":true}'::jsonb),
  ('backyrd.owner.stable_information','1.0.0',0.85,0.80,
   '{"minimum_verified_days":90,"minimum_observation_days":90,"stability_window_days":90,"maximum_core_changes":1,"tracked_core_fields":["business_name","category","confirmed_ownership_consistency"]}'::jsonb),
  ('backyrd.owner.responsive','1.0.0',0.80,0.80,
   '{"window_days":365,"minimum_requests":4,"minimum_on_time_ratio":0.75}'::jsonb),
  ('backyrd.owner.repeated_claim_abuse','1.0.0',0.70,0.75,
   '{"window_days":365,"minimum_invalid_claims":3,"minimum_distinct_spots":2,"statuses":["rejected","revoked"],"single_rejection_is_normal":true}'::jsonb),
  ('backyrd.owner.document_quality','1.0.0',0.65,0.75,
   '{"window_days":180,"minimum_confirmed_issues":3,"source":"trusted_owner_review_adapter","single_correction_is_normal":true}'::jsonb),
  ('backyrd.owner.data_instability','1.0.0',0.70,0.75,
   '{"window_days":90,"minimum_events":4,"minimum_distinct_change_kinds":2,"ordinary_maintenance_fields":["opening_hours","phone","website","address","menu","images"]}'::jsonb),
  ('backyrd.owner.neglect','1.0.0',0.65,0.75,
   '{"window_days":180,"grace_days":7,"minimum_overdue_requests":3}'::jsonb),
  ('backyrd.owner.trust_pattern','1.0.0',0.90,0.90,
   '{"window_days":180,"minimum_risk_families":3,"families":["claim","document","instability","neglect"]}'::jsonb);

create or replace function public.account_trust_owner_hash_reference_v1(p_value text)
returns text
language plpgsql
immutable
security definer
set search_path=extensions,pg_catalog
as $$
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then
    raise exception 'owner_reference_required' using errcode='22023';
  end if;
  return encode(extensions.digest(convert_to(btrim(p_value),'UTF8'),'sha256'),'hex');
end;
$$;

create or replace function public.account_trust_schedule_owner_user_v1(
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
  insert into public.account_trust_owner_evaluation_state(user_id,next_evaluation_at)
  values(p_user_id,coalesce(p_schedule_at,now()))
  on conflict(user_id) do update set
    next_evaluation_at=least(public.account_trust_owner_evaluation_state.next_evaluation_at,excluded.next_evaluation_at),
    updated_at=now();
end;
$$;

create or replace function public.account_trust_record_owner_event_v1(
  p_user_id uuid,p_event_type text,p_source_kind text,p_source_reference text,
  p_occurred_at timestamptz default now(),p_change_kind text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_hash text;v_id uuid;v_existing public.account_trust_owner_events%rowtype;
begin
  if p_event_type not in ('document_issue_confirmed','information_contradiction_confirmed','ownership_inconsistency_confirmed') then
    raise exception 'owner_event_type_invalid' using errcode='22023';
  end if;
  if p_source_kind is null or p_source_kind !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception 'owner_event_source_kind_invalid' using errcode='22023';
  end if;
  if p_occurred_at is null or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'owner_event_time_invalid' using errcode='22023';
  end if;
  if p_event_type in ('information_contradiction_confirmed','ownership_inconsistency_confirmed')
     and (p_change_kind is null or p_change_kind !~ '^[a-z][a-z0-9_]*$') then
    raise exception 'owner_event_change_kind_required' using errcode='22023';
  end if;
  perform public.account_trust_schedule_owner_user_v1(p_user_id,p_occurred_at);
  v_hash:=public.account_trust_owner_hash_reference_v1(p_source_reference);
  insert into public.account_trust_owner_events(
    user_id,event_type,source_kind,source_reference_hash,change_kind,occurred_at
  ) values(p_user_id,p_event_type,p_source_kind,v_hash,p_change_kind,p_occurred_at)
  on conflict(user_id,event_type,source_kind,source_reference_hash) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_existing from public.account_trust_owner_events
    where user_id=p_user_id and event_type=p_event_type
      and source_kind=p_source_kind and source_reference_hash=v_hash;
    if v_existing.occurred_at is distinct from p_occurred_at
       or v_existing.change_kind is distinct from p_change_kind then
      raise exception 'owner_event_idempotency_conflict' using errcode='23505';
    end if;
    v_id:=v_existing.id;
  end if;
  return v_id;
end;
$$;

create or replace function public.account_trust_upsert_owner_request_v1(
  p_user_id uuid,p_request_reference text,p_request_type text,
  p_requested_at timestamptz,p_due_at timestamptz,
  p_status text default 'open',p_responded_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_hash text;v_request public.account_trust_owner_requests%rowtype;
begin
  if p_request_type not in ('verification','required_correction','required_information','mandatory_confirmation') then
    raise exception 'owner_request_type_invalid' using errcode='22023';
  end if;
  if p_status not in ('open','completed','cancelled') then
    raise exception 'owner_request_status_invalid' using errcode='22023';
  end if;
  if p_requested_at is null or p_due_at is null or p_due_at<=p_requested_at
     or p_requested_at>now()+interval '5 minutes' then
    raise exception 'owner_request_time_invalid' using errcode='22023';
  end if;
  if (p_status='completed') is distinct from (p_responded_at is not null)
     or (p_responded_at is not null and p_responded_at<p_requested_at) then
    raise exception 'owner_request_response_invalid' using errcode='22023';
  end if;
  perform public.account_trust_schedule_owner_user_v1(p_user_id,least(p_requested_at,now()));
  v_hash:=public.account_trust_owner_hash_reference_v1(p_request_reference);
  select * into v_request from public.account_trust_owner_requests
  where user_id=p_user_id and request_reference_hash=v_hash for update;
  if v_request.id is null then
    insert into public.account_trust_owner_requests(
      user_id,request_reference_hash,request_type,requested_at,due_at,responded_at,status
    ) values(p_user_id,v_hash,p_request_type,p_requested_at,p_due_at,p_responded_at,p_status)
    returning * into v_request;
  else
    if v_request.request_type is distinct from p_request_type
       or v_request.requested_at is distinct from p_requested_at
       or v_request.due_at is distinct from p_due_at then
      raise exception 'owner_request_idempotency_conflict' using errcode='23505';
    end if;
    if v_request.status='cancelled' and p_status<>'cancelled' then
      raise exception 'owner_request_cancelled' using errcode='22023';
    end if;
    update public.account_trust_owner_requests set
      status=p_status,responded_at=p_responded_at,updated_at=now()
    where id=v_request.id returning * into v_request;
  end if;
  return v_request.id;
end;
$$;

create or replace function public.account_trust_evaluate_owner_user_v1(
  p_user_id uuid,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_config public.account_trust_owner_detector_config%rowtype;
  v_state public.account_trust_owner_evaluation_state%rowtype;
  v_verified_at timestamptz;v_result jsonb;v_emitted integer:=0;v_milestone record;
  v_complete boolean:=false;v_stability_events integer:=0;v_events integer:=0;v_change_kinds integer:=0;
  v_total_requests integer:=0;v_on_time integer:=0;v_ratio numeric:=0;
  v_invalid_claims integer:=0;v_invalid_spots integer:=0;v_document_issues integer:=0;
  v_overdue integer:=0;v_claim_family boolean:=false;v_document_family boolean:=false;
  v_instability_family boolean:=false;v_neglect_family boolean:=false;v_family_count integer:=0;
begin
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'owner_evaluation_time_invalid' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'account_trust_user_not_found' using errcode='P0002';
  end if;
  insert into public.account_trust_owner_evaluation_state(user_id,next_evaluation_at)
  values(p_user_id,p_as_of) on conflict(user_id) do nothing;
  select * into v_state from public.account_trust_owner_evaluation_state where user_id=p_user_id;

  select min(coalesce(sc.reviewed_at,sc.updated_at,sc.created_at)) into v_verified_at
  from public.spot_claims sc join public.spots s on s.id=sc.spot_id and s.owner_id=sc.user_id
  where sc.user_id=p_user_id and sc.status='approved' and sc.email_verified_at is not null
    and coalesce(sc.reviewed_at,sc.updated_at,sc.created_at)<=p_as_of;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.verified' and enabled;
  if v_config.detector_key is not null and v_verified_at is not null then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'owner_verified',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,v_verified_at,null,'verified',
      jsonb_build_object('verified_at',v_verified_at,'verification_basis','approved_claim_and_verified_business_email'),
      '{"business_quality_not_evaluated":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select exists(
    select 1 from public.spots s
    join public.spot_claims sc on sc.spot_id=s.id and sc.user_id=s.owner_id
      and sc.status='approved' and sc.email_verified_at is not null
    where s.owner_id=p_user_id
      and nullif(btrim(s.name),'') is not null
      and nullif(btrim(s.address),'') is not null
      and nullif(btrim(s.city),'') is not null
      and nullif(btrim(s.country),'') is not null
      and num_nonnulls(nullif(btrim(s.website),''),nullif(btrim(s.phone),''),nullif(btrim(s.email),''))>=1
  ) into v_complete;
  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.profile_complete' and enabled;
  if v_config.detector_key is not null and v_complete then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'owner_profile_complete',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,p_as_of,null,'complete_v1',
      '{"required_identity_fields_complete":true,"minimum_contact_channels_met":true,"field_values_excluded":true}'::jsonb,
      '{"business_quality_not_evaluated":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.long_term_verified' and enabled;
  if v_config.detector_key is not null and v_verified_at is not null then
    for v_milestone in select * from public.account_trust_owner_milestones order by milestone_days loop
      if p_as_of>=v_verified_at+make_interval(days=>v_milestone.milestone_days) then
        v_result:=public.account_trust_emit_signal_v1(
          p_user_id,'owner_long_term_verified',v_config.detector_key,v_config.detector_version,
          v_milestone.strength,v_config.confidence,
          v_verified_at+make_interval(days=>v_milestone.milestone_days),null,
          'milestone:'||v_milestone.milestone_days,
          jsonb_build_object('milestone_days',v_milestone.milestone_days,'label',v_milestone.label,'verified_since',v_verified_at),
          '{"business_quality_not_evaluated":true}'::jsonb);
        if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
      end if;
    end loop;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.stable_information' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer into v_stability_events from public.account_trust_owner_events e
    where e.user_id=p_user_id
      and e.event_type in ('core_information_changed','information_contradiction_confirmed','ownership_inconsistency_confirmed')
      and e.occurred_at between p_as_of-make_interval(days=>(v_config.settings->>'stability_window_days')::integer) and p_as_of;
  end if;
  if v_config.detector_key is not null and v_verified_at is not null
     and p_as_of>=v_verified_at+make_interval(days=>(v_config.settings->>'minimum_verified_days')::integer)
     and p_as_of>=v_state.observation_started_at+make_interval(days=>(v_config.settings->>'minimum_observation_days')::integer)
     and v_stability_events<=(v_config.settings->>'maximum_core_changes')::integer then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'owner_stable_information',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,p_as_of,null,
      'observed:'||to_char(v_state.observation_started_at,'YYYY-MM-DD'),
      jsonb_build_object('observation_days',(v_config.settings->>'minimum_observation_days')::integer,
        'stability_window_days',(v_config.settings->>'stability_window_days')::integer,
        'observed_core_change_count',v_stability_events,
        'ordinary_maintenance_excluded',true),'{"business_quality_not_evaluated":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.responsive' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer,count(*) filter(where status='completed' and responded_at<=due_at)::integer
    into v_total_requests,v_on_time from public.account_trust_owner_requests
    where user_id=p_user_id and requested_at between
      p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of
      and (status='completed' or (status='open' and due_at<p_as_of));
    v_ratio:=case when v_total_requests>0 then v_on_time::numeric/v_total_requests else 0 end;
    if v_total_requests>=(v_config.settings->>'minimum_requests')::integer
       and v_ratio>=(v_config.settings->>'minimum_on_time_ratio')::numeric then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'owner_responsive',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'responsive_v1',
        jsonb_build_object('eligible_request_count',v_total_requests,'on_time_response_count',v_on_time,
          'on_time_ratio',round(v_ratio,4),'request_contents_excluded',true),
        '{"not_every_interaction_required":true}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.repeated_claim_abuse' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer,count(distinct spot_id)::integer into v_invalid_claims,v_invalid_spots
    from public.spot_claims where user_id=p_user_id and status in ('rejected','revoked')
      and coalesce(reviewed_at,updated_at,created_at) between
        p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of;
    if v_invalid_claims>=(v_config.settings->>'minimum_invalid_claims')::integer
       and v_invalid_spots>=(v_config.settings->>'minimum_distinct_spots')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'owner_repeated_claim_abuse',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'claim_pattern:'||to_char(p_as_of,'YYYY'),
        jsonb_build_object('invalid_claim_count',v_invalid_claims,'distinct_spot_count',v_invalid_spots,
          'window_days',(v_config.settings->>'window_days')::integer,'claim_content_excluded',true),
        '{"signal_interpretation":"indicator_not_proof","single_rejection_is_normal":true}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.document_quality' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer into v_document_issues from public.account_trust_owner_events
    where user_id=p_user_id and event_type='document_issue_confirmed'
      and occurred_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of;
    if v_document_issues>=(v_config.settings->>'minimum_confirmed_issues')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'owner_document_quality',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'document_pattern:'||to_char(p_as_of,'YYYY-Q'),
        jsonb_build_object('confirmed_issue_count',v_document_issues,
          'window_days',(v_config.settings->>'window_days')::integer,'documents_excluded',true),
        '{"signal_interpretation":"indicator_not_proof","single_correction_is_normal":true}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.data_instability' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer,count(distinct change_kind)::integer into v_events,v_change_kinds
    from public.account_trust_owner_events where user_id=p_user_id
      and event_type in ('core_information_changed','information_contradiction_confirmed','ownership_inconsistency_confirmed')
      and occurred_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of;
    if v_events>=(v_config.settings->>'minimum_events')::integer
       and v_change_kinds>=(v_config.settings->>'minimum_distinct_change_kinds')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'owner_data_instability',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'instability:'||to_char(p_as_of,'YYYY-Q'),
        jsonb_build_object('core_change_count',v_events,'distinct_change_kind_count',v_change_kinds,
          'window_days',(v_config.settings->>'window_days')::integer,'changed_values_excluded',true,
          'ordinary_maintenance_excluded',true),'{"signal_interpretation":"indicator_not_proof"}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.neglect' and enabled;
  if v_config.detector_key is not null then
    select count(*)::integer into v_overdue from public.account_trust_owner_requests
    where user_id=p_user_id and status='open'
      and requested_at between p_as_of-make_interval(days=>(v_config.settings->>'window_days')::integer) and p_as_of
      and due_at+make_interval(days=>(v_config.settings->>'grace_days')::integer)<=p_as_of;
    if v_overdue>=(v_config.settings->>'minimum_overdue_requests')::integer then
      v_result:=public.account_trust_emit_signal_v1(
        p_user_id,'owner_neglect',v_config.detector_key,v_config.detector_version,
        v_config.signal_strength,v_config.confidence,p_as_of,null,'neglect:'||to_char(p_as_of,'YYYY-Q'),
        jsonb_build_object('overdue_request_count',v_overdue,
          'grace_days',(v_config.settings->>'grace_days')::integer,
          'window_days',(v_config.settings->>'window_days')::integer,'request_contents_excluded',true),
        '{"signal_interpretation":"indicator_not_proof","single_missed_request_is_normal":true}'::jsonb);
      if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
    end if;
  end if;

  select
    bool_or(signal_key='owner_repeated_claim_abuse'),
    bool_or(signal_key='owner_document_quality'),
    bool_or(signal_key='owner_data_instability'),
    bool_or(signal_key='owner_neglect')
  into v_claim_family,v_document_family,v_instability_family,v_neglect_family
  from public.account_trust_signals where user_id=p_user_id and dimension='owner'
    and polarity='risk' and signal_key<>'owner_trust_pattern' and status='active'
    and observed_at between p_as_of-interval '180 days' and p_as_of
    and (expires_at is null or expires_at>p_as_of);
  v_family_count:=(case when coalesce(v_claim_family,false) then 1 else 0 end)
    +(case when coalesce(v_document_family,false) then 1 else 0 end)
    +(case when coalesce(v_instability_family,false) then 1 else 0 end)
    +(case when coalesce(v_neglect_family,false) then 1 else 0 end);
  select * into v_config from public.account_trust_owner_detector_config
  where detector_key='backyrd.owner.trust_pattern' and enabled;
  if v_config.detector_key is not null
     and v_family_count>=(v_config.settings->>'minimum_risk_families')::integer then
    v_result:=public.account_trust_emit_signal_v1(
      p_user_id,'owner_trust_pattern',v_config.detector_key,v_config.detector_version,
      v_config.signal_strength,v_config.confidence,p_as_of,null,'pattern:'||to_char(p_as_of,'YYYY-Q'),
      jsonb_build_object('aligned_risk_family_count',v_family_count,'claim_pattern_present',v_claim_family,
        'document_pattern_present',v_document_family,'instability_pattern_present',v_instability_family,
        'neglect_pattern_present',v_neglect_family),
      '{"signal_interpretation":"high_confidence_indicator_not_proof","multi_signal_required":true}'::jsonb);
    if not coalesce((v_result->>'duplicate')::boolean,false) then v_emitted:=v_emitted+1; end if;
  end if;

  return jsonb_build_object('user_id',p_user_id,'signals_emitted',v_emitted,
    'verified_at',v_verified_at,'profile_complete',v_complete,
    'eligible_request_count',v_total_requests,'on_time_response_count',v_on_time,
    'invalid_claim_count',v_invalid_claims,'document_issue_count',v_document_issues,
    'core_change_count',v_events,'overdue_request_count',v_overdue,
    'aligned_risk_family_count',v_family_count);
end;
$$;

create or replace function public.account_trust_evaluate_owner_due_v1(
  p_limit integer default 1000,p_as_of timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_state record;v_result jsonb;v_processed integer:=0;v_emitted integer:=0;
begin
  if p_limit is null or p_limit<1 or p_limit>10000 then
    raise exception 'owner_evaluation_limit_invalid' using errcode='22023';
  end if;
  if p_as_of is null or p_as_of>now()+interval '5 minutes' then
    raise exception 'owner_evaluation_time_invalid' using errcode='22023';
  end if;
  for v_state in select user_id from public.account_trust_owner_evaluation_state
    where next_evaluation_at<=p_as_of order by next_evaluation_at,user_id
    limit p_limit for update skip locked
  loop
    v_result:=public.account_trust_evaluate_owner_user_v1(v_state.user_id,p_as_of);
    update public.account_trust_owner_evaluation_state set
      last_evaluated_at=p_as_of,next_evaluation_at=p_as_of+interval '24 hours',
      last_signal_count=coalesce((v_result->>'signals_emitted')::integer,0),updated_at=now()
    where user_id=v_state.user_id;
    v_processed:=v_processed+1;
    v_emitted:=v_emitted+coalesce((v_result->>'signals_emitted')::integer,0);
  end loop;
  return jsonb_build_object('processed',v_processed,'signals_emitted',v_emitted);
end;
$$;

create or replace function public.account_trust_capture_owner_claim_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.account_trust_schedule_owner_user_v1(new.user_id,now());
  return new;
end;
$$;

create or replace function public.account_trust_capture_owner_spot_v1()
returns trigger language plpgsql security definer set search_path=public,extensions,pg_catalog as $$
declare v_reference text;
begin
  if old.owner_id is not null then perform public.account_trust_schedule_owner_user_v1(old.owner_id,now()); end if;
  if new.owner_id is not null and new.owner_id is distinct from old.owner_id then
    perform public.account_trust_schedule_owner_user_v1(new.owner_id,now());
  end if;
  if new.owner_id is not null and new.owner_id is not distinct from old.owner_id then
    if new.name is distinct from old.name then
      v_reference:=new.id::text||':business_name:'||
        coalesce(old.name,'<null>')||':'||coalesce(new.name,'<null>');
      insert into public.account_trust_owner_events(
        user_id,event_type,source_kind,source_reference_hash,change_kind,occurred_at
      ) values(new.owner_id,'core_information_changed','spots_trigger',
        public.account_trust_owner_hash_reference_v1(v_reference),'business_name',now())
      on conflict do nothing;
    end if;
    if new.category_id is distinct from old.category_id then
      v_reference:=new.id::text||':category:'||
        coalesce(old.category_id::text,'<null>')||':'||coalesce(new.category_id::text,'<null>');
      insert into public.account_trust_owner_events(
        user_id,event_type,source_kind,source_reference_hash,change_kind,occurred_at
      ) values(new.owner_id,'core_information_changed','spots_trigger',
        public.account_trust_owner_hash_reference_v1(v_reference),'category',now())
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.account_trust_schedule_owner_profile_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if exists(select 1 from public.spots where owner_id=new.id)
     or exists(select 1 from public.spot_claims where user_id=new.id) then
    perform public.account_trust_schedule_owner_user_v1(new.id,now());
  end if;
  return new;
end;
$$;

create trigger trg_account_trust_owner_claim_v1
after insert or update of status,email_verified_at,reviewed_at on public.spot_claims
for each row execute function public.account_trust_capture_owner_claim_v1();

create trigger trg_account_trust_owner_spot_v1
after update of owner_id,name,category_id,address,city,country,website,phone,email on public.spots
for each row execute function public.account_trust_capture_owner_spot_v1();

create trigger trg_account_trust_owner_profile_v1
after update of contact_email on public.profiles
for each row execute function public.account_trust_schedule_owner_profile_v1();

insert into public.account_trust_owner_evaluation_state(user_id,next_evaluation_at)
select distinct candidate.user_id,now() from (
  select owner_id user_id from public.spots where owner_id is not null
  union select user_id from public.spot_claims
) candidate where candidate.user_id is not null
on conflict(user_id) do nothing;

select public.account_trust_evaluate_owner_due_v1(10000,now());

alter table public.account_trust_owner_detector_config enable row level security;
alter table public.account_trust_owner_milestones enable row level security;
alter table public.account_trust_owner_events enable row level security;
alter table public.account_trust_owner_requests enable row level security;
alter table public.account_trust_owner_evaluation_state enable row level security;

revoke all on table public.account_trust_owner_detector_config from public,anon,authenticated;
revoke all on table public.account_trust_owner_milestones from public,anon,authenticated;
revoke all on table public.account_trust_owner_events from public,anon,authenticated;
revoke all on table public.account_trust_owner_requests from public,anon,authenticated;
revoke all on table public.account_trust_owner_evaluation_state from public,anon,authenticated;
grant select,insert,update,delete on table public.account_trust_owner_detector_config to service_role;
grant select,insert,update,delete on table public.account_trust_owner_milestones to service_role;
grant select,insert,update,delete on table public.account_trust_owner_events to service_role;
grant select,insert,update,delete on table public.account_trust_owner_requests to service_role;
grant select,insert,update,delete on table public.account_trust_owner_evaluation_state to service_role;

revoke all on function public.account_trust_owner_hash_reference_v1(text) from public,anon,authenticated;
revoke all on function public.account_trust_schedule_owner_user_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_record_owner_event_v1(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.account_trust_upsert_owner_request_v1(uuid,text,text,timestamptz,timestamptz,text,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_owner_user_v1(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_evaluate_owner_due_v1(integer,timestamptz) from public,anon,authenticated;
revoke all on function public.account_trust_capture_owner_claim_v1() from public,anon,authenticated;
revoke all on function public.account_trust_capture_owner_spot_v1() from public,anon,authenticated;
revoke all on function public.account_trust_schedule_owner_profile_v1() from public,anon,authenticated;

grant execute on function public.account_trust_owner_hash_reference_v1(text) to service_role;
grant execute on function public.account_trust_schedule_owner_user_v1(uuid,timestamptz) to service_role;
grant execute on function public.account_trust_record_owner_event_v1(uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.account_trust_upsert_owner_request_v1(uuid,text,text,timestamptz,timestamptz,text,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_owner_user_v1(uuid,timestamptz) to service_role;
grant execute on function public.account_trust_evaluate_owner_due_v1(integer,timestamptz) to service_role;

comment on function public.account_trust_record_owner_event_v1(uuid,text,text,text,timestamptz,text) is
  'Service-only ingestion of confirmed, data-minimized Owner evidence. Raw documents, values, and notes are excluded.';
comment on function public.account_trust_upsert_owner_request_v1(uuid,text,text,timestamptz,timestamptz,text,timestamptz) is
  'Service-only lifecycle contract for required Owner requests. The external request reference is hashed before storage.';
comment on function public.account_trust_evaluate_owner_user_v1(uuid,timestamptz) is
  'Sprint 9.5 non-enforcing Owner Trust evaluation. Signals assess platform-partner reliability, never business quality.';
