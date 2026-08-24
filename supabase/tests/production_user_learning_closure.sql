\set ON_ERROR_STOP on
begin;
create function pg_temp.learning_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.learning_assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'learning closure failed: %',p_message;end if;end$$;
create function pg_temp.learning_actor(p_user uuid,p_role text) returns void language plpgsql as $$begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);perform set_config('request.jwt.claim.role',p_role,true);
end$$;

do $$declare u uuid:=pg_temp.learning_uuid('user');o uuid:=pg_temp.learning_uuid('other');s uuid:=pg_temp.learning_uuid('spot');d uuid:=pg_temp.learning_uuid('decision');payload jsonb;
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','learning@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',o,'authenticated','authenticated','learning-other@invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u),(o) on conflict do nothing;
 insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active) values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
 insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration'),(o,'personalized_recommendations','granted',now(),'system_migration');
 insert into public.spots(id,name,lat,lng,status,city,data_origin) values(s,'Learning fixture',47.5,7.5,'approved','Basel','REAL');
 update public.backyrd_memory_bridge_settings_v1 set enabled=true;update public.backyrd_user_intelligence_runtime_settings_v1 set enabled=true;
 insert into public.decision_sessions(id,user_id,city) values(d,u,'Basel');
 insert into public.backyrd_internal_decision_handoffs_v1(decision_id,user_id,city,request_context,candidate_ids) values(d,u,'Basel',jsonb_build_object('canonicalIntent',jsonb_build_object('semanticContractVersion','backyrd-canonical-semantics-v1')),array[s]);
 insert into public.decision_impressions(decision_id,spot_id,rank) values(d,s,1);
 perform pg_temp.learning_assert(not exists(select 1 from public.backyrd_memory_bridge_outbox_v1 where canonical_event_type='candidate_exposed'),'frozen internal candidate became exposure');
 payload:=jsonb_build_object(s::text,jsonb_build_object('spot_id',s,'name','Learning fixture'));
 perform public.backyrd_initialize_decision_continuation_v1(d,u,array[s],payload,array[s],'DETERMINISTIC_NORTH_STAR','NOT_RUN');
 perform pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_bridge_outbox_v1 where canonical_event_type='candidate_exposed'),'visible candidate did not become exactly one exposure');
end$$;

set local role authenticated;
select pg_temp.learning_actor(pg_temp.learning_uuid('user'),'authenticated');
select public.log_decision_action_v1(pg_temp.learning_uuid('decision'),pg_temp.learning_uuid('spot'),'exact_mood');
select public.log_decision_action_v1(pg_temp.learning_uuid('decision'),pg_temp.learning_uuid('spot'),'exact_mood');
select public.log_decision_action_v1(pg_temp.learning_uuid('decision'),pg_temp.learning_uuid('spot'),'not_there');
insert into public.reviews(spot_id,user_id,mood_a,text) values(pg_temp.learning_uuid('spot'),pg_temp.learning_uuid('user'),'gemütlich','War gut und gemütlich.');
select public.backyrd_set_self_declared_taste_v1('vibe.cozy',true,'PROFILE');
do $$begin
 perform pg_temp.learning_actor(pg_temp.learning_uuid('other'),'authenticated');
 begin perform public.log_decision_action_v1(pg_temp.learning_uuid('decision'),pg_temp.learning_uuid('spot'),'exact_mood');raise exception 'cross-user feedback accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;

select pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_bridge_outbox_v1 where canonical_event_type='exact_mood_feedback'),'duplicate Passt created duplicate canonical feedback');
select pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_bridge_outbox_v1 where canonical_event_type='not_there'),'Nicht passend was not captured');

set local role service_role;
select pg_temp.learning_actor(null,'service_role');
select public.backyrd_memory_bridge_process_v1(50);
select pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_events_v1 where user_id=pg_temp.learning_uuid('user') and event_type='exact_mood_feedback'),'Passt did not reach N2');
select pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_events_v1 where user_id=pg_temp.learning_uuid('user') and event_type='not_there'),'Nicht passend did not reach N2');
select pg_temp.learning_assert((select supersedes_event_id is not null from public.backyrd_memory_events_v1 where user_id=pg_temp.learning_uuid('user') and event_type='not_there'),'feedback correction did not supersede prior outcome');
select pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_events_v1 where user_id=pg_temp.learning_uuid('user') and event_type='verified_visit' and provenance->>'sourceEventId' like 'standard_review:%'),'modern standard Review did not reach N2 Experience');
select pg_temp.learning_assert((select count(*)=1 from public.backyrd_memory_events_v1 where user_id=pg_temp.learning_uuid('user') and event_type='onboarding_preference' and provenance->>'source'='SELF_DECLARED'),'self-declared Taste did not reach N2');
select pg_temp.learning_assert(not has_function_privilege('authenticated','public.backyrd_user_learning_health_v1()','execute'),'client can read learning health');
reset role;
rollback;
