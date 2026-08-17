\set ON_ERROR_STOP on

begin;

create function pg_temp.n2_uuid(p_label text) returns uuid language sql immutable as $$
  select (substr(md5(p_label),1,8)||'-'||substr(md5(p_label),9,4)||'-4'||substr(md5(p_label),14,3)||'-8'||substr(md5(p_label),18,3)||'-'||substr(md5(p_label),21,12))::uuid;
$$;
create function pg_temp.n2_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'N2 acceptance failed: %',p_message; end if; end; $$;
create function pg_temp.n2_actor(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_user::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
end; $$;
create function pg_temp.n2_event(p_user uuid,p_id text,p_type text,p_spot uuid,p_session text default 'session-1') returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id',pg_temp.n2_uuid(p_id),'userId',p_user,'idempotencyKey','fixture:'||p_id,
    'eventType',p_type,'contractVersion','backyrd-memory-event-contract-v1',
    'occurredAt',now()-interval '2 days','observedAt',now()-interval '2 days' + interval '1 minute',
    'sessionId',p_session,'spotId',p_spot,
    'momentSignature',jsonb_build_object('audience','friends','daypart','evening','calendar','weekend','occasion','afterwork','placeType','bar'),
    'spotEvidence',case when p_type in ('candidate_exposed','not_there') then jsonb_build_object('placeType','bar','concepts',jsonb_build_array()) else jsonb_build_object('placeType','bar','concepts',jsonb_build_array('vibe.social','discovery.hidden_gem')) end,
    'provenance',jsonb_build_object('source','n2_fixture','sourceEventId',p_id,'sourceVersion','v1'),
    'consentPurpose','personalized_recommendations','consentState','granted'
  );
$$;

insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
values ('personalized_recommendations','Personalisierte Empfehlungen','N2 synthetic fixture.','personalization','consent',true,false,false,10,true)
on conflict (key) do nothing;

do $$
declare v_user uuid:=pg_temp.n2_uuid('user'); v_other uuid:=pg_temp.n2_uuid('other'); v_none uuid:=pg_temp.n2_uuid('none');
  v_spot1 uuid:=pg_temp.n2_uuid('spot1'); v_spot2 uuid:=pg_temp.n2_uuid('spot2'); v_result record;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','n2@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_other,'authenticated','authenticated','n2-other@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_none,'authenticated','authenticated','n2-none@fixture.invalid','','{}','{}',now(),now());
  insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values
    (v_user,'personalized_recommendations','granted',now(),'system_migration'),
    (v_other,'personalized_recommendations','granted',now(),'system_migration');
  insert into public.spots(id,name,lat,lng,status) values (v_spot1,'N2 Spot 1',47.5,7.5,'approved'),(v_spot2,'N2 Spot 2',47.6,7.6,'approved');

  select * into v_result from public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'shown','candidate_exposed',v_spot1));
  perform pg_temp.n2_assert(v_result.inserted,'first ingestion inserts');
  select * into v_result from public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'shown','candidate_exposed',v_spot1));
  perform pg_temp.n2_assert(not v_result.inserted,'exact replay is idempotent');
  perform public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'save','saved',v_spot1,'session-1'));
  perform public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'visit','verified_visit',v_spot2,'session-2'));
  perform pg_temp.n2_assert((select count(*)=3 from public.backyrd_memory_events_v1 where user_id=v_user),'canonical ledger contains one row per idempotent event');
  perform pg_temp.n2_assert((select event_class='EXPOSURE' and retention_class='EXPOSURE' from public.backyrd_memory_events_v1 where user_id=v_user and event_type='candidate_exposed'),'server contract derives class and retention');

  begin
    perform public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'shown','saved',v_spot1));
    raise exception 'conflicting replay accepted';
  exception when unique_violation then perform pg_temp.n2_assert(sqlerrm='memory_idempotency_conflict','conflict fails for canonical reason'); end;
  begin
    update public.backyrd_memory_events_v1 set event_type='saved' where user_id=v_user and event_type='candidate_exposed';
    raise exception 'immutable event changed';
  exception when object_not_in_prerequisite_state then perform pg_temp.n2_assert(sqlerrm='memory_events_are_immutable','memory mutation fails closed'); end;
  begin
    perform public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_none,'no-consent','saved',v_spot1));
    raise exception 'missing consent accepted';
  exception when insufficient_privilege then perform pg_temp.n2_assert(sqlerrm='personalization_consent_required','missing consent is rejected'); end;
  begin
    perform public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'future','saved',v_spot1)||jsonb_build_object('occurredAt',now()+interval '1 day'));
    raise exception 'future event accepted';
  exception when invalid_parameter_value then perform pg_temp.n2_assert(sqlerrm='future_memory_event_not_allowed','future event rejected'); end;
  begin
    perform public.backyrd_ingest_memory_event_v1(pg_temp.n2_event(v_user,'leak','saved',v_spot1)||jsonb_build_object('momentSignature',jsonb_build_object('latentTruth','secret')));
    raise exception 'forbidden field accepted';
  exception when invalid_parameter_value then perform pg_temp.n2_assert(sqlerrm='forbidden_memory_field','latent truth rejected'); end;

  insert into public.backyrd_user_behavior_patterns_v1(user_id,pattern_key,context_signature,state,confidence,evidence_count,independent_session_count,independent_spot_count,outcome_support_count,positive_count,negative_count,contradiction_rate,first_evidence_at,last_evidence_at,recency_state,evidence_fingerprint,calculated_at)
  values (v_user,'audience=friends|daypart=evening','{"audience":"friends","daypart":"evening"}','KNOWN',0.7,4,3,2,2,4,0,0,now()-interval '20 days',now()-interval '2 days','CURRENT',repeat('a',64),now()),
         (v_other,'audience=solo|daypart=morning','{"audience":"solo","daypart":"morning"}','KNOWN',0.8,5,4,3,3,5,0,0,now()-interval '30 days',now()-interval '1 day','CURRENT',repeat('b',64),now());
  insert into public.backyrd_user_intelligence_state_v1(user_id,knowledge_state,source_event_count,source_watermark,calculated_at)
  values (v_user,'DEVELOPING',3,now()-interval '2 days',now()),(v_other,'MATURE',10,now()-interval '1 day',now());
