-- Restore Product -> N2 -> shared frozen User Intelligence wiring.
-- No historical Review/Taste reinterpretation and no learning formula change.

-- Modern standard Reviews are a distinct, canonical Product source.
alter table public.backyrd_memory_bridge_outbox_v1
  drop constraint if exists backyrd_memory_bridge_outbox_v1_source_type_check;
alter table public.backyrd_memory_bridge_outbox_v1
  add constraint backyrd_memory_bridge_outbox_v1_source_type_check
  check(source_type in ('decision_session','decision_impression','analytics_event','product_action','favorite','reservation','smart_review','standard_review'));

create or replace function public.backyrd_memory_bridge_enqueue_v1(
  p_source_type text,p_source_id text,p_user_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_session_id text default null,p_decision_id uuid default null,p_spot_id uuid default null,
  p_exposure_rank integer default null,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if not public.backyrd_memory_bridge_enabled_v1() then return; end if;
  if p_source_type not in ('decision_session','decision_impression','analytics_event','product_action','favorite','reservation','smart_review','standard_review')
     or p_event_type not in ('decision_request','candidate_exposed','spot_opened','saved','save_removed','navigation_intent','reservation_intent','verified_visit','exact_mood_feedback','not_there')
     or p_source_id is null or p_user_id is null or p_occurred_at is null then
    raise exception 'memory_bridge_invalid_source' using errcode='22023';
  end if;
  if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') then return; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object'
     or p_metadata ?| array['text','moods','review_text','photo_url','token','secret','key'] then
    raise exception 'memory_bridge_invalid_metadata' using errcode='22023';
  end if;
  insert into public.backyrd_memory_bridge_outbox_v1(
    source_type,source_id,user_id,canonical_event_type,occurred_at,session_id,decision_id,spot_id,exposure_rank,source_metadata
  ) values(p_source_type,p_source_id,p_user_id,p_event_type,p_occurred_at,p_session_id,p_decision_id,p_spot_id,p_exposure_rank,p_metadata)
  on conflict(source_type,source_id,semantic_version,canonical_event_type) do nothing;
end $$;

-- Internal North-Star decision_impressions are a frozen candidate universe,
-- not Product-visible exposure. Legacy Product decisions still use this table
-- for their actual visible page.
create or replace function public.backyrd_memory_bridge_enqueue_impression_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid;
begin
  if exists(select 1 from public.backyrd_internal_decision_handoffs_v1 h where h.decision_id=new.decision_id) then return new; end if;
  select user_id into v_user from public.decision_sessions where id=new.decision_id;
  if v_user is not null then
    perform public.backyrd_memory_bridge_enqueue_v1('decision_impression',new.id::text,v_user,'candidate_exposed',new.created_at,new.decision_id::text,new.decision_id,new.spot_id,new.rank,jsonb_build_object('mapping','legacy_visible_decision_impression_v1'));
  end if;
  return new;
end $$;

create or replace function public.backyrd_memory_bridge_enqueue_visible_impression_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid;v_rank integer;
begin
  select user_id into v_user from public.backyrd_decision_continuations_v1 where decision_id=new.decision_id;
  if v_user is null then raise exception 'visible_impression_decision_missing' using errcode='23503'; end if;
  v_rank:=(new.page_number-1)*3+new.position_in_page;
  perform public.backyrd_memory_bridge_enqueue_v1(
    'decision_impression',new.decision_id::text||':'||new.spot_id::text,v_user,'candidate_exposed',new.created_at,
    new.decision_id::text,new.decision_id,new.spot_id,v_rank,
    jsonb_build_object('mapping','decision_visible_impression_v1','page',new.page_number,'positionInPage',new.position_in_page)
  );
  return new;
end $$;
drop trigger if exists trg_backyrd_memory_bridge_visible_impression_v1 on public.backyrd_decision_visible_impressions_v1;
create trigger trg_backyrd_memory_bridge_visible_impression_v1 after insert on public.backyrd_decision_visible_impressions_v1
for each row execute function public.backyrd_memory_bridge_enqueue_visible_impression_v1();

-- Decision feedback remains moment-bound. It is accepted only for a visible
-- candidate when continuation state exists, or for the legacy visible
-- impression table on older decisions.
alter table public.decision_actions add column if not exists feedback_revision integer not null default 1;
alter table public.decision_actions drop constraint if exists decision_actions_feedback_revision_check;
alter table public.decision_actions add constraint decision_actions_feedback_revision_check check(feedback_revision>=1);

create or replace function public.backyrd_log_decision_action_v1(p_decision_id uuid,p_spot_id uuid,p_action text)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_uid uuid:=auth.uid();v_action text:=lower(trim(coalesce(p_action,'')));v_existing public.decision_actions%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_decision_id is null or p_spot_id is null or v_action not in ('tapped','was_here','exact_mood','not_there') then raise exception 'bad_request' using errcode='22023'; end if;
  if not exists(select 1 from public.decision_sessions where id=p_decision_id and user_id=v_uid) then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.backyrd_decision_continuations_v1 where decision_id=p_decision_id) then
    if not exists(select 1 from public.backyrd_decision_visible_impressions_v1 where decision_id=p_decision_id and spot_id=p_spot_id) then raise exception 'decision_feedback_candidate_not_visible' using errcode='42501'; end if;
  elsif not exists(select 1 from public.decision_impressions where decision_id=p_decision_id and spot_id=p_spot_id) then
    raise exception 'decision_feedback_candidate_not_visible' using errcode='42501';
  end if;
  if v_action='tapped' then
    insert into public.decision_actions(decision_id,spot_id,action,created_at) values(p_decision_id,p_spot_id,'tapped',now()) on conflict do nothing;
    return;
  end if;
  select * into v_existing from public.decision_actions where decision_id=p_decision_id and spot_id=p_spot_id and action in ('was_here','exact_mood','not_there') for update;
  if found and v_existing.action=v_action then return; end if;
  if found then
    update public.decision_actions set action=v_action,created_at=now(),feedback_revision=feedback_revision+1 where id=v_existing.id;
  else
    insert into public.decision_actions(decision_id,spot_id,action,created_at) values(p_decision_id,p_spot_id,v_action,now());
  end if;
