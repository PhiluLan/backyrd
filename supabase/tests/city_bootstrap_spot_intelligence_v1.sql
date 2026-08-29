begin;

create or replace function pg_temp.assert(p_condition boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_condition,false) then raise exception 'ASSERTION_FAILED: %',p_message;end if;end$$;
create or replace function pg_temp.r_uuid(p text) returns uuid language sql immutable as $$select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid$$;
create or replace function pg_temp.actor(p_user uuid,p_role text) returns void language plpgsql as $$begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role',p_role)::text,true);perform set_config('request.jwt.claim.sub',p_user::text,true);perform set_config('request.jwt.claim.role',p_role,true);end$$;

select pg_temp.assert((select count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('backyrd_city_bootstrap_runs_v1','backyrd_city_bootstrap_queries_v1','backyrd_city_bootstrap_candidates_v1','backyrd_city_bootstrap_evidence_v1','backyrd_spot_external_identities_v1','backyrd_city_bootstrap_reviews_v1','backyrd_city_bootstrap_jobs_v1','backyrd_city_bootstrap_cost_events_v1','backyrd_city_bootstrap_checkpoints_v1') and c.relrowsecurity),'all operational tables require RLS');
select pg_temp.assert(not has_table_privilege('anon','public.backyrd_city_bootstrap_candidates_v1','select'),'anon can read candidates');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_city_bootstrap_evidence_v1','select'),'authenticated can read evidence');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_city_bootstrap_reviews_v1','update'),'authenticated can mutate reviews');
select pg_temp.assert(has_table_privilege('service_role','public.backyrd_city_bootstrap_candidates_v1','insert'),'service role cannot operate pipeline');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_city_bootstrap_validate_candidate_v1(uuid)','execute'),'authenticated can validate candidates');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_city_bootstrap_enqueue_research_v1(uuid)','execute'),'authenticated can bypass Research enqueue controls');

insert into public.categories(name) values('Café') on conflict(name) do nothing;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.r_uuid('city-bootstrap-founder'),'authenticated','authenticated','city-bootstrap-founder@test.invalid','','{}','{}',now(),now());
insert into public.admin_users(user_id,role) values(pg_temp.r_uuid('city-bootstrap-founder'),'super_admin');

insert into public.backyrd_city_bootstrap_runs_v1(run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status,requested_by,started_at)
values('basel-pilot-test-v1','basel','Basel','{"south":47.519,"west":7.554,"north":47.599,"east":7.633}','{"osm":true,"googlePlaces":"identifier-only"}','{"pilotSize":30}','backyrd-city-bootstrap-v1',repeat('a',40),'PILOT','RUNNING',pg_temp.r_uuid('city-bootstrap-founder'),now());

insert into public.backyrd_city_bootstrap_candidates_v1(run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,website,google_place_id,external_types,canonical_category_name,relevance_state,relevance_reason,relevance_confidence,identity_state,identity_confidence,lifecycle_state,source_fingerprint)
select id,repeat('1',64),'Pilot Café','pilot cafe','Testweg 1','testweg 1','Basel','Switzerland',47.56,7.59,'https://pilot.example/','test-google-place-1',array['cafe'],'Café','RELEVANT','SUPPORTED_TYPE','HIGH','NEW_IDENTITY','STRONG','EVIDENCE_PENDING',repeat('b',64)
from public.backyrd_city_bootstrap_runs_v1 where run_key='basel-pilot-test-v1';

insert into public.backyrd_city_bootstrap_evidence_v1(candidate_id,source_family,source_identity,fact_family,normalized_value,evidence_fingerprint,authority_class,legal_use_status,observed_at,pipeline_version)
select id,'OPENSTREETMAP','node/100','IDENTITY',jsonb_build_object('source','osm'),repeat('4',64),'STRUCTURED_OPEN_DATA','PERMITTED',now(),'backyrd-city-bootstrap-v1' from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café'
union all
select id,'GOOGLE_PLACE_ID','test-google-place-1','IDENTITY',jsonb_build_object('identifierOnly',true),repeat('5',64),'IDENTIFIER_ONLY','IDENTIFIER_ONLY',now(),'backyrd-city-bootstrap-v1' from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café';

