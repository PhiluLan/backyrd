\set ON_ERROR_STOP on
begin;

create function pg_temp.ops_uuid(p text) returns uuid language sql immutable as $$select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid$$;
create function pg_temp.ops_assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'spot engine admin operations failed: %',p_message;end if;end$$;
create function pg_temp.ops_actor(p_user uuid,p_role text default 'authenticated') returns void language plpgsql as $$begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);perform set_config('request.jwt.claim.sub',p_user::text,true);perform set_config('request.jwt.claim.role',p_role,true);end$$;
create function pg_temp.ops_candidate_state(p_id uuid) returns text language sql security definer set search_path=public,pg_catalog as $$select lifecycle_state from public.backyrd_city_bootstrap_candidates_v1 where id=p_id$$;
create function pg_temp.ops_review_state(p_id uuid) returns text language sql security definer set search_path=public,pg_catalog as $$select state from public.backyrd_city_bootstrap_reviews_v1 where id=p_id$$;
create function pg_temp.ops_review_actor(p_id uuid) returns uuid language sql security definer set search_path=public,pg_catalog as $$select resolved_by from public.backyrd_city_bootstrap_reviews_v1 where id=p_id$$;
create function pg_temp.ops_job_state(p_id uuid) returns text language sql security definer set search_path=public,pg_catalog as $$select state from public.backyrd_city_bootstrap_jobs_v1 where id=p_id$$;
create function pg_temp.ops_job_retry_actor(p_id uuid) returns uuid language sql security definer set search_path=public,pg_catalog as $$select (admin_retry_history->0->>'actorId')::uuid from public.backyrd_city_bootstrap_jobs_v1 where id=p_id$$;