end $$;

create or replace function public.backyrd_memory_bridge_enqueue_decision_feedback_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid;v_event text;v_revision text;
begin
  if new.action not in ('exact_mood','not_there') or (tg_op='UPDATE' and old.action=new.action) then return new; end if;
  select user_id into v_user from public.decision_sessions where id=new.decision_id;
  if v_user is null then raise exception 'decision_feedback_user_missing' using errcode='23503'; end if;
  v_event:=case new.action when 'exact_mood' then 'exact_mood_feedback' else 'not_there' end;
  v_revision:=new.feedback_revision::text;
  perform public.backyrd_memory_bridge_enqueue_v1(
    'product_action','decision_action:'||new.id||':'||new.action||':'||v_revision,v_user,v_event,new.created_at,
    new.decision_id::text,new.decision_id,new.spot_id,null,
    jsonb_build_object('mapping','decision_moment_feedback_v1','actionRowId',new.id,'actionRevision',new.feedback_revision,'action',new.action,'semanticContractVersion','backyrd-canonical-semantics-v1')
  );
  return new;
end $$;
drop trigger if exists trg_backyrd_memory_bridge_decision_feedback_v1 on public.decision_actions;
create trigger trg_backyrd_memory_bridge_decision_feedback_v1 after insert or update of action on public.decision_actions
for each row execute function public.backyrd_memory_bridge_enqueue_decision_feedback_v1();