set local role service_role;
select pg_temp.actor(pg_temp.r_uuid('city-bootstrap-founder'),'service_role');
select pg_temp.assert((select (public.backyrd_city_bootstrap_validate_candidate_v1(id)->>'eligible')::boolean from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café'),'evidence gate did not validate pilot candidate');

select pg_temp.assert((select (public.backyrd_city_bootstrap_publish_candidate_v1(id)->>'published')::boolean from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café'),'eligible pilot candidate did not publish');
select pg_temp.assert((select count(*)=1 from public.spots where google_place_id='test-google-place-1' and status='approved' and data_origin='IMPORT' and google_photo_enabled=false),'canonical Spot identity publication contract failed');
select pg_temp.assert((select count(*)=1 from public.backyrd_spot_sources_v1 where source_reference like 'city-bootstrap:%' and spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'publication provenance missing');
select pg_temp.assert((select count(*)=1 from public.backyrd_spot_external_identities_v1 where source_family='GOOGLE_PLACE_ID' and source_identity='test-google-place-1'),'external identity missing');
select pg_temp.assert((select count(*)=0 from public.backyrd_spot_accepted_facts_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'publication wrote Accepted Facts directly');
select pg_temp.assert((select count(*)=0 from public.backyrd_spot_intelligence_evidence_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'publication wrote N4 directly');
select pg_temp.assert((select (public.backyrd_city_bootstrap_enqueue_research_v1(id)->>'canonicalWrite')::boolean=false from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café'),'Research adapter reported a canonical write');
select pg_temp.assert((select count(*)=1 from public.backyrd_spot_research_jobs_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1') and actor_id=pg_temp.r_uuid('city-bootstrap-founder') and contract_version='backyrd-spot-research-agent-v2.1'),'canonical Research v2.1 job missing');
select pg_temp.assert((select count(*)=2 from public.backyrd_spot_research_passes_v2 where job_id=(select id from public.backyrd_spot_research_jobs_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1'))),'Research A/B passes missing');
select public.backyrd_city_bootstrap_enqueue_research_v1(id) from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café';
select pg_temp.assert((select count(*)=1 from public.backyrd_spot_research_jobs_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'Research replay duplicated logical job');

select public.backyrd_city_bootstrap_publish_candidate_v1(id) from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café';
select pg_temp.assert((select count(*)=1 from public.spots where google_place_id='test-google-place-1'),'idempotent replay duplicated Spot');

insert into public.backyrd_city_bootstrap_candidates_v1(run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,website,google_place_id,external_types,canonical_category_name,relevance_state,relevance_reason,relevance_confidence,identity_state,identity_confidence,lifecycle_state,source_fingerprint)
select id,repeat('2',64),'Pilot Café Again','pilot cafe again','Otherweg 2','otherweg 2','Basel','Switzerland',47.561,7.591,'https://pilot-again.example/','test-google-place-1',array['cafe'],'Café','RELEVANT','SUPPORTED_TYPE','HIGH','NEW_IDENTITY','STRONG','PRODUCT_ELIGIBLE',repeat('c',64)
from public.backyrd_city_bootstrap_runs_v1 where run_key='basel-pilot-test-v1';
select public.backyrd_city_bootstrap_publish_candidate_v1(id) from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café Again';
select pg_temp.assert((select count(*)=1 from public.spots where google_place_id='test-google-place-1'),'same provider identity created duplicate Spot');

insert into public.backyrd_city_bootstrap_candidates_v1(run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,external_types,relevance_state,identity_state,lifecycle_state,source_fingerprint)
select id,repeat('3',64),'Ambiguous Place','ambiguous place','Shared 1','shared 1','Basel','Switzerland',47.57,7.60,array['tourist_attraction'],'AMBIGUOUS','AMBIGUOUS','REVIEW_REQUIRED',repeat('d',64)
from public.backyrd_city_bootstrap_runs_v1 where run_key='basel-pilot-test-v1';
select public.backyrd_city_bootstrap_open_review_v1(id,'IDENTITY_AMBIGUOUS','HIGH',repeat('d',64),'Resolve identity') from public.backyrd_city_bootstrap_candidates_v1 where display_name='Ambiguous Place';
select public.backyrd_city_bootstrap_open_review_v1(id,'IDENTITY_AMBIGUOUS','HIGH',repeat('d',64),'Resolve identity') from public.backyrd_city_bootstrap_candidates_v1 where display_name='Ambiguous Place';
select pg_temp.assert((select count(*)=1 from public.backyrd_city_bootstrap_reviews_v1 where reason='IDENTITY_AMBIGUOUS' and state='OPEN'),'review queue did not deduplicate');

insert into public.backyrd_city_bootstrap_jobs_v1(run_id,candidate_id,stage,idempotency_key)
select run_id,id,'IDENTITY','identity:test' from public.backyrd_city_bootstrap_candidates_v1 where display_name='Ambiguous Place';
create temporary table claimed as select public.backyrd_city_bootstrap_claim_job_v1((select id from public.backyrd_city_bootstrap_runs_v1 where run_key='basel-pilot-test-v1'),'test-runner',60) value;
select pg_temp.assert((select value->>'stage'='IDENTITY' from claimed),'job claim failed');
select public.backyrd_city_bootstrap_finish_job_v1((value->>'jobId')::uuid,(value->>'leaseToken')::uuid,true) from claimed;
select pg_temp.assert((select count(*)=1 from public.backyrd_city_bootstrap_jobs_v1 where id=(select (value->>'jobId')::uuid from claimed) and state='COMPLETE'),'job completion failed');

select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'N4 registry changed');
select pg_temp.assert((select count(*)=0 from public.spots where data_origin in ('TEST','FIXTURE') and status='approved'),'fixture leakage');

rollback;
