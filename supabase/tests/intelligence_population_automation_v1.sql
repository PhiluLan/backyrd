begin;

create function pg_temp.population_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'intelligence population automation failed: %',p_message;end if;end$$;

select pg_temp.population_assert(not has_function_privilege('anon','public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)','execute'),'anon can control Population tick');
select pg_temp.population_assert(not has_function_privilege('authenticated','public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)','execute'),'authenticated/admin browser can control Population tick');
select pg_temp.population_assert(has_function_privilege('service_role','public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)','execute'),'service worker cannot control Population tick');
select pg_temp.population_assert(not has_function_privilege('anon','public.backyrd_configure_intelligence_population_worker_v1(text)','execute'),'anon can configure Population cron');
select pg_temp.population_assert(not has_function_privilege('authenticated','public.backyrd_configure_intelligence_population_worker_v1(text)','execute'),'authenticated/admin browser can configure Population cron');
select pg_temp.population_assert(has_function_privilege('service_role','public.backyrd_configure_intelligence_population_worker_v1(text)','execute'),'service worker cannot configure Population cron');

select pg_temp.population_assert((select p.prosecdef and regexp_replace(array_to_string(p.proconfig,','),'[[:space:]]','','g') like '%search_path=public,pg_catalog%' from pg_proc p where p.oid='public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)'::regprocedure),'tick control SECURITY DEFINER classification drift');
select pg_temp.population_assert((select p.prosecdef and regexp_replace(array_to_string(p.proconfig,','),'[[:space:]]','','g') like '%search_path=public,pg_catalog,vault,cron%' from pg_proc p where p.oid='public.backyrd_configure_intelligence_population_worker_v1(text)'::regprocedure),'cron configure SECURITY DEFINER classification drift');
select pg_temp.population_assert(pg_get_function_arguments('public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)'::regprocedure) not similar to '%(actor|user)%','caller-controlled actor/user argument');
select pg_temp.population_assert(pg_get_function_arguments('public.backyrd_configure_intelligence_population_worker_v1(text)'::regprocedure) not similar to '%(actor|user|secret|key)%','caller-controlled actor or credential argument');

set local role anon;
do $$begin
  begin perform public.backyrd_intelligence_population_tick_control_v1(gen_random_uuid(),'CLAIM',gen_random_uuid());raise exception 'anon tick control unexpectedly succeeded';exception when insufficient_privilege then null;end;
  begin perform public.backyrd_configure_intelligence_population_worker_v1('https://example.supabase.co/functions/v1/city-bootstrap-worker');raise exception 'anon cron configuration unexpectedly succeeded';exception when insufficient_privilege then null;end;
end$$;
reset role;

set local role authenticated;
do $$begin
  begin perform public.backyrd_intelligence_population_tick_control_v1(gen_random_uuid(),'CLAIM',gen_random_uuid());raise exception 'authenticated tick control unexpectedly succeeded';exception when insufficient_privilege then null;end;
  begin perform public.backyrd_configure_intelligence_population_worker_v1('https://example.supabase.co/functions/v1/city-bootstrap-worker');raise exception 'authenticated cron configuration unexpectedly succeeded';exception when insufficient_privilege then null;end;
end$$;
reset role;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','62000000-0000-4000-8000-000000000001','authenticated','authenticated','population-automation@invalid','','{}','{}',now(),now());
insert into public.admin_users(user_id,role) values('62000000-0000-4000-8000-000000000001','super_admin');
insert into public.backyrd_city_bootstrap_runs_v1(id,run_key,city_key,city_name,geography,source_configuration,target_configuration,pipeline_version,canonical_repository_commit,mode,status,requested_by,started_at)
values('62000000-0000-4000-8000-000000000002','basel-intelligence-population-automation-test','basel','Basel','{}','{}','{"phase":"FULL_LAUNCH_CURATION","researchConcurrencyLimit":3,"researchCoverageTarget":415,"discoveryEnabled":false}','backyrd-intelligence-population-v1',repeat('e',40),'INTELLIGENCE','RUNNING','62000000-0000-4000-8000-000000000001',now());

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('request.jwt.claim.role','service_role',true);
select pg_temp.population_assert((public.backyrd_intelligence_population_tick_control_v1('62000000-0000-4000-8000-000000000002','CLAIM','62000000-0000-4000-8000-000000000003')->>'claimed')::boolean,'authorized service worker could not claim tick lease');
select pg_temp.population_assert(not (public.backyrd_intelligence_population_tick_control_v1('62000000-0000-4000-8000-000000000002','CLAIM','62000000-0000-4000-8000-000000000004')->>'claimed')::boolean,'overlapping service tick acquired a second lease');
do $$begin
  begin perform public.backyrd_intelligence_population_tick_control_v1('62000000-0000-4000-8000-000000000002','RELEASE','62000000-0000-4000-8000-000000000004');raise exception 'foreign lease token released Population tick';exception when serialization_failure then null;end;
end$$;
select pg_temp.population_assert((public.backyrd_intelligence_population_tick_control_v1('62000000-0000-4000-8000-000000000002','RELEASE','62000000-0000-4000-8000-000000000003')->>'released')::boolean,'authorized service worker could not release its lease');
reset role;

rollback;
