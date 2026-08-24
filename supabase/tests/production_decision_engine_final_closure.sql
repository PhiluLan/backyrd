\set ON_ERROR_STOP on
begin;

create function pg_temp.closure_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.closure_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'decision closure failed: %',p_message; end if; end $$;
create function pg_temp.closure_actor(p_user uuid,p_role text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role',p_role,true);
end $$;

do $$
declare v_user uuid:=pg_temp.closure_uuid('decision-closure-user');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','decision-closure@invalid','','{}','{}',now(),now());
 insert into public.decision_sessions(id,user_id,city,mood_a_text,mood_b_text)
 values(pg_temp.closure_uuid('decision-closure-session'),v_user,'Basel','Regentag','mit meiner 4-jährigen Tochter');
end $$;

set local role authenticated;
select pg_temp.closure_actor(pg_temp.closure_uuid('decision-closure-user'),'authenticated');
select pg_temp.closure_assert(not has_table_privilege('authenticated','public.backyrd_decision_funnel_traces_v1','SELECT'),'authenticated role has trace SELECT privilege');
do $$ begin
 begin
  perform public.backyrd_persist_decision_funnel_trace_v1(pg_temp.closure_uuid('decision-closure-session'),pg_temp.closure_uuid('decision-closure-user'),'RETRIEVAL','{}');
  raise exception 'authenticated caller wrote service trace';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role service_role;
select pg_temp.closure_actor(pg_temp.closure_uuid('decision-closure-user'),'service_role');
select public.backyrd_persist_decision_funnel_trace_v1(
 pg_temp.closure_uuid('decision-closure-session'),pg_temp.closure_uuid('decision-closure-user'),'RETRIEVAL',
 '{"currentIntent":{"rain":"PREFERRED","family":"FAMILY_WITH_CHILD","childAge":4},"funnel":{"retrieved":[{"spotId":"ab4da026-0d47-4ea1-b626-5293106b4fc2","fusionRank":11}],"excluded":[]}}'
);
select public.backyrd_persist_decision_funnel_trace_v1(
 pg_temp.closure_uuid('decision-closure-session'),pg_temp.closure_uuid('decision-closure-user'),'DECISION',
 '{"deterministicOrder":["ab4da026-0d47-4ea1-b626-5293106b4fc2"],"rankingInputs":{"ab4da026-0d47-4ea1-b626-5293106b4fc2":{"factualFit":{"disposition":"MATCHED"}}}}'
);
select public.backyrd_persist_decision_funnel_trace_v1(
 pg_temp.closure_uuid('decision-closure-session'),pg_temp.closure_uuid('decision-closure-user'),'COMPLETE',
 '{"finalSource":"DETERMINISTIC_NORTH_STAR","finalOrder":["ab4da026-0d47-4ea1-b626-5293106b4fc2"]}'
);
select pg_temp.closure_assert((select current_intent#>>'{rain}'='PREFERRED' from public.backyrd_decision_funnel_traces_v1 where decision_id=pg_temp.closure_uuid('decision-closure-session')),'retrieval stage missing');
select pg_temp.closure_assert((select decision_funnel#>>'{rankingInputs,ab4da026-0d47-4ea1-b626-5293106b4fc2,factualFit,disposition}'='MATCHED' from public.backyrd_decision_funnel_traces_v1 where decision_id=pg_temp.closure_uuid('decision-closure-session')),'decision stage missing');
select pg_temp.closure_assert((select completed_at is not null and final_disposition->>'finalSource'='DETERMINISTIC_NORTH_STAR' from public.backyrd_decision_funnel_traces_v1 where decision_id=pg_temp.closure_uuid('decision-closure-session')),'complete stage missing');
do $$ begin
 begin
  perform public.backyrd_persist_decision_funnel_trace_v1(pg_temp.closure_uuid('decision-closure-session'),pg_temp.closure_uuid('wrong-user'),'RETRIEVAL','{}');
  raise exception 'cross-user trace write succeeded';
 exception when insufficient_privilege then null; end;
end $$;

rollback;
