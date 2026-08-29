begin;

create or replace function pg_temp.assert(p_condition boolean,p_message text) returns void language plpgsql as $$begin if not coalesce(p_condition,false) then raise exception 'ASSERTION_FAILED: %',p_message;end if;end$$;

select pg_temp.assert((select count(*)=9 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('backyrd_city_bootstrap_runs_v1','backyrd_city_bootstrap_queries_v1','backyrd_city_bootstrap_candidates_v1','backyrd_city_bootstrap_evidence_v1','backyrd_spot_external_identities_v1','backyrd_city_bootstrap_reviews_v1','backyrd_city_bootstrap_jobs_v1','backyrd_city_bootstrap_cost_events_v1','backyrd_city_bootstrap_checkpoints_v1') and c.relrowsecurity),'all operational tables require RLS');
select pg_temp.assert(not has_table_privilege('anon','public.backyrd_city_bootstrap_candidates_v1','select'),'anon can read candidates');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_city_bootstrap_evidence_v1','select'),'authenticated can read evidence');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_city_bootstrap_reviews_v1','update'),'authenticated can mutate reviews');
select pg_temp.assert(has_table_privilege('service_role','public.backyrd_city_bootstrap_candidates_v1','insert'),'service role cannot operate pipeline');

insert into public.categories(name) values('Café') on conflict(name) do nothing;

insert into public.backyrd_city_bootstrap_runs_v1(run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status,started_at)
values('basel-pilot-test-v1','basel','Basel','{"south":47.519,"west":7.554,"north":47.599,"east":7.633}','{"osm":true}','{"pilotSize":30}','backyrd-city-bootstrap-v1',repeat('a',40),'PILOT','RUNNING',now());

insert into public.backyrd_city_bootstrap_candidates_v1(run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,website,google_place_id,external_types,canonical_category_name,relevance_state,relevance_reason,relevance_confidence,identity_state,identity_confidence,lifecycle_state,source_fingerprint)
select id,repeat('1',64),'Pilot Café','pilot cafe','Testweg 1','testweg 1','Basel','Switzerland',47.56,7.59,'https://pilot.example/','test-google-place-1',array['cafe'],'Café','RELEVANT','SUPPORTED_TYPE','HIGH','NEW_IDENTITY','STRONG','PRODUCT_ELIGIBLE',repeat('b',64)
from public.backyrd_city_bootstrap_runs_v1 where run_key='basel-pilot-test-v1';

select pg_temp.assert((select (public.backyrd_city_bootstrap_publish_candidate_v1(id)->>'published')::boolean from public.backyrd_city_bootstrap_candidates_v1 where display_name='Pilot Café'),'eligible pilot candidate did not publish');
select pg_temp.assert((select count(*)=1 from public.spots where google_place_id='test-google-place-1' and status='approved' and data_origin='IMPORT' and google_photo_enabled=false),'canonical Spot identity publication contract failed');
select pg_temp.assert((select count(*)=1 from public.backyrd_spot_sources_v1 where source_reference like 'city-bootstrap:%' and spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'publication provenance missing');
select pg_temp.assert((select count(*)=1 from public.backyrd_spot_external_identities_v1 where source_family='GOOGLE_PLACE_ID' and source_identity='test-google-place-1'),'external identity missing');
select pg_temp.assert((select count(*)=0 from public.backyrd_spot_accepted_facts_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'publication wrote Accepted Facts directly');
select pg_temp.assert((select count(*)=0 from public.backyrd_spot_intelligence_evidence_v1 where spot_id=(select id from public.spots where google_place_id='test-google-place-1')),'publication wrote N4 directly');

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
