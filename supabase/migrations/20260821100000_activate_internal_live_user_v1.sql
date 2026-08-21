-- First controlled internal live-user activation. This migration adds only
-- server-owned routing, lifecycle and observability boundaries. Engine
-- semantics remain in the shared frozen runtimes.

create table public.backyrd_internal_live_users_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  n2_enabled boolean not null default true,
  user_intelligence_enabled boolean not null default true,
  decision_enabled boolean not null default true,
  n6_enabled boolean not null default true,
  activation_reason text not null default 'FIRST_INTERNAL_LIVE_USER',
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.backyrd_internal_live_users_v1 enable row level security;
revoke all on public.backyrd_internal_live_users_v1 from public,anon,authenticated;
grant all on public.backyrd_internal_live_users_v1 to service_role;

create or replace function public.backyrd_internal_live_user_enabled_v1(p_user_id uuid,p_capability text default 'DECISION')
returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
  select coalesce((
    select u.enabled
      and case upper(coalesce(p_capability,'DECISION'))
        when 'N2' then u.n2_enabled
        when 'USER_INTELLIGENCE' then u.user_intelligence_enabled
        when 'DECISION' then u.decision_enabled
        when 'N6' then u.n6_enabled
        else false
      end
      and public.user_has_active_consent_v1(u.user_id,'personalized_recommendations')
    from public.backyrd_internal_live_users_v1 u where u.user_id=p_user_id
  ),false)
$$;
revoke all on function public.backyrd_internal_live_user_enabled_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.backyrd_internal_live_user_enabled_v1(uuid,text) to service_role;

create table public.backyrd_internal_decision_handoffs_v1 (
  decision_id uuid primary key references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  city text,
  mood_a_text text,
  mood_b_text text,
  request_context jsonb not null check(jsonb_typeof(request_context)='object'),
  candidate_ids uuid[] not null check(cardinality(candidate_ids) between 1 and 10),
  learning_eligible boolean not null default true,
  claimed_at timestamptz,
  expires_at timestamptz not null default now()+interval '10 minutes',
  created_at timestamptz not null default now(),
  unique(user_id,decision_id)
);
create index backyrd_internal_decision_handoff_claim_v1
  on public.backyrd_internal_decision_handoffs_v1(user_id,created_at desc)
  where claimed_at is null;
alter table public.backyrd_internal_decision_handoffs_v1 enable row level security;
revoke all on public.backyrd_internal_decision_handoffs_v1 from public,anon,authenticated;
grant all on public.backyrd_internal_decision_handoffs_v1 to service_role;

create table public.backyrd_internal_live_decision_executions_v1 (
  decision_id uuid primary key references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('PROCESSING','COMPLETE','FALLBACK')),
  deterministic_trace_id uuid,
  n6_trace_id uuid,
  n6_disposition text,
  final_source text check(final_source is null or final_source in ('N6_VALIDATED','DETERMINISTIC_NORTH_STAR','LEGACY_V13_FALLBACK')),
  final_order uuid[] not null default '{}',
  knowledge_mode text,
  user_card_hash text,
  package_hash text,
  response_hash text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index backyrd_internal_live_decision_user_v1
  on public.backyrd_internal_live_decision_executions_v1(user_id,created_at desc);
alter table public.backyrd_internal_live_decision_executions_v1 enable row level security;
revoke all on public.backyrd_internal_live_decision_executions_v1 from public,anon,authenticated;
grant all on public.backyrd_internal_live_decision_executions_v1 to service_role;

