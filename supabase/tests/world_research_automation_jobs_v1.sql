\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world research automation: %', p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;

select pg_temp.assert(
  not has_table_privilege('anon','public.world_research_automation_jobs_v1','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.world_research_automation_jobs_v1','select,insert,update,delete')
  and has_table_privilege('service_role','public.world_research_automation_jobs_v1','select,insert,update')
  and not has_function_privilege('anon','public.world_research_automation_enqueue_v1(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','public.world_research_automation_enqueue_v1(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','public.world_research_automation_claim_v1(integer)','execute')
  and has_function_privilege('service_role','public.world_research_automation_claim_v1(integer)','execute'),
  'private grants');
select pg_temp.assert((select relrowsecurity from pg_class where oid='public.world_research_automation_jobs_v1'::regclass), 'RLS disabled');

insert into public.spots(id,name,city,lat,lng,status,data_origin)
values (pg_temp.id('world-automation-spot'),'! Automation test','Basel',47.55,7.58,'approved','REAL');

set local role service_role;
select pg_temp.assert(
  (public.world_research_automation_enqueue_v1(
    pg_temp.id('world-automation-admin'),pg_temp.id('world-automation-spot'),
    jsonb_build_object('contractVersion','backyrd.world-research-batch@1.1','exportHash','fixture-hash',
      'batch',jsonb_build_object('spots',jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('world-automation-spot')::text,'name','! Automation test'))))
  )->>'reused')::boolean = false,
  'enqueue did not create a job');
select pg_temp.assert(
  (public.world_research_automation_enqueue_v1(
    pg_temp.id('world-automation-admin'),pg_temp.id('world-automation-spot'),
    jsonb_build_object('contractVersion','backyrd.world-research-batch@1.1','exportHash','fixture-hash',
      'batch',jsonb_build_object('spots',jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('world-automation-spot')::text,'name','! Automation test'))))
  )->>'reused')::boolean = true,
  'double click was not idempotent');
select pg_temp.assert((select count(*) from public.world_research_automation_jobs_v1 where spot_id=pg_temp.id('world-automation-spot'))=1,'duplicate job');
select pg_temp.assert((public.world_research_automation_claim_v1(90)->>'jobId')::uuid =
  (select id from public.world_research_automation_jobs_v1 where spot_id=pg_temp.id('world-automation-spot')), 'worker could not claim');
select pg_temp.assert((select status='RUNNING' and lease_token is not null and attempts=1
  from public.world_research_automation_jobs_v1 where spot_id=pg_temp.id('world-automation-spot')), 'lease was not recorded');
select pg_temp.assert(public.world_research_automation_claim_v1(90) is null, 'second worker claimed same job');
reset role;
delete from public.spots where id=pg_temp.id('world-automation-spot');
select pg_temp.assert(
  not exists (select 1 from public.world_research_automation_jobs_v1 where spot_id=pg_temp.id('world-automation-spot')),
  'spot deletion retained an orphan research job');
rollback;
