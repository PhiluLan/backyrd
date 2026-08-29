begin;
create or replace function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'City Bootstrap website identity test failed: %',p_message;end if;end $$;
select pg_temp.assert(not public.backyrd_city_bootstrap_website_matches_name_v1('Bridge Bar','https://facebook.com/pg/barbrutbasel/about'),'stale social brand accepted');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Bridge Bar','https://www.bridge-bar.ch/'),'canonical venue domain rejected');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Bar Brut Basel','https://facebook.com/pg/barbrutbasel/about'),'matching social handle rejected');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Café Fab 6','https://sv-group.com/de/fab-6'),'concrete operator path rejected');
select pg_temp.assert(not public.backyrd_city_bootstrap_website_matches_name_v1('Robi Bachgraben','https://robi-spiel-aktionen.ch/angebot/robi-volta.html'),'sibling venue URL accepted');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Robi Bachgraben','https://robi-spiel-aktionen.ch/spielplaetze.php'),'operator overview rejected');
select pg_temp.assert(not public.backyrd_city_bootstrap_website_matches_name_v1('Basel Restaurant','https://operator.example/tenant'),'generic subject accepted');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Stucki','https://tanjagrandits.ch/restaurant-stucki/'),'valid operator URL rejected');
select pg_temp.assert(not public.backyrd_city_bootstrap_website_matches_name_v1('Oscar One','https://kitchenbrew.ch/locations/oscar-two'),'sibling operator path accepted');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Oscar One','https://kitchenbrew.ch/'),'unrelated custom brand should remain unknown');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Bridge Bar','https://instagram.com/bridgebar.official'),'matching social handle rejected');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Bridge Bar','https://sub.facebook.com/bridgebar'),'matching social subdomain rejected');
select pg_temp.assert(not public.backyrd_city_bootstrap_website_matches_name_v1('Bridge Bar','http://bridge-bar.ch'),'insecure URL accepted');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Restaurant Lu','https://restaurantlu.com/'),'short distinctive name rejected');
select pg_temp.assert(public.backyrd_city_bootstrap_website_matches_name_v1('Negishi Sushi Bar','https://negishi.ch/basel-steinen'),'location path rejected');

insert into public.backyrd_city_bootstrap_runs_v1(run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status)
values('website-identity-gate-v1','basel','Basel','{}','{}','{}','backyrd-city-bootstrap-v1',repeat('a',40),'SCALE','RUNNING');
insert into public.backyrd_city_bootstrap_candidates_v1(run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,website,external_types,relevance_state,identity_state,lifecycle_state,source_fingerprint)
select id,repeat('b',64),'Bridge Bar','bridge bar','Vogesenplatz 12','vogesenplatz 12','Basel','Switzerland',47.57,7.58,'https://facebook.com/pg/barbrutbasel/about',array['bar'],'RELEVANT','NEW_IDENTITY','EVIDENCE_PENDING',repeat('c',64)
from public.backyrd_city_bootstrap_runs_v1 where run_key='website-identity-gate-v1';
do $$begin
  update public.backyrd_city_bootstrap_candidates_v1 set lifecycle_state='PRODUCT_ELIGIBLE' where normalized_name='bridge bar';
  raise exception 'website identity trigger did not fail closed';
exception when sqlstate '22023' then
  if sqlerrm<>'city_bootstrap_website_identity_ambiguous' then raise;end if;
end$$;
select pg_temp.assert((select lifecycle_state='EVIDENCE_PENDING' from public.backyrd_city_bootstrap_candidates_v1 where normalized_name='bridge bar'),'failed transition mutated candidate state');
update public.backyrd_city_bootstrap_candidates_v1 set website='https://bridge-bar.ch/',lifecycle_state='PRODUCT_ELIGIBLE' where normalized_name='bridge bar';
select pg_temp.assert((select lifecycle_state='PRODUCT_ELIGIBLE' from public.backyrd_city_bootstrap_candidates_v1 where normalized_name='bridge bar'),'canonical identity evidence was blocked');

-- The server-only Stage runtime may write an evidence-pending Candidate, but
-- it still cannot call the helper directly or bypass the eligibility gate.
set local role service_role;
insert into public.backyrd_city_bootstrap_candidates_v1(run_id,identity_key,display_name,normalized_name,address,normalized_address,city,country,lat,lng,website,external_types,relevance_state,identity_state,lifecycle_state,source_fingerprint)
select id,repeat('d',64),'Service Stage Fixture','service stage fixture','Testweg 3','testweg 3','Basel','Switzerland',47.58,7.59,'https://unrelated.example/',array['cafe'],'RELEVANT','NEW_IDENTITY','EVIDENCE_PENDING',repeat('e',64)
from public.backyrd_city_bootstrap_runs_v1 where run_key='website-identity-gate-v1';
do $$begin
  update public.backyrd_city_bootstrap_candidates_v1 set display_name='Bridge Bar',website='https://facebook.com/pg/barbrutbasel/about',lifecycle_state='PRODUCT_ELIGIBLE' where identity_key=repeat('d',64);
  raise exception 'service role bypassed website identity trigger';
exception when sqlstate '22023' then
  if sqlerrm<>'city_bootstrap_website_identity_ambiguous' then raise;end if;
end$$;
reset role;
select pg_temp.assert((select lifecycle_state='EVIDENCE_PENDING' from public.backyrd_city_bootstrap_candidates_v1 where identity_key=repeat('d',64)),'service role failed to stage evidence-pending candidate');

select pg_temp.assert(not has_function_privilege('anon','public.backyrd_city_bootstrap_website_matches_name_v1(text,text)','EXECUTE'),'anonymous client can call identity helper');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_city_bootstrap_website_matches_name_v1(text,text)','EXECUTE'),'authenticated client can call identity helper');
select pg_temp.assert(not has_function_privilege('service_role','public.backyrd_city_bootstrap_website_matches_name_v1(text,text)','EXECUTE'),'service can bypass the worker audit through helper');
rollback;
