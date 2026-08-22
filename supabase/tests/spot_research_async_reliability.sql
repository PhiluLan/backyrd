\set ON_ERROR_STOP on
begin;
create function pg_temp.r_uuid(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'async research v2 test failed: %',p_message; end if; end $$;
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
 perform pg_temp.assert(a->>'phase'='PASS_A_QUEUED','job did not expose Pass A progress');
end $$;
select pg_temp.actor(pg_temp.r_uuid('research-owner'),'authenticated');
do $$ begin begin perform public.backyrd_enqueue_spot_research_job_v1(pg_temp.r_uuid('research-spot'),null);raise exception 'owner enqueued research';exception when insufficient_privilege then null;end;end $$;

reset role;set local role service_role;select pg_temp.actor(pg_temp.r_uuid('research-admin'),'service_role');
do $$ declare claim jsonb;attempt jsonb;reclaim jsonb;result jsonb;second jsonb;before_facts bigint;before_n4 bigint;v_job uuid;v_lease uuid;begin
 select count(*) into before_facts from public.backyrd_spot_accepted_facts_v1 where spot_id=pg_temp.r_uuid('research-spot');
 select count(*) into before_n4 from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=pg_temp.r_uuid('research-spot');
 claim:=public.backyrd_claim_spot_research_job_v1('runner-a',60);v_job:=(claim->>'jobId')::uuid;v_lease:=(claim->>'leaseToken')::uuid;
 perform pg_temp.assert(claim->>'spotId'=pg_temp.r_uuid('research-spot')::text and claim->>'passKey'='A','worker did not claim Pass A');
 attempt:=public.backyrd_begin_spot_research_pass_attempt_v2(v_job,v_lease,'A');
 perform public.backyrd_record_spot_research_pass_disposition_v2(v_job,v_lease,'A',jsonb_build_object('providerResponseId','resp_a','providerStatus','queued','inputBytes',900));
 perform public.backyrd_release_spot_research_pass_v2(v_job,v_lease,'A','queued',1);
 update public.backyrd_spot_research_jobs_v1 set available_at=now() where id=v_job;
 reclaim:=public.backyrd_claim_spot_research_job_v1('runner-b',60);
 perform pg_temp.assert(reclaim->>'providerResponseId'='resp_a','worker restart lost Pass A response identity');
 result:=public.backyrd_finalize_spot_research_pass_v2(v_job,(reclaim->>'leaseToken')::uuid,'A',
  jsonb_build_array(jsonb_build_object('factKey','activity.types','value',jsonb_build_array('MUSEUM'),'supportStatus','SUPPORTED','sourceUrl','https://museum.example/visit','sourceType','OFFICIAL_WEBSITE','shortEvidence','Official museum visitor information.','observedAt',null,'passKey','A','classification','NEW','deterministicConfidence',.90)),
  jsonb_build_array(jsonb_build_object('fieldKey','activity.types','value',jsonb_build_array('MUSEUM'),'sourceUrl','https://museum.example/visit','sourceType','OFFICIAL_WEBSITE','sourceTitle','Museum','observedAt',null,'evidenceExcerpt','Official museum visitor information.','confidenceRationale','Deterministic OFFICIAL_WEBSITE policy (0.90); human acceptance required.','classification','NEW','deterministicConfidence',.90,'passKey','A')),
  jsonb_build_object('providerResponseId','resp_a','providerStatus','completed','inputBytes',900,'inputTokens',100,'outputTokens',80,'totalTokens',180,'webSearchCalls',1,'latencyMs',4));
 perform pg_temp.assert(result->>'state'='QUEUED' and result->>'phase'='PASS_A_COMPLETE','Pass A did not complete independently');
 perform pg_temp.assert((public.backyrd_finalize_spot_research_pass_v2(v_job,(reclaim->>'leaseToken')::uuid,'A','[]','[]','{}')->>'replayed')::boolean,'response-loss replay duplicated Pass A');
 second:=public.backyrd_claim_spot_research_job_v1('runner-c',60);
 perform pg_temp.assert(second->>'passKey'='B','Pass B was not made processable');
 perform public.backyrd_begin_spot_research_pass_attempt_v2(v_job,(second->>'leaseToken')::uuid,'B');
 result:=public.backyrd_fail_spot_research_pass_v2(v_job,(second->>'leaseToken')::uuid,'B',false,'research_output_schema_invalid');
 perform pg_temp.assert(result->>'state'='READY_FOR_REVIEW','Pass A success did not survive Pass B failure');
 perform pg_temp.assert((select count(*) from public.backyrd_spot_fact_proposals_v1 where spot_id=pg_temp.r_uuid('research-spot') and research_classification='NEW')=1,'deterministic proposal was not persisted once');
 perform pg_temp.assert((select count(*) from public.backyrd_spot_research_extractions_v2 where job_id=v_job)=1,'validated extraction trace missing');
 perform pg_temp.assert((select source_type from public.backyrd_spot_sources_v1 s join public.backyrd_spot_fact_proposals_v1 p on p.source_id=s.id where p.spot_id=pg_temp.r_uuid('research-spot') limit 1)='OFFICIAL_WEBSITE','source authority was flattened to Research');
 perform pg_temp.assert((select count(*) from public.backyrd_spot_accepted_facts_v1 where spot_id=pg_temp.r_uuid('research-spot'))=before_facts,'research wrote accepted truth');
 perform pg_temp.assert((select count(*) from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=pg_temp.r_uuid('research-spot'))=before_n4,'research mutated N4');
end $$;

select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_spot_research_jobs_v1','select'),'client can read private job rows directly');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_spot_research_extractions_v2','select'),'client can read private extraction rows directly');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_claim_spot_research_job_v1(text,integer)','execute'),'client can claim jobs');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_finalize_spot_research_pass_v2(uuid,uuid,text,jsonb,jsonb,jsonb)','execute'),'client can persist provider output');
rollback;
