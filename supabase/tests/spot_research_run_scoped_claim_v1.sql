\set ON_ERROR_STOP on
begin;

create function pg_temp.claim_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'run-scoped research claim test failed: %',p_message; end if;
end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','71000000-0000-4000-8000-000000000001','authenticated','authenticated','run-claim@test.invalid','','{}','{}',now(),now());
insert into public.categories(id,name) values ('71000000-0000-4000-8000-000000000002','Run Scoped Claim Test');
insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin,website) values
  ('71000000-0000-4000-8000-000000000003','Older Audit Run Spot',47,7,'approved','Basel','71000000-0000-4000-8000-000000000002','REAL','https://older-run.example/'),
  ('71000000-0000-4000-8000-000000000004','Target Run Spot',47,7,'approved','Basel','71000000-0000-4000-8000-000000000002','REAL','https://target-run.example/'),
  ('71000000-0000-4000-8000-000000000009','Standalone Research Spot',47,7,'approved','Basel','71000000-0000-4000-8000-000000000002','REAL','https://standalone.example/');
insert into public.backyrd_city_bootstrap_runs_v1(id,run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status,requested_by,started_at) values
  ('71000000-0000-4000-8000-000000000005','test-intelligence-old-run','basel','Basel','{}','{}','{}','test','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','INTELLIGENCE','RUNNING','71000000-0000-4000-8000-000000000001',now()),
  ('71000000-0000-4000-8000-000000000006','test-intelligence-target-run','basel','Basel','{}','{}','{}','test','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','INTELLIGENCE','RUNNING','71000000-0000-4000-8000-000000000001',now());
insert into public.backyrd_spot_research_jobs_v1(id,spot_id,actor_id,state,contract_version,source_scope,source_scope_hash,current_pass,phase,population_run_id,queued_at) values
  ('71000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','QUEUED','backyrd-spot-research-agent-v2.1','{"officialWebsite":"https://older-run.example/"}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','A','PASS_A_QUEUED','71000000-0000-4000-8000-000000000005',now()-interval '1 hour'),
  ('71000000-0000-4000-8000-000000000008','71000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','QUEUED','backyrd-spot-research-agent-v2.1','{"officialWebsite":"https://target-run.example/"}','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','A','PASS_A_QUEUED','71000000-0000-4000-8000-000000000006',now()),
  ('71000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000009','71000000-0000-4000-8000-000000000001','QUEUED','backyrd-spot-research-agent-v2.1','{"officialWebsite":"https://standalone.example/"}','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','A','PASS_A_QUEUED',null,now());
insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values
  ('71000000-0000-4000-8000-000000000007','A','QUEUED'),
  ('71000000-0000-4000-8000-000000000007','B','PENDING'),
  ('71000000-0000-4000-8000-000000000008','A','QUEUED'),
  ('71000000-0000-4000-8000-000000000008','B','PENDING'),
  ('71000000-0000-4000-8000-000000000010','A','QUEUED'),
  ('71000000-0000-4000-8000-000000000010','B','PENDING');

set local role anon;
do $$ begin
  begin
    perform public.backyrd_claim_spot_research_job_v2('anon',60,'71000000-0000-4000-8000-000000000006');
    raise exception 'anon claimed an Intelligence Population job';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role authenticated;
do $$ begin
  begin
    perform public.backyrd_claim_spot_research_job_v2('client',60,'71000000-0000-4000-8000-000000000006');
    raise exception 'authenticated client claimed an Intelligence Population job';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare v_claim jsonb;v_legacy_claim jsonb;begin
  v_claim:=public.backyrd_claim_spot_research_job_v2('target-worker',60,'71000000-0000-4000-8000-000000000006');
  perform pg_temp.claim_assert(v_claim->>'jobId'='71000000-0000-4000-8000-000000000008','worker claimed the older job from another run');
  perform pg_temp.claim_assert(v_claim->>'populationRunId'='71000000-0000-4000-8000-000000000006','claim omitted target-run attribution');
  perform pg_temp.claim_assert((select state='QUEUED' from public.backyrd_spot_research_jobs_v1 where id='71000000-0000-4000-8000-000000000007'),'older audit-run job was mutated');
  perform pg_temp.claim_assert((select state='RUNNING' from public.backyrd_spot_research_jobs_v1 where id='71000000-0000-4000-8000-000000000008'),'target-run job was not leased');
  v_legacy_claim:=public.backyrd_claim_spot_research_job_v1('scheduled-live-tick',60);
  perform pg_temp.claim_assert(v_legacy_claim->>'jobId'='71000000-0000-4000-8000-000000000010','legacy worker claimed a Population job instead of standalone Research');
  perform pg_temp.claim_assert((select state='QUEUED' from public.backyrd_spot_research_jobs_v1 where id='71000000-0000-4000-8000-000000000007'),'legacy worker drained the older Population run');
end $$;

reset role;
select pg_temp.claim_assert(not has_function_privilege('anon','public.backyrd_claim_spot_research_job_v2(text,integer,uuid)','execute'),'anon has EXECUTE');
select pg_temp.claim_assert(not has_function_privilege('authenticated','public.backyrd_claim_spot_research_job_v2(text,integer,uuid)','execute'),'authenticated has EXECUTE');
select pg_temp.claim_assert(has_function_privilege('service_role','public.backyrd_claim_spot_research_job_v2(text,integer,uuid)','execute'),'service role lacks EXECUTE');
select pg_temp.claim_assert((select proargnames is null or not (proargnames && array['p_actor','p_actor_id','p_user','p_user_id']) from pg_proc where oid='public.backyrd_claim_spot_research_job_v2(text,integer,uuid)'::regprocedure),'claim accepts caller-controlled actor identity');

rollback;
