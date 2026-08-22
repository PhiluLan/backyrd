\set ON_ERROR_STOP on
begin;
create function pg_temp.r_uuid(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'async research test failed: %',p_message; end if; end $$;
create function pg_temp.actor(p_user uuid,p_role text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);perform set_config('request.jwt.claim.sub',p_user::text,true);perform set_config('request.jwt.claim.role',p_role,true);end $$;

do $$ declare v_admin uuid:=pg_temp.r_uuid('research-admin');v_owner uuid:=pg_temp.r_uuid('research-owner');v_category uuid:=pg_temp.r_uuid('research-category');begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',v_admin,'authenticated','authenticated','research-admin@test.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',v_owner,'authenticated','authenticated','research-owner@test.invalid','','{}','{}',now(),now());
 insert into public.admin_users(user_id,role) values(v_admin,'admin');
 insert into public.categories(id,name) values(v_category,'Museum Test');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin,owner_id,website) values(pg_temp.r_uuid('research-spot'),'Research Museum',47,7,'approved','Basel',v_category,'REAL',v_owner,'https://museum.example/');
end $$;

set local role authenticated;
select pg_temp.actor(pg_temp.r_uuid('research-admin'),'authenticated');
do $$ declare a jsonb;b jsonb;begin
 a:=public.backyrd_enqueue_spot_research_job_v1(pg_temp.r_uuid('research-spot'),null);
 b:=public.backyrd_enqueue_spot_research_job_v1(pg_temp.r_uuid('research-spot'),null);
 perform pg_temp.assert(a->>'jobId'=b->>'jobId' and (b->>'deduplicated')::boolean,'double click was not deduplicated');
end $$;
select pg_temp.actor(pg_temp.r_uuid('research-owner'),'authenticated');
do $$ begin
 begin perform public.backyrd_enqueue_spot_research_job_v1(pg_temp.r_uuid('research-spot'),null);raise exception 'owner enqueued research';exception when insufficient_privilege then null;end;
end $$;

reset role;set local role service_role;select pg_temp.actor(pg_temp.r_uuid('research-admin'),'service_role');
do $$ declare claim jsonb;attempt jsonb;reclaim jsonb;result jsonb;before_facts bigint;before_n4 bigint;begin
 select count(*) into before_facts from public.backyrd_spot_accepted_facts_v1 where spot_id=pg_temp.r_uuid('research-spot');
 select count(*) into before_n4 from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=pg_temp.r_uuid('research-spot');
 claim:=public.backyrd_claim_spot_research_job_v1('runner-a',60);
 perform pg_temp.assert(claim->>'spotId'=pg_temp.r_uuid('research-spot')::text,'worker did not claim the queued job');
 attempt:=public.backyrd_begin_spot_research_attempt_v1((claim->>'jobId')::uuid,(claim->>'leaseToken')::uuid);
 perform public.backyrd_record_spot_research_provider_v1((claim->>'jobId')::uuid,(claim->>'leaseToken')::uuid,'resp_test','queued');
 perform public.backyrd_release_spot_research_job_v1((claim->>'jobId')::uuid,(claim->>'leaseToken')::uuid,'queued',1);
 update public.backyrd_spot_research_jobs_v1 set available_at=now() where id=(claim->>'jobId')::uuid;
 reclaim:=public.backyrd_claim_spot_research_job_v1('runner-b',60);
 perform pg_temp.assert(reclaim->>'providerResponseId'='resp_test','worker restart lost provider response identity');
 result:=public.backyrd_finalize_spot_research_job_v1((reclaim->>'jobId')::uuid,(reclaim->>'leaseToken')::uuid,'[]',jsonb_build_object('providerResponseId','resp_test','providerStatus','completed','inputTokens',10,'outputTokens',2,'totalTokens',12,'webSearchCalls',1,'latencyMs',4));
 perform pg_temp.assert(result->>'state'='READY_FOR_REVIEW' and (result->>'proposalCount')::integer=0,'final job disposition invalid');
 perform pg_temp.assert((select count(*) from public.backyrd_spot_accepted_facts_v1 where spot_id=pg_temp.r_uuid('research-spot'))=before_facts,'research wrote accepted truth');
 perform pg_temp.assert((select count(*) from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=pg_temp.r_uuid('research-spot'))=before_n4,'research mutated N4');
 perform pg_temp.assert((public.backyrd_finalize_spot_research_job_v1((reclaim->>'jobId')::uuid,(reclaim->>'leaseToken')::uuid,'[]','{}')->>'replayed')::boolean,'response-loss replay was not idempotent');
end $$;

select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_spot_research_jobs_v1','select'),'client can read private job rows directly');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_claim_spot_research_job_v1(text,integer)','execute'),'client can claim jobs');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_finalize_spot_research_job_v1(uuid,uuid,jsonb,jsonb)','execute'),'client can persist provider output');
rollback;
