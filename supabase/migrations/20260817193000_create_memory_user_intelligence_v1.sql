-- N2: canonical consented Memory ledger and User Intelligence graph foundation.
-- Additive and lab/code validated only. No existing Product source is wired or backfilled here.

create table public.backyrd_memory_event_types_v1 (
  event_type text primary key,
  event_class text not null check (event_class in (
    'REQUEST','EXPOSURE','WEAK_INTERACTION','DELIBERATE_INTENT',
    'OUTCOME','EXPLICIT_FEEDBACK','ONBOARDING','CORRECTION'
  )),
  evidence_family text not null,
  retention_class text not null,
  taste_event_type text,
  direction smallint not null default 0 check (direction in (-1,0,1)),
  learning_eligible boolean not null default false,
  pattern_eligible boolean not null default false,
  outcome_support boolean not null default false,
  contract_version text not null default 'backyrd-memory-event-contract-v1',
  created_at timestamptz not null default now()
);

insert into public.backyrd_memory_event_types_v1(
  event_type,event_class,evidence_family,retention_class,taste_event_type,
  direction,learning_eligible,pattern_eligible,outcome_support
) values
  ('decision_request','REQUEST','request','REQUEST_MINIMIZED',null,0,false,false,false),
  ('structured_intent_recorded','REQUEST','request','REQUEST_MINIMIZED',null,0,false,false,false),
  ('moment_signature_recorded','REQUEST','moment','REQUEST_MINIMIZED',null,0,false,false,false),
  ('decision_results_shown','EXPOSURE','exposure','EXPOSURE','decision_shown',0,true,false,false),
  ('candidate_exposed','EXPOSURE','exposure','EXPOSURE','decision_shown',0,true,false,false),
  ('spot_tapped','WEAK_INTERACTION','interaction','WEAK_INTERACTION','spot_tapped',1,true,false,false),
  ('search_result_opened','WEAK_INTERACTION','interaction','WEAK_INTERACTION','search_result_opened',1,true,false,false),
  ('spot_opened','WEAK_INTERACTION','interaction','WEAK_INTERACTION','spot_opened',1,true,false,false),
  ('saved','DELIBERATE_INTENT','commitment','DELIBERATE_INTENT','saved',1,true,true,false),
  ('save_removed','DELIBERATE_INTENT','state_change','DELIBERATE_INTENT','save_removed',0,true,false,false),
  ('navigation_intent','DELIBERATE_INTENT','commitment','DELIBERATE_INTENT','navigation_intent',1,true,true,false),
  ('reservation_intent','DELIBERATE_INTENT','commitment','DELIBERATE_INTENT','reservation_intent',1,true,true,false),
  ('verified_visit','OUTCOME','outcome','OUTCOME','verified_visit',1,true,true,true),
  ('positive_post_visit','EXPLICIT_FEEDBACK','outcome','EXPLICIT_FEEDBACK','positive_post_visit',1,true,true,true),
  ('negative_post_visit','EXPLICIT_FEEDBACK','explicit_negative','EXPLICIT_FEEDBACK','negative_post_visit',-1,true,true,true),
  ('exact_mood_feedback','EXPLICIT_FEEDBACK','explicit','EXPLICIT_FEEDBACK','exact_mood_feedback',1,true,true,true),
  ('explicit_positive','EXPLICIT_FEEDBACK','explicit','EXPLICIT_FEEDBACK','liked',1,true,true,true),
  ('explicit_negative','EXPLICIT_FEEDBACK','explicit_negative','EXPLICIT_FEEDBACK','disliked',-1,true,true,true),
  ('not_there','CORRECTION','correction','CORRECTION','not_there',0,true,false,false),
  ('remix_requested','REQUEST','request','REQUEST_MINIMIZED',null,0,false,false,false),
  ('onboarding_preference','ONBOARDING','onboarding','ONBOARDING','onboarding_preference',1,true,false,false),
  ('memory_correction','CORRECTION','correction','CORRECTION',null,0,false,false,false);

create table public.backyrd_memory_retention_contract_v1 (
  retention_class text primary key,
  max_age_days integer not null check (max_age_days between 1 and 3650),
  purpose text not null,
  deletion_behavior text not null check (deletion_behavior in ('DELETE_AND_REBUILD','DELETE_IMMEDIATELY')),
  contract_version text not null default 'backyrd-memory-retention-v1',
  created_at timestamptz not null default now()
);