select pg_temp.ops_assert(not has_table_privilege('authenticated','public.backyrd_city_bootstrap_runs_v1','select'),'authenticated gained direct run reads');
select pg_temp.ops_assert(not has_table_privilege('authenticated','public.backyrd_city_bootstrap_reviews_v1','update'),'authenticated gained direct review writes');
select pg_temp.ops_assert(not has_function_privilege('anon','public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer)','execute'),'anon can read operations');
select pg_temp.ops_assert(has_function_privilege('authenticated','public.backyrd_admin_spot_engine_review_v1(uuid,text,text)','execute'),'Founder review RPC missing');
select pg_temp.ops_assert(not has_function_privilege('service_role','public.backyrd_admin_spot_engine_review_v1(uuid,text,text)','execute'),'service role received new admin RPC privilege');
select pg_temp.ops_assert((select count(*)=3 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('backyrd_admin_spot_engine_operations_v1','backyrd_admin_spot_engine_review_v1','backyrd_admin_spot_engine_retry_job_v1') and p.prosecdef and p.proconfig@>array['search_path=public,pg_catalog']::text[]),'admin RPC SECURITY DEFINER classification drifted');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000',pg_temp.ops_uuid('ops-founder'),'authenticated','authenticated','ops-founder@invalid','','{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000',pg_temp.ops_uuid('ops-user'),'authenticated','authenticated','ops-user@invalid','','{}','{}',now(),now());
insert into public.admin_users(user_id,role) values(pg_temp.ops_uuid('ops-founder'),'super_admin');
insert into public.categories(name) values('Café') on conflict(name) do nothing;

insert into public.backyrd_city_bootstrap_runs_v1(id,run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status,requested_by,started_at,stop_reason)
values(pg_temp.ops_uuid('ops-run'),'basel-scale-ops-test','basel','Basel','{}','{}','{}','backyrd-city-bootstrap-v1',repeat('a',40),'SCALE','PAUSED',pg_temp.ops_uuid('ops-founder'),now(),'CIRCUIT_BREAKER:OPS_TEST');

insert into public.backyrd_city_bootstrap_candidates_v1(id,run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,website,external_types,canonical_category_name,relevance_state,relevance_reason,relevance_confidence,identity_state,identity_confidence,lifecycle_state,source_fingerprint) values
(pg_temp.ops_uuid('ops-accept'),pg_temp.ops_uuid('ops-run'),repeat('1',64),'Ops Fixture','ops fixture','Testweg 1','testweg 1','Basel','Switzerland',47.56,7.59,'https://opsfixture.example/',array['cafe'],'Café','RELEVANT','SUPPORTED_TYPE','HIGH','NEW_IDENTITY','STRONG','REVIEW_REQUIRED',repeat('2',64)),
(pg_temp.ops_uuid('ops-reject'),pg_temp.ops_uuid('ops-run'),repeat('3',64),'Ambiguous Fixture','ambiguous fixture','Testweg 2','testweg 2','Basel','Switzerland',47.57,7.60,null,array['cafe'],'Café','AMBIGUOUS','IDENTITY_AMBIGUOUS','LOW','AMBIGUOUS','AMBIGUOUS','REVIEW_REQUIRED',repeat('4',64));
insert into public.backyrd_city_bootstrap_evidence_v1(candidate_id,source_family,source_identity,fact_family,normalized_value,evidence_fingerprint,authority_class,legal_use_status,observed_at,pipeline_version) values
(pg_temp.ops_uuid('ops-accept'),'OPENSTREETMAP','node/ops-1','IDENTITY','{"source":"osm"}',repeat('5',64),'STRUCTURED_OPEN_DATA','PERMITTED',now(),'backyrd-city-bootstrap-v1');
insert into public.backyrd_city_bootstrap_reviews_v1(id,run_id,candidate_id,reason,priority,evidence_fingerprint,proposed_action) values
(pg_temp.ops_uuid('ops-accept-review'),pg_temp.ops_uuid('ops-run'),pg_temp.ops_uuid('ops-accept'),'SOURCE_CONFLICT','MEDIUM',repeat('6',64),'Confirm corrected source'),
(pg_temp.ops_uuid('ops-reject-review'),pg_temp.ops_uuid('ops-run'),pg_temp.ops_uuid('ops-reject'),'IDENTITY_AMBIGUOUS','HIGH',repeat('7',64),'Resolve identity');
insert into public.backyrd_city_bootstrap_jobs_v1(id,run_id,candidate_id,stage,idempotency_key,state,attempts,max_attempts,failure_class,failure_code) values
(pg_temp.ops_uuid('ops-job'),pg_temp.ops_uuid('ops-run'),pg_temp.ops_uuid('ops-accept'),'EVIDENCE','ops:transient','FAILED',1,2,'TRANSIENT','provider_timeout');

set local role authenticated;
select pg_temp.ops_actor(pg_temp.ops_uuid('ops-user'));
do $$begin
  begin perform public.backyrd_admin_spot_engine_operations_v1('basel',pg_temp.ops_uuid('ops-run'),'ALL',100,0);raise exception 'non-admin entered operations';exception when insufficient_privilege then null;end;
  begin perform public.backyrd_admin_spot_engine_review_v1(pg_temp.ops_uuid('ops-reject-review'),'REJECT','foreign review id');raise exception 'non-admin mutated foreign review';exception when insufficient_privilege then null;end;
  begin perform public.backyrd_admin_spot_engine_retry_job_v1(pg_temp.ops_uuid('ops-job'));raise exception 'non-admin retried foreign job';exception when insufficient_privilege then null;end;
end$$;

reset role;
set local role anon;
select pg_temp.ops_actor(pg_temp.ops_uuid('ops-user'),'anon');
do $$begin
  begin perform public.backyrd_admin_spot_engine_operations_v1('basel',pg_temp.ops_uuid('ops-run'),'ALL',100,0);raise exception 'anon entered operations';exception when insufficient_privilege then null;end;
end$$;

reset role;
set local role authenticated;
select pg_temp.ops_actor(pg_temp.ops_uuid('ops-founder'));
do $$declare result jsonb;begin
 result:=public.backyrd_admin_spot_engine_operations_v1('basel',pg_temp.ops_uuid('ops-run'),'ALL',100,0);
 perform pg_temp.ops_assert(result->'selectedRun'->>'status'='PAUSED','pause state missing');
 perform pg_temp.ops_assert(result->'selectedRun'->>'stop_reason'='CIRCUIT_BREAKER:OPS_TEST','pause reason missing');
 perform pg_temp.ops_assert((result->'metrics'->>'discovered')::integer=2,'candidate metrics incorrect');
 perform pg_temp.ops_assert(jsonb_array_length(result->'reviewCases')=2,'review cases missing');
 perform pg_temp.ops_assert(result->>'serverOnlyCredentials'='true','secret boundary marker missing');
end$$;

select public.backyrd_admin_spot_engine_retry_job_v1(pg_temp.ops_uuid('ops-job'));
select pg_temp.ops_assert(pg_temp.ops_job_state(pg_temp.ops_uuid('ops-job'))='QUEUED','transient retry did not requeue');
select pg_temp.ops_assert(pg_temp.ops_job_retry_actor(pg_temp.ops_uuid('ops-job'))=pg_temp.ops_uuid('ops-founder'),'retry actor attribution missing');
select public.backyrd_admin_spot_engine_review_v1(pg_temp.ops_uuid('ops-reject-review'),'REJECT','Founder rejected ambiguous identity');
select pg_temp.ops_assert(pg_temp.ops_candidate_state(pg_temp.ops_uuid('ops-reject'))='REJECTED','rejected candidate was not isolated');
select pg_temp.ops_assert(pg_temp.ops_review_state(pg_temp.ops_uuid('ops-reject-review'))='REJECTED','review audit state missing');
select pg_temp.ops_assert(pg_temp.ops_review_actor(pg_temp.ops_uuid('ops-reject-review'))=pg_temp.ops_uuid('ops-founder'),'review actor attribution missing');
select public.backyrd_admin_spot_engine_review_v1(pg_temp.ops_uuid('ops-accept-review'),'ACCEPT','Founder confirmed corrected source');
select pg_temp.ops_assert(pg_temp.ops_candidate_state(pg_temp.ops_uuid('ops-accept'))='PRODUCT_ELIGIBLE','accepted review did not re-run eligibility');
select pg_temp.ops_assert(pg_temp.ops_review_state(pg_temp.ops_uuid('ops-accept-review'))='RESOLVED','accepted review audit state missing');

select pg_temp.ops_assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'N4 registry changed');
select pg_temp.ops_assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'Taste registry changed');
rollback;
