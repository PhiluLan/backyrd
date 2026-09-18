-- Decision vNext Product runtime persistence boundary.
--
-- This is an additive, source-only migration. Applying it creates no enabled
-- Product release: generation zero is OFF and there is deliberately no ON RPC.
-- The existing Founder Live idempotency store remains untouched.

create schema if not exists decision_vnext_private;
revoke all on schema decision_vnext_private from public, anon, authenticated, service_role;

create table decision_vnext_private.product_runtime_control_events_v1 (
  generation bigint primary key check (generation >= 0),
  state text not null check (state in ('OFF','ON')),
  release_hash text check (release_hash is null or release_hash ~ '^[0-9a-f]{64}$'),
  artifact_hash text check (artifact_hash is null or artifact_hash ~ '^[0-9a-f]{64}$'),
  source_set_hash text check (source_set_hash is null or source_set_hash ~ '^[0-9a-f]{64}$'),
  reason_code text not null check (reason_code ~ '^[A-Z0-9_]{2,80}$'),
  authority_hash text not null check (authority_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  constraint product_runtime_control_binding_v1 check (
    (generation = 0 and state = 'OFF' and release_hash is null and artifact_hash is null and source_set_hash is null)
    or
    (generation > 0 and release_hash is not null and artifact_hash is not null and source_set_hash is not null)
  )
);

insert into decision_vnext_private.product_runtime_control_events_v1(
  generation,state,reason_code,authority_hash
) values (
  0,'OFF','DEFAULT_OFF',encode(extensions.digest(convert_to('backyrd.decision-vnext.product-runtime.default-off@1.0','UTF8'),'sha256'),'hex')
);

create table decision_vnext_private.product_idempotency_records_v1 (
  scope_version text not null check (scope_version = 'backyrd.decision-vnext.product-idempotency-scope@1.0'),
  purpose text not null check (purpose in ('PRODUCT_DECISION_VNEXT_EVALUATION','DECISION_RELEVANT_USER_PROJECTION')),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  subject_digest text not null check (subject_digest ~ '^[0-9a-f]{64}$'),
  idempotency_key_digest text not null check (idempotency_key_digest ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  response_contract_version text not null check (response_contract_version ~ '^backyrd\.[a-z0-9._-]+@[0-9]+\.[0-9]+$'),
  release_hash text not null check (release_hash ~ '^[0-9a-f]{64}$'),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  source_set_hash text not null check (source_set_hash ~ '^[0-9a-f]{64}$'),
  generation bigint not null check (generation > 0),
  response_envelope_bytes text not null check (octet_length(response_envelope_bytes) between 2 and 65536),
  response_hash text not null check (response_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint product_idempotency_records_v1_identity primary key (
    scope_version,purpose,release_hash,artifact_hash,source_set_hash,generation,
    response_contract_version,subject_digest,idempotency_key_digest
  ),
  constraint product_idempotency_records_v1_ttl check (
    expires_at > created_at and expires_at <= created_at + interval '24 hours'
  ),
  constraint product_user_binding_v1 check (auth_user_id is not null)
);

create index product_idempotency_records_v1_expiry_idx
  on decision_vnext_private.product_idempotency_records_v1(expires_at);
create index product_idempotency_records_v1_projection_idx
  on decision_vnext_private.product_idempotency_records_v1(auth_user_id,purpose,idempotency_key_digest,payload_hash)
  where purpose = 'DECISION_RELEVANT_USER_PROJECTION';

alter table decision_vnext_private.product_runtime_control_events_v1 enable row level security;
alter table decision_vnext_private.product_idempotency_records_v1 enable row level security;
revoke all on table decision_vnext_private.product_runtime_control_events_v1,
  decision_vnext_private.product_idempotency_records_v1 from public, anon, authenticated, service_role;

create function decision_vnext_private.assert_service_authority_v1()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role','') <> 'service_role' then
    raise exception 'decision_vnext_product_service_authority_required' using errcode = '42501';
  end if;
end;
$$;

create function decision_vnext_private.reject_runtime_control_mutation_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'decision_vnext_product_runtime_control_immutable' using errcode = '55000';
end;
$$;

create trigger decision_vnext_product_runtime_control_immutable_v1
before update or delete on decision_vnext_private.product_runtime_control_events_v1
for each row execute function decision_vnext_private.reject_runtime_control_mutation_v1();

create function decision_vnext_private.reject_idempotency_mutation_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     and current_setting('backyrd.decision_vnext_product_purge',true) = 'v1'
     and (
       old.expires_at <= clock_timestamp()
       or current_setting('backyrd.decision_vnext_product_lifecycle_purge',true) = 'v1'
     ) then
    return old;
  end if;
  raise exception 'decision_vnext_product_idempotency_immutable' using errcode = '55000';
end;
$$;

create trigger decision_vnext_product_idempotency_immutable_v1
before update or delete on decision_vnext_private.product_idempotency_records_v1
for each row execute function decision_vnext_private.reject_idempotency_mutation_v1();

revoke all on function decision_vnext_private.assert_service_authority_v1(),
  decision_vnext_private.reject_runtime_control_mutation_v1(),
  decision_vnext_private.reject_idempotency_mutation_v1() from public, anon, authenticated, service_role;

create function public.backyrd_decision_vnext_product_control_v1(
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_generation is null or p_generation < 1 then
    raise exception 'decision_vnext_product_control_input_invalid' using errcode = '22023';
  end if;
  select * into strict v_control from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  if v_control.generation <> p_generation
     or v_control.release_hash is distinct from p_release_hash
     or v_control.artifact_hash is distinct from p_artifact_hash
     or v_control.source_set_hash is distinct from p_source_set_hash
     or v_control.state <> 'ON' then
    return jsonb_build_object(
      'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
      'state','OFF','enabled',false,'killSwitch',true,'generation',v_control.generation,
      'reason','BINDING_OR_STATE_DENIED'
    );
  end if;
  return jsonb_build_object(
    'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
    'state','ON','enabled',true,'killSwitch',false,'generation',v_control.generation,
    'releaseHash',v_control.release_hash,'artifactHash',v_control.artifact_hash,
    'sourceSetHash',v_control.source_set_hash,'reason','EXACT_BINDING_ACTIVE'
  );
end;
$$;

create function public.backyrd_decision_vnext_product_emergency_off_v1(
  p_expected_generation bigint,p_release_hash text,p_artifact_hash text,p_source_set_hash text,
  p_reason_code text,p_authority_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_current decision_vnext_private.product_runtime_control_events_v1%rowtype;v_next bigint;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_expected_generation is null or p_expected_generation < 0
     or p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_reason_code is null or p_reason_code !~ '^EMERGENCY_[A-Z0-9_]{2,70}$'
     or p_authority_hash is null or p_authority_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'decision_vnext_product_emergency_off_input_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_current from decision_vnext_private.product_runtime_control_events_v1 order by generation desc limit 1;
  if v_current.generation <> p_expected_generation then
    raise exception 'decision_vnext_product_control_generation_conflict' using errcode = '40001';
  end if;
  v_next := v_current.generation + 1;
  insert into decision_vnext_private.product_runtime_control_events_v1(
    generation,state,release_hash,artifact_hash,source_set_hash,reason_code,authority_hash
  ) values (v_next,'OFF',p_release_hash,p_artifact_hash,p_source_set_hash,p_reason_code,p_authority_hash);
  return jsonb_build_object(
    'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
    'state','OFF','enabled',false,'killSwitch',true,'generation',v_next,
    'releaseHash',p_release_hash,'artifactHash',p_artifact_hash,'sourceSetHash',p_source_set_hash,
    'reason',p_reason_code
  );
end;
$$;

create function public.backyrd_decision_vnext_product_idempotency_commit_v1(
  p_purpose text,p_auth_user_id uuid,p_subject_digest text,p_idempotency_key_digest text,
  p_payload_hash text,p_response_contract_version text,p_release_hash text,p_artifact_hash text,
  p_source_set_hash text,p_generation bigint,p_response_envelope_bytes text,p_response_hash text,
  p_ttl_seconds integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz:=clock_timestamp();v_response jsonb;v_control jsonb;
  v_row decision_vnext_private.product_idempotency_records_v1%rowtype;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control := public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode = '55000';
  end if;
  if p_purpose not in ('PRODUCT_DECISION_VNEXT_EVALUATION','DECISION_RELEVANT_USER_PROJECTION')
     or p_auth_user_id is null
     or p_subject_digest is null or p_subject_digest !~ '^[0-9a-f]{64}$'
     or p_idempotency_key_digest is null or p_idempotency_key_digest !~ '^[0-9a-f]{64}$'
     or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_response_contract_version is null or p_response_contract_version !~ '^backyrd\.[a-z0-9._-]+@[0-9]+\.[0-9]+$'
     or p_response_envelope_bytes is null or octet_length(p_response_envelope_bytes) not between 2 and 65536
     or p_response_hash is null or p_response_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_seconds is null or p_ttl_seconds not between 1 and 86400 then
    raise exception 'decision_vnext_product_idempotency_input_invalid' using errcode = '22023';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_authenticated_user_required' using errcode='42501';
  end if;
  if p_purpose='DECISION_RELEVANT_USER_PROJECTION'
     and not public.user_has_active_consent_v1(p_auth_user_id,'personalized_recommendations') then
    raise exception 'decision_vnext_product_projection_consent_required' using errcode='42501';
  end if;
  begin v_response:=p_response_envelope_bytes::jsonb;
  exception when others then raise exception 'decision_vnext_product_idempotency_response_invalid' using errcode='22023'; end;
  if jsonb_typeof(v_response)<>'object'
     or p_response_envelope_bytes ~* '"(email|userId|authUserId|rawAuthUuid|token|jwt|authorization|requestText|naturalLanguage|ip|ipAddress|userAgent)"[[:space:]]*:'
     or encode(extensions.digest(convert_to(p_response_envelope_bytes,'UTF8'),'sha256'),'hex')<>p_response_hash then
    raise exception 'decision_vnext_product_idempotency_response_forbidden_or_hash_mismatch' using errcode='22023';
  end if;
  insert into decision_vnext_private.product_idempotency_records_v1(
    scope_version,purpose,auth_user_id,subject_digest,idempotency_key_digest,payload_hash,
    response_contract_version,release_hash,artifact_hash,source_set_hash,generation,
    response_envelope_bytes,response_hash,created_at,expires_at
  ) values (
    'backyrd.decision-vnext.product-idempotency-scope@1.0',p_purpose,p_auth_user_id,
    p_subject_digest,p_idempotency_key_digest,p_payload_hash,p_response_contract_version,
    p_release_hash,p_artifact_hash,p_source_set_hash,p_generation,p_response_envelope_bytes,
    p_response_hash,v_now,v_now+make_interval(secs=>p_ttl_seconds)
  ) on conflict on constraint product_idempotency_records_v1_identity do nothing returning * into v_row;
  if found then
    return jsonb_build_object('status','CREATED','responseHash',v_row.response_hash,'createdAt',v_row.created_at,'expiresAt',v_row.expires_at);
  end if;
  select * into strict v_row from decision_vnext_private.product_idempotency_records_v1
   where scope_version='backyrd.decision-vnext.product-idempotency-scope@1.0'
     and purpose=p_purpose and release_hash=p_release_hash and artifact_hash=p_artifact_hash
     and source_set_hash=p_source_set_hash and generation=p_generation
     and response_contract_version=p_response_contract_version and subject_digest=p_subject_digest
     and idempotency_key_digest=p_idempotency_key_digest for update;
  if v_row.expires_at<=v_now then return jsonb_build_object('status','EXPIRED','createdAt',v_row.created_at,'expiresAt',v_row.expires_at); end if;
  if v_row.payload_hash<>p_payload_hash or v_row.auth_user_id is distinct from p_auth_user_id then
    return jsonb_build_object('status','CONFLICT','createdAt',v_row.created_at,'expiresAt',v_row.expires_at);
  end if;
  return jsonb_build_object('status','REPLAYED','responseEnvelopeBytes',v_row.response_envelope_bytes,'responseHash',v_row.response_hash,'createdAt',v_row.created_at,'expiresAt',v_row.expires_at);
end;
$$;

create function public.backyrd_decision_vnext_product_interaction_authority_v1(
  p_auth_user_id uuid,p_subject_binding_hash text,p_decision_id text,p_candidate_id text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_control jsonb;v_row decision_vnext_private.product_idempotency_records_v1%rowtype;
  v_execution jsonb;v_candidate jsonb;v_session_id text;v_context_hash text;v_occurred_at text;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode='55000';
  end if;
  if p_auth_user_id is null or p_subject_binding_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_decision_id),'') is null or length(p_decision_id)>240
     or nullif(btrim(p_candidate_id),'') is null or length(p_candidate_id)>240
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_interaction_authority_denied' using errcode='42501';
  end if;
  -- Consent authority is checked before the first personal idempotency read.
  if not public.user_has_active_consent_v1(p_auth_user_id,'personalized_recommendations') then
    return jsonb_build_object('status','SUPPRESSED_NO_CONSENT');
  end if;
  select * into v_row from decision_vnext_private.product_idempotency_records_v1 r
   where r.scope_version='backyrd.decision-vnext.product-idempotency-scope@1.0'
     and r.purpose='PRODUCT_DECISION_VNEXT_EVALUATION' and r.auth_user_id=p_auth_user_id
     and r.subject_digest=p_subject_binding_hash and r.release_hash=p_release_hash
     and r.artifact_hash=p_artifact_hash and r.source_set_hash=p_source_set_hash
     and r.generation=p_generation and r.response_contract_version='backyrd.decision-vnext.product-response@1.0'
     and r.expires_at>clock_timestamp()
     and r.response_envelope_bytes::jsonb#>>'{response,decisionId}'=p_decision_id
   order by r.created_at desc limit 1;
  if not found or encode(extensions.digest(convert_to(v_row.response_envelope_bytes,'UTF8'),'sha256'),'hex')<>v_row.response_hash then
    raise exception 'decision_vnext_product_interaction_authority_denied' using errcode='42501';
  end if;
  v_execution:=v_row.response_envelope_bytes::jsonb;
  if v_execution#>>'{response,contractVersion}'<>'backyrd.decision-vnext.product-response@1.0'
     or v_execution#>>'{response,status}'<>'AVAILABLE'
     or v_execution#>>'{response,decisionId}'<>p_decision_id
     or v_execution#>>'{envelope,decisionId}'<>p_decision_id
     or v_execution#>>'{envelope,actor,subjectBindingHash}'<>p_subject_binding_hash
     or v_execution#>>'{envelope,authority,transportSlug}'<>'decision-v13'
     or v_execution#>>'{envelope,authority,purpose}'<>'PRODUCT_DECISION'
     or coalesce((v_execution#>>'{envelope,boundaries,legacyEngineUsed}')::boolean,true)
     or coalesce((v_execution#>>'{envelope,boundaries,fallbackUsed}')::boolean,true)
     or coalesce((v_execution#>>'{response,legacyEngineUsed}')::boolean,true)
     or coalesce((v_execution#>>'{response,fallbackUsed}')::boolean,true) then
    raise exception 'decision_vnext_product_execution_seal_invalid' using errcode='42501';
  end if;
  select candidate into v_candidate from jsonb_array_elements(coalesce(v_execution#>'{response,candidates}','[]'::jsonb)) candidate
   where candidate->>'spotId'=p_candidate_id and candidate->'rank'<>'null'::jsonb limit 1;
  select event->>'sessionId' into v_session_id from jsonb_array_elements(coalesce(v_execution->'learningEvents','[]'::jsonb)) event
   where event->>'eventType'='decision_requested' and event->>'decisionId'=p_decision_id limit 1;
  v_context_hash:=v_execution#>>'{envelope,bindings,contextHash}';
  v_occurred_at:=v_execution#>>'{envelope,authority,serverTime}';
  if v_candidate is null or nullif(v_session_id,'') is null
     or v_context_hash !~ '^[0-9a-f]{64}$' or v_candidate->>'spotId'<>p_candidate_id then
    raise exception 'decision_vnext_product_interaction_authority_denied' using errcode='42501';
  end if;
  begin perform v_occurred_at::timestamptz;
  exception when others then raise exception 'decision_vnext_product_interaction_authority_denied' using errcode='42501'; end;
  return jsonb_build_object(
    'status','AUTHORIZED','sessionId',v_session_id,'contextBindingHash',v_context_hash,
    'spotId',v_candidate->>'spotId','occurredAt',v_occurred_at
  );
end;
$$;

-- Exact Product events are admitted as themselves. None is renamed to a legacy
-- event, and generic learning stays disabled until its exact consumer exists.
insert into public.backyrd_memory_event_types_v1(
  event_type,event_class,evidence_family,retention_class,taste_event_type,
  direction,learning_eligible,pattern_eligible,outcome_support,contract_version
) values
 ('decision_requested','REQUEST','product_decision_request','REQUEST_MINIMIZED',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('candidate_impression','EXPOSURE','product_candidate_impression','EXPOSURE',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('candidate_opened','WEAK_INTERACTION','product_candidate_opened','WEAK_INTERACTION',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('candidate_saved','DELIBERATE_INTENT','product_candidate_saved','DELIBERATE_INTENT',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('alternative_requested','REQUEST','product_alternative_request','REQUEST_MINIMIZED',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('candidate_rejected','WEAK_INTERACTION','product_contextual_rejection','WEAK_INTERACTION',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('explicit_feedback','EXPLICIT_FEEDBACK','product_explicit_feedback','EXPLICIT_FEEDBACK',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('outcome_confirmed','OUTCOME','product_confirmed_outcome','OUTCOME',null,0,false,false,true,'backyrd.user-intelligence.product-decision-event@1.0'),
 ('event_correction','CORRECTION','product_event_correction','CORRECTION',null,0,false,false,false,'backyrd.user-intelligence.product-decision-event@1.0')
on conflict(event_type) do nothing;

do $$
begin
  if (select count(*) from public.backyrd_memory_event_types_v1
      where event_type=any(array['decision_requested','candidate_impression','candidate_opened','candidate_saved','alternative_requested','candidate_rejected','explicit_feedback','outcome_confirmed','event_correction'])
        and contract_version='backyrd.user-intelligence.product-decision-event@1.0'
        and taste_event_type is null and direction=0 and not learning_eligible and not pattern_eligible)<>9 then
    raise exception 'decision_vnext_product_event_catalog_drift' using errcode='22023';
  end if;
end;
$$;

insert into public.backyrd_memory_source_adapters_v1(
  source_table,source_event_type,canonical_event_type,mapping_status,notes,adapter_version
) select 'decision_vnext_product_learning',event_type,event_type,'SUPPORTED',
  'Identity mapping only. Exact Product record remains in outbox metadata; no legacy semantic translation.',
  'backyrd-product-decision-learning-outbox@1.0'
from unnest(array['decision_requested','candidate_impression','candidate_opened','candidate_saved','alternative_requested','candidate_rejected','explicit_feedback','outcome_confirmed','event_correction']) event_type
on conflict(source_table,source_event_type) do nothing;

do $$
begin
  if (select count(*) from public.backyrd_memory_source_adapters_v1
      where source_table='decision_vnext_product_learning'
        and source_event_type=canonical_event_type
        and mapping_status='SUPPORTED'
        and adapter_version='backyrd-product-decision-learning-outbox@1.0')<>9 then
    raise exception 'decision_vnext_product_source_adapter_drift' using errcode='22023';
  end if;
end;
$$;

alter table public.backyrd_memory_bridge_outbox_v1
  drop constraint if exists backyrd_memory_bridge_outbox_v1_source_type_check;
alter table public.backyrd_memory_bridge_outbox_v1
  add constraint backyrd_memory_bridge_outbox_v1_source_type_check check(source_type in (
    'decision_session','decision_impression','analytics_event','product_action','favorite',
    'reservation','smart_review','standard_review','product_decision_vnext'
  ));

create unique index backyrd_memory_bridge_product_learning_idempotency_v1
  on public.backyrd_memory_bridge_outbox_v1(user_id,((source_metadata->'productRecord')->>'idempotencyKey'))
  where source_type='product_decision_vnext';
create unique index backyrd_memory_bridge_product_learning_event_v1
  on public.backyrd_memory_bridge_outbox_v1(user_id,((source_metadata->'productRecord')->>'eventId'))
  where source_type='product_decision_vnext';

create function public.backyrd_decision_vnext_product_learning_append_v1(
  p_record_bytes text,p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_record jsonb;v_control jsonb;v_user uuid;v_existing public.backyrd_memory_bridge_outbox_v1%rowtype;
  v_event_type text;v_event_id text;v_idempotency_key text;v_record_hash text;v_occurred_at timestamptz;
  v_candidate_required boolean;v_allowed_keys text[]:=array[
    'contractVersion','eventVersion','eventId','idempotencyKey','eventType','purpose','userId',
    'subjectBindingHash','decisionId','sessionId','journeyId','candidateId','spotId','contextBindingHash',
    'occurredAt','feedback','targetEventId','targetRecordHash','authorityRecordId','authorityRecordHash',
    'consentHash','consentVersion','lifecycle','semanticDisposition','boundaries'
  ];
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then raise exception 'decision_vnext_product_runtime_off' using errcode='55000'; end if;
  if p_record_bytes is null or octet_length(p_record_bytes) not between 2 and 65536 then raise exception 'product_learning_record_invalid' using errcode='22023'; end if;
  begin v_record:=p_record_bytes::jsonb; exception when others then raise exception 'product_learning_record_invalid' using errcode='22023'; end;
  if jsonb_typeof(v_record)<>'object'
     or (select count(*) from jsonb_object_keys(v_record))<>cardinality(v_allowed_keys)
     or exists(select 1 from jsonb_object_keys(v_record) k where k<>all(v_allowed_keys)) then
    raise exception 'product_learning_record_shape_invalid' using errcode='22023';
  end if;
  v_event_type:=v_record->>'eventType';v_event_id:=v_record->>'eventId';v_idempotency_key:=v_record->>'idempotencyKey';
  v_record_hash:=encode(extensions.digest(convert_to(p_record_bytes,'UTF8'),'sha256'),'hex');
  if v_record->>'contractVersion'<>'backyrd.user-intelligence.product-decision-learning-record@1.0'
     or v_record->>'eventVersion'<>'backyrd.user-intelligence.product-decision-event@1.0'
     or v_record->>'purpose'<>'PERSONALIZED_DECISION_LEARNING' or v_record->>'lifecycle'<>'ACTIVE'
     or v_event_type not in ('decision_requested','candidate_impression','candidate_opened','candidate_saved','alternative_requested','candidate_rejected','explicit_feedback','outcome_confirmed','event_correction')
     or nullif(v_event_id,'') is null or nullif(v_idempotency_key,'') is null
     or v_record->>'userId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_record->>'subjectBindingHash' !~ '^[0-9a-f]{64}$'
     or v_record->>'contextBindingHash' !~ '^[0-9a-f]{64}$'
     or v_record->>'authorityRecordHash' !~ '^[0-9a-f]{64}$'
     or v_record->>'consentHash' !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_record->'boundaries')<>'object'
     or v_record->'boundaries'<>jsonb_build_object('rawEvidenceIncluded',false,'rawTextIncluded',false,'sensitiveInferenceIncluded',false,'worldMutationAuthorized',false,'clientRankingAuthorized',false,'clientProfileMutationAuthorized',false) then
    raise exception 'product_learning_record_contract_invalid' using errcode='22023';
  end if;
  if nullif(v_record->>'decisionId','') is null or nullif(v_record->>'sessionId','') is null
     or nullif(v_record->>'journeyId','') is null or nullif(v_record->>'authorityRecordId','') is null
     or nullif(v_record->>'consentVersion','') is null then
    raise exception 'product_learning_record_binding_invalid' using errcode='22023';
  end if;
  begin v_user:=(v_record->>'userId')::uuid;v_occurred_at:=(v_record->>'occurredAt')::timestamptz;
  exception when others then raise exception 'product_learning_record_identity_or_time_invalid' using errcode='22023'; end;
  if v_occurred_at>clock_timestamp()+interval '5 minutes'
     or not exists(select 1 from auth.users u where u.id=v_user and u.deleted_at is null)
     or not public.user_has_active_consent_v1(v_user,'personalized_recommendations') then
    raise exception 'product_learning_user_or_consent_denied' using errcode='42501';
  end if;
  v_candidate_required:=v_event_type in ('candidate_impression','candidate_opened','candidate_saved','candidate_rejected','explicit_feedback','outcome_confirmed');
  if (v_candidate_required and (nullif(v_record->>'candidateId','') is null or nullif(v_record->>'spotId','') is null))
     or (not v_candidate_required and v_event_type<>'event_correction' and (v_record->>'candidateId' is not null or v_record->>'spotId' is not null))
     or (v_event_type='explicit_feedback')<>(v_record->'feedback'<>'null'::jsonb)
     or (v_event_type='explicit_feedback' and (
       jsonb_typeof(v_record->'feedback')<>'object'
       or (select count(*) from jsonb_object_keys(v_record->'feedback'))<>2
       or v_record#>>'{feedback,response}' not in ('HAS_MATCHED','HAS_NOT_MATCHED','CANNOT_ASSESS_OR_SKIPPED')
       or v_record#>'{feedback,explicitlySelected}'<>'true'::jsonb
     ))
     or (v_event_type='event_correction')<>(nullif(v_record->>'targetEventId','') is not null and nullif(v_record->>'targetRecordHash','') is not null)
     or (v_event_type='candidate_saved' and v_record->>'semanticDisposition'<>'PLANNING_STATE')
     or (v_event_type='candidate_rejected' and v_record->>'semanticDisposition'<>'WEAK_CONTEXTUAL_NEGATIVE')
     or (v_event_type in ('explicit_feedback','outcome_confirmed') and v_record->>'semanticDisposition'<>'EXPLICIT_OUTCOME')
     or (v_event_type='event_correction' and v_record->>'semanticDisposition'<>'CORRECTION')
     or (v_event_type not in ('candidate_saved','candidate_rejected','explicit_feedback','outcome_confirmed','event_correction') and v_record->>'semanticDisposition'<>'OBSERVATION_ONLY') then
    raise exception 'product_learning_semantics_invalid' using errcode='22023';
  end if;
  v_record:=v_record||jsonb_build_object('recordHash',v_record_hash);
  if v_event_type='event_correction' and not exists(
    select 1 from public.backyrd_memory_bridge_outbox_v1 o
    where o.source_type='product_decision_vnext' and o.user_id=v_user
      and o.source_metadata#>>'{productRecord,eventId}'=v_record->>'targetEventId'
      and o.source_metadata#>>'{productRecord,recordHash}'=v_record->>'targetRecordHash'
  ) then raise exception 'product_learning_correction_target_invalid' using errcode='23503'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  select * into v_existing from public.backyrd_memory_bridge_outbox_v1 o
   where o.source_type='product_decision_vnext' and o.user_id=v_user
     and (o.source_metadata#>>'{productRecord,idempotencyKey}'=v_idempotency_key
          or o.source_metadata#>>'{productRecord,eventId}'=v_event_id)
   order by o.created_at limit 1 for update;
  if found then
    if v_existing.source_metadata#>>'{productRecord,idempotencyKey}'=v_idempotency_key
       and v_existing.source_metadata#>>'{productRecord,eventId}'=v_event_id
       and v_existing.source_metadata#>>'{productRecord,recordHash}'=v_record_hash
       and v_existing.source_metadata->>'productRecordBytes'=p_record_bytes then
      return jsonb_build_object('status','REPLAYED','eventId',v_event_id,'recordHash',v_record_hash);
    end if;
    raise exception 'product_learning_idempotency_conflict' using errcode='23505';
  end if;
  insert into public.backyrd_memory_bridge_outbox_v1(
    source_type,source_id,semantic_version,user_id,canonical_event_type,occurred_at,
    session_id,decision_id,spot_id,exposure_rank,source_metadata
  ) values (
    'product_decision_vnext',v_event_id,'backyrd.user-intelligence.product-decision-event@1.0',
    v_user,v_event_type,v_occurred_at,v_record->>'sessionId',null,null,null,
    jsonb_build_object('mapping','exact_product_decision_record_v1','productRecord',v_record,'productRecordBytes',p_record_bytes,'releaseHash',p_release_hash,'artifactHash',p_artifact_hash,'sourceSetHash',p_source_set_hash,'generation',p_generation)
  );
  return jsonb_build_object('status','PERSISTED','eventId',v_event_id,'recordHash',v_record_hash);
end;
$$;

create function public.backyrd_decision_vnext_product_projection_v1(
  p_auth_user_id uuid,p_request_hash text,p_consent_hash text,p_subject_binding_hash text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_control jsonb;v_row decision_vnext_private.product_idempotency_records_v1%rowtype;v_envelope jsonb;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    return jsonb_build_object('status','NEUTRAL','neutralReason','KILL_SWITCH','envelope',null);
  end if;
  if p_auth_user_id is null or p_request_hash !~ '^[0-9a-f]{64}$' or p_consent_hash !~ '^[0-9a-f]{64}$' or p_subject_binding_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'decision_vnext_product_projection_input_invalid' using errcode='22023';
  end if;
  -- This branch intentionally precedes the only personal-envelope read.
  if not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null)
     or not public.user_has_active_consent_v1(p_auth_user_id,'personalized_recommendations') then
    return jsonb_build_object('status','NEUTRAL','neutralReason','NO_CONSENT','envelope',null);
  end if;
  select * into v_row from decision_vnext_private.product_idempotency_records_v1 r
   where r.scope_version='backyrd.decision-vnext.product-idempotency-scope@1.0'
     and r.purpose='DECISION_RELEVANT_USER_PROJECTION' and r.auth_user_id=p_auth_user_id
     and r.subject_digest=p_subject_binding_hash and r.idempotency_key_digest=p_request_hash
     and r.payload_hash=p_consent_hash and r.release_hash=p_release_hash and r.artifact_hash=p_artifact_hash
     and r.source_set_hash=p_source_set_hash and r.generation=p_generation
     and r.response_contract_version='backyrd.user-intelligence.product-projection-envelope@2.0'
     and r.expires_at>clock_timestamp() order by r.created_at desc limit 1;
  if not found then return jsonb_build_object('status','NEUTRAL','neutralReason','MISSING_SNAPSHOT','envelope',null); end if;
  if encode(extensions.digest(convert_to(v_row.response_envelope_bytes,'UTF8'),'sha256'),'hex')<>v_row.response_hash then
    raise exception 'decision_vnext_product_projection_hash_mismatch' using errcode='22023';
  end if;
  v_envelope:=v_row.response_envelope_bytes::jsonb;
  if v_envelope->>'contractVersion'<>'backyrd.user-intelligence.product-projection-envelope@2.0'
     or v_envelope->>'purpose'<>'DECISION_RELEVANT_USER_PROJECTION'
     or v_envelope->>'requestHash'<>p_request_hash or v_envelope->>'consentHash'<>p_consent_hash
     or v_envelope->>'subjectBindingHash'<>p_subject_binding_hash
     or v_envelope->>'issuer'<>'BACKYRD_USER_INTELLIGENCE_PROJECTION_AUTHORITY'
     or v_envelope->>'envelopeHash' !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_envelope->'projection')<>'object'
     or v_row.response_envelope_bytes ~* '"(userId|authUserId|rawAuthUuid|email|token|jwt|authorization)"[[:space:]]*:' then
    raise exception 'decision_vnext_product_projection_envelope_invalid' using errcode='22023';
  end if;
  begin
    if clock_timestamp() < (v_envelope->>'issuedAt')::timestamptz
       or clock_timestamp() >= (v_envelope->>'validUntil')::timestamptz then
      return jsonb_build_object('status','NEUTRAL','neutralReason','MISSING_SNAPSHOT','envelope',null);
    end if;
  exception when others then
    raise exception 'decision_vnext_product_projection_envelope_time_invalid' using errcode='22023';
  end;
  return jsonb_build_object('status','ACTIVE','neutralReason',null,'envelope',v_envelope,'responseHash',v_row.response_hash);
end;
$$;

-- One service-only Product read boundary. It exposes only canonical current
-- World snapshots for active spots in the requested area and, after the
-- consent check, the authenticated user's latest minimized canonical nodes.
create function public.backyrd_decision_vnext_product_context_v1(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_control jsonb;v_world jsonb;v_consent public.user_consents%rowtype;
  v_snapshot jsonb;v_count integer;v_now timestamptz:=clock_timestamp();
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode='55000';
  end if;
  if p_auth_user_id is null or p_subject_binding_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_target_city),'') is null or length(p_target_city)>120
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_context_authority_denied' using errcode='42501';
  end if;
  select count(*),coalesce(jsonb_agg(m.world_snapshot order by p.spot_id),'[]'::jsonb)
    into v_count,v_world
  from world_knowledge_private.current_projection_pointers p
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
  join public.spots s on s.id=p.spot_id and s.status='approved'
  where lower(m.world_snapshot#>>'{spot,location,locality}')=lower(btrim(p_target_city))
    and not exists(
      select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'conflicts','[]'::jsonb)) conflict
      cross join lateral jsonb_array_elements_text(coalesce(conflict->'attributeKeys','[]'::jsonb)) attribute_key
      where attribute_key in ('identity.location','identity.locality','location.locality')
    );
  if v_count=0 or v_count>1000 then
    raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000';
  end if;
  select * into v_consent from public.user_consents c
   where c.user_id=p_auth_user_id and c.purpose_key='personalized_recommendations';
  if not found or v_consent.status<>'granted' then
    return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
      'authorizedCity',btrim(p_target_city),'serverTime',v_now,'worldSnapshots',v_world,
      'status','NO_CONSENT','consent',null,'snapshot',null);
  end if;
  select jsonb_build_object('snapshotId',s.snapshot_id,'snapshotHash',s.snapshot_hash,
      'runtimeVersion',s.runtime_version,'sourceHash',s.source_hash,
      'nodes',coalesce((select jsonb_agg(n.node order by n.node_key)
        from public.backyrd_user_intelligence_snapshot_nodes_v1 n where n.snapshot_id=s.snapshot_id),'[]'::jsonb))
    into v_snapshot
  from public.backyrd_user_intelligence_latest_v1 l
  join public.backyrd_user_intelligence_snapshots_v2 s on s.snapshot_id=l.snapshot_id and s.user_id=l.user_id
  where l.user_id=p_auth_user_id and s.status='COMMITTED';
  return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
    'authorizedCity',btrim(p_target_city),'serverTime',v_now,'worldSnapshots',v_world,
    'status',case when v_snapshot is null then 'MISSING_SNAPSHOT' else 'ACTIVE' end,
    'consent',jsonb_build_object(
      'contractVersion','backyrd.user-intelligence.consent-envelope@1.0',
      'purpose','PERSONALIZED_RECOMMENDATIONS','state','GRANTED',
      'consentVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),
      'policyVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),
      'uxVersion','canonical-consent-ledger-v1','effectiveAt',v_consent.granted_at,
      'captureContext',case when v_consent.source='mobile' then 'ONBOARDING' when v_consent.source='web' then 'SETTINGS' else 'MIGRATION_VERIFIED' end,
      'allowedProcessing',jsonb_build_array('PERSONALIZATION_EVIDENCE','TRANSPARENCY','EXPORT','ERASURE'),
      'lifecycleEffect','ALLOW'),'snapshot',v_snapshot);
end;
$$;

-- The client can submit only the versioned event transport. User, consent,
-- decision, session, context and candidate authority are reconstructed from
-- the authenticated server binding and the sealed decision ledger.
create function public.backyrd_decision_vnext_product_learning_event_v1(
  p_auth_user_id uuid,p_subject_binding_hash text,p_authentication_context_hash text,p_event jsonb,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_control jsonb;v_row decision_vnext_private.product_idempotency_records_v1%rowtype;
  v_execution jsonb;v_event_type text;v_candidate_required boolean;v_candidate jsonb;
  v_consent public.user_consents%rowtype;v_consent_hash text;v_authority_hash text;
  v_semantic text;v_record jsonb;v_result jsonb;v_record_bytes text;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then raise exception 'decision_vnext_product_runtime_off' using errcode='55000'; end if;
  if p_auth_user_id is null or p_subject_binding_hash !~ '^[0-9a-f]{64}$'
     or p_authentication_context_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_event)<>'object'
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'product_learning_event_authority_denied' using errcode='42501';
  end if;
  select * into v_consent from public.user_consents c where c.user_id=p_auth_user_id
    and c.purpose_key='personalized_recommendations' and c.status='granted';
  if not found then
    return jsonb_build_object('contractVersion','backyrd.user-intelligence.product-decision-learning-receipt@1.0',
      'status','SUPPRESSED_NO_CONSENT','persisted',false,'eventId',null,'recordHash',null,'neutralProjectionRequired',true);
  end if;
  v_event_type:=p_event->>'eventType';
  if p_event->>'contractVersion'<>'backyrd.user-intelligence.product-decision-learning-input@1.0'
     or v_event_type not in ('decision_requested','candidate_impression','candidate_opened','candidate_saved','alternative_requested','candidate_rejected','explicit_feedback','outcome_confirmed','event_correction')
     or nullif(p_event->>'eventId','') is null or nullif(p_event->>'idempotencyKey','') is null
     or nullif(p_event->>'decisionId','') is null or nullif(p_event->>'sessionId','') is null
     or p_event->>'contextBindingHash' !~ '^[0-9a-f]{64}$' then
    raise exception 'product_learning_event_contract_invalid' using errcode='22023';
  end if;
  select * into v_row from decision_vnext_private.product_idempotency_records_v1 r
   where r.scope_version='backyrd.decision-vnext.product-idempotency-scope@1.0'
     and r.purpose='PRODUCT_DECISION_VNEXT_EVALUATION' and r.auth_user_id=p_auth_user_id
     and r.subject_digest=p_subject_binding_hash and r.release_hash=p_release_hash
     and r.artifact_hash=p_artifact_hash and r.source_set_hash=p_source_set_hash
     and r.generation=p_generation and r.response_contract_version='backyrd.decision-vnext.product-response@1.0'
     and r.expires_at>clock_timestamp()
     and r.response_envelope_bytes::jsonb#>>'{response,decisionId}'=p_event->>'decisionId'
   order by r.created_at desc limit 1 for update;
  if not found or encode(extensions.digest(convert_to(v_row.response_envelope_bytes,'UTF8'),'sha256'),'hex')<>v_row.response_hash then
    raise exception 'product_learning_decision_ledger_missing' using errcode='42501';
  end if;
  v_execution:=v_row.response_envelope_bytes::jsonb;
  if v_execution#>>'{envelope,actor,subjectBindingHash}'<>p_subject_binding_hash
     or v_execution#>>'{envelope,actor,authenticationContextHash}'<>p_authentication_context_hash
     or v_execution#>>'{envelope,authority,transportSlug}'<>'decision-v13'
     or v_execution#>>'{envelope,bindings,contextHash}'<>p_event->>'contextBindingHash' then
    raise exception 'product_learning_decision_binding_invalid' using errcode='42501';
  end if;
  v_candidate_required:=v_event_type in ('candidate_impression','candidate_opened','candidate_saved','candidate_rejected','explicit_feedback','outcome_confirmed');
  if p_event->>'sessionId' is distinct from (
      select x->>'sessionId' from jsonb_array_elements(v_execution->'learningEvents') x
      where x->>'eventType'='decision_requested' limit 1) then
    raise exception 'product_learning_session_binding_invalid' using errcode='42501';
  end if;
  if v_candidate_required then
    select x into v_candidate from jsonb_array_elements(v_execution#>'{response,candidates}') x
      where x->>'spotId'=p_event->>'candidateId' and x->>'spotId'=p_event->>'spotId' limit 1;
    if v_candidate is null then raise exception 'product_learning_candidate_binding_invalid' using errcode='42501'; end if;
  elsif v_event_type<>'event_correction' and (p_event->>'candidateId' is not null or p_event->>'spotId' is not null) then
    raise exception 'product_learning_candidate_forbidden' using errcode='42501';
  end if;
  if v_event_type not in ('candidate_impression','candidate_opened') and not exists(
      select 1 from jsonb_array_elements(v_execution->'learningEvents') x where x=p_event) then
    raise exception 'product_learning_event_not_sealed' using errcode='42501';
  end if;
  v_semantic:=case when v_event_type='candidate_saved' then 'PLANNING_STATE'
    when v_event_type='candidate_rejected' then 'WEAK_CONTEXTUAL_NEGATIVE'
    when v_event_type in ('explicit_feedback','outcome_confirmed') then 'EXPLICIT_OUTCOME'
    when v_event_type='event_correction' then 'CORRECTION' else 'OBSERVATION_ONLY' end;
  v_consent_hash:=encode(extensions.digest(convert_to(jsonb_build_object('user',p_auth_user_id,'purpose',v_consent.purpose_key,'status',v_consent.status,'document',v_consent.document_id,'grantedAt',v_consent.granted_at)::text,'UTF8'),'sha256'),'hex');
  v_authority_hash:=encode(extensions.digest(convert_to(jsonb_build_object('user',p_auth_user_id,'subject',p_subject_binding_hash,'decision',p_event->>'decisionId','session',p_event->>'sessionId','candidate',p_event->'candidateId','context',p_event->>'contextBindingHash','event',p_event->>'eventId')::text,'UTF8'),'sha256'),'hex');
  v_record:=jsonb_build_object(
    'contractVersion','backyrd.user-intelligence.product-decision-learning-record@1.0','eventVersion','backyrd.user-intelligence.product-decision-event@1.0',
    'eventId',p_event->>'eventId','idempotencyKey',p_event->>'idempotencyKey','eventType',v_event_type,'purpose','PERSONALIZED_DECISION_LEARNING',
    'userId',p_auth_user_id,'subjectBindingHash',p_subject_binding_hash,'decisionId',p_event->>'decisionId','sessionId',p_event->>'sessionId',
    'journeyId',p_event->>'sessionId','candidateId',p_event->'candidateId','spotId',p_event->'spotId','contextBindingHash',p_event->>'contextBindingHash',
    'occurredAt',p_event->>'occurredAt','feedback',p_event->'feedback','targetEventId',p_event->'targetEventId','targetRecordHash',null,
    'authorityRecordId','product-authority-'||(p_event->>'eventId'),'authorityRecordHash',v_authority_hash,'consentHash',v_consent_hash,
    'consentVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),'lifecycle','ACTIVE','semanticDisposition',v_semantic,
    'boundaries',jsonb_build_object('rawEvidenceIncluded',false,'rawTextIncluded',false,'sensitiveInferenceIncluded',false,'worldMutationAuthorized',false,'clientRankingAuthorized',false,'clientProfileMutationAuthorized',false));
  v_record_bytes:=v_record::text;
  v_result:=public.backyrd_decision_vnext_product_learning_append_v1(v_record_bytes,p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  return jsonb_build_object('contractVersion','backyrd.user-intelligence.product-decision-learning-receipt@1.0',
    'status',v_result->>'status','persisted',true,'eventId',v_result->>'eventId','recordHash',v_result->>'recordHash','neutralProjectionRequired',false);
end;
$$;

create function decision_vnext_private.purge_product_user_v1(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('backyrd.decision_vnext_product_purge','v1',true);
  perform set_config('backyrd.decision_vnext_product_lifecycle_purge','v1',true);
  delete from decision_vnext_private.product_idempotency_records_v1 where auth_user_id=p_user_id;
  delete from public.backyrd_memory_bridge_outbox_v1 where user_id=p_user_id and source_type='product_decision_vnext';
end;
$$;

create function decision_vnext_private.product_consent_withdrawal_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.purpose_key='personalized_recommendations' and new.status='withdrawn'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform decision_vnext_private.purge_product_user_v1(new.user_id);
  end if;
  return new;
end;
$$;

create function decision_vnext_private.product_profile_erasure_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform decision_vnext_private.purge_product_user_v1(old.id);return old;end;
$$;

create trigger decision_vnext_product_consent_withdrawal_v1
after insert or update of status on public.user_consents
for each row execute function decision_vnext_private.product_consent_withdrawal_v1();
create trigger decision_vnext_product_profile_erasure_v1
before delete on public.profiles
for each row execute function decision_vnext_private.product_profile_erasure_v1();

create function public.backyrd_decision_vnext_product_idempotency_purge_expired_v1(p_limit integer default 500)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_deleted integer;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'decision_vnext_product_purge_limit_invalid' using errcode='22023'; end if;
  perform set_config('backyrd.decision_vnext_product_purge','v1',true);
  with expired as materialized (
    select scope_version,purpose,release_hash,artifact_hash,source_set_hash,generation,
      response_contract_version,subject_digest,idempotency_key_digest
    from decision_vnext_private.product_idempotency_records_v1 where expires_at<=clock_timestamp()
    order by expires_at limit p_limit for update skip locked
  ) delete from decision_vnext_private.product_idempotency_records_v1 r using expired e
    where r.scope_version=e.scope_version and r.purpose=e.purpose and r.release_hash=e.release_hash
      and r.artifact_hash=e.artifact_hash and r.source_set_hash=e.source_set_hash and r.generation=e.generation
      and r.response_contract_version=e.response_contract_version and r.subject_digest=e.subject_digest
      and r.idempotency_key_digest=e.idempotency_key_digest;
  get diagnostics v_deleted=row_count;return v_deleted;
end;
$$;

revoke all on function public.backyrd_decision_vnext_product_control_v1(text,text,text,bigint),
  public.backyrd_decision_vnext_product_emergency_off_v1(bigint,text,text,text,text,text),
  public.backyrd_decision_vnext_product_idempotency_commit_v1(text,uuid,text,text,text,text,text,text,text,bigint,text,text,integer),
  public.backyrd_decision_vnext_product_interaction_authority_v1(uuid,text,text,text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_learning_append_v1(text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_context_v1(uuid,text,text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_learning_event_v1(uuid,text,text,jsonb,text,text,text,bigint),
  public.backyrd_decision_vnext_product_projection_v1(uuid,text,text,text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_idempotency_purge_expired_v1(integer)
from public, anon, authenticated;
grant execute on function public.backyrd_decision_vnext_product_control_v1(text,text,text,bigint),
  public.backyrd_decision_vnext_product_emergency_off_v1(bigint,text,text,text,text,text),
  public.backyrd_decision_vnext_product_idempotency_commit_v1(text,uuid,text,text,text,text,text,text,text,bigint,text,text,integer),
  public.backyrd_decision_vnext_product_interaction_authority_v1(uuid,text,text,text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_learning_append_v1(text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_context_v1(uuid,text,text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_learning_event_v1(uuid,text,text,jsonb,text,text,text,bigint),
  public.backyrd_decision_vnext_product_projection_v1(uuid,text,text,text,text,text,text,bigint),
  public.backyrd_decision_vnext_product_idempotency_purge_expired_v1(integer)
to service_role;

revoke all on function decision_vnext_private.purge_product_user_v1(uuid),
  decision_vnext_private.product_consent_withdrawal_v1(),
  decision_vnext_private.product_profile_erasure_v1() from public, anon, authenticated, service_role;

comment on schema decision_vnext_private is 'Private Decision vNext Product runtime state; not exposed to clients or service-role direct access.';
comment on table decision_vnext_private.product_runtime_control_events_v1 is 'Append-only release/generation control history. Migration default is OFF; no ON RPC exists.';
comment on table decision_vnext_private.product_idempotency_records_v1 is 'Purpose-, release- and generation-bound Product replay records; separate from Founder Live.';