insert into public.backyrd_memory_retention_contract_v1(retention_class,max_age_days,purpose,deletion_behavior) values
  ('REQUEST_MINIMIZED',30,'Short-lived minimized request/moment context; not durable Taste by itself.','DELETE_AND_REBUILD'),
  ('EXPOSURE',90,'Debiasing and Decision attribution context; never positive preference alone.','DELETE_AND_REBUILD'),
  ('WEAK_INTERACTION',180,'Bounded weak behavioral evidence.','DELETE_AND_REBUILD'),
  ('DELIBERATE_INTENT',365,'Purposeful Product action evidence.','DELETE_AND_REBUILD'),
  ('OUTCOME',730,'High-value verified behavioral Outcome evidence.','DELETE_AND_REBUILD'),
  ('EXPLICIT_FEEDBACK',730,'User-declared experience evidence.','DELETE_AND_REBUILD'),
  ('ONBOARDING',730,'Correctable initial preference evidence.','DELETE_AND_REBUILD'),
  ('CORRECTION',730,'Append-only correction chain needed for reconstruction.','DELETE_AND_REBUILD');

create table public.backyrd_memory_source_adapters_v1 (
  source_table text not null,
  source_event_type text not null,
  canonical_event_type text references public.backyrd_memory_event_types_v1(event_type),
  mapping_status text not null check (mapping_status in ('SUPPORTED','REQUIRES_SEMANTIC_QUALIFICATION','AMBIGUOUS','NOT_ELIGIBLE')),
  notes text not null,
  adapter_version text not null default 'backyrd-memory-source-adapters-v1',
  primary key (source_table, source_event_type)
);

insert into public.backyrd_memory_source_adapters_v1 values
  ('decision_sessions','decision_created','decision_request','SUPPORTED','Minimize to structured intent and moment signature; do not copy raw request text.','backyrd-memory-source-adapters-v1'),
  ('decision_impressions','candidate_shown','candidate_exposed','SUPPORTED','Preserve rank/propensity when available; exposure is neutral.','backyrd-memory-source-adapters-v1'),
  ('analytics_events','spot_opened','spot_opened','SUPPORTED','Weak evidence only when personalization consent exists.','backyrd-memory-source-adapters-v1'),
  ('favorites','favorite_created','saved','SUPPORTED','Stable source ID required; deletion maps to save_removed.','backyrd-memory-source-adapters-v1'),
  ('backyrd_ml_events_v1','decision_open','spot_opened','SUPPORTED','Existing event semantics map to weak interaction.','backyrd-memory-source-adapters-v1'),
  ('backyrd_ml_events_v1','favorite_add','saved','SUPPORTED','Existing commitment signal.','backyrd-memory-source-adapters-v1'),
  ('backyrd_ml_events_v1','spot_detail_view','verified_visit','AMBIGUOUS','A detail view does not prove a visit; never auto-migrate as verified_visit.','backyrd-memory-source-adapters-v1'),
  ('reviews','review_created',null,'REQUIRES_SEMANTIC_QUALIFICATION','Direction and declared concepts require explicit review/mood semantics.','backyrd-memory-source-adapters-v1'),
  ('user_taste_events_v2','legacy_taste_event',null,'AMBIGUOUS','Legacy factor lacks the full N2 provenance/consent/context envelope.','backyrd-memory-source-adapters-v1'),
  ('backyrd_taste_evidence_v1','wave3a_evidence',null,'SUPPORTED','Consumed as existing validated derived-learning evidence; not duplicated as historical Memory.','backyrd-memory-source-adapters-v1');

