-- Temporal User-Evidence Attribution v1.
-- Additive only: freezes Decision-time context/N4, fails old unpinned events
-- closed, and exposes deterministic per-event processing dispositions.

create table public.backyrd_decision_evidence_envelopes_v1 (
  decision_id uuid primary key references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  moment_hash text not null check(moment_hash ~ '^[0-9a-f]{64}$'),
  package_hash text not null check(package_hash ~ '^[0-9a-f]{64}$'),
  semantic_contract_version text not null,
  moment_signature jsonb not null check(jsonb_typeof(moment_signature)='object'),
  requested_context jsonb not null check(jsonb_typeof(requested_context)='object'),
  ambient_context jsonb not null check(jsonb_typeof(ambient_context)='object'),
  envelope_version text not null default 'backyrd-decision-evidence-envelope-v1',
  created_at timestamptz not null default now(),
  unique(user_id,decision_id,package_hash)
);

create table public.backyrd_decision_candidate_evidence_v1 (
  decision_id uuid not null references public.backyrd_decision_evidence_envelopes_v1(decision_id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete restrict,
  n4_snapshot_hash text not null check(n4_snapshot_hash ~ '^[0-9a-f]{64}$'),
  n4_snapshot_identity text,
  n4_availability text not null check(n4_availability in ('FULL','PARTIAL','UNKNOWN')),
  place_type text check(place_type is null or place_type in ('cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other')),
  taste_concepts jsonb not null default '[]'::jsonb check(jsonb_typeof(taste_concepts)='array'),
  suitability_context jsonb not null default '{}'::jsonb check(jsonb_typeof(suitability_context)='object'),
  semantic_contract_version text not null,
  created_at timestamptz not null default now(),
  primary key(decision_id,spot_id),
  check(n4_availability<>'UNKNOWN' or jsonb_array_length(taste_concepts)=0)
);

create table public.backyrd_memory_event_evidence_envelopes_v1 (
  memory_event_id uuid primary key references public.backyrd_memory_events_v1(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid references public.decision_sessions(id) on delete set null,
  spot_id uuid references public.spots(id) on delete set null,
  source_kind text not null check(source_kind in ('DECISION_PACKAGE','EVENT_TIME_SPOT_READ','DIRECT_SEMANTIC','NO_ENVELOPE')),
  moment_signature jsonb not null default '{}'::jsonb check(jsonb_typeof(moment_signature)='object'),
  requested_context jsonb not null default '{}'::jsonb check(jsonb_typeof(requested_context)='object'),
  ambient_context jsonb not null default '{}'::jsonb check(jsonb_typeof(ambient_context)='object'),
  n4_snapshot_hash text check(n4_snapshot_hash is null or n4_snapshot_hash ~ '^[0-9a-f]{64}$'),
  n4_snapshot_identity text,
  n4_availability text not null check(n4_availability in ('FULL','PARTIAL','UNKNOWN','NOT_REQUIRED')),
  place_type text check(place_type is null or place_type in ('cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other')),
  taste_concepts jsonb not null default '[]'::jsonb check(jsonb_typeof(taste_concepts)='array'),
  suitability_context jsonb not null default '{}'::jsonb check(jsonb_typeof(suitability_context)='object'),
  attribution_disposition text not null,
  semantic_contract_version text not null,
  envelope_hash text not null check(envelope_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.backyrd_user_evidence_processing_v1 (
  memory_event_id uuid primary key references public.backyrd_memory_events_v1(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_id uuid references public.backyrd_user_intelligence_snapshots_v2(snapshot_id) on delete set null,
  processing_disposition text not null,
  evidence_count integer not null default 0 check(evidence_count between 0 and 1000),
  runtime_version text not null,
  source_watermark timestamptz not null,
  disposition_hash text not null check(disposition_hash ~ '^[0-9a-f]{64}$'),
  processed_at timestamptz not null default now()
);

create index backyrd_user_evidence_processing_user_time_v1 on public.backyrd_user_evidence_processing_v1(user_id,processed_at desc);

alter table public.backyrd_decision_evidence_envelopes_v1 enable row level security;
alter table public.backyrd_decision_candidate_evidence_v1 enable row level security;
alter table public.backyrd_memory_event_evidence_envelopes_v1 enable row level security;
alter table public.backyrd_user_evidence_processing_v1 enable row level security;
revoke all on public.backyrd_decision_evidence_envelopes_v1,public.backyrd_decision_candidate_evidence_v1,public.backyrd_memory_event_evidence_envelopes_v1,public.backyrd_user_evidence_processing_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_evidence_envelopes_v1,public.backyrd_decision_candidate_evidence_v1,public.backyrd_memory_event_evidence_envelopes_v1,public.backyrd_user_evidence_processing_v1 to service_role;

create or replace function public.backyrd_persist_decision_evidence_envelope_v1(
  p_decision_id uuid,p_user_id uuid,p_moment_hash text,p_package_hash text,p_semantic_contract_version text,
  p_moment_signature jsonb,p_requested_context jsonb,p_ambient_context jsonb,p_candidates jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_candidate jsonb;v_trace public.backyrd_decision_input_traces_v1%rowtype;v_spot uuid;v_hash text;v_existing public.backyrd_decision_evidence_envelopes_v1%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'decision_evidence_service_only' using errcode='42501';end if;
 select * into v_trace from public.backyrd_decision_input_traces_v1 where decision_id=p_decision_id and user_id=p_user_id and moment_hash=p_moment_hash and package_hash=p_package_hash;
 if not found then raise exception 'decision_evidence_trace_mismatch' using errcode='42501';end if;
 if p_semantic_contract_version is null or jsonb_typeof(p_moment_signature)<>'object' or jsonb_typeof(p_requested_context)<>'object' or jsonb_typeof(p_ambient_context)<>'object' or jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates)>50 then raise exception 'decision_evidence_invalid' using errcode='22023';end if;
 select * into v_existing from public.backyrd_decision_evidence_envelopes_v1 where decision_id=p_decision_id;
 if found then
  if v_existing.package_hash<>p_package_hash or v_existing.moment_hash<>p_moment_hash or v_existing.moment_signature<>p_moment_signature then raise exception 'decision_evidence_already_frozen' using errcode='23505';end if;
  return p_decision_id;
 end if;
 insert into public.backyrd_decision_evidence_envelopes_v1(decision_id,user_id,moment_hash,package_hash,semantic_contract_version,moment_signature,requested_context,ambient_context)
 values(p_decision_id,p_user_id,p_moment_hash,p_package_hash,p_semantic_contract_version,p_moment_signature,p_requested_context,p_ambient_context);
 for v_candidate in select value from jsonb_array_elements(p_candidates) loop
  v_spot:=nullif(v_candidate->>'spotId','')::uuid;v_hash:=v_candidate->>'n4SnapshotHash';
  if v_spot is null or v_hash is null or v_trace.n4_hashes->>v_spot::text is distinct from v_hash or not exists(select 1 from public.decision_impressions where decision_id=p_decision_id and spot_id=v_spot) then raise exception 'decision_candidate_evidence_mismatch' using errcode='42501';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(v_candidate->'tasteConcepts','[]'::jsonb)) c where not exists(select 1 from public.backyrd_taste_concepts_v1 t where t.concept_key=c->>'concept') or coalesce((c->>'confidence')::numeric,-1) not between 0 and 1) then raise exception 'decision_candidate_taste_invalid' using errcode='22023';end if;
  insert into public.backyrd_decision_candidate_evidence_v1(decision_id,spot_id,n4_snapshot_hash,n4_snapshot_identity,n4_availability,place_type,taste_concepts,suitability_context,semantic_contract_version)
  values(p_decision_id,v_spot,v_hash,nullif(v_candidate->>'n4SnapshotIdentity',''),v_candidate->>'availability',nullif(v_candidate->>'placeType',''),coalesce(v_candidate->'tasteConcepts','[]'::jsonb),coalesce(v_candidate->'suitabilityContext','{}'::jsonb),p_semantic_contract_version);
 end loop;
 return p_decision_id;
end $$;

create or replace function public.backyrd_capture_event_time_evidence_v1(p_spot_id uuid,p_decision_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_decision public.backyrd_decision_evidence_envelopes_v1%rowtype;v_candidate public.backyrd_decision_candidate_evidence_v1%rowtype;v_n4 record;v_concepts jsonb:='[]'::jsonb;v_disposition text;v_body jsonb;
begin
 if p_spot_id is null then return jsonb_build_object('sourceKind','NO_ENVELOPE','momentSignature','{}'::jsonb,'requestedContext','{}'::jsonb,'ambientContext','{}'::jsonb,'n4Availability','UNKNOWN','tasteConcepts','[]'::jsonb,'suitabilityContext','{}'::jsonb,'attributionDisposition','SPOT_ID_MISSING','semanticContractVersion','backyrd-canonical-semantics-v1');end if;
 if p_decision_id is not null then
  select * into v_decision from public.backyrd_decision_evidence_envelopes_v1 where decision_id=p_decision_id;
  select * into v_candidate from public.backyrd_decision_candidate_evidence_v1 where decision_id=p_decision_id and spot_id=p_spot_id;
  if v_decision.decision_id is null or v_candidate.spot_id is null then return jsonb_build_object('sourceKind','NO_ENVELOPE','momentSignature','{}'::jsonb,'requestedContext','{}'::jsonb,'ambientContext','{}'::jsonb,'n4Availability','UNKNOWN','tasteConcepts','[]'::jsonb,'suitabilityContext','{}'::jsonb,'attributionDisposition','DECISION_PACKAGE_UNAVAILABLE','semanticContractVersion','backyrd-canonical-semantics-v1');end if;
  v_disposition:=case when v_candidate.n4_availability='UNKNOWN' then 'NO_EVENT_TIME_N4' when jsonb_array_length(v_candidate.taste_concepts)=0 then 'NO_TASTE_AUTHORIZED_CONCEPTS' else 'PINNED_DECISION_EVIDENCE' end;
  return jsonb_build_object('sourceKind','DECISION_PACKAGE','momentSignature',v_decision.moment_signature,'requestedContext',v_decision.requested_context,'ambientContext',v_decision.ambient_context,'n4SnapshotHash',v_candidate.n4_snapshot_hash,'n4SnapshotIdentity',v_candidate.n4_snapshot_identity,'n4Availability',v_candidate.n4_availability,'placeType',v_candidate.place_type,'tasteConcepts',v_candidate.taste_concepts,'suitabilityContext',v_candidate.suitability_context,'attributionDisposition',v_disposition,'semanticContractVersion',v_candidate.semantic_contract_version);
 end if;
 select * into v_n4 from public.backyrd_read_n4_for_user_intelligence_v1(array[p_spot_id]) where spot_id=p_spot_id;
 if not found then return jsonb_build_object('sourceKind','EVENT_TIME_SPOT_READ','momentSignature','{}'::jsonb,'requestedContext','{}'::jsonb,'ambientContext','{}'::jsonb,'n4SnapshotHash',encode(extensions.digest(convert_to('UNKNOWN:'||p_spot_id::text,'UTF8'),'sha256'),'hex'),'n4Availability','UNKNOWN','tasteConcepts','[]'::jsonb,'suitabilityContext','{}'::jsonb,'attributionDisposition','NO_EVENT_TIME_N4','semanticContractVersion','backyrd-canonical-semantics-v1');end if;
 if not coalesce(v_n4.available,false) then return jsonb_build_object('sourceKind','EVENT_TIME_SPOT_READ','momentSignature','{}'::jsonb,'requestedContext','{}'::jsonb,'ambientContext','{}'::jsonb,'n4SnapshotHash',coalesce(v_n4.snapshot_identity,encode(extensions.digest(convert_to('UNKNOWN:'||p_spot_id::text,'UTF8'),'sha256'),'hex')),'n4SnapshotIdentity',v_n4.snapshot_identity,'n4Availability','UNKNOWN','placeType',v_n4.place_type,'tasteConcepts','[]'::jsonb,'suitabilityContext','{}'::jsonb,'attributionDisposition','NO_EVENT_TIME_N4','semanticContractVersion','backyrd-canonical-semantics-v1');end if;
 select coalesce(jsonb_agg(jsonb_build_object('concept',c->>'concept','confidence',(c->>'confidence')::numeric,'presence',(c->>'presence')::numeric) order by c->>'concept'),'[]'::jsonb) into v_concepts from jsonb_array_elements(v_n4.concepts)c join public.backyrd_taste_concepts_v1 t on t.concept_key=c->>'concept';
 v_disposition:=case when jsonb_array_length(v_concepts)=0 then 'NO_TASTE_AUTHORIZED_CONCEPTS' else 'PINNED_EVENT_TIME_N4' end;
 return jsonb_build_object('sourceKind','EVENT_TIME_SPOT_READ','momentSignature','{}'::jsonb,'requestedContext','{}'::jsonb,'ambientContext','{}'::jsonb,'n4SnapshotHash',v_n4.snapshot_identity,'n4SnapshotIdentity',v_n4.snapshot_identity,'n4Availability',case when v_n4.place_type is null then 'PARTIAL' else 'FULL' end,'placeType',v_n4.place_type,'tasteConcepts',v_concepts,'suitabilityContext','{}'::jsonb,'attributionDisposition',v_disposition,'semanticContractVersion','backyrd-canonical-semantics-v1');
end $$;

-- Capture bounded evidence at source-enqueue time, never at worker rebuild time.
create or replace function public.backyrd_memory_bridge_enqueue_v1(
  p_source_type text,p_source_id text,p_user_id uuid,p_event_type text,p_occurred_at timestamptz,
  p_session_id text default null,p_decision_id uuid default null,p_spot_id uuid default null,
  p_exposure_rank integer default null,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if not public.backyrd_memory_bridge_enabled_v1() then return;end if;
  if p_source_type not in ('decision_session','decision_impression','analytics_event','product_action','favorite','reservation','smart_review','standard_review') or p_event_type not in ('decision_request','candidate_exposed','spot_opened','saved','save_removed','navigation_intent','reservation_intent','verified_visit','exact_mood_feedback','not_there') or p_source_id is null or p_user_id is null or p_occurred_at is null then raise exception 'memory_bridge_invalid_source' using errcode='22023';end if;
  if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') then return;end if;
  if jsonb_typeof(v_metadata)<>'object' or v_metadata ?| array['text','moods','review_text','photo_url','token','secret','key'] then raise exception 'memory_bridge_invalid_metadata' using errcode='22023';end if;
  if p_event_type in ('spot_opened','saved','navigation_intent','reservation_intent','verified_visit','exact_mood_feedback','not_there') and p_spot_id is not null then v_metadata:=v_metadata||jsonb_build_object('evidenceEnvelope',public.backyrd_capture_event_time_evidence_v1(p_spot_id,p_decision_id));end if;
  insert into public.backyrd_memory_bridge_outbox_v1(source_type,source_id,user_id,canonical_event_type,occurred_at,session_id,decision_id,spot_id,exposure_rank,source_metadata)
  values(p_source_type,p_source_id,p_user_id,p_event_type,p_occurred_at,p_session_id,p_decision_id,p_spot_id,p_exposure_rank,v_metadata)
  on conflict(source_type,source_id,semantic_version,canonical_event_type) do nothing;
end $$;

-- Processor v3 consumes only the envelope frozen on the outbox row.
create or replace function public.backyrd_memory_bridge_process_v1(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_row public.backyrd_memory_bridge_outbox_v1%rowtype;v_result record;v_committed integer:=0;v_retryable integer:=0;v_failed integer:=0;v_suppressed integer:=0;v_event jsonb;v_code text;v_moment jsonb;v_spot_evidence jsonb;v_supersedes uuid;v_envelope jsonb;v_hash text;
begin
 if auth.role()<>'service_role' then raise exception 'memory_bridge_service_only' using errcode='42501';end if;
 perform public.backyrd_memory_bridge_recover_stale_v1();
 for v_i in 1..greatest(1,least(coalesce(p_limit,50),200)) loop
  with candidate as(select id from public.backyrd_memory_bridge_outbox_v1 where state in('PENDING','RETRYABLE') and available_at<=now() order by occurred_at,case when source_metadata->>'mapping'='decision_moment_feedback_v1' then coalesce((source_metadata->>'actionRevision')::integer,1) else 0 end,created_at,id for update skip locked limit 1)
  update public.backyrd_memory_bridge_outbox_v1 o set state='PROCESSING',locked_at=now(),attempts=o.attempts+1,updated_at=now() from candidate where o.id=candidate.id returning o.* into v_row;
  exit when not found;
  if not public.user_has_active_consent_v1(v_row.user_id,'personalized_recommendations') then delete from public.backyrd_memory_bridge_outbox_v1 where id=v_row.id;v_suppressed:=v_suppressed+1;continue;end if;
  v_envelope:=coalesce(v_row.source_metadata->'evidenceEnvelope','{}'::jsonb);
  v_moment:=coalesce(v_envelope->'momentSignature','{}'::jsonb);
  v_spot_evidence:='{}'::jsonb;
  if nullif(v_envelope->>'placeType','') is not null then v_spot_evidence:=v_spot_evidence||jsonb_build_object('placeType',v_envelope->>'placeType');end if;
  if jsonb_typeof(v_envelope->'tasteConcepts')='array' and jsonb_array_length(v_envelope->'tasteConcepts')>0 then v_spot_evidence:=v_spot_evidence||jsonb_build_object('concepts',(select jsonb_agg(c->>'concept' order by c->>'concept') from jsonb_array_elements(v_envelope->'tasteConcepts')c));end if;
  v_supersedes:=null;
  if v_row.source_metadata->>'mapping'='decision_moment_feedback_v1' then select prior.canonical_event_id into v_supersedes from public.backyrd_memory_bridge_outbox_v1 prior where prior.id<>v_row.id and prior.user_id=v_row.user_id and prior.state='COMMITTED' and prior.canonical_event_id is not null and prior.source_metadata->>'mapping'='decision_moment_feedback_v1' and prior.source_metadata->>'actionRowId'=v_row.source_metadata->>'actionRowId' and prior.occurred_at<=v_row.occurred_at order by prior.occurred_at desc,prior.id desc limit 1;end if;
  v_event:=jsonb_build_object('userId',v_row.user_id,'idempotencyKey',v_row.source_type||':'||v_row.source_id||':'||v_row.semantic_version||':'||v_row.canonical_event_type,'eventType',v_row.canonical_event_type,'contractVersion','backyrd-memory-event-contract-v1','occurredAt',v_row.occurred_at,'observedAt',v_row.occurred_at,'sessionId',v_row.session_id,'decisionId',v_row.decision_id,'spotId',v_row.spot_id,'momentSignature',v_moment,'spotEvidence',v_spot_evidence,'provenance',jsonb_build_object('source','product_memory_bridge','sourceEventId',v_row.source_type||':'||v_row.source_id,'sourceVersion',v_row.semantic_version),'consentPurpose','personalized_recommendations','consentState','granted','exposure',jsonb_build_object('rank',v_row.exposure_rank));
  if v_supersedes is not null then v_event:=v_event||jsonb_build_object('supersedesEventId',v_supersedes);end if;
  begin
   select * into v_result from public.backyrd_ingest_memory_event_v1(v_event);
   if v_row.spot_id is not null and v_row.canonical_event_type in('spot_opened','saved','navigation_intent','reservation_intent','verified_visit','exact_mood_feedback','not_there') then
    v_hash:=encode(digest(convert_to(jsonb_build_object('eventId',v_result.event_id,'envelope',v_envelope)::text,'UTF8'),'sha256'),'hex');
    insert into public.backyrd_memory_event_evidence_envelopes_v1(memory_event_id,user_id,decision_id,spot_id,source_kind,moment_signature,requested_context,ambient_context,n4_snapshot_hash,n4_snapshot_identity,n4_availability,place_type,taste_concepts,suitability_context,attribution_disposition,semantic_contract_version,envelope_hash)
    values(v_result.event_id,v_row.user_id,v_row.decision_id,v_row.spot_id,coalesce(nullif(v_envelope->>'sourceKind',''),'NO_ENVELOPE'),v_moment,coalesce(v_envelope->'requestedContext','{}'::jsonb),coalesce(v_envelope->'ambientContext','{}'::jsonb),nullif(v_envelope->>'n4SnapshotHash',''),nullif(v_envelope->>'n4SnapshotIdentity',''),coalesce(nullif(v_envelope->>'n4Availability',''),'UNKNOWN'),nullif(v_envelope->>'placeType',''),coalesce(v_envelope->'tasteConcepts','[]'::jsonb),coalesce(v_envelope->'suitabilityContext','{}'::jsonb),coalesce(nullif(v_envelope->>'attributionDisposition',''),'UNPINNED_HISTORICAL_FAIL_CLOSED'),coalesce(nullif(v_envelope->>'semanticContractVersion',''),'backyrd-canonical-semantics-v1'),v_hash)
    on conflict(memory_event_id) do nothing;
   end if;
   update public.backyrd_memory_bridge_outbox_v1 set state='COMMITTED',locked_at=null,committed_at=now(),canonical_event_id=v_result.event_id,canonical_event_hash=v_result.event_hash,updated_at=now(),failure_code=null where id=v_row.id;v_committed:=v_committed+1;
  exception when others then
   get stacked diagnostics v_code=returned_sqlstate;
   if v_code in('22023','23505') then update public.backyrd_memory_bridge_outbox_v1 set state='INVALID',locked_at=null,failure_code='ingestion_invalid:'||v_code,updated_at=now() where id=v_row.id;v_failed:=v_failed+1;
   elsif v_row.attempts>=8 then update public.backyrd_memory_bridge_outbox_v1 set state='FAILED',locked_at=null,failure_code='ingestion_failed:'||v_code,updated_at=now() where id=v_row.id;v_failed:=v_failed+1;
   else update public.backyrd_memory_bridge_outbox_v1 set state='RETRYABLE',locked_at=null,available_at=now()+make_interval(secs=>least(3600,5*power(2,v_row.attempts)::integer)),failure_code='ingestion_retryable:'||v_code,updated_at=now() where id=v_row.id;v_retryable:=v_retryable+1;end if;
  end;
 end loop;
 return jsonb_build_object('committed',v_committed,'retryable',v_retryable,'failed',v_failed,'suppressedConsent',v_suppressed);
end $$;

revoke all on function public.backyrd_persist_decision_evidence_envelope_v1(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb),public.backyrd_capture_event_time_evidence_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.backyrd_persist_decision_evidence_envelope_v1(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb),public.backyrd_capture_event_time_evidence_v1(uuid,uuid) to service_role;

create or replace function public.backyrd_persist_shared_user_intelligence_v3(
 p_user_id uuid,p_runtime_version text,p_input_contract_version text,p_source_watermark timestamptz,p_source_hash text,p_snapshot_hash text,
 p_card jsonb,p_nodes jsonb,p_ledger jsonb,p_dispositions jsonb,p_work_ids uuid[],p_lease_token uuid
) returns uuid language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_snapshot uuid;v_previous uuid;v_node jsonb;v_change jsonb;v_disposition jsonb;v_latest_watermark timestamptz;v_event uuid;v_disposition_hash text;
begin
 if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not public.user_has_active_consent_v1(p_user_id,'personalized_recommendations') or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_intelligence_consent_required' using errcode='42501';end if;
 if not exists(select 1 from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token and target_watermark=p_source_watermark and expires_at>now()) then raise exception 'user_intelligence_lease_invalid' using errcode='40001';end if;
 if jsonb_typeof(p_card)<>'object' or jsonb_typeof(p_nodes)<>'array' or jsonb_typeof(p_ledger)<>'array' or jsonb_typeof(p_dispositions)<>'array' or p_card->>'userId'<>p_user_id::text or p_card->>'userCardHash'<>p_snapshot_hash or p_snapshot_hash!~'^[0-9a-f]{64}$' or p_source_hash!~'^[0-9a-f]{64}$' or jsonb_array_length(p_nodes)<>(select count(distinct x->>'nodeKey') from jsonb_array_elements(p_nodes)x) then raise exception 'invalid_shared_runtime_result' using errcode='22023';end if;
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
 for v_disposition in select value from jsonb_array_elements(p_dispositions) loop
  v_event:=nullif(v_disposition->>'eventId','')::uuid;
  if v_event is null or not exists(select 1 from public.backyrd_memory_events_v1 where id=v_event and user_id=p_user_id and ingested_at<=p_source_watermark) then raise exception 'user_evidence_disposition_event_invalid' using errcode='22023';end if;
  v_disposition_hash:=encode(digest(convert_to(jsonb_build_object('eventId',v_event,'disposition',v_disposition->>'processingDisposition','evidenceCount',coalesce((v_disposition->>'evidenceCount')::integer,0),'envelopeHash',v_disposition->>'envelopeHash','runtimeVersion',p_runtime_version,'sourceWatermark',p_source_watermark)::text,'UTF8'),'sha256'),'hex');
  insert into public.backyrd_user_evidence_processing_v1(memory_event_id,user_id,snapshot_id,processing_disposition,evidence_count,runtime_version,source_watermark,disposition_hash,processed_at)
  values(v_event,p_user_id,v_snapshot,coalesce(nullif(v_disposition->>'processingDisposition',''),'NO_EVIDENCE'),coalesce((v_disposition->>'evidenceCount')::integer,0),p_runtime_version,p_source_watermark,v_disposition_hash,now())
  on conflict(memory_event_id) do update set snapshot_id=excluded.snapshot_id,processing_disposition=excluded.processing_disposition,evidence_count=excluded.evidence_count,runtime_version=excluded.runtime_version,source_watermark=excluded.source_watermark,disposition_hash=excluded.disposition_hash,processed_at=excluded.processed_at;
 end loop;
 insert into public.backyrd_user_intelligence_latest_v1(user_id,snapshot_id,source_watermark) values(p_user_id,v_snapshot,p_source_watermark) on conflict(user_id) do update set snapshot_id=excluded.snapshot_id,source_watermark=excluded.source_watermark,updated_at=now();
 update public.backyrd_user_intelligence_work_v1 set state='COMMITTED',locked_at=null,lease_token=null,updated_at=now() where source_memory_event_id=any(p_work_ids) and user_id=p_user_id and lease_token=p_lease_token;
 delete from public.backyrd_user_intelligence_user_leases_v1 where user_id=p_user_id and lease_token=p_lease_token;
 return v_snapshot;
end $$;

revoke all on function public.backyrd_persist_shared_user_intelligence_v3(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid) from public,anon,authenticated;
grant execute on function public.backyrd_persist_shared_user_intelligence_v3(uuid,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,uuid[],uuid) to service_role;

comment on table public.backyrd_decision_evidence_envelopes_v1 is 'Immutable bounded requested/ambient Decision context for event-time User Evidence attribution.';
comment on table public.backyrd_decision_candidate_evidence_v1 is 'Immutable candidate N4 envelope used by the Decision; later Spot enrichment cannot alter it.';
comment on table public.backyrd_memory_event_evidence_envelopes_v1 is 'Immutable event-time attribution source. Missing rows are historical UNPINNED and fail closed.';
comment on table public.backyrd_user_evidence_processing_v1 is 'Auditable per-event worker disposition without raw Product text.';
