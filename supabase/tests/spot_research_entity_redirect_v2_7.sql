begin;
create or replace function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'Research entity redirect v2.7 test failed: %',p_message;end if;end $$;

select pg_temp.assert(public.backyrd_research_url_matches_instance_v1('https://robi.example/spielplaetze.php','https://www.robi.example/angebot/offene-kinder/robi-bachgraben.html','Robi Bachgraben'),'concrete same-host subject redirect rejected');
select pg_temp.assert(not public.backyrd_research_url_matches_instance_v1('https://brand.example/basel-sbb','https://brand.example/','Brand Basel SBB'),'generic brand root accepted');
select pg_temp.assert(not public.backyrd_research_url_matches_instance_v1('https://robi.example/spielplaetze.php','https://robi.example/angebot/robi-volta.html','Robi Bachgraben'),'sibling venue accepted');
select pg_temp.assert(not public.backyrd_research_url_matches_instance_v1('https://robi.example/spielplaetze.php','https://robi.example/events/robi-bachgraben.html','Robi Bachgraben'),'event page accepted as persistent venue source');
select pg_temp.assert(not public.backyrd_research_url_matches_instance_v1('https://robi.example/spielplaetze.php','https://third-party.example/angebot/robi-bachgraben.html','Robi Bachgraben'),'third-party subject page accepted');
select pg_temp.assert(to_regprocedure('public.backyrd_finalize_spot_research_pass_v3_entity_redirect_v27(uuid,uuid,text,jsonb,jsonb,jsonb)') is not null,'v2.7 finalizer history was not preserved');
select pg_temp.assert(has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'service role cannot execute current finalizer');
select pg_temp.assert(not has_function_privilege('service_role','public.backyrd_finalize_spot_research_pass_v3_entity_instance_v26(uuid,uuid,text,jsonb,jsonb,jsonb)','EXECUTE'),'legacy v2.6 finalizer remains callable');

rollback;