create table public.backyrd_memory_events_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  event_type text not null references public.backyrd_memory_event_types_v1(event_type),
  event_class text not null,
  evidence_family text not null,
  occurred_at timestamptz not null,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  session_id text,
  decision_id uuid,
  spot_id uuid references public.spots(id) on delete set null,
  moment_signature jsonb not null default '{}'::jsonb,
  spot_evidence jsonb not null default '{}'::jsonb,
  provenance jsonb not null,
  consent_purpose text not null default 'personalized_recommendations',
  consent_state text not null check (consent_state = 'granted'),
  exposure_rank integer check (exposure_rank is null or exposure_rank between 1 and 500),
  exposure_propensity numeric check (exposure_propensity is null or (exposure_propensity > 0 and exposure_propensity <= 1)),
  supersedes_event_id uuid references public.backyrd_memory_events_v1(id) on delete restrict,
  retention_class text not null references public.backyrd_memory_retention_contract_v1(retention_class),
  expires_at timestamptz not null,
  event_hash text not null check (event_hash ~ '^[0-9a-f]{64}$'),
  contract_version text not null default 'backyrd-memory-event-contract-v1',
  evidence_mapping_version text not null default 'backyrd-memory-evidence-mapping-v1',
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint backyrd_memory_event_time_order check (occurred_at <= observed_at and observed_at <= ingested_at),
  constraint backyrd_memory_event_not_future check (occurred_at <= ingested_at),
  constraint backyrd_memory_moment_is_object check (jsonb_typeof(moment_signature) = 'object'),
  constraint backyrd_memory_spot_evidence_is_object check (jsonb_typeof(spot_evidence) = 'object'),
  constraint backyrd_memory_provenance_is_object check (jsonb_typeof(provenance) = 'object')
);

comment on table public.backyrd_memory_events_v1 is
  'Immutable, purpose-limited N2 Memory ledger: what happened, never a stored preference conclusion.';

create index backyrd_memory_events_v1_user_time_idx on public.backyrd_memory_events_v1(user_id, occurred_at desc);
create index backyrd_memory_events_v1_user_class_time_idx on public.backyrd_memory_events_v1(user_id, event_class, occurred_at desc);
create index backyrd_memory_events_v1_user_session_idx on public.backyrd_memory_events_v1(user_id, session_id) where session_id is not null;
create index backyrd_memory_events_v1_expiry_idx on public.backyrd_memory_events_v1(expires_at);
create index backyrd_memory_events_v1_supersedes_idx on public.backyrd_memory_events_v1(supersedes_event_id) where supersedes_event_id is not null;

create table public.backyrd_user_behavior_patterns_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern_key text not null,
  context_signature jsonb not null check (jsonb_typeof(context_signature) = 'object'),
  state text not null check (state in ('KNOWN','UNKNOWN')),
  confidence numeric not null check (confidence between 0 and 1),
  evidence_count integer not null check (evidence_count >= 0),
  independent_session_count integer not null check (independent_session_count >= 0),
  independent_spot_count integer not null check (independent_spot_count >= 0),
  outcome_support_count integer not null check (outcome_support_count >= 0),
  positive_count integer not null check (positive_count >= 0),
  negative_count integer not null check (negative_count >= 0),
  contradiction_rate numeric not null check (contradiction_rate between 0 and 1),
  first_evidence_at timestamptz,
  last_evidence_at timestamptz,
  recency_state text not null check (recency_state in ('CURRENT','AGING','STALE','UNKNOWN')),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  pattern_contract_version text not null default 'backyrd-behavioral-pattern-contract-v1',
  confidence_contract_version text not null default 'backyrd-user-intelligence-confidence-v1',
  calculated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, pattern_key)
);

create index backyrd_user_behavior_patterns_v1_query_idx
  on public.backyrd_user_behavior_patterns_v1(user_id, state, confidence desc);

create table public.backyrd_user_intelligence_state_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  knowledge_state text not null check (knowledge_state in ('COLD','EARLY','DEVELOPING','MATURE','LONG_TERM','UNKNOWN')),
  source_event_count integer not null default 0 check (source_event_count >= 0),
  source_watermark timestamptz,
  taste_map_fingerprint text,
  pattern_fingerprint text,
  contradictions jsonb not null default '[]'::jsonb check (jsonb_typeof(contradictions) = 'array'),
  calculated_at timestamptz not null,
  user_intelligence_schema_version text not null default 'backyrd-user-intelligence-schema-v1',
  evidence_mapping_version text not null default 'backyrd-memory-evidence-mapping-v1',
  updated_at timestamptz not null default now(),
  constraint backyrd_user_intelligence_taste_hash check (taste_map_fingerprint is null or taste_map_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint backyrd_user_intelligence_pattern_hash check (pattern_fingerprint is null or pattern_fingerprint ~ '^[0-9a-f]{64}$')
);

