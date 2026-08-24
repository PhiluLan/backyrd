\set ON_ERROR_STOP on
begin;

create function pg_temp.continuation_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.continuation_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'decision continuation failed: %',p_message; end if; end $$;
create function pg_temp.continuation_actor(p_user uuid,p_role text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role',p_role,true);
end $$;

do $$
declare v_user uuid:=pg_temp.continuation_uuid('continuation-user');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','continuation@invalid','','{}','{}',now(),now());
end $$;

set local role authenticated;
select pg_temp.continuation_actor(pg_temp.continuation_uuid('continuation-user'),'authenticated');
select pg_temp.continuation_assert(not has_table_privilege('authenticated','public.backyrd_decision_continuations_v1','SELECT'),'authenticated role can read continuation state');
do $$ begin
 begin
  perform public.backyrd_next_decision_continuation_v1(gen_random_uuid(),pg_temp.continuation_uuid('continuation-user'),gen_random_uuid(),3);
  raise exception 'authenticated caller entered service continuation boundary';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role service_role;
select pg_temp.continuation_actor(pg_temp.continuation_uuid('continuation-user'),'service_role');
do $$
declare
  v_user uuid:=pg_temp.continuation_uuid('continuation-user');
  v_decision uuid:=pg_temp.continuation_uuid('continuation-decision');
  v_second uuid:=pg_temp.continuation_uuid('continuation-second-decision');
  v_order uuid[]:='{}';v_payload jsonb;v_page1 jsonb;v_page2 jsonb;v_page2_retry jsonb;v_page3 jsonb;v_page4 jsonb;
  v_request2 uuid:=pg_temp.continuation_uuid('continuation-page-2');v_i integer;v_spot uuid;
begin
  for v_i in 1..8 loop
    v_spot:=pg_temp.continuation_uuid('continuation-spot-'||v_i);
    insert into public.spots(id,name,lat,lng,status,city,data_origin)
    values(v_spot,'Continuation Fixture '||v_i,47.55+v_i/10000.0,7.59,'approved','Basel','TEST');
    v_order:=array_append(v_order,v_spot);
  end loop;
  select jsonb_object_agg(spot_id::text,jsonb_build_object('spot_id',spot_id,'name','Fixture '||ord,'rank',ord))
    into v_payload from unnest(v_order) with ordinality ids(spot_id,ord);
  insert into public.decision_sessions(id,user_id,city) values(v_decision,v_user,'Basel');
  v_page1:=public.backyrd_initialize_decision_continuation_v1(v_decision,v_user,v_order,v_payload,v_order[1:3],'DETERMINISTIC_NORTH_STAR','NOT_RUN');
  perform pg_temp.continuation_assert(v_page1->'returnedSpotIds'=to_jsonb(v_order[1:3]),'page 1 differs from frozen order');
  v_page2:=public.backyrd_next_decision_continuation_v1(v_decision,v_user,v_request2,3);
  perform pg_temp.continuation_assert(v_page2->'returnedSpotIds'=to_jsonb(v_order[4:6]),'page 2 repeats or skips frozen candidates');
  v_page2_retry:=public.backyrd_next_decision_continuation_v1(v_decision,v_user,v_request2,3);
  perform pg_temp.continuation_assert(v_page2_retry=v_page2,'response-loss retry is not idempotent');
  v_page3:=public.backyrd_next_decision_continuation_v1(v_decision,v_user,pg_temp.continuation_uuid('continuation-page-3'),3);
  perform pg_temp.continuation_assert(v_page3->'returnedSpotIds'=to_jsonb(v_order[7:8]) and (v_page3->>'exhausted')::boolean,'short final page is invalid');
  v_page4:=public.backyrd_next_decision_continuation_v1(v_decision,v_user,pg_temp.continuation_uuid('continuation-page-4'),3);
  perform pg_temp.continuation_assert(jsonb_array_length(v_page4->'returnedSpotIds')=0 and (v_page4->>'exhausted')::boolean,'exhausted page refilled old Spots');
  perform pg_temp.continuation_assert((select count(*)=8 from public.backyrd_decision_visible_impressions_v1 where decision_id=v_decision),'visible impressions are not exactly once');
  perform pg_temp.continuation_assert((select count(*)=4 from public.backyrd_decision_continuation_pages_v1 where decision_id=v_decision),'retry created a duplicate page');

  -- A distinct Decision may show a previous Spot again; continuity is scoped.
  insert into public.decision_sessions(id,user_id,city) values(v_second,v_user,'Basel');
  perform public.backyrd_initialize_decision_continuation_v1(v_second,v_user,v_order,v_payload,v_order[1:3],'DETERMINISTIC_NORTH_STAR','NOT_RUN');
  perform pg_temp.continuation_assert(exists(select 1 from public.backyrd_decision_visible_impressions_v1 where decision_id=v_second and spot_id=v_order[1]),'new Decision cannot independently show a Spot');
  -- A candidate made unavailable after page 1 is skipped, never used as refill.
  update public.spots set status='pending' where id=v_order[8];
  v_page2:=public.backyrd_next_decision_continuation_v1(v_second,v_user,pg_temp.continuation_uuid('continuation-second-page-2'),3);
  perform pg_temp.continuation_assert(v_page2->'skippedUnavailableSpotIds'=to_jsonb(v_order[8:8]),'unavailable candidate was not traced');
  v_page3:=public.backyrd_next_decision_continuation_v1(v_second,v_user,pg_temp.continuation_uuid('continuation-second-page-3'),3);
  perform pg_temp.continuation_assert(v_page3->'returnedSpotIds'=to_jsonb(v_order[7:7]) and (v_page3->>'exhausted')::boolean,'unavailable candidate was returned');

  begin
    perform public.backyrd_next_decision_continuation_v1(v_decision,gen_random_uuid(),gen_random_uuid(),3);
    raise exception 'cross-user continuation succeeded';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
