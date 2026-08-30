\set ON_ERROR_STOP on
begin;

create function pg_temp.provider_bound_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'provider concurrency bound failed: %',p_message;end if;end$$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','72000000-0000-4000-8000-000000000001','authenticated','authenticated','provider-bound@test.invalid','','{}','{}',now(),now());
insert into public.categories(id,name) values('72000000-0000-4000-8000-000000000002','Provider Bound Test');
insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin,website) values
 ('72000000-0000-4000-8000-000000000003','Provider Slot One',47,7,'approved','Basel','72000000-0000-4000-8000-000000000002','REAL','https://one.example/'),
 ('72000000-0000-4000-8000-000000000004','Provider Slot Two',47,7,'approved','Basel','72000000-0000-4000-8000-000000000002','REAL','https://two.example/'),
 ('72000000-0000-4000-8000-000000000005','Provider Slot Pending',47,7,'approved','Basel','72000000-0000-4000-8000-000000000002','REAL','https://pending.example/');
insert into public.backyrd_city_bootstrap_runs_v1(id,run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status,requested_by,started_at)
values('72000000-0000-4000-8000-000000000006','provider-concurrency-bound-test','basel','Basel','{}','{}','{"researchConcurrencyLimit":2}','test',repeat('7',40),'INTELLIGENCE','RUNNING','72000000-0000-4000-8000-000000000001',now());
insert into public.backyrd_spot_research_jobs_v1(id,spot_id,actor_id,state,contract_version,source_scope,source_scope_hash,current_pass,phase,population_run_id,queued_at,lease_token,lease_expires_at,runner_id) values
 ('72000000-0000-4000-8000-000000000007','72000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000001','RUNNING','backyrd-spot-research-agent-v2.1','{}',repeat('a',64),'A','PASS_A_RUNNING','72000000-0000-4000-8000-000000000006',now()-interval '3 minutes','72000000-0000-4000-8000-000000000011',now()+interval '5 minutes','existing-one'),
 ('72000000-0000-4000-8000-000000000008','72000000-0000-4000-8000-000000000004','72000000-0000-4000-8000-000000000001','RUNNING','backyrd-spot-research-agent-v2.1','{}',repeat('b',64),'A','PASS_A_RUNNING','72000000-0000-4000-8000-000000000006',now()-interval '2 minutes','72000000-0000-4000-8000-000000000012',now()+interval '5 minutes','existing-two'),
 ('72000000-0000-4000-8000-000000000009','72000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000001','QUEUED','backyrd-spot-research-agent-v2.1','{}',repeat('c',64),'A','PASS_A_QUEUED','72000000-0000-4000-8000-000000000006',now(),null,null,null);
insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state,provider_response_id,provider_status) values
 ('72000000-0000-4000-8000-000000000007','A','RUNNING','resp_active_one','in_progress'),
 ('72000000-0000-4000-8000-000000000007','B','PENDING',null,null),
 ('72000000-0000-4000-8000-000000000008','A','RUNNING','resp_active_two','queued'),
 ('72000000-0000-4000-8000-000000000008','B','PENDING',null,null),
 ('72000000-0000-4000-8000-000000000009','A','QUEUED',null,null),
 ('72000000-0000-4000-8000-000000000009','B','PENDING',null,null);

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('request.jwt.claim.role','service_role',true);
select pg_temp.provider_bound_assert(public.backyrd_claim_spot_research_job_v2('overlap-worker',60,'72000000-0000-4000-8000-000000000006') is null,'fresh provider response was claimed while both slots were occupied');

reset role;
update public.backyrd_spot_research_passes_v2 set provider_status='completed' where job_id='72000000-0000-4000-8000-000000000007' and pass_key='A';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('request.jwt.claim.role','service_role',true);
select pg_temp.provider_bound_assert((public.backyrd_claim_spot_research_job_v2('safe-worker',60,'72000000-0000-4000-8000-000000000006')->>'jobId')='72000000-0000-4000-8000-000000000009','fresh provider response was not admitted after one slot completed');

reset role;
select pg_temp.provider_bound_assert(not has_function_privilege('anon','public.backyrd_claim_spot_research_job_v2(text,integer,uuid)','execute'),'anon has EXECUTE');
select pg_temp.provider_bound_assert(not has_function_privilege('authenticated','public.backyrd_claim_spot_research_job_v2(text,integer,uuid)','execute'),'authenticated has EXECUTE');
select pg_temp.provider_bound_assert(has_function_privilege('service_role','public.backyrd_claim_spot_research_job_v2(text,integer,uuid)','execute'),'service role lacks EXECUTE');

rollback;