create or replace function public.backyrd_memory_forbidden_json_v1(p_value jsonb)
returns boolean language sql immutable parallel safe
set search_path = public, pg_catalog
as $$
  select coalesce(p_value::text ~* '"[^" ]*(latent|ground[_-]?truth|oracle|expected[_-]?utility|fingerprint|contact|wifi|advertising[_-]?id|trust[_-]?score|moderation)[^" ]*"', false);
$$;

create or replace function public.backyrd_memory_validate_insert_v1()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog, extensions
as $$
declare
  v_type public.backyrd_memory_event_types_v1%rowtype;
  v_retention public.backyrd_memory_retention_contract_v1%rowtype;
  v_existing public.backyrd_memory_events_v1%rowtype;
  v_allowed_keys text[] := array['audience','daypart','calendar','occasion','placeType','friction','distanceWillingness'];
begin
  if not public.user_has_active_consent_v1(new.user_id, 'personalized_recommendations')
     or new.consent_purpose <> 'personalized_recommendations'
     or new.consent_state <> 'granted' then
    raise exception 'personalization_consent_required' using errcode = '42501';
  end if;
  if new.contract_version <> 'backyrd-memory-event-contract-v1' then
    raise exception 'memory_contract_version_mismatch' using errcode = '22023';
  end if;
  if new.occurred_at > now() or new.observed_at > now() or new.ingested_at > now() + interval '1 minute' then
    raise exception 'future_memory_event_not_allowed' using errcode = '22023';
  end if;
  if public.backyrd_memory_forbidden_json_v1(new.moment_signature)
     or public.backyrd_memory_forbidden_json_v1(new.spot_evidence)
     or public.backyrd_memory_forbidden_json_v1(new.provenance) then
    raise exception 'forbidden_memory_field' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(new.moment_signature) key where key <> all(v_allowed_keys)) then
    raise exception 'unsupported_moment_field' using errcode = '22023';
  end if;
  if new.moment_signature ? 'audience' and new.moment_signature->>'audience' not in ('solo','date','friends','family','work','other')
     or new.moment_signature ? 'daypart' and new.moment_signature->>'daypart' not in ('morning','afternoon','evening','night')
     or new.moment_signature ? 'calendar' and new.moment_signature->>'calendar' not in ('weekday','weekend')
     or new.moment_signature ? 'placeType' and new.moment_signature->>'placeType' not in ('cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other')
     or new.moment_signature ? 'friction' and new.moment_signature->>'friction' not in ('low','medium','high')
     or new.moment_signature ? 'distanceWillingness' and new.moment_signature->>'distanceWillingness' not in ('near','moderate','far') then
    raise exception 'invalid_moment_value' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(new.spot_evidence) key where key not in ('placeType','concepts'))
     or exists (select 1 from jsonb_object_keys(new.provenance) key where key not in ('source','sourceEventId','sourceVersion')) then
    raise exception 'unsupported_memory_evidence_field' using errcode = '22023';
  end if;
  if new.spot_evidence ? 'placeType' and new.spot_evidence->>'placeType' not in ('cafe','bar','restaurant','nightlife','culture','outing','activity','experience','hotel','other') then
    raise exception 'unknown_place_type' using errcode = '22023';
  end if;
  if new.spot_evidence ? 'concepts' and (
    jsonb_typeof(new.spot_evidence->'concepts') <> 'array' or exists (
      select 1 from jsonb_array_elements_text(new.spot_evidence->'concepts') as concepts(concept)
      where not exists (select 1 from public.backyrd_taste_concepts_v1 registry where registry.concept_key=concept)
    )
  ) then raise exception 'unknown_spot_evidence_concept' using errcode = '22023'; end if;
  if coalesce(new.provenance->>'source','') = '' or coalesce(new.provenance->>'sourceEventId','') = '' then
    raise exception 'memory_provenance_required' using errcode = '22023';
  end if;
  select * into strict v_type from public.backyrd_memory_event_types_v1 where event_type = new.event_type;
  select * into strict v_retention from public.backyrd_memory_retention_contract_v1 where retention_class = v_type.retention_class;
  new.event_class := v_type.event_class;
  new.evidence_family := v_type.evidence_family;
  new.retention_class := v_type.retention_class;
  new.expires_at := new.occurred_at + make_interval(days => v_retention.max_age_days);
  if new.expires_at <= new.ingested_at then
    raise exception 'stale_memory_event_outside_retention' using errcode = '22023';
  end if;
  new.event_hash := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'userId',new.user_id,'idempotencyKey',new.idempotency_key,'eventType',new.event_type,
      'occurredAt',new.occurred_at,'observedAt',new.observed_at,'sessionId',new.session_id,
      'decisionId',new.decision_id,'spotId',new.spot_id,'momentSignature',new.moment_signature,
      'spotEvidence',new.spot_evidence,'provenance',new.provenance,'supersedesEventId',new.supersedes_event_id,
      'contractVersion',new.contract_version
    )::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.backyrd_memory_events_v1
    where user_id = new.user_id and idempotency_key = new.idempotency_key;
  if found and v_existing.event_hash <> new.event_hash then
    raise exception 'memory_idempotency_conflict' using errcode = '23505';
  end if;
  if new.supersedes_event_id is not null and not exists (
    select 1 from public.backyrd_memory_events_v1 prior
    where prior.id = new.supersedes_event_id and prior.user_id = new.user_id and prior.occurred_at <= new.occurred_at
  ) then
    raise exception 'invalid_memory_supersession' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger trg_backyrd_memory_events_v1_validate
