\set ON_ERROR_STOP on
begin;

-- backyrd:authorization-positive
-- backyrd:authorization-negative

create function pg_temp.product_runtime_uuid(p_value text) returns uuid language sql immutable as $$
  select (substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||'-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12))::uuid
$$;
create function pg_temp.product_runtime_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'decision vnext product runtime test failed: %',p_message; end if; end
$$;

select pg_temp.product_runtime_assert(
  not has_schema_privilege('anon','decision_vnext_private','USAGE')
  and not has_schema_privilege('authenticated','decision_vnext_private','USAGE')
  and not has_schema_privilege('service_role','decision_vnext_private','USAGE'),
  'private schema must not be directly exposed'
);
select pg_temp.product_runtime_assert(
  not has_table_privilege('service_role','decision_vnext_private.product_runtime_control_events_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role','decision_vnext_private.product_idempotency_records_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','decision_vnext_private.product_idempotency_records_v1','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','decision_vnext_private.product_idempotency_records_v1','SELECT,INSERT,UPDATE,DELETE'),
  'application roles must have no direct private-table privileges'
);
select pg_temp.product_runtime_assert(
  has_function_privilege('service_role','public.backyrd_decision_vnext_product_control_v1(text,text,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.backyrd_decision_vnext_product_idempotency_commit_v1(text,uuid,text,text,text,text,text,text,text,bigint,text,text,integer)','EXECUTE')
  and has_function_privilege('service_role','public.backyrd_decision_vnext_product_projection_v1(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.backyrd_decision_vnext_product_learning_append_v1(text,text,text,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.backyrd_decision_vnext_product_interaction_authority_v1(uuid,text,text,text,text,text,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.backyrd_decision_vnext_product_context_v1(uuid,text,text,text,text,text,bigint)','EXECUTE')
  and has_function_privilege('service_role','public.backyrd_decision_vnext_product_learning_event_v1(uuid,text,text,jsonb,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_learning_append_v1(text,text,text,text,bigint)','EXECUTE'),
  'only service_role receives the aligned Product RPCs'
);
select pg_temp.product_runtime_assert(
  not has_function_privilege('public','public.backyrd_decision_vnext_product_context_v1(uuid,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_context_v1(uuid,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v1(uuid,text,text,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('public','public.backyrd_decision_vnext_product_learning_event_v1(uuid,text,text,jsonb,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_learning_event_v1(uuid,text,text,jsonb,text,text,text,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_learning_event_v1(uuid,text,text,jsonb,text,text,text,bigint)','EXECUTE'),
  'Product context and event authority RPCs deny every client role'
);
select pg_temp.product_runtime_assert(
  has_function_privilege('postgres','public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)','EXECUTE')
  and not has_function_privilege('public','public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)','EXECUTE')
  and not has_function_privilege('anon','public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)','EXECUTE')
  and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)','EXECUTE')
  and not has_function_privilege('service_role','public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)','EXECUTE'),
  'only the manual database release operator can activate Product'
);
select pg_temp.product_runtime_assert(
  to_regclass('founder_live_private.idempotency_records_v1') is null
  or exists(
    select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='founder_live_private' and t.relname='idempotency_records_v1'
      and c.conname='idempotency_records_v1_purpose_check'
      and pg_get_constraintdef(c.oid) ilike '%FOUNDER_LIVE_READ_ONLY_EVALUATION%'
  ),
  'Founder Live purpose constraint remains Founder-only'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000',pg_temp.product_runtime_uuid('product-user'),'authenticated','authenticated','product-runtime@fixture.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',pg_temp.product_runtime_uuid('no-consent-user'),'authenticated','authenticated','product-no-consent@fixture.invalid','','{}','{}',now(),now());
insert into public.profiles(id) values(pg_temp.product_runtime_uuid('product-user')),(pg_temp.product_runtime_uuid('no-consent-user')) on conflict do nothing;
insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
values('personalized_recommendations','Personalized','fixture','personalization','consent',true,false,false,1,true) on conflict(key) do nothing;
insert into public.user_consents(user_id,purpose_key,status,granted_at,source)
values(pg_temp.product_runtime_uuid('product-user'),'personalized_recommendations','granted',now(),'system_migration');

create temporary table product_runtime_binding as select
  repeat('a',64)::text release_hash,repeat('b',64)::text artifact_hash,repeat('c',64)::text source_set_hash,
  repeat('d',64)::text subject_hash,repeat('e',64)::text request_hash,repeat('f',64)::text consent_hash;

select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);

select pg_temp.product_runtime_assert(
  (select not (public.backyrd_decision_vnext_product_control_v1(release_hash,artifact_hash,source_set_hash,1)->>'enabled')::boolean from product_runtime_binding),
  'generation zero is fail-closed OFF'
);
select pg_temp.product_runtime_assert(
  (select public.backyrd_decision_vnext_product_projection_v1(
    pg_temp.product_runtime_uuid('product-user'),request_hash,consent_hash,subject_hash,
    release_hash,artifact_hash,source_set_hash,1
  )->>'neutralReason'='KILL_SWITCH' from product_runtime_binding),
  'OFF projection returns kill-switch neutral without a personal read'
);

select pg_temp.product_runtime_assert(
  (select (public.backyrd_decision_vnext_product_activate_v1(
    0,release_hash,artifact_hash,source_set_hash,repeat('1',64),
    pg_catalog.clock_timestamp()+interval '1 hour'
  )->>'generation')::bigint=1 from product_runtime_binding),
  'manual operator activation binds exact generation and a finite authority lease'
);

select pg_temp.product_runtime_assert(
  (select (public.backyrd_decision_vnext_product_control_v1(release_hash,artifact_hash,source_set_hash,1)->>'enabled')::boolean from product_runtime_binding),
  'exact release/generation binding is readable by service authority'
);
select pg_temp.product_runtime_assert(
  (select not (public.backyrd_decision_vnext_product_control_v1(repeat('0',64),artifact_hash,source_set_hash,1)->>'enabled')::boolean from product_runtime_binding),
  'wrong release hash fails closed'
);
do $$
declare v_binding record;
begin
  select * into v_binding from product_runtime_binding;
  begin
    perform public.backyrd_decision_vnext_product_activate_v1(1,v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,repeat('1',64),pg_catalog.clock_timestamp()+interval '1 hour');
    raise exception 'ON-to-ON transition accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    perform public.backyrd_decision_vnext_product_activate_v1(0,v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,repeat('1',64),pg_catalog.clock_timestamp()+interval '1 hour');
    raise exception 'stale generation accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.backyrd_decision_vnext_product_activate_v1(1,v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,repeat('1',64),pg_catalog.clock_timestamp()-interval '1 second');
    raise exception 'expired authority accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

create temporary table product_projection_bytes as
select jsonb_build_object(
  'contractVersion','backyrd.user-intelligence.product-projection-envelope@2.0',
  'purpose','DECISION_RELEVANT_USER_PROJECTION','requestHash',b.request_hash,
  'subjectBindingHash',b.subject_hash,'consentHash',b.consent_hash,
  'projection',jsonb_build_object('status','NEUTRAL','neutralReason','MISSING_SNAPSHOT'),
  'issuedAt',pg_catalog.clock_timestamp()-interval '1 minute',
  'validUntil',pg_catalog.clock_timestamp()+interval '1 hour',
  'issuer','BACKYRD_USER_INTELLIGENCE_PROJECTION_AUTHORITY','envelopeHash',repeat('2',64)
)::text envelope from product_runtime_binding b;

create temporary table product_idempotency_created as
select public.backyrd_decision_vnext_product_idempotency_commit_v1(
  'DECISION_RELEVANT_USER_PROJECTION',pg_temp.product_runtime_uuid('product-user'),b.subject_hash,b.request_hash,b.consent_hash,
  'backyrd.user-intelligence.product-projection-envelope@2.0',b.release_hash,b.artifact_hash,b.source_set_hash,1,p.envelope,
  encode(extensions.digest(convert_to(p.envelope,'UTF8'),'sha256'),'hex'),3600
) value from product_runtime_binding b cross join product_projection_bytes p;
select pg_temp.product_runtime_assert((select value->>'status'='CREATED' from product_idempotency_created),'first Product idempotency commit creates');

create temporary table product_idempotency_replayed as
select public.backyrd_decision_vnext_product_idempotency_commit_v1(
  'DECISION_RELEVANT_USER_PROJECTION',pg_temp.product_runtime_uuid('product-user'),b.subject_hash,b.request_hash,b.consent_hash,
  'backyrd.user-intelligence.product-projection-envelope@2.0',b.release_hash,b.artifact_hash,b.source_set_hash,1,'{"ignored":true}',
  encode(extensions.digest(convert_to('{"ignored":true}','UTF8'),'sha256'),'hex'),60
) value from product_runtime_binding b;
select pg_temp.product_runtime_assert((select value->>'status'='REPLAYED' from product_idempotency_replayed),'same payload replays the first exact response');

create temporary table product_idempotency_conflict as
select public.backyrd_decision_vnext_product_idempotency_commit_v1(
  'DECISION_RELEVANT_USER_PROJECTION',pg_temp.product_runtime_uuid('product-user'),b.subject_hash,b.request_hash,repeat('0',64),
  'backyrd.user-intelligence.product-projection-envelope@2.0',b.release_hash,b.artifact_hash,b.source_set_hash,1,p.envelope,
  encode(extensions.digest(convert_to(p.envelope,'UTF8'),'sha256'),'hex'),60
) value from product_runtime_binding b cross join product_projection_bytes p;
select pg_temp.product_runtime_assert((select value->>'status'='CONFLICT' from product_idempotency_conflict),'changed payload conflicts without overwrite');

select pg_temp.product_runtime_assert(
  (select public.backyrd_decision_vnext_product_projection_v1(
    pg_temp.product_runtime_uuid('product-user'),request_hash,consent_hash,subject_hash,
    release_hash,artifact_hash,source_set_hash,1
  )->>'status'='ACTIVE' from product_runtime_binding),
  'consented account receives the exact stored projection envelope'
);
select pg_temp.product_runtime_assert(
  (select public.backyrd_decision_vnext_product_projection_v1(
    pg_temp.product_runtime_uuid('no-consent-user'),request_hash,consent_hash,subject_hash,
    release_hash,artifact_hash,source_set_hash,1
  )->>'neutralReason'='NO_CONSENT' from product_runtime_binding),
  'no-consent account is neutral before any personal envelope read'
);

create temporary table product_execution_bytes as
select jsonb_build_object(
  'response',jsonb_build_object(
    'contractVersion','backyrd.decision-vnext.product-response@1.0','status','AVAILABLE',
    'decisionId','decision-product-authority-1','candidates',jsonb_build_array(
      jsonb_build_object('spotId','spot-presented-1','rank',1)
    ),'legacyEngineUsed',false,'fallbackUsed',false
  ),
  'envelope',jsonb_build_object(
    'decisionId','decision-product-authority-1','actor',jsonb_build_object('subjectBindingHash',b.subject_hash),
    'authority',jsonb_build_object('serverTime',clock_timestamp(),'purpose','PRODUCT_DECISION','transportSlug','decision-v13'),
    'bindings',jsonb_build_object('contextHash',repeat('9',64)),
    'boundaries',jsonb_build_object('legacyEngineUsed',false,'fallbackUsed',false)
  ),
  'projection',jsonb_build_object('status','ACTIVE'),
  'learningEvents',jsonb_build_array(jsonb_build_object(
    'eventType','decision_requested','decisionId','decision-product-authority-1','sessionId','session-product-authority-1'
  ))
)::text execution from product_runtime_binding b;

create temporary table product_execution_created as
select public.backyrd_decision_vnext_product_idempotency_commit_v1(
  'PRODUCT_DECISION_VNEXT_EVALUATION',pg_temp.product_runtime_uuid('product-user'),b.subject_hash,repeat('8',64),repeat('9',64),
  'backyrd.decision-vnext.product-response@1.0',b.release_hash,b.artifact_hash,b.source_set_hash,1,e.execution,
  encode(extensions.digest(convert_to(e.execution,'UTF8'),'sha256'),'hex'),3600
) value from product_runtime_binding b cross join product_execution_bytes e;
select pg_temp.product_runtime_assert((select value->>'status'='CREATED' from product_execution_created),'sealed Product execution is stored subject-bound');
select pg_temp.product_runtime_assert(
  (select public.backyrd_decision_vnext_product_interaction_authority_v1(
    pg_temp.product_runtime_uuid('product-user'),subject_hash,'decision-product-authority-1','spot-presented-1',
    release_hash,artifact_hash,source_set_hash,1
  )=jsonb_build_object('status','AUTHORIZED','sessionId','session-product-authority-1','contextBindingHash',repeat('9',64),'spotId','spot-presented-1','occurredAt',
    (select execution::jsonb#>>'{envelope,authority,serverTime}' from product_execution_bytes)) from product_runtime_binding),
  'authorized interaction returns status plus only the four sealed authority fields'
);

create temporary table product_no_consent_canary as
select public.backyrd_decision_vnext_product_idempotency_commit_v1(
  'PRODUCT_DECISION_VNEXT_EVALUATION',pg_temp.product_runtime_uuid('no-consent-user'),b.subject_hash,repeat('7',64),repeat('6',64),
  'backyrd.decision-vnext.product-response@1.0',b.release_hash,b.artifact_hash,b.source_set_hash,1,
  '{"response":{"decisionId":"decision-no-consent-canary"}}',
  encode(extensions.digest(convert_to('{"response":{"decisionId":"decision-no-consent-canary"}}','UTF8'),'sha256'),'hex'),3600
) value from product_runtime_binding b;
create temporary table product_no_consent_before as
select count(*)::bigint idempotency_count,
  (select count(*) from public.backyrd_memory_bridge_outbox_v1 where user_id=pg_temp.product_runtime_uuid('no-consent-user'))::bigint outbox_count
from decision_vnext_private.product_idempotency_records_v1 where auth_user_id=pg_temp.product_runtime_uuid('no-consent-user');
select pg_temp.product_runtime_assert(
  (select public.backyrd_decision_vnext_product_interaction_authority_v1(
    pg_temp.product_runtime_uuid('no-consent-user'),subject_hash,'decision-no-consent-canary','spot-canary',
    release_hash,artifact_hash,source_set_hash,1
  )=jsonb_build_object('status','SUPPRESSED_NO_CONSENT') from product_runtime_binding),
  'no-consent interaction is suppressed before reading the poisoned personal execution'
);
select pg_temp.product_runtime_assert(
  (select count(*) from decision_vnext_private.product_idempotency_records_v1 where auth_user_id=pg_temp.product_runtime_uuid('no-consent-user'))=(select idempotency_count from product_no_consent_before)
  and (select count(*) from public.backyrd_memory_bridge_outbox_v1 where user_id=pg_temp.product_runtime_uuid('no-consent-user'))=(select outbox_count from product_no_consent_before),
  'no-consent authority lookup performs no write'
);
do $$
declare v_binding record;
begin
  select * into v_binding from product_runtime_binding;
  begin
    perform public.backyrd_decision_vnext_product_interaction_authority_v1(
      pg_temp.product_runtime_uuid('product-user'),v_binding.subject_hash,'decision-product-authority-1','spot-not-presented',
      v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,1
    );
    raise exception 'unpresented candidate received interaction authority';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.backyrd_decision_vnext_product_interaction_authority_v1(
      pg_temp.product_runtime_uuid('product-user'),v_binding.subject_hash,'decision-not-sealed','spot-presented-1',
      v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,1
    );
    raise exception 'wrong decision received interaction authority';
  exception when insufficient_privilege then null;
  end;
end;
$$;

create temporary table product_learning_body as
select jsonb_build_object(
  'contractVersion','backyrd.user-intelligence.product-decision-learning-record@1.0',
  'eventVersion','backyrd.user-intelligence.product-decision-event@1.0',
  'eventId','event-decision-requested-1','idempotencyKey','idempotency-decision-requested-1',
  'eventType','decision_requested','purpose','PERSONALIZED_DECISION_LEARNING',
  'userId',pg_temp.product_runtime_uuid('product-user')::text,'subjectBindingHash',repeat('3',64),
  'decisionId','decision-product-1','sessionId','session-product-1','journeyId','journey-product-1',
  'candidateId',null,'spotId',null,'contextBindingHash',repeat('4',64),
  'occurredAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'feedback',null,'targetEventId',null,'targetRecordHash',null,
  'authorityRecordId','authority-product-1','authorityRecordHash',repeat('5',64),
  'consentHash',repeat('6',64),'consentVersion','product-consent-1','lifecycle','ACTIVE',
  'semanticDisposition','OBSERVATION_ONLY',
  'boundaries',jsonb_build_object('rawEvidenceIncluded',false,'rawTextIncluded',false,'sensitiveInferenceIncluded',false,'worldMutationAuthorized',false,'clientRankingAuthorized',false,'clientProfileMutationAuthorized',false)
)::text body;

create temporary table product_learning_created as
select public.backyrd_decision_vnext_product_learning_append_v1(body,b.release_hash,b.artifact_hash,b.source_set_hash,1) value
from product_learning_body cross join product_runtime_binding b;
select pg_temp.product_runtime_assert((select value->>'status'='PERSISTED' from product_learning_created),'exact Product learning record persists');
select pg_temp.product_runtime_assert(
  (select count(*)=1 from decision_vnext_private.product_learning_records_v1
   where event_type='decision_requested' and record->>'eventType'='decision_requested'
     and record_bytes=(select body from product_learning_body)),
  'isolated Product store preserves the exact Product event bytes'
);
select pg_temp.product_runtime_assert(
  (select count(*)=22 from public.backyrd_memory_event_types_v1)
    and not exists(select 1 from public.backyrd_memory_source_adapters_v1 where source_table='decision_vnext_product_learning'),
  'Product append leaves the frozen N2 registry and adapters unchanged'
);
select pg_temp.product_runtime_assert(
  not exists(select 1 from public.backyrd_memory_bridge_outbox_v1 where source_type='product_decision_vnext'),
  'Product append creates no Legacy/N2 outbox row'
);
select pg_temp.product_runtime_assert(
  (select public.backyrd_decision_vnext_product_learning_append_v1(body,b.release_hash,b.artifact_hash,b.source_set_hash,1)->>'status'='REPLAYED'
   from product_learning_body cross join product_runtime_binding b),
  'byte-identical Product learning record replays'
);

do $$
declare v_body jsonb;v_binding record;
begin
  select body::jsonb into v_body from product_learning_body;
  select * into v_binding from product_runtime_binding;
  begin
    perform public.backyrd_decision_vnext_product_learning_append_v1(
      (v_body||jsonb_build_object('eventId','event-conflicting-reuse'))::text,
      v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,1
    );
    raise exception 'conflicting Product idempotency reuse accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.backyrd_decision_vnext_product_learning_append_v1(
      (v_body||jsonb_build_object('userId',pg_temp.product_runtime_uuid('no-consent-user')::text,'eventId','event-no-consent','idempotencyKey','idem-no-consent'))::text,
      v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,1
    );
    raise exception 'no-consent Product learning accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update decision_vnext_private.product_runtime_control_events_v1 set state='OFF' where generation=1;
    raise exception 'runtime control mutation accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update decision_vnext_private.product_idempotency_records_v1 set response_hash=repeat('0',64);
    raise exception 'Product idempotency mutation accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

-- Consent withdrawal invokes the Product-specific lifecycle purge as well as
-- the pre-existing canonical N2 purge.
update public.user_consents set status='withdrawn',granted_at=null,withdrawn_at=clock_timestamp()
where user_id=pg_temp.product_runtime_uuid('product-user') and purpose_key='personalized_recommendations';
select pg_temp.product_runtime_assert(
  not exists(select 1 from public.backyrd_memory_bridge_outbox_v1 where user_id=pg_temp.product_runtime_uuid('product-user') and source_type='product_decision_vnext')
  and not exists(select 1 from decision_vnext_private.product_idempotency_records_v1 where auth_user_id=pg_temp.product_runtime_uuid('product-user')),
  'withdrawal purges Product outbox and Product idempotency state'
);

create temporary table product_emergency_off as
select public.backyrd_decision_vnext_product_emergency_off_v1(
  1,release_hash,artifact_hash,source_set_hash,'EMERGENCY_SQL_CONTRACT_TEST',repeat('7',64)
) value from product_runtime_binding;
select pg_temp.product_runtime_assert(
  (select value->>'state'='OFF' and (value->>'killSwitch')::boolean and (value->>'generation')::bigint=2 from product_emergency_off),
  'service authority can append Emergency-OFF only'
);
do $$
declare v_binding record;
begin
  select * into v_binding from product_runtime_binding;
  begin
    perform public.backyrd_decision_vnext_product_emergency_off_v1(
      1,v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,'EMERGENCY_STALE_TEST',repeat('8',64)
    );
    raise exception 'stale Emergency-OFF generation accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.backyrd_decision_vnext_product_idempotency_commit_v1(
      'PRODUCT_DECISION_VNEXT_EVALUATION',null,repeat('1',64),repeat('2',64),repeat('3',64),
      'backyrd.decision-vnext.product-response@1.0',v_binding.release_hash,v_binding.artifact_hash,v_binding.source_set_hash,2,
      '{}',encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'),60
    );
    raise exception 'idempotency write accepted after Emergency-OFF';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
  begin perform public.backyrd_decision_vnext_product_control_v1(repeat('a',64),repeat('b',64),repeat('c',64),1);raise exception 'authenticated control call accepted';
  exception when insufficient_privilege then null;end;
  begin perform public.backyrd_decision_vnext_product_learning_append_v1('{}',repeat('a',64),repeat('b',64),repeat('c',64),1);raise exception 'authenticated learning call accepted';
  exception when insufficient_privilege then null;end;
end $$;
reset role;

rollback;
