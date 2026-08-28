\set ON_ERROR_STOP on
begin;

create function pg_temp.cutover_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.cutover_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'fresh Product cutover failed: %',p_message; end if; end $$;
create function pg_temp.cutover_actor(p_user uuid,p_role text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);
 perform set_config('request.jwt.claim.sub',coalesce(p_user::text,''),true);
 perform set_config('request.jwt.claim.role',p_role,true);
end $$;

do $$
declare v_internal uuid:=pg_temp.cutover_uuid('internal');v_public uuid:=pg_temp.cutover_uuid('public');v_i int;
begin
 insert into auth.users(instance_id,id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values
 ('00000000-0000-0000-0000-000000000000',v_internal,'authenticated','authenticated','fresh-cutover@backyrd.ch',now(),'','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',v_public,'authenticated','authenticated','fresh-cutover@example.test',now(),'','{}','{}',now(),now());
 update public.profiles set profile_onboarding_completed_at=now(),decision_onboarding_completed_at=now(),onboarding_version='canonical-semantics-v1' where id in(v_internal,v_public);
 insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
 values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
 insert into public.user_consents(user_id,purpose_key,status,granted_at,source)
 values(v_internal,'personalized_recommendations','granted',now(),'system_migration'),(v_public,'personalized_recommendations','granted',now(),'system_migration');
 for v_i in 1..3 loop
  insert into public.spots(id,name,lat,lng,status,city,data_origin)
  values(pg_temp.cutover_uuid('spot-'||v_i),'Cutover Spot '||v_i,47.5+v_i/1000.0,7.5,'approved','Basel','TEST');
 end loop;
end $$;

set local role service_role;
select pg_temp.cutover_actor(pg_temp.cutover_uuid('internal'),'service_role');
select pg_temp.cutover_assert(public.backyrd_canonical_product_user_enabled_v1(pg_temp.cutover_uuid('internal'),'DECISION'),'verified controlled Fresh user missed North-Star');
select pg_temp.cutover_assert(not public.backyrd_canonical_product_user_enabled_v1(pg_temp.cutover_uuid('public'),'DECISION'),'public rollout expanded outside controlled cohort');

do $$
declare
 v_user uuid:=pg_temp.cutover_uuid('internal');v_decision uuid;v_order uuid[]:=array[pg_temp.cutover_uuid('spot-1'),pg_temp.cutover_uuid('spot-2'),pg_temp.cutover_uuid('spot-3')];v_payload jsonb;v_legacy_before bigint;
begin
 v_decision:=public.backyrd_prepare_internal_live_decision_v1(v_user,'Basel','gemütlich','Freunde',jsonb_build_object('canonicalIntent',jsonb_build_object('socialContext','friends')),v_order,array['a','b','c'],true);
 select jsonb_object_agg(id::text,jsonb_build_object('spot_id',id,'name',name)) into v_payload from public.spots where id=any(v_order);
 perform public.backyrd_initialize_decision_continuation_v1(v_decision,v_user,v_order,v_payload,v_order,'DETERMINISTIC_NORTH_STAR','NOT_RUN');
 perform pg_temp.cutover_assert((select count(*)=0 from public.backyrd_decision_visible_impressions_v1 where decision_id=v_decision),'unseen response payload created exposures');
 perform public.backyrd_record_visible_decision_impression_v1(v_decision,v_order[1],1,1);
 perform public.backyrd_record_visible_decision_impression_v1(v_decision,v_order[1],1,1);
 perform pg_temp.cutover_assert((select count(*)=1 from public.backyrd_decision_visible_impressions_v1 where decision_id=v_decision),'visible exposure is not idempotent');
 perform pg_temp.cutover_assert(not exists(select 1 from public.backyrd_decision_visible_impressions_v1 where decision_id=v_decision and spot_id=any(v_order[2:3])),'unseen cards became exposures');
 select count(*) into v_legacy_before from public.user_taste_events_v2 where user_id=v_user;
 perform public.log_decision_action_v1(v_decision,v_order[1],'exact_mood');
 perform pg_temp.cutover_assert(exists(select 1 from public.backyrd_memory_bridge_outbox_v1 where user_id=v_user and decision_id=v_decision and canonical_event_type='exact_mood_feedback'),'Passt missed canonical N2 outbox');
 perform pg_temp.cutover_assert((select count(*)=v_legacy_before from public.user_taste_events_v2 where user_id=v_user),'Passt created a parallel Legacy Taste write');
 begin
  perform public.log_decision_action_v1(v_decision,v_order[2],'not_there');
  raise exception 'feedback accepted for unseen card';
 exception when insufficient_privilege then null; end;
end $$;

rollback;