end; $$;

set local role authenticated;
select pg_temp.n2_actor(pg_temp.n2_uuid('user'));
do $$ begin
  perform pg_temp.n2_assert((select count(*)=1 from public.backyrd_user_behavior_patterns_v1),'RLS isolates other users patterns');
  perform pg_temp.n2_assert((public.backyrd_get_my_user_intelligence_v1()->>'knowledgeState')='DEVELOPING','own Intelligence summary is available');
  perform pg_temp.n2_assert((select count(*)=3 from public.backyrd_get_my_memory_timeline_v1(50)),'bounded own timeline is available');
  begin perform count(*) from public.backyrd_memory_events_v1; raise exception 'raw Memory leaked'; exception when insufficient_privilege then null; end;
  begin insert into public.backyrd_user_intelligence_state_v1(user_id,knowledge_state,calculated_at) values(pg_temp.n2_uuid('user'),'MATURE',now()); raise exception 'client mutated Intelligence'; exception when insufficient_privilege then null; end;
end; $$;
reset role;

update public.user_consents set status='withdrawn',granted_at=null,withdrawn_at=now()
where user_id=pg_temp.n2_uuid('user') and purpose_key='personalized_recommendations';

do $$ begin
  perform pg_temp.n2_assert((select count(*)=0 from public.backyrd_memory_events_v1 where user_id=pg_temp.n2_uuid('user')),'withdrawal erases Memory');
  perform pg_temp.n2_assert((select count(*)=0 from public.backyrd_user_behavior_patterns_v1 where user_id=pg_temp.n2_uuid('user')),'withdrawal erases Patterns');
  perform pg_temp.n2_assert((select count(*)=0 from public.backyrd_user_intelligence_state_v1 where user_id=pg_temp.n2_uuid('user')),'withdrawal erases derived Intelligence');
  perform pg_temp.n2_assert(not has_table_privilege('anon','public.backyrd_memory_events_v1','select') and not has_table_privilege('authenticated','public.backyrd_memory_events_v1','select'),'raw Memory is service-only');
  perform pg_temp.n2_assert((select relrowsecurity from pg_class where oid='public.backyrd_memory_events_v1'::regclass),'Memory RLS enabled');
  perform pg_temp.n2_assert((select count(*)=22 from public.backyrd_memory_event_types_v1),'event contract registry frozen');
  perform pg_temp.n2_assert((select count(*)=8 from public.backyrd_memory_retention_contract_v1),'retention contract complete');
end; $$;

rollback;
