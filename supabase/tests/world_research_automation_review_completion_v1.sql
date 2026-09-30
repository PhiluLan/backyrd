\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world research review completion: %', p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;

select pg_temp.assert(
  not has_table_privilege('anon','public.world_research_automation_jobs_v1','select,insert,update,delete')
  and not has_table_privilege('authenticated','public.world_research_automation_jobs_v1','select,insert,update,delete')
  and has_table_privilege('service_role','public.world_research_automation_jobs_v1','update'),
  'review columns changed private grants');
select pg_temp.assert((select relrowsecurity from pg_class where oid='public.world_research_automation_jobs_v1'::regclass), 'RLS disabled');

insert into public.spots(id,name,city,lat,lng,status,data_origin)
values (pg_temp.id('world-review-spot'),'! Review completion test','Basel',47.55,7.58,'approved','REAL');
set local role service_role;
insert into public.world_research_automation_jobs_v1
  (id,spot_id,spot_name,actor_id,export_document,status)
values (pg_temp.id('world-review-job'),pg_temp.id('world-review-spot'),'! Review completion test',
  pg_temp.id('world-review-admin'),'{}'::jsonb,'READY_FOR_REVIEW');
update public.world_research_automation_jobs_v1
set reviewed_at=clock_timestamp(), reviewed_by=pg_temp.id('world-review-admin'), review_outcome='NO_CHANGES'
where id=pg_temp.id('world-review-job');
select pg_temp.assert((select review_outcome='NO_CHANGES' and reviewed_at is not null
  from public.world_research_automation_jobs_v1 where id=pg_temp.id('world-review-job')),
  'service could not record no-change review');
do $$ begin
  begin
    update public.world_research_automation_jobs_v1
    set reviewed_at=null where id=pg_temp.id('world-review-job');
    raise exception 'inconsistent review marker accepted';
  exception when check_violation then null; end;
end $$;
reset role;

delete from public.spots where id=pg_temp.id('world-review-spot');
rollback;
