\set ON_ERROR_STOP on
begin;

create function pg_temp.temporal_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.temporal_assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'temporal attribution failed: %',p_message;end if;end$$;
create function pg_temp.temporal_actor(p_user uuid,p_role text) returns void language plpgsql as $$begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);perform set_config('request.jwt.claim.role',p_role,true);
end$$;

do $$declare u uuid:=pg_temp.temporal_uuid('user');s uuid:=pg_temp.temporal_uuid('spot');d uuid:=pg_temp.temporal_uuid('decision');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','temporal@fixture.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
 values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
 insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration');
 insert into public.spots(id,name,lat,lng,status,city,data_origin) values(s,'Temporal fixture',47.5,7.5,'approved','Basel','REAL');
 insert into public.decision_sessions(id,user_id,city,created_at) values(d,u,'Basel',now());
 insert into public.decision_impressions(decision_id,spot_id,rank) values(d,s,1);
 update public.backyrd_memory_bridge_settings_v1 set enabled=true;
 update public.backyrd_decision_input_runtime_settings_v1 set enabled=true;
end$$;

set local role authenticated;
select pg_temp.temporal_actor(pg_temp.temporal_uuid('user'),'authenticated');
do $$begin
 begin perform public.backyrd_capture_event_time_evidence_v1(pg_temp.temporal_uuid('spot'),pg_temp.temporal_uuid('decision'));raise exception 'client captured privileged evidence';exception when insufficient_privilege then null;end;
 begin perform 1 from public.backyrd_decision_evidence_envelopes_v1;raise exception 'client read private Decision evidence';exception when insufficient_privilege then null;end;
 begin perform 1 from public.backyrd_memory_event_evidence_envelopes_v1;raise exception 'client read private event evidence';exception when insufficient_privilege then null;end;
end$$;
reset role;

set local role service_role;
select pg_temp.temporal_actor(null,'service_role');
select public.backyrd_persist_decision_input_trace_v1(
 pg_temp.temporal_uuid('decision'),pg_temp.temporal_uuid('user'),repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),
 jsonb_build_object(pg_temp.temporal_uuid('spot')::text,repeat('f',64)),'LOW_OR_UNKNOWN','{}',repeat('e',64),'VALID'
);
select public.backyrd_persist_decision_evidence_envelope_v1(
 pg_temp.temporal_uuid('decision'),pg_temp.temporal_uuid('user'),repeat('b',64),repeat('e',64),'backyrd-canonical-semantics-v1',
 jsonb_build_object('audience','friends','daypart','evening'),
 jsonb_build_object('city','basel','socialContext','friends','requestedDayparts',jsonb_build_array('evening'),'concepts',jsonb_build_array('vibe.cozy')),
 jsonb_build_object('observedDaypart','morning'),
 jsonb_build_array(jsonb_build_object('spotId',pg_temp.temporal_uuid('spot'),'n4SnapshotHash',repeat('f',64),'availability','UNKNOWN','tasteConcepts','[]'::jsonb,'suitabilityContext','{}'::jsonb))
);
select pg_temp.temporal_assert((public.backyrd_capture_event_time_evidence_v1(pg_temp.temporal_uuid('spot'),pg_temp.temporal_uuid('decision'))#>>'{momentSignature,daypart}')='evening','requested evening not pinned');
select pg_temp.temporal_assert((public.backyrd_capture_event_time_evidence_v1(pg_temp.temporal_uuid('spot'),pg_temp.temporal_uuid('decision'))#>>'{ambientContext,observedDaypart}')='morning','ambient daypart missing');
select pg_temp.temporal_assert((public.backyrd_capture_event_time_evidence_v1(pg_temp.temporal_uuid('spot'),pg_temp.temporal_uuid('decision'))->>'attributionDisposition')='NO_EVENT_TIME_N4','UNKNOWN N4 was attributed');
reset role;

set local role authenticated;
select pg_temp.temporal_actor(pg_temp.temporal_uuid('user'),'authenticated');
select public.log_decision_action_v1(pg_temp.temporal_uuid('decision'),pg_temp.temporal_uuid('spot'),'exact_mood');
reset role;

set local role service_role;
select pg_temp.temporal_actor(null,'service_role');
select public.backyrd_memory_bridge_process_v1(50);
select pg_temp.temporal_assert((select count(*)=1 from public.backyrd_memory_event_evidence_envelopes_v1 e join public.backyrd_memory_events_v1 m on m.id=e.memory_event_id where m.user_id=pg_temp.temporal_uuid('user') and m.event_type='exact_mood_feedback' and e.attribution_disposition='NO_EVENT_TIME_N4'),'Passt envelope was not frozen as UNKNOWN');
select pg_temp.temporal_assert((select moment_signature->>'daypart'='evening' and moment_signature->>'audience'='friends' from public.backyrd_memory_events_v1 where user_id=pg_temp.temporal_uuid('user') and event_type='exact_mood_feedback'),'N2 lost requested moment');
select pg_temp.temporal_assert((select count(*)=0 from public.backyrd_memory_event_evidence_envelopes_v1 e cross join lateral jsonb_array_elements(e.taste_concepts)c where e.user_id=pg_temp.temporal_uuid('user')),'UNKNOWN event gained Taste concepts');
reset role;

rollback;