create or replace function public.backyrd_memory_bridge_decision_moment_v1(p_decision_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_intent jsonb:='{}'::jsonb;v_facts jsonb:='{}'::jsonb;v_result jsonb:='{}'::jsonb;v_audience text;v_place text;
begin
  select coalesce(current_intent,'{}'::jsonb) into v_intent from public.backyrd_decision_funnel_traces_v1 where decision_id=p_decision_id;
  v_facts:=coalesce(v_intent->'currentRequestFacts','{}'::jsonb);
  v_audience:=lower(coalesce(v_facts#>>'{familyContext,value}',v_intent->>'socialContext',''));
  if v_audience in ('family_with_child','family_with_kids','family') then v_result:=v_result||jsonb_build_object('audience','family');
  elsif v_audience in ('solo','date','friends','work') then v_result:=v_result||jsonb_build_object('audience',v_audience); end if;
  if jsonb_typeof(v_intent->'preferredPlaceTypes')='array' and jsonb_array_length(v_intent->'preferredPlaceTypes')=1 then
    v_place:=lower(v_intent#>>'{preferredPlaceTypes,0}');
    if v_place in ('cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other') then v_result:=v_result||jsonb_build_object('placeType',v_place); end if;
  end if;
  return v_result;
end $$;

-- Current REAL STANDARD_REVIEW rows are canonical Product experience claims.
-- This creates Experience, not Satisfaction. Text/Mood qualification remains
-- in the unchanged frozen runtime and may honestly yield no semantic claim.
create or replace function public.backyrd_memory_bridge_enqueue_standard_review_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.data_origin='REAL' and new.review_origin='STANDARD_REVIEW'
     and new.product_evidence_origin is null and new.semantic_contract_version='backyrd-canonical-semantics-v1' then
    perform public.backyrd_memory_bridge_enqueue_v1(
      'standard_review',new.id::text,new.user_id,'verified_visit',new.created_at,'standard_review:'||new.id,null,new.spot_id,null,
      jsonb_build_object('mapping','standard_review_experience_v1','spotBound',true,'satisfaction','UNKNOWN')
    );
  end if;
  return new;
end $$;
drop trigger if exists trg_backyrd_memory_bridge_standard_review_v1 on public.reviews;
create trigger trg_backyrd_memory_bridge_standard_review_v1 after insert on public.reviews
for each row execute function public.backyrd_memory_bridge_enqueue_standard_review_v1();

-- Processor v2 adds minimized Decision context and append-only correction
-- identity while preserving the existing ingestion/retry contract.
create or replace function public.backyrd_memory_bridge_process_v1(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row public.backyrd_memory_bridge_outbox_v1%rowtype;v_result record;
  v_committed integer:=0;v_retryable integer:=0;v_failed integer:=0;v_suppressed integer:=0;
  v_event jsonb;v_code text;v_moment jsonb;v_supersedes uuid;
begin
  if auth.role()<>'service_role' then raise exception 'memory_bridge_service_only' using errcode='42501'; end if;
  perform public.backyrd_memory_bridge_recover_stale_v1();
  for v_i in 1..greatest(1,least(coalesce(p_limit,50),200)) loop
    with candidate as(
      select id from public.backyrd_memory_bridge_outbox_v1 where state in ('PENDING','RETRYABLE') and available_at<=now()
      order by occurred_at,
        case when source_metadata->>'mapping'='decision_moment_feedback_v1' then coalesce((source_metadata->>'actionRevision')::integer,1) else 0 end,
        created_at,id for update skip locked limit 1
    ) update public.backyrd_memory_bridge_outbox_v1 o set state='PROCESSING',locked_at=now(),attempts=o.attempts+1,updated_at=now()
      from candidate where o.id=candidate.id returning o.* into v_row;
    exit when not found;
    if not public.user_has_active_consent_v1(v_row.user_id,'personalized_recommendations') then
      delete from public.backyrd_memory_bridge_outbox_v1 where id=v_row.id;v_suppressed:=v_suppressed+1;continue;
    end if;
    v_moment:=case when v_row.decision_id is not null then public.backyrd_memory_bridge_decision_moment_v1(v_row.decision_id) else '{}'::jsonb end;
    v_supersedes:=null;
    if v_row.source_metadata->>'mapping'='decision_moment_feedback_v1' then
      select prior.canonical_event_id into v_supersedes from public.backyrd_memory_bridge_outbox_v1 prior
      where prior.id<>v_row.id and prior.user_id=v_row.user_id and prior.state='COMMITTED' and prior.canonical_event_id is not null
        and prior.source_metadata->>'mapping'='decision_moment_feedback_v1'
        and prior.source_metadata->>'actionRowId'=v_row.source_metadata->>'actionRowId'
        and prior.occurred_at<=v_row.occurred_at order by prior.occurred_at desc,prior.id desc limit 1;
    end if;
    v_event:=jsonb_build_object(
      'userId',v_row.user_id,'idempotencyKey',v_row.source_type||':'||v_row.source_id||':'||v_row.semantic_version||':'||v_row.canonical_event_type,
      'eventType',v_row.canonical_event_type,'contractVersion','backyrd-memory-event-contract-v1','occurredAt',v_row.occurred_at,'observedAt',v_row.occurred_at,
      'sessionId',v_row.session_id,'decisionId',v_row.decision_id,'spotId',v_row.spot_id,'momentSignature',v_moment,'spotEvidence','{}'::jsonb,
      'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId',v_row.source_type||':'||v_row.source_id,'sourceVersion',v_row.semantic_version),
      'consentPurpose','personalized_recommendations','consentState','granted','exposure',jsonb_build_object('rank',v_row.exposure_rank)
    );
    if v_supersedes is not null then v_event:=v_event||jsonb_build_object('supersedesEventId',v_supersedes); end if;
    begin
      select * into v_result from public.backyrd_ingest_memory_event_v1(v_event);
      update public.backyrd_memory_bridge_outbox_v1 set state='COMMITTED',locked_at=null,committed_at=now(),canonical_event_id=v_result.event_id,canonical_event_hash=v_result.event_hash,updated_at=now(),failure_code=null where id=v_row.id;
      v_committed:=v_committed+1;
    exception when others then
      get stacked diagnostics v_code=returned_sqlstate;
      if v_code in ('22023','23505') then
        update public.backyrd_memory_bridge_outbox_v1 set state='INVALID',locked_at=null,failure_code='ingestion_invalid:'||v_code,updated_at=now() where id=v_row.id;v_failed:=v_failed+1;
      elsif v_row.attempts>=8 then
        update public.backyrd_memory_bridge_outbox_v1 set state='FAILED',locked_at=null,failure_code='ingestion_failed:'||v_code,updated_at=now() where id=v_row.id;v_failed:=v_failed+1;
      else
        update public.backyrd_memory_bridge_outbox_v1 set state='RETRYABLE',locked_at=null,available_at=now()+make_interval(secs=>least(3600,5*power(2,v_row.attempts)::integer)),failure_code='ingestion_retryable:'||v_code,updated_at=now() where id=v_row.id;v_retryable:=v_retryable+1;
      end if;
    end;
  end loop;
  return jsonb_build_object('committed',v_committed,'retryable',v_retryable,'failed',v_failed,'suppressedConsent',v_suppressed);
end $$;

-- User learning is consent-gated, not an internal-user entitlement. The
-- temporary first-live-user allowlist remains authoritative for Decision/N6,
-- but must not discard canonical N2 or block fresh-user card processing.
create or replace function public.backyrd_user_intelligence_enqueue_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce((select enabled from public.backyrd_user_intelligence_runtime_settings_v1 where singleton),false) then
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
 and not exists(select 1 from public.backyrd_user_intelligence_user_leases_v1 l where l.user_id=w.user_id)
 order by w.created_at for update skip locked limit 1;
 if v_user is null then return; end if;
 select max(m.ingested_at) into v_watermark from public.backyrd_memory_events_v1 m where m.user_id=v_user;
 if v_watermark is null then return; end if;
 insert into public.backyrd_user_intelligence_user_leases_v1(user_id,lease_token,target_watermark,expires_at)
 values(v_user,v_token,v_watermark,now()+make_interval(secs=>greatest(30,least(p_lease_seconds,1800))))
 on conflict on constraint backyrd_user_intelligence_user_leases_v1_pkey do nothing;
 if not found then return; end if;
 with claimed as(
  update public.backyrd_user_intelligence_work_v1 w set state='PROCESSING',lease_token=v_token,target_watermark=v_watermark,claimed_at=now(),locked_at=now(),attempts=attempts+1,updated_at=now()
  from public.backyrd_memory_events_v1 m where w.source_memory_event_id=m.id and w.user_id=v_user and w.state in ('PENDING','RETRYABLE') and m.ingested_at<=v_watermark
  returning w.source_memory_event_id,w.attempts
 ) select array_agg(source_memory_event_id),max(attempts) into v_ids,v_attempt from claimed;
 select string_agg(distinct w.processing_reason,',' order by w.processing_reason) into v_reason from public.backyrd_user_intelligence_work_v1 w where w.source_memory_event_id=any(v_ids);
 return query select v_token,v_user,v_watermark,coalesce(v_ids,'{}'::uuid[]),coalesce(v_attempt,1),coalesce(v_reason,'MEMORY_COMMITTED');
end $$;

create or replace function public.backyrd_persist_shared_user_intelligence_v2(p_user_id uuid,p_runtime_version text,p_input_contract_version text,p_source_watermark timestamptz,p_source_hash text,p_snapshot_hash text,p_card jsonb,p_nodes jsonb,p_ledger jsonb,p_work_ids uuid[],p_lease_token uuid)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_snapshot uuid;v_previous uuid;v_node jsonb;v_change jsonb;v_latest_watermark timestamptz;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_intelligence_consent_required' using errcode='42501'; end if;
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

-- New profile declarations persist an explicit N2 event. Removal remains a
-- correction and never becomes negative evidence.
create or replace function public.backyrd_set_self_declared_taste_v1(p_concept_key text,p_active boolean,p_source_kind text default 'PROFILE')
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid:=auth.uid();v_id uuid;v_revision integer;v_now timestamptz:=now();v_event text;
begin
 if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_source_kind<>'PROFILE' then raise exception 'source_kind_not_client_writable' using errcode='42501'; end if;
 if not exists(select 1 from public.backyrd_taste_concepts_v1 where concept_key=p_concept_key) then raise exception 'canonical_concept_invalid' using errcode='22023'; end if;
 select id into v_id from public.backyrd_self_declared_taste_v1 where user_id=v_user and concept_key=p_concept_key and source_kind='PROFILE' and spot_id is null for update;
 if v_id is null then
  insert into public.backyrd_self_declared_taste_v1(user_id,concept_key,source_kind,state,corrected_at) values(v_user,p_concept_key,'PROFILE',case when p_active then 'ACTIVE' else 'REMOVED' end,case when p_active then null else v_now end) returning id,revision into v_id,v_revision;
 else
  update public.backyrd_self_declared_taste_v1 set state=case when p_active then 'ACTIVE' else 'REMOVED' end,corrected_at=case when p_active then null else v_now end,revision=revision+1,semantic_contract_version='backyrd-canonical-semantics-v1' where id=v_id returning revision into v_revision;
 end if;
 v_event:=case when p_active then 'onboarding_preference' else 'memory_correction' end;
 perform public.backyrd_ingest_memory_event_v1(jsonb_build_object(
  'userId',v_user,'idempotencyKey','self-declared:'||v_id||':'||v_revision,'eventType',v_event,'occurredAt',v_now,'observedAt',v_now,'ingestedAt',v_now,
  'sessionId','self-declared:PROFILE','momentSignature','{}'::jsonb,
  'spotEvidence',case when p_active then jsonb_build_object('concepts',jsonb_build_array(p_concept_key)) else '{}'::jsonb end,
  'provenance',jsonb_build_object('source','SELF_DECLARED','sourceVersion','backyrd-canonical-semantics-v1','sourceEventId',v_id||':'||v_revision),
  'consentPurpose','personalized_recommendations','consentState','granted','contractVersion','backyrd-memory-event-contract-v1'
 ));
 return jsonb_build_object('id',v_id,'state',case when p_active then 'ACTIVE' else 'REMOVED' end,'evidenceAuthority','SELF_DECLARED','semanticContractVersion','backyrd-canonical-semantics-v1');
end $$;

create or replace function public.complete_decision_onboarding_v2(p_city text,p_spot_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_user uuid:=auth.uid();v_ids uuid[];v_count integer;v_spot uuid;v_snapshot text;v_inserted integer:=0;v_now timestamptz:=now();r record;v_id uuid;v_revision integer;
begin
 if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into v_ids from unnest(coalesce(p_spot_ids,'{}'::uuid[])) id where id is not null;
 v_count:=coalesce(cardinality(v_ids),0);if v_count<3 or v_count>8 then raise exception 'onboarding_spot_count_invalid';end if;
 if (select count(*) from public.spots where id=any(v_ids) and status='approved' and data_origin not in ('FIXTURE','TEST'))<>v_count then raise exception 'onboarding_spot_invalid';end if;
 insert into public.profiles(id,city,home_city,created_at,updated_at) values(v_user,p_city,p_city,now(),now()) on conflict(id) do update set city=coalesce(public.profiles.city,excluded.city),home_city=coalesce(public.profiles.home_city,excluded.home_city),updated_at=now();
 perform public.save_favorite_spot_seeds_v1(p_city:=p_city,p_spot_ids:=v_ids,p_raw_names:='{}'::text[]);
 foreach v_spot in array v_ids loop
  select snapshot_identity into v_snapshot from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) where spot_id=v_spot and available;
  if v_snapshot is null then continue;end if;
  for r in select c->>'concept' concept from public.backyrd_read_n4_for_user_intelligence_v1(array[v_spot]) n cross join lateral jsonb_array_elements(n.concepts)c join public.backyrd_taste_concepts_v1 t on t.concept_key=c->>'concept' where n.spot_id=v_spot and (c->>'confidence')::numeric>=.35 loop
   insert into public.backyrd_self_declared_taste_v1(user_id,concept_key,source_kind,spot_id,source_n4_snapshot_identity,state)
   values(v_user,r.concept,'DECISION_ONBOARDING',v_spot,v_snapshot,'ACTIVE')
   on conflict(user_id,concept_key,source_kind,spot_id) do update set
     revision=case when backyrd_self_declared_taste_v1.state<>'ACTIVE' or backyrd_self_declared_taste_v1.source_n4_snapshot_identity is distinct from excluded.source_n4_snapshot_identity then backyrd_self_declared_taste_v1.revision+1 else backyrd_self_declared_taste_v1.revision end,
     state='ACTIVE',source_n4_snapshot_identity=excluded.source_n4_snapshot_identity,corrected_at=null
   returning id,revision into v_id,v_revision;
   perform public.backyrd_ingest_memory_event_v1(jsonb_build_object(
    'userId',v_user,'idempotencyKey','self-declared:'||v_id||':'||v_revision,'eventType','onboarding_preference','occurredAt',v_now,'observedAt',v_now,'ingestedAt',v_now,
    'sessionId','decision-onboarding-v2','spotId',v_spot,'momentSignature','{}'::jsonb,'spotEvidence',jsonb_build_object('concepts',jsonb_build_array(r.concept)),
    'provenance',jsonb_build_object('source','SELF_DECLARED','sourceVersion','backyrd-canonical-semantics-v1','sourceEventId',v_id||':'||v_revision),
    'consentPurpose','personalized_recommendations','consentState','granted','contractVersion','backyrd-memory-event-contract-v1'
   ));
   v_inserted:=v_inserted+1;
  end loop;
 end loop;
 update public.profiles set decision_onboarding_completed_at=now(),onboarding_version='canonical-semantics-v1',updated_at=now() where id=v_user;
 return jsonb_build_object('ok',true,'selectedCount',v_count,'declaredEvidenceCount',v_inserted,'semanticContractVersion','backyrd-canonical-semantics-v1');
end $$;

-- Service-only operational health; counts and watermarks only, no raw content.
create or replace function public.backyrd_user_learning_health_v1()
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
 select case when auth.role()<>'service_role' then null else jsonb_build_object(
  'memoryBridgeByState',(select coalesce(jsonb_object_agg(state,count),'{}'::jsonb) from(select state,count(*)::int count from public.backyrd_memory_bridge_outbox_v1 group by state)s),
  'workerByState',(select coalesce(jsonb_object_agg(state,count),'{}'::jsonb) from(select state,count(*)::int count from public.backyrd_user_intelligence_work_v1 group by state)s),
  'oldestPendingWatermark',(select min(m.ingested_at) from public.backyrd_user_intelligence_work_v1 w join public.backyrd_memory_events_v1 m on m.id=w.source_memory_event_id where w.state in('PENDING','RETRYABLE','PROCESSING')),
  'oldestFailedWatermark',(select min(m.ingested_at) from public.backyrd_user_intelligence_work_v1 w join public.backyrd_memory_events_v1 m on m.id=w.source_memory_event_id where w.state='FAILED'),
  'latestCardCommit',(select max(updated_at) from public.backyrd_user_intelligence_latest_v1),
  'failureCodes',(select coalesce(jsonb_object_agg(failure_code,count),'{}'::jsonb) from(select coalesce(failure_code,'NONE') failure_code,count(*)::int count from public.backyrd_user_intelligence_work_v1 where state='FAILED' group by failure_code)s)
 ) end
$$;

-- Safe replay of existing canonical N2 work only. No event is inserted and no
-- Legacy source is reinterpreted.
update public.backyrd_user_intelligence_work_v1 set
  state='PENDING',attempts=0,available_at=now(),locked_at=null,lease_token=null,target_watermark=null,claimed_at=null,
  failure_code=null,processing_reason='RECOVER_N4_TASTE_BOUNDARY_V1',updated_at=now()
where state='FAILED' and failure_code like '%unknown_spot_evidence_concept%';

revoke all on function public.backyrd_memory_bridge_enqueue_visible_impression_v1(),public.backyrd_memory_bridge_enqueue_decision_feedback_v1(),public.backyrd_memory_bridge_decision_moment_v1(uuid),public.backyrd_memory_bridge_enqueue_standard_review_v1(),public.backyrd_user_learning_health_v1() from public,anon,authenticated;
grant execute on function public.backyrd_user_learning_health_v1() to service_role;
grant execute on function public.backyrd_set_self_declared_taste_v1(text,boolean,text),public.complete_decision_onboarding_v2(text,uuid[]) to authenticated,service_role;

comment on function public.backyrd_user_learning_health_v1() is 'Secret-safe Product-to-N2 and User Intelligence queue health. Service role only.';
