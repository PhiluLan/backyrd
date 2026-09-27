\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'research queue: %', p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_message in sqlerrm)>0 then return; end if;
    raise exception 'expected %, got %',p_message,sqlerrm;
  end;
  raise exception 'expected %, call succeeded',p_message;
end $$;

select pg_temp.assert(
  has_function_privilege('authenticated','public.world_product_admin_research_queue_v1(integer)','execute')
  and has_function_privilege('authenticated','public.world_product_admin_record_research_export_v1(uuid[])','execute')
  and not has_function_privilege('anon','public.world_product_admin_research_queue_v1(integer)','execute')
  and not has_function_privilege('anon','public.world_product_admin_record_research_export_v1(uuid[])','execute')
  and not has_function_privilege('service_role','public.world_product_admin_research_queue_v1(integer)','execute')
  and not has_table_privilege('authenticated','world_knowledge_private.research_spot_exports_v1','select,insert,update,delete'),
  'grants or private table exposure');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000',pg_temp.id('queue-admin'),'authenticated','authenticated','queue-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
       ('00000000-0000-0000-0000-000000000000',pg_temp.id('queue-user'),'authenticated','authenticated','queue-user@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('queue-admin'),true),(pg_temp.id('queue-user'),false)
  on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,city,lat,lng,status,data_origin)
select pg_temp.id('queue-spot-'||i), '! Research queue '||lpad(i::text,2,'0'), 'Basel',47.55,7.58,'approved','REAL'
from generate_series(1,12) i;
insert into public.spots(id,name,city,lat,lng,status,data_origin)
values(pg_temp.id('queue-unapproved'),'! Research queue unapproved','Basel',47.55,7.58,'pending','REAL');

select pg_temp.expect_error($q$select public.world_product_admin_research_queue_v1(1)$q$,'admin_required');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('queue-user'))::text,true);
select pg_temp.expect_error($q$select public.world_product_admin_research_queue_v1(1)$q$,'admin_required');
select pg_temp.expect_error($q$select public.world_product_admin_record_research_export_v1(array[pg_temp.id('queue-spot-1')])$q$,'admin_required');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('queue-admin'))::text,true);
select pg_temp.expect_error($q$select public.world_product_admin_research_queue_v1(0)$q$,'world_research_page_invalid');
select pg_temp.expect_error($q$select public.world_product_admin_record_research_export_v1(array[pg_temp.id('queue-unapproved')])$q$,'world_research_export_selection_invalid');
select pg_temp.expect_error($q$select public.world_product_admin_record_research_export_v1(array[pg_temp.id('queue-spot-1'),pg_temp.id('queue-spot-1')])$q$,'world_research_export_selection_invalid');
select public.world_product_admin_record_research_export_v1(array[pg_temp.id('queue-spot-1'),pg_temp.id('queue-spot-2')]);
select pg_temp.assert((select count(*) from world_knowledge_private.research_spot_exports_v1 where spot_id in (pg_temp.id('queue-spot-1'),pg_temp.id('queue-spot-2')))=2,'export progress not recorded');
select pg_temp.assert((public.world_product_admin_research_queue_v1(1)->>'page')::integer=1
  and (public.world_product_admin_research_queue_v1(1)->>'pageSize')::integer=10
  and jsonb_array_length(public.world_product_admin_research_queue_v1(1)->'spots')=10,
  'first page not bounded');
select pg_temp.assert((public.world_product_admin_research_queue_v1(1)#>>'{spots,0,spotId}')::uuid=pg_temp.id('queue-spot-1')
  and (public.world_product_admin_research_queue_v1(1)#>>'{spots,9,spotId}')::uuid=pg_temp.id('queue-spot-10'),
  'alphabetical page ordering');
select pg_temp.assert((public.world_product_admin_research_queue_v1(2)#>>'{spots,0,spotId}')::uuid=pg_temp.id('queue-spot-11'),
  'second page overlaps first');
select pg_temp.assert((public.world_product_admin_research_queue_v1(1)#>>'{spots,0,exportedAt}') is not null
  and (public.world_product_admin_research_queue_v1(1)#>>'{spots,2,exportedAt}') is null
  and (public.world_product_admin_research_queue_v1(1)#>>'{spots,0,importedAt}') is null,
  'export falsely marked as imported');
rollback;
