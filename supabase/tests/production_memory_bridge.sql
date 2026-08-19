\set ON_ERROR_STOP on
begin;

create function pg_temp.uuid(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'memory bridge test failed: %',p_message; end if; end $$;

do $$
declare u uuid:=pg_temp.uuid('bridge-user'); o uuid:=pg_temp.uuid('bridge-other'); s uuid:=pg_temp.uuid('bridge-spot'); d uuid:=pg_temp.uuid('bridge-decision'); r uuid:=pg_temp.uuid('bridge-review');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','bridge@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',o,'authenticated','authenticated','bridge-other@fixture.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(u),(o) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status) values(s,'Bridge fixture',47.5,7.5,'approved');
  insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
  values('personalized_recommendations','Personalized','fixture','personalization','consent',true,false,false,1,true) on conflict(key) do nothing;
  insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration');
  update public.backyrd_memory_bridge_settings_v1 set enabled=true;
  insert into public.decision_sessions(id,user_id,city) values(d,u,'Basel');
  insert into public.decision_impressions(decision_id,spot_id,rank) values(d,s,1);
  insert into public.favorites(user_id,spot_id) values(u,s);
  delete from public.favorites where user_id=u and spot_id=s;
  insert into public.reservations(spot_id,user_id,date) values(s,u,now()+interval '1 day');
  insert into public.reviews(id,spot_id,user_id,product_evidence_origin,mood_a,text) values(r,s,u,'smart_review_v1','cozy','great place');
  insert into public.review_photos(review_id,url,uploaded_by) values(r,'https://fixture.invalid/review.jpg',u);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uuid('bridge-user'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.uuid('bridge-user')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.backyrd_record_memory_product_action_v1(pg_temp.uuid('bridge-open'),'spot_opened',pg_temp.uuid('bridge-spot'),pg_temp.uuid('bridge-decision'),'decision',now());
select public.backyrd_record_memory_product_action_v1(pg_temp.uuid('bridge-navigation'),'navigation_intent',pg_temp.uuid('bridge-spot'),pg_temp.uuid('bridge-decision'),'generic',now());
select pg_temp.assert(public.backyrd_record_memory_product_action_v1(pg_temp.uuid('bridge-open'),'spot_opened',pg_temp.uuid('bridge-spot'),pg_temp.uuid('bridge-decision'),'decision',now()) is not null,'exact product action replay is idempotent');
reset role;

select pg_temp.assert((select count(*)=8 from public.backyrd_memory_bridge_outbox_v1 where user_id=pg_temp.uuid('bridge-user')),'all defined source mappings queued once');
select pg_temp.assert((select count(*)=1 from public.backyrd_memory_bridge_outbox_v1 where canonical_event_type='verified_visit'),'only qualified Smart Review is experience');
select pg_temp.assert((select count(*)=0 from public.backyrd_memory_bridge_outbox_v1 where canonical_event_type in ('positive_post_visit','negative_post_visit')),'no source action implies satisfaction');
select pg_temp.assert((select count(*)=0 from public.backyrd_memory_bridge_outbox_v1 where source_metadata::text ilike '%great place%' or source_metadata::text ilike '%cozy%'),'review text and moods are not copied into N2 bridge metadata');

set local role service_role;
select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert((public.backyrd_memory_bridge_process_v1(50)->>'committed')::integer=8,'server worker commits queued events');
select pg_temp.assert((select count(*)=8 from public.backyrd_memory_events_v1 where user_id=pg_temp.uuid('bridge-user')),'one source mapping becomes one immutable N2 event');
select pg_temp.assert((select count(*)=0 from public.backyrd_memory_events_v1 where user_id=pg_temp.uuid('bridge-user') and event_type in ('positive_post_visit','negative_post_visit')),'semantic boundary survives ingestion');
select pg_temp.assert((public.backyrd_memory_bridge_process_v1(50)->>'committed')::integer=0,'replay never creates duplicate memory');
reset role;

do $$
declare u uuid:=pg_temp.uuid('bridge-user'); s uuid:=pg_temp.uuid('bridge-spot'); f uuid:=pg_temp.uuid('bridge-pending');
begin
  insert into public.favorites(id,user_id,spot_id) values(f,u,s);
  perform pg_temp.assert((select count(*)=1 from public.backyrd_memory_bridge_outbox_v1 where source_id=f::text||':added'),'pending event exists before withdrawal');
  update public.user_consents set status='withdrawn',granted_at=null,withdrawn_at=now() where user_id=u and purpose_key='personalized_recommendations';
  perform pg_temp.assert((select count(*)=0 from public.backyrd_memory_bridge_outbox_v1 where user_id=u),'withdrawal removes queued source so it cannot resurrect memory');
  perform pg_temp.assert((select count(*)=0 from public.backyrd_memory_events_v1 where user_id=u),'existing N2 withdrawal purge remains effective');
end $$;

set local role authenticated;
do $$ begin
  begin perform public.backyrd_memory_bridge_process_v1(1); raise exception 'client invoked worker';
  exception when insufficient_privilege then null; end;
  begin select * from public.backyrd_memory_bridge_outbox_v1; raise exception 'client read outbox';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