before insert on public.backyrd_memory_events_v1
for each row execute function public.backyrd_memory_validate_insert_v1();

create or replace function public.backyrd_memory_reject_mutation_v1()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog
as $$ begin raise exception 'memory_events_are_immutable' using errcode = '55000'; end; $$;

create trigger trg_backyrd_memory_events_v1_immutable
before update on public.backyrd_memory_events_v1
for each row execute function public.backyrd_memory_reject_mutation_v1();

create or replace function public.backyrd_ingest_memory_event_v1(p_event jsonb)
returns table(event_id uuid,event_hash text,inserted boolean)
language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare v_id uuid := coalesce(nullif(p_event->>'id','')::uuid,gen_random_uuid()); v_row_count integer := 0;
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then raise exception 'invalid_memory_event' using errcode='22023'; end if;
  if public.backyrd_memory_forbidden_json_v1(p_event) then raise exception 'forbidden_memory_field' using errcode='22023'; end if;
  insert into public.backyrd_memory_events_v1(
    id,user_id,idempotency_key,event_type,event_class,evidence_family,
    occurred_at,observed_at,ingested_at,session_id,decision_id,spot_id,
    moment_signature,spot_evidence,provenance,consent_purpose,consent_state,
    exposure_rank,exposure_propensity,supersedes_event_id,retention_class,
    expires_at,event_hash,contract_version,evidence_mapping_version
  ) values (
    v_id,(p_event->>'userId')::uuid,p_event->>'idempotencyKey',p_event->>'eventType','','',
    (p_event->>'occurredAt')::timestamptz,coalesce((p_event->>'observedAt')::timestamptz,(p_event->>'occurredAt')::timestamptz),
    coalesce((p_event->>'ingestedAt')::timestamptz,now()),nullif(p_event->>'sessionId',''),nullif(p_event->>'decisionId','')::uuid,
    nullif(p_event->>'spotId','')::uuid,coalesce(p_event->'momentSignature','{}'::jsonb),coalesce(p_event->'spotEvidence','{}'::jsonb),
    coalesce(p_event->'provenance','{}'::jsonb),p_event->>'consentPurpose',p_event->>'consentState',
    nullif(p_event#>>'{exposure,rank}','')::integer,nullif(p_event#>>'{exposure,propensity}','')::numeric,
    nullif(p_event->>'supersedesEventId','')::uuid,'',now(),'',(p_event->>'contractVersion'),'backyrd-memory-evidence-mapping-v1'
  ) on conflict (user_id,idempotency_key) do nothing;
  get diagnostics v_row_count = row_count;
  return query select m.id,m.event_hash,(v_row_count = 1) from public.backyrd_memory_events_v1 m
    where m.user_id=(p_event->>'userId')::uuid and m.idempotency_key=p_event->>'idempotencyKey';
end;
$$;

create or replace function public.backyrd_purge_user_memory_v1(p_user_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare v_memory integer; v_patterns integer; v_state integer; v_taste_evidence integer; v_taste_map integer;
begin
  delete from public.backyrd_user_behavior_patterns_v1 where user_id = p_user_id; get diagnostics v_patterns = row_count;
  delete from public.backyrd_user_intelligence_state_v1 where user_id = p_user_id; get diagnostics v_state = row_count;
  delete from public.backyrd_taste_evidence_v1 where user_id = p_user_id; get diagnostics v_taste_evidence = row_count;
  delete from public.backyrd_user_taste_map_v1 where user_id = p_user_id; get diagnostics v_taste_map = row_count;
  delete from public.backyrd_memory_events_v1 where user_id = p_user_id; get diagnostics v_memory = row_count;
  return jsonb_build_object('memory',v_memory,'patterns',v_patterns,'state',v_state,'tasteEvidence',v_taste_evidence,'tasteMap',v_taste_map);
end;
$$;

create or replace function public.backyrd_memory_consent_withdrawal_v1()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog
as $$
begin
  if new.purpose_key = 'personalized_recommendations' and new.status = 'withdrawn'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.backyrd_purge_user_memory_v1(new.user_id);
  end if;
  return new;
end;
$$;

create trigger trg_backyrd_memory_consent_withdrawal_v1
after insert or update of status on public.user_consents
for each row execute function public.backyrd_memory_consent_withdrawal_v1();

create or replace function public.backyrd_memory_profile_erasure_v1()
returns trigger language plpgsql security definer
set search_path = public, pg_catalog
as $$ begin perform public.backyrd_purge_user_memory_v1(old.id); return old; end; $$;

create trigger trg_backyrd_memory_profile_erasure_v1
before delete on public.profiles
for each row execute function public.backyrd_memory_profile_erasure_v1();

create or replace function public.backyrd_apply_memory_retention_v1(p_limit integer default 5000)
returns jsonb language plpgsql security definer
set search_path = public, pg_catalog
as $$
declare v_users uuid[]; v_event_ids uuid[]; v_deleted integer;
begin
  select array_agg(id),array_agg(distinct user_id) into v_event_ids,v_users from (
    select id,user_id from public.backyrd_memory_events_v1 where expires_at <= now()
    order by expires_at limit greatest(1,least(coalesce(p_limit,5000),50000))
  ) expired;
  if v_event_ids is not null then
    delete from public.backyrd_taste_evidence_v1 where source_event_id in (select unnest(v_event_ids)::text);
  end if;
  delete from public.backyrd_memory_events_v1 where id = any(coalesce(v_event_ids,'{}'::uuid[]));
  get diagnostics v_deleted = row_count;
  if v_users is not null then
    delete from public.backyrd_user_behavior_patterns_v1 where user_id = any(v_users);
    delete from public.backyrd_user_intelligence_state_v1 where user_id = any(v_users);
    delete from public.backyrd_user_taste_map_v1 where user_id = any(v_users);
  end if;
  return jsonb_build_object('deletedEvents',v_deleted,'rebuildRequiredUsers',coalesce(cardinality(v_users),0));
end;
$$;

create or replace function public.backyrd_get_my_user_intelligence_v1()
returns jsonb language sql stable security definer
set search_path = public, pg_catalog
as $$
  select case
    when auth.uid() is null or not public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations') then
      jsonb_build_object('knowledgeState','UNKNOWN','taste',jsonb_build_array(),'patterns',jsonb_build_array())
    else jsonb_build_object(
      'knowledgeState',coalesce(s.knowledge_state,'COLD'),
      'asOf',s.calculated_at,
      'taste',coalesce((select jsonb_agg(jsonb_build_object(
        'concept',t.concept_key,'scopeKind',t.scope_kind,'scopeKey',t.scope_key,
        'affinity',t.affinity,'confidence',t.confidence,'recency',t.decay_state
      ) order by abs(t.affinity)*t.confidence desc) from public.backyrd_user_taste_map_v1 t where t.user_id=auth.uid()),'[]'::jsonb),
      'patterns',coalesce((select jsonb_agg(jsonb_build_object(
        'patternKey',p.pattern_key,'context',p.context_signature,'confidence',p.confidence,'recency',p.recency_state
      ) order by p.confidence desc) from public.backyrd_user_behavior_patterns_v1 p where p.user_id=auth.uid() and p.state='KNOWN'),'[]'::jsonb),
      'versions',jsonb_build_object('schema','backyrd-user-intelligence-schema-v1','memory','backyrd-memory-event-contract-v1')
    ) end
  from (select 1) anchor left join public.backyrd_user_intelligence_state_v1 s on s.user_id=auth.uid();
$$;

create or replace function public.backyrd_get_my_memory_timeline_v1(p_limit integer default 50)
returns table(occurred_at timestamptz,event_class text,event_type text,source_family text)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select m.occurred_at,m.event_class,m.event_type,m.evidence_family
  from public.backyrd_memory_events_v1 m
  where auth.uid() is not null and m.user_id=auth.uid()
    and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations')
  order by m.occurred_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

alter table public.backyrd_memory_event_types_v1 enable row level security;
alter table public.backyrd_memory_retention_contract_v1 enable row level security;
alter table public.backyrd_memory_source_adapters_v1 enable row level security;
alter table public.backyrd_memory_events_v1 enable row level security;
alter table public.backyrd_user_behavior_patterns_v1 enable row level security;
alter table public.backyrd_user_intelligence_state_v1 enable row level security;

create policy backyrd_memory_event_types_v1_no_client on public.backyrd_memory_event_types_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_memory_retention_contract_v1_no_client on public.backyrd_memory_retention_contract_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_memory_source_adapters_v1_no_client on public.backyrd_memory_source_adapters_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_memory_events_v1_no_client on public.backyrd_memory_events_v1 for all to anon,authenticated using(false) with check(false);
create policy backyrd_user_behavior_patterns_v1_read_own on public.backyrd_user_behavior_patterns_v1 for select to authenticated
  using(auth.uid()=user_id and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations'));
create policy backyrd_user_intelligence_state_v1_read_own on public.backyrd_user_intelligence_state_v1 for select to authenticated
  using(auth.uid()=user_id and public.user_has_active_consent_v1(auth.uid(),'personalized_recommendations'));

revoke all on table public.backyrd_memory_event_types_v1,public.backyrd_memory_retention_contract_v1,
  public.backyrd_memory_source_adapters_v1,public.backyrd_memory_events_v1,
  public.backyrd_user_behavior_patterns_v1,public.backyrd_user_intelligence_state_v1 from anon,authenticated;
grant select on table public.backyrd_user_behavior_patterns_v1,public.backyrd_user_intelligence_state_v1 to authenticated;
grant all on table public.backyrd_memory_event_types_v1,public.backyrd_memory_retention_contract_v1,
  public.backyrd_memory_source_adapters_v1,public.backyrd_memory_events_v1,
  public.backyrd_user_behavior_patterns_v1,public.backyrd_user_intelligence_state_v1 to service_role;

revoke all on function public.backyrd_memory_forbidden_json_v1(jsonb),public.backyrd_memory_validate_insert_v1(),
  public.backyrd_memory_reject_mutation_v1(),public.backyrd_memory_consent_withdrawal_v1(),
  public.backyrd_memory_profile_erasure_v1() from public,anon,authenticated;
revoke all on function public.backyrd_purge_user_memory_v1(uuid),public.backyrd_apply_memory_retention_v1(integer) from public,anon,authenticated;
revoke all on function public.backyrd_ingest_memory_event_v1(jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_ingest_memory_event_v1(jsonb),public.backyrd_purge_user_memory_v1(uuid),public.backyrd_apply_memory_retention_v1(integer) to service_role;
revoke all on function public.backyrd_get_my_user_intelligence_v1(),public.backyrd_get_my_memory_timeline_v1(integer) from public,anon;
grant execute on function public.backyrd_get_my_user_intelligence_v1(),public.backyrd_get_my_memory_timeline_v1(integer) to authenticated,service_role;
