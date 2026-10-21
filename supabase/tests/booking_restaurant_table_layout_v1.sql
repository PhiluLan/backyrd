-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-table-layout-test:'||label)::uuid $$;
create function pg_temp.booking_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Booking Console: %',message; end if; end $$;
create function pg_temp.booking_actor(label text) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',pg_temp.booking_id(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.booking_id(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.booking_setup(suffix text) returns jsonb language sql as $$
 select jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('area-'||suffix),'name','Gastraum','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('table-'||suffix),'area_id',pg_temp.booking_id('area-'||suffix),'label','Tisch 1','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('service-'||suffix),'name','Service','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true)))
$$;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.booking_id(x),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x||'@booking.invalid','','{}','{}',now(),now()
from unnest(array['booking-owner','booking-other']) x;
insert into public.spots(id,name,lat,lng,owner_id,status) values
 (pg_temp.booking_id('spot-a'),'Booking Fixture A',47.5,7.5,pg_temp.booking_id('booking-owner'),'approved'),
 (pg_temp.booking_id('spot-b'),'Booking Fixture B',47.5,7.5,pg_temp.booking_id('booking-owner'),'approved');

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_create_v1(uuid,uuid,uuid,uuid,timestamptz,integer,text,text,text,text,text)','execute'),'anon must not create');
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_read_v1(uuid,date)','execute'),'anon must not read');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.assert_operator(uuid)','execute'),'private assertion not callable by clients');
do $$ declare t text; begin
 foreach t in array array['booking_restaurant_settings','booking_restaurant_areas','booking_restaurant_tables','booking_restaurant_services','booking_reservations','booking_audit_events'] loop
   perform pg_temp.booking_assert(not has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE'),'anon table grants: '||t);
   perform pg_temp.booking_assert(not has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE'),'direct mutation grants: '||t);
   perform pg_temp.booking_assert((select relrowsecurity from pg_class where oid=('public.'||t)::regclass),'missing RLS: '||t);
 end loop;
end $$;

set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)->'settings'='null','fresh console has no fabricated setup');
select pg_temp.booking_assert(public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'))=1,'owner setup save');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_save_layout_v1(uuid,bigint,jsonb)','execute'),'anon may not save a plan');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.valid_table_layout_v1(jsonb)','execute'),'private helper is not a client endpoint');
do $$
declare s uuid:=pg_temp.booking_id('spot-a'); setup jsonb; entries jsonb; geometry jsonb; bad jsonb; slot record; r uuid; rev bigint;
begin
 setup:=pg_temp.booking_setup('a');
 setup:=jsonb_set(setup,'{areas}',(setup->'areas')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('area-a2'),'name','Terrace','is_active',true)));
 setup:=jsonb_set(setup,'{tables}',(setup->'tables')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('table-a2'),'area_id',pg_temp.booking_id('area-a'),'label','Table 2','seats',6,'is_active',true)));
 perform public.booking_console_save_setup_v1(s,1,setup);
 select * into strict slot from public.booking_console_slots_v1(s,(now() at time zone 'Europe/Zurich')::date+1,4)
   where table_id=pg_temp.booking_id('table-a') order by starts_at limit 1;
 r:=public.booking_console_create_v1(s,pg_temp.booking_id('original'),slot.service_id,slot.table_id,slot.starts_at,4,'Synthetic guest');
 geometry:=jsonb_build_object('x',100,'y',80,'width',120,'height',80,'shape','rectangle');
 entries:=jsonb_build_array(jsonb_build_object('table_id',slot.table_id,'area_id',pg_temp.booking_id('area-a'),'layout',geometry));
 perform pg_temp.booking_assert(public.booking_console_save_layout_v1(s,2,entries)=3,'owner layout save');
 perform pg_temp.booking_assert(public.booking_console_save_layout_v1(s,2,entries)=3,'uncertain identical retry must replay without revision drift');
 perform pg_temp.booking_assert((select layout=geometry and seats=4 from public.booking_restaurant_tables where id=slot.table_id),'layout save changed capacity or lost geometry');
 perform pg_temp.booking_assert((select starts_at=slot.starts_at and ends_at=slot.ends_at and party_size=4 and table_id=slot.table_id from public.booking_reservations where id=r),'layout save modified a reservation');
 perform pg_temp.booking_assert((select count(*)=1 from public.booking_audit_events where spot_id=s and action='table_layout_saved'),'retry duplicated layout audit');
 begin
  perform public.booking_console_save_layout_v1(s,2,jsonb_set(entries,'{0,layout,x}','110'));
  raise exception 'stale plan overwritten';
 exception when serialization_failure then null; end;
 -- Invalid numbers, shapes, null/missing fields and unexpected stored data all
 -- fail before a mixed patch can change another table.
 foreach bad in array array[
  jsonb_set(geometry,'{x}','-1'),jsonb_set(geometry,'{x}','990'),jsonb_set(geometry,'{width}','39'),
  jsonb_set(geometry,'{height}','301'),jsonb_set(geometry,'{x}','1.5'),jsonb_set(geometry,'{x}','"1"'),
  jsonb_set(geometry,'{shape}','null'),jsonb_set(geometry,'{shape}','"triangle"'),geometry-'width',geometry||'{"guest_name":"Do not store"}'::jsonb
 ] loop
  begin
   perform public.booking_console_save_layout_v1(s,3,jsonb_set(entries,'{0,layout}',bad));
   raise exception 'invalid layout accepted';
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.booking_console_save_layout_v1(s,3,jsonb_set(entries,'{0,layout,x}','110')||jsonb_build_array(
    jsonb_build_object('table_id',pg_temp.booking_id('table-a2'),'area_id',pg_temp.booking_id('area-a'),'layout',jsonb_set(geometry,'{y}','699'))));
  raise exception 'mixed invalid patch accepted';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert((select layout=geometry from public.booking_restaurant_tables where id=slot.table_id),'failed patch partially changed a table');
 begin
  perform public.booking_console_save_layout_v1(s,3,entries||entries);
  raise exception 'duplicate table patch accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_save_layout_v1(s,3,jsonb_build_array(jsonb_build_object('table_id',pg_temp.booking_id('table-b'),'area_id',pg_temp.booking_id('area-b'),'layout',geometry)));
  raise exception 'cross-restaurant layout edit accepted';
 exception when insufficient_privilege then null; end;
 -- Legacy setup saves retire/reactivate all resources internally; they must
 -- retain layouts and remain backward compatible without knowing the field.
 perform public.booking_console_save_setup_v1(s,3,setup);
 perform pg_temp.booking_assert((select layout=geometry from public.booking_restaurant_tables where id=slot.table_id),'legacy setup save reset a table plan');
 perform pg_temp.booking_assert(public.booking_console_save_layout_v1(s,3,entries)=4,'identical patch should preserve unrelated setup changes');
 -- A real room move invalidates a room-relative position, then a stale room
 -- patch must fail even when trying to clear an already empty layout.
 setup:=jsonb_set(setup,'{tables,0,area_id}',to_jsonb(pg_temp.booking_id('area-a2')));
 perform public.booking_console_save_setup_v1(s,4,setup);
 perform pg_temp.booking_assert((select layout is null from public.booking_restaurant_tables where id=slot.table_id),'room move retained misleading coordinates');
 begin
  perform public.booking_console_save_layout_v1(s,4,jsonb_set(entries,'{0,layout}','null'));
  raise exception 'stale room context accepted';
 exception when serialization_failure then null; end;
 entries:=jsonb_set(entries,'{0,area_id}',to_jsonb(pg_temp.booking_id('area-a2')));
 entries:=jsonb_set(entries,'{0,layout,shape}','"round"');
 perform pg_temp.booking_assert(public.booking_console_save_layout_v1(s,5,entries)=6,'oval/round table save');
 perform pg_temp.booking_assert(public.booking_console_read_v1(s,(now() at time zone 'Europe/Zurich')::date)#>>'{capabilities,table_layouts}'='true','layout capability not advertised');
end $$;

select pg_temp.booking_actor('booking-other');
select pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_tables),'cross-owner geometry exposed');
do $$ begin
 begin
  perform public.booking_console_save_layout_v1(pg_temp.booking_id('spot-a'),6,'[]');
  raise exception 'cross-owner layout save accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin
  update public.booking_restaurant_tables set layout='{"x":-1,"y":0,"width":100,"height":80,"shape":"rectangle"}' where id=pg_temp.booking_id('table-a');
  raise exception 'server write bypassed geometry constraint';
 exception when check_violation then null; end;
end $$;
reset role;
rollback;