create or replace function public.backyrd_prepare_internal_live_decision_v1(
  p_user_id uuid,p_city text,p_mood_a_text text,p_mood_b_text text,
  p_request_context jsonb,p_candidate_ids uuid[],p_why_this text[],p_learning_eligible boolean default true
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_decision uuid;v_i integer;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  if not public.backyrd_internal_live_user_enabled_v1(p_user_id,'DECISION') then raise exception 'internal_live_user_not_enabled' using errcode='42501'; end if;
  if jsonb_typeof(p_request_context)<>'object' or p_candidate_ids is null or cardinality(p_candidate_ids) not between 1 and 10
     or cardinality(p_candidate_ids)<>(select count(distinct x) from unnest(p_candidate_ids)x)
     or exists(select 1 from unnest(p_candidate_ids)x where not exists(select 1 from public.spots s where s.id=x)) then
    raise exception 'internal_live_invalid_decision_input' using errcode='22023';
  end if;
  perform set_config('backyrd.internal_live_learning_eligible',case when p_learning_eligible then 'true' else 'false' end,true);
  insert into public.decision_sessions(user_id,city,mood_a_text,mood_b_text)
  values(p_user_id,nullif(trim(p_city),''),nullif(trim(p_mood_a_text),''),nullif(trim(p_mood_b_text),'')) returning id into v_decision;
  insert into public.backyrd_internal_decision_handoffs_v1(decision_id,user_id,city,mood_a_text,mood_b_text,request_context,candidate_ids,learning_eligible)
  values(v_decision,p_user_id,nullif(trim(p_city),''),nullif(trim(p_mood_a_text),''),nullif(trim(p_mood_b_text),''),p_request_context,p_candidate_ids,p_learning_eligible);
  for v_i in 1..cardinality(p_candidate_ids) loop
    insert into public.decision_impressions(decision_id,spot_id,rank,why_this)
    values(v_decision,p_candidate_ids[v_i],v_i,case when p_why_this is null then null else p_why_this[v_i] end)
    on conflict(decision_id,spot_id) do update set rank=excluded.rank,why_this=excluded.why_this;
  end loop;
  insert into public.backyrd_internal_live_decision_executions_v1(decision_id,user_id,status)
  values(v_decision,p_user_id,'PROCESSING');
  return v_decision;
end $$;

-- The installed client creates its Decision session after receiving v13.
-- Reuse the server-prepared session exactly once so later opens/reviews retain
-- the canonical North-Star decision identity without a Mobile release.
create or replace function public.create_decision_session_v1(p_city text,p_mood_a_text text default null,p_mood_b_text text default null)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'not_authenticated' using errcode='P0001'; end if;
  select h.decision_id into v_id from public.backyrd_internal_decision_handoffs_v1 h
  where h.user_id=v_user and h.claimed_at is null and h.expires_at>now()
    and h.city is not distinct from nullif(trim(p_city),'')
    and h.mood_a_text is not distinct from nullif(trim(p_mood_a_text),'')
    and h.mood_b_text is not distinct from nullif(trim(p_mood_b_text),'')
  order by h.created_at desc for update skip locked limit 1;
  if v_id is not null then
    update public.backyrd_internal_decision_handoffs_v1 set claimed_at=now() where decision_id=v_id;
    return v_id;
  end if;
  insert into public.decision_sessions(user_id,city,mood_a_text,mood_b_text)
  values(v_user,p_city,p_mood_a_text,p_mood_b_text) returning id into v_id;
  return v_id;
end $$;

create or replace function public.backyrd_finalize_internal_live_decision_v1(
  p_decision_id uuid,p_user_id uuid,p_status text,p_deterministic_trace_id uuid,p_n6_trace_id uuid,
  p_n6_disposition text,p_final_source text,p_final_order uuid[],p_knowledge_mode text,
  p_user_card_hash text,p_package_hash text,p_response_hash text,p_error_code text default null
) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_candidates uuid[];v_n6_disposition text;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  select candidate_ids into v_candidates from public.backyrd_internal_decision_handoffs_v1 where decision_id=p_decision_id and user_id=p_user_id;
  if v_candidates is null or p_status not in ('COMPLETE','FALLBACK') or p_final_source not in ('N6_VALIDATED','DETERMINISTIC_NORTH_STAR','LEGACY_V13_FALLBACK')
     or cardinality(p_final_order)<>cardinality(array(select distinct x from unnest(p_final_order)x))
     or exists(select 1 from unnest(p_final_order)x where not x=any(v_candidates)) then
    raise exception 'internal_live_finalize_invalid' using errcode='22023';
  end if;
  if p_final_source='N6_VALIDATED' then
    select disposition into v_n6_disposition from public.backyrd_n6_shadow_traces_v1 where id=p_n6_trace_id and decision_id=p_decision_id and user_id=p_user_id;
    if v_n6_disposition is distinct from 'VALIDATED' then raise exception 'internal_live_n6_not_validated' using errcode='42501'; end if;
  end if;
  update public.backyrd_internal_live_decision_executions_v1 set
    status=p_status,deterministic_trace_id=p_deterministic_trace_id,n6_trace_id=p_n6_trace_id,n6_disposition=p_n6_disposition,
    final_source=p_final_source,final_order=p_final_order,knowledge_mode=p_knowledge_mode,user_card_hash=p_user_card_hash,
    package_hash=p_package_hash,response_hash=p_response_hash,error_code=left(p_error_code,160),completed_at=now()
  where decision_id=p_decision_id and user_id=p_user_id;
end $$;

-- Global switches can be enabled safely: every personal enqueue and worker
-- claim remains constrained to the server-owned live-user allowlist.
create or replace function public.backyrd_memory_bridge_enqueue_v1(
  p_source_type text,p_source_id text,p_user_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_session_id text default null,p_decision_id uuid default null,p_spot_id uuid default null,
  p_exposure_rank integer default null,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.backyrd_memory_bridge_enabled_v1() or not public.backyrd_internal_live_user_enabled_v1(p_user_id,'N2') then return; end if;
  if current_setting('backyrd.internal_live_learning_eligible',true)='false' then return; end if;
  if p_source_type not in ('decision_session','decision_impression','analytics_event','product_action','favorite','reservation','smart_review')
     or p_event_type not in ('decision_request','candidate_exposed','spot_opened','saved','save_removed','navigation_intent','reservation_intent','verified_visit')
     or p_source_id is null or p_user_id is null or p_occurred_at is null then raise exception 'memory_bridge_invalid_source' using errcode='22023'; end if;
  if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') then return; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or p_metadata ?| array['text','moods','review_text','photo_url','token','secret','key'] then raise exception 'memory_bridge_invalid_metadata' using errcode='22023'; end if;
  insert into public.backyrd_memory_bridge_outbox_v1(source_type,source_id,user_id,canonical_event_type,occurred_at,session_id,decision_id,spot_id,exposure_rank,source_metadata)
  values(p_source_type,p_source_id,p_user_id,p_event_type,p_occurred_at,p_session_id,p_decision_id,p_spot_id,p_exposure_rank,p_metadata)
  on conflict(source_type,source_id,semantic_version,canonical_event_type) do nothing;
end $$;

-- Existing installed clients already emit decision_open. Adapt it server-side
-- so no new Mobile build is required for canonical spot-open Memory.
create or replace function public.backyrd_memory_bridge_enqueue_ml_open_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.event_type='decision_open' then
    perform public.backyrd_memory_bridge_enqueue_v1('analytics_event',new.id::text,new.user_id,'spot_opened',new.created_at,new.decision_id::text,new.decision_id,new.spot_id,new.rank,jsonb_build_object('mapping','decision_open_v1','entrySurface','decision'));
  end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_memory_bridge_ml_open_v1 on public.backyrd_ml_events_v1;
create trigger trg_backyrd_memory_bridge_ml_open_v1 after insert on public.backyrd_ml_events_v1 for each row execute function public.backyrd_memory_bridge_enqueue_ml_open_v1();

create or replace function public.backyrd_user_intelligence_enqueue_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if coalesce((select enabled from public.backyrd_user_intelligence_runtime_settings_v1 where singleton),false)
     and public.backyrd_internal_live_user_enabled_v1(new.user_id,'USER_INTELLIGENCE') then
    insert into public.backyrd_user_intelligence_work_v1(source_memory_event_id,user_id,processing_reason)
    values(new.id,new.user_id,'MEMORY_COMMITTED') on conflict(source_memory_event_id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.backyrd_claim_user_intelligence_work_v1(p_lease_seconds integer default 300)
returns table(lease_token uuid,user_id uuid,target_watermark timestamptz,work_ids uuid[],attempt integer,processing_reason text)
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid;v_token uuid:=gen_random_uuid();v_watermark timestamptz;v_ids uuid[];v_attempt int;v_reason text;
begin
  if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
  if not coalesce((select enabled from public.backyrd_user_intelligence_runtime_settings_v1 where singleton),false) then return; end if;
  update public.backyrd_user_intelligence_work_v1 w set state='RETRYABLE',lease_token=null,locked_at=null,available_at=now(),failure_code='LEASE_EXPIRED',updated_at=now()
  from public.backyrd_user_intelligence_user_leases_v1 l where w.user_id=l.user_id and w.lease_token=l.lease_token and l.expires_at<=now() and w.state='PROCESSING';
  delete from public.backyrd_user_intelligence_user_leases_v1 where expires_at<=now();
  select w.user_id into v_user from public.backyrd_user_intelligence_work_v1 w
  where w.state in ('PENDING','RETRYABLE') and w.available_at<=now()
    and public.backyrd_internal_live_user_enabled_v1(w.user_id,'USER_INTELLIGENCE')
    and not exists(select 1 from public.backyrd_user_intelligence_user_leases_v1 l where l.user_id=w.user_id)
  order by w.created_at for update skip locked limit 1;
  if v_user is null then return; end if;
  select max(m.ingested_at) into v_watermark from public.backyrd_memory_events_v1 m where m.user_id=v_user;
  if v_watermark is null then return; end if;
  insert into public.backyrd_user_intelligence_user_leases_v1(user_id,lease_token,target_watermark,expires_at)
  values(v_user,v_token,v_watermark,now()+make_interval(secs=>greatest(30,least(p_lease_seconds,1800)))) on conflict on constraint backyrd_user_intelligence_user_leases_v1_pkey do nothing;
  if not found then return; end if;
  with claimed as (
    update public.backyrd_user_intelligence_work_v1 w set state='PROCESSING',lease_token=v_token,target_watermark=v_watermark,claimed_at=now(),locked_at=now(),attempts=attempts+1,updated_at=now()
    from public.backyrd_memory_events_v1 m where w.source_memory_event_id=m.id and w.user_id=v_user and w.state in ('PENDING','RETRYABLE') and m.ingested_at<=v_watermark
    returning w.source_memory_event_id,w.attempts
  ) select array_agg(source_memory_event_id),max(attempts) into v_ids,v_attempt from claimed;
  select string_agg(distinct w.processing_reason,',' order by w.processing_reason) into v_reason from public.backyrd_user_intelligence_work_v1 w where w.source_memory_event_id=any(v_ids);
  return query select v_token,v_user,v_watermark,coalesce(v_ids,'{}'::uuid[]),coalesce(v_attempt,1),coalesce(v_reason,'MEMORY_COMMITTED');
end $$;

create or replace function public.backyrd_claim_n6_shadow_for_decision_v1(p_runner_id uuid,p_decision_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_settings public.backyrd_n6_shadow_settings_v1%rowtype;v_work public.backyrd_n6_shadow_work_v1%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  select * into v_settings from public.backyrd_n6_shadow_settings_v1 where singleton;
  if not v_settings.enabled then return null; end if;
  update public.backyrd_n6_shadow_work_v1 set state='PENDING',runner_id=null,claimed_at=null,lease_expires_at=null,updated_at=now()
    where state='PROCESSING' and lease_expires_at<now() and attempt<v_settings.max_attempts;
  if (select count(*) from public.backyrd_n6_shadow_work_v1 where state='PROCESSING' and lease_expires_at>=now())>=v_settings.max_concurrent_calls then return null; end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where decision_id=p_decision_id and state in ('PENDING','RETRYABLE_FAILED') and attempt<v_settings.max_attempts for update skip locked;
  if v_work.id is null or not public.backyrd_internal_live_user_enabled_v1(v_work.user_id,'N6') then return null; end if;
  update public.backyrd_n6_shadow_work_v1 set state='PROCESSING',attempt=attempt+1,shadow_run_id=gen_random_uuid(),runner_id=p_runner_id,claimed_at=now(),lease_expires_at=now()+interval '3 minutes',updated_at=now()
  where id=v_work.id returning * into v_work;
  return jsonb_build_object('work_id',v_work.id,'shadow_run_id',v_work.shadow_run_id,'decision_id',v_work.decision_id,'user_id',v_work.user_id,'attempt',v_work.attempt);
end $$;

create or replace function public.backyrd_memory_bridge_process_v1(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row public.backyrd_memory_bridge_outbox_v1%rowtype;v_result record;
  v_committed integer:=0;v_retryable integer:=0;v_failed integer:=0;v_suppressed integer:=0;v_event jsonb;v_code text;v_pruned integer:=0;
begin
  if auth.role()<>'service_role' then raise exception 'memory_bridge_service_only' using errcode='42501'; end if;
  perform public.backyrd_memory_bridge_recover_stale_v1();
  delete from public.backyrd_memory_bridge_outbox_v1 o where o.state in ('PENDING','RETRYABLE','PROCESSING') and not public.backyrd_internal_live_user_enabled_v1(o.user_id,'N2');
  get diagnostics v_pruned=row_count;v_suppressed:=v_suppressed+v_pruned;
  for v_i in 1..greatest(1,least(coalesce(p_limit,50),200)) loop
    with candidate as (
      select id from public.backyrd_memory_bridge_outbox_v1 where state in ('PENDING','RETRYABLE') and available_at<=now()
      order by created_at for update skip locked limit 1
    ) update public.backyrd_memory_bridge_outbox_v1 o set state='PROCESSING',locked_at=now(),attempts=o.attempts+1,updated_at=now()
      from candidate where o.id=candidate.id returning o.* into v_row;
    exit when not found;
    if not public.user_has_active_consent_v1(v_row.user_id,'personalized_recommendations') or not public.backyrd_internal_live_user_enabled_v1(v_row.user_id,'N2') then
      delete from public.backyrd_memory_bridge_outbox_v1 where id=v_row.id;v_suppressed:=v_suppressed+1;continue;
    end if;
    v_event:=jsonb_build_object('userId',v_row.user_id,'idempotencyKey',v_row.source_type||':'||v_row.source_id||':'||v_row.semantic_version||':'||v_row.canonical_event_type,
      'eventType',v_row.canonical_event_type,'contractVersion','backyrd-memory-event-contract-v1','occurredAt',v_row.occurred_at,'observedAt',v_row.occurred_at,
      'sessionId',v_row.session_id,'decisionId',v_row.decision_id,'spotId',v_row.spot_id,'momentSignature','{}'::jsonb,'spotEvidence','{}'::jsonb,
      'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId',v_row.source_type||':'||v_row.source_id,'sourceVersion',v_row.semantic_version),
      'consentPurpose','personalized_recommendations','consentState','granted','exposure',jsonb_build_object('rank',v_row.exposure_rank));
    begin
      select * into v_result from public.backyrd_ingest_memory_event_v1(v_event);
      update public.backyrd_memory_bridge_outbox_v1 set state='COMMITTED',locked_at=null,committed_at=now(),canonical_event_id=v_result.event_id,canonical_event_hash=v_result.event_hash,updated_at=now(),failure_code=null where id=v_row.id;
      v_committed:=v_committed+1;
    exception when others then
      get stacked diagnostics v_code=returned_sqlstate;
      if v_code in ('22023','23505') then update public.backyrd_memory_bridge_outbox_v1 set state='INVALID',locked_at=null,failure_code='ingestion_invalid:'||v_code,updated_at=now() where id=v_row.id;v_failed:=v_failed+1;
      elsif v_row.attempts>=8 then update public.backyrd_memory_bridge_outbox_v1 set state='FAILED',locked_at=null,failure_code='ingestion_failed:'||v_code,updated_at=now() where id=v_row.id;v_failed:=v_failed+1;
      else update public.backyrd_memory_bridge_outbox_v1 set state='RETRYABLE',locked_at=null,available_at=now()+make_interval(secs=>least(3600,5*power(2,v_row.attempts)::integer)),failure_code='ingestion_retryable:'||v_code,updated_at=now() where id=v_row.id;v_retryable:=v_retryable+1;end if;
    end;
  end loop;
  return jsonb_build_object('committed',v_committed,'retryable',v_retryable,'failed',v_failed,'suppressedConsentOrAllowlist',v_suppressed);
end $$;

create or replace function public.backyrd_persist_shared_user_intelligence_v2(p_user_id uuid,p_runtime_version text,p_input_contract_version text,p_source_watermark timestamptz,p_source_hash text,p_snapshot_hash text,p_card jsonb,p_nodes jsonb,p_ledger jsonb,p_work_ids uuid[],p_lease_token uuid)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_snapshot uuid;v_previous uuid;v_node jsonb;v_change jsonb;v_latest_watermark timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') or not public.backyrd_internal_live_user_enabled_v1(p_user_id,'USER_INTELLIGENCE') or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_intelligence_consent_or_allowlist_required' using errcode='42501'; end if;
  if not exists(select 1 from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token and target_watermark=p_source_watermark and expires_at>now()) then raise exception 'user_intelligence_lease_invalid' using errcode='40001'; end if;
  if jsonb_typeof(p_card)<>'object' or jsonb_typeof(p_nodes)<>'array' or jsonb_typeof(p_ledger)<>'array' or p_card->>'userId'<>p_user_id::text or p_card->>'userCardHash'<>p_snapshot_hash or p_snapshot_hash!~'^[0-9a-f]{64}$' or p_source_hash!~'^[0-9a-f]{64}$' or jsonb_array_length(p_nodes)<>(select count(distinct x->>'nodeKey') from jsonb_array_elements(p_nodes)x) then raise exception 'invalid_shared_runtime_result' using errcode='22023'; end if;
  select snapshot_id,source_watermark into v_previous,v_latest_watermark from public.backyrd_user_intelligence_latest_v1 where user_id=p_user_id for update;
  if v_latest_watermark is not null and v_latest_watermark>p_source_watermark then
    update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,lease_token=null,updated_at=now() where source_memory_event_id=any(p_work_ids) and user_id=p_user_id;
    delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token;return v_previous;
  end if;
  select snapshot_id into v_snapshot from public.backyrd_user_intelligence_snapshots_v2 where user_id=p_user_id and source_hash=p_source_hash and snapshot_hash=p_snapshot_hash;
  if v_snapshot is null then
    insert into public.backyrd_user_intelligence_snapshots_v2(user_id,runtime_version,input_contract_version,source_watermark,source_hash,snapshot_hash,card,node_count) values(p_user_id,p_runtime_version,p_input_contract_version,p_source_watermark,p_source_hash,p_snapshot_hash,p_card,jsonb_array_length(p_nodes)) returning snapshot_id into v_snapshot;
    for v_node in select value from jsonb_array_elements(p_nodes) loop insert into public.backyrd_user_intelligence_snapshot_nodes_v1(snapshot_id,node_key,node) values(v_snapshot,v_node->>'nodeKey',v_node);end loop;
    for v_change in select value from jsonb_array_elements(p_ledger) loop insert into public.backyrd_user_intelligence_change_ledger_v1(user_id,node_key,previous_node,next_node,reason_code,engine_version,change_hash) values(p_user_id,v_change->>'nodeKey',v_change->'before',coalesce(v_change->'after','{}'::jsonb),coalesce(v_change->>'reasonCode','SHARED_RUNTIME_REBUILD'),p_runtime_version,v_change->>'changeId') on conflict do nothing;end loop;
  end if;
  insert into public.backyrd_user_intelligence_latest_v1(user_id,snapshot_id,source_watermark) values(p_user_id,v_snapshot,p_source_watermark) on conflict(user_id) do update set snapshot_id=excluded.snapshot_id,source_watermark=excluded.source_watermark,updated_at=now();
  update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,lease_token=null,updated_at=now() where source_memory_event_id=any(p_work_ids) and user_id=p_user_id and lease_token=p_lease_token;
  delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token;
  return v_snapshot;
end $$;

create or replace function public.backyrd_internal_live_disable_cleanup_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if old.enabled and not new.enabled then
    delete from public.backyrd_memory_bridge_outbox_v1 where user_id=new.user_id and state in ('PENDING','PROCESSING','RETRYABLE');
    delete from public.backyrd_user_intelligence_work_v1 where user_id=new.user_id and state in ('PENDING','PROCESSING','RETRYABLE');
    delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=new.user_id;
  end if;
  new.updated_at:=now();return new;
end $$;
drop trigger if exists trg_backyrd_internal_live_disable_cleanup_v1 on public.backyrd_internal_live_users_v1;
create trigger trg_backyrd_internal_live_disable_cleanup_v1 before update on public.backyrd_internal_live_users_v1 for each row execute function public.backyrd_internal_live_disable_cleanup_v1();

create or replace function public.backyrd_activate_internal_live_user_v1(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_now timestamptz:=now();v_was_granted boolean;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=p_user_id and deleted_at is null and banned_until is null) then
    raise exception 'internal_live_user_invalid' using errcode='22023';
  end if;
  select status='granted' into v_was_granted from public.user_consents
    where user_id=p_user_id and purpose_key='personalized_recommendations';
  insert into public.user_consents(user_id,purpose_key,status,document_id,granted_at,withdrawn_at,source,app_version,locale,updated_at)
  values(p_user_id,'personalized_recommendations','granted',null,v_now,null,'admin_migration','internal-live-activation-2026-08-21','de-CH',v_now)
  on conflict on constraint user_consents_pkey do update set
    status='granted',granted_at=v_now,withdrawn_at=null,source='admin_migration',
    app_version='internal-live-activation-2026-08-21',locale='de-CH',updated_at=v_now;
  if not coalesce(v_was_granted,false) then
    insert into public.consent_events(user_id,purpose_key,event_type,source,app_version,locale,occurred_at)
    values(p_user_id,'personalized_recommendations','consent_granted','admin_migration','internal-live-activation-2026-08-21','de-CH',v_now);
  end if;
  insert into public.backyrd_internal_live_users_v1(user_id,enabled,n2_enabled,user_intelligence_enabled,decision_enabled,n6_enabled,activated_at,updated_at)
  values(p_user_id,true,true,true,true,true,v_now,v_now)
  on conflict(user_id) do update set enabled=true,n2_enabled=true,user_intelligence_enabled=true,
    decision_enabled=true,n6_enabled=true,activated_at=coalesce(backyrd_internal_live_users_v1.activated_at,v_now),updated_at=v_now;
  update public.backyrd_memory_bridge_settings_v1 set enabled=true,updated_at=v_now where singleton;
  update public.backyrd_user_intelligence_runtime_settings_v1 set enabled=true,updated_at=v_now where singleton;
  update public.backyrd_decision_input_runtime_settings_v1 set enabled=true,updated_at=v_now where singleton;
  update public.backyrd_decision_orchestrator_settings_v1 set enabled=true,updated_at=v_now where singleton;
  update public.backyrd_n6_shadow_settings_v1 set enabled=true,internal_only=true,sample_rate=0,
    allowlisted_user_ids=array[p_user_id],per_user_daily_call_cap=10,global_daily_call_cap=20,
    global_daily_budget_usd=5,max_concurrent_calls=1,max_attempts=2,updated_at=v_now where singleton;
  return jsonb_build_object('userId',p_user_id,'enabled',true,'consent','granted','exclusiveN6Allowlist',true);
end $$;

create or replace function public.backyrd_deactivate_internal_live_user_v1(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  update public.backyrd_internal_live_users_v1 set enabled=false,updated_at=now() where user_id=p_user_id;
  update public.backyrd_n6_shadow_settings_v1 set allowlisted_user_ids=array_remove(allowlisted_user_ids,p_user_id),updated_at=now() where singleton;
  return jsonb_build_object('userId',p_user_id,'enabled',false);
end $$;

-- Service-only configuration stores scheduling credentials in Supabase Vault;
-- no key is committed to schema or Product code.
create or replace function public.backyrd_configure_internal_live_worker_v1(p_worker_url text,p_service_key text,p_internal_secret text)
returns void language plpgsql security definer set search_path=public,pg_catalog,vault,cron as $$
declare v_command text;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  if p_worker_url!~'^https://[a-z0-9-]+\.supabase\.co/functions/v1/decision-engine-worker$' or length(p_service_key)<40 or length(p_internal_secret)<32 then raise exception 'internal_live_worker_config_invalid' using errcode='22023'; end if;
  perform vault.create_secret(p_service_key,'backyrd_internal_live_service_key','Internal live worker service credential');
  perform vault.create_secret(p_internal_secret,'backyrd_internal_live_worker_secret','Internal live worker invocation secret');
  perform cron.unschedule(jobid) from cron.job where jobname='backyrd-internal-live-worker-v1';
  v_command := format($cmd$select net.http_post(
    url:=%L,
    headers:=jsonb_build_object(
      'authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='backyrd_internal_live_service_key' order by created_at desc limit 1),
      'content-type','application/json',
      'x-backyrd-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='backyrd_internal_live_worker_secret' order by created_at desc limit 1)
    ),body:='{"mode":"LIVE_TICK"}'::jsonb,timeout_milliseconds:=50000
  )$cmd$,p_worker_url);
  perform cron.schedule('backyrd-internal-live-worker-v1','* * * * *',v_command);
end $$;

create or replace function public.backyrd_internal_live_status_v1(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog,cron as $$
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  return jsonb_build_object(
    'userExists',exists(select 1 from auth.users where id=p_user_id and deleted_at is null),
    'consentActive',public.user_has_active_consent_v1(p_user_id,'personalized_recommendations'),
    'allowlisted',public.backyrd_internal_live_user_enabled_v1(p_user_id,'DECISION'),
    'n2Enabled',public.backyrd_internal_live_user_enabled_v1(p_user_id,'N2'),
    'userIntelligenceEnabled',public.backyrd_internal_live_user_enabled_v1(p_user_id,'USER_INTELLIGENCE'),
    'n6Enabled',public.backyrd_internal_live_user_enabled_v1(p_user_id,'N6'),
    'enabledUserCount',(select count(*) from public.backyrd_internal_live_users_v1 where enabled),
    'memoryEvents',(select count(*) from public.backyrd_memory_events_v1 where user_id=p_user_id),
    'snapshot',(select jsonb_build_object('snapshotId',s.snapshot_id,'snapshotHash',s.snapshot_hash,'nodeCount',s.node_count,'sourceWatermark',s.source_watermark) from public.backyrd_user_intelligence_latest_v1 l join public.backyrd_user_intelligence_snapshots_v2 s on s.snapshot_id=l.snapshot_id where l.user_id=p_user_id),
    'workerScheduled',exists(select 1 from cron.job where jobname='backyrd-internal-live-worker-v1' and active),
    'workerSchedule',(select schedule from cron.job where jobname='backyrd-internal-live-worker-v1' and active limit 1)
  );
end $$;

revoke all on function public.backyrd_prepare_internal_live_decision_v1(uuid,text,text,text,jsonb,uuid[],text[],boolean),public.backyrd_finalize_internal_live_decision_v1(uuid,uuid,text,uuid,uuid,text,text,uuid[],text,text,text,text,text),public.backyrd_claim_n6_shadow_for_decision_v1(uuid,uuid),public.backyrd_configure_internal_live_worker_v1(text,text,text),public.backyrd_activate_internal_live_user_v1(uuid),public.backyrd_deactivate_internal_live_user_v1(uuid),public.backyrd_internal_live_status_v1(uuid),public.backyrd_memory_bridge_enqueue_ml_open_v1(),public.backyrd_internal_live_disable_cleanup_v1() from public,anon,authenticated;
grant execute on function public.backyrd_prepare_internal_live_decision_v1(uuid,text,text,text,jsonb,uuid[],text[],boolean),public.backyrd_finalize_internal_live_decision_v1(uuid,uuid,text,uuid,uuid,text,text,uuid[],text,text,text,text,text),public.backyrd_claim_n6_shadow_for_decision_v1(uuid,uuid),public.backyrd_configure_internal_live_worker_v1(text,text,text),public.backyrd_activate_internal_live_user_v1(uuid),public.backyrd_deactivate_internal_live_user_v1(uuid),public.backyrd_internal_live_status_v1(uuid) to service_role;
