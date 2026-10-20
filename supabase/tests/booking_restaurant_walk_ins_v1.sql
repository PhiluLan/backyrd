-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-walk-in-test:'||label)::uuid $$;
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
 'services',jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('service-'||suffix),'name','Service','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','12:00','closes_at','15:00','interval_minutes',30,'is_active',true)))
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

-- Freeze only the private clock inside this rolled-back test transaction.
-- Production callers can neither supply admission time nor execute/replace it.
select pg_temp.booking_assert(position('clock_timestamp' in pg_get_functiondef('booking_private.admission_clock_v1()'::regprocedure))>0,'production admission clock must use the server clock');
create temp table booking_admission_clock(value timestamptz);
insert into booking_admission_clock values (((now() at time zone 'Europe/Zurich')::date+time '12:07:15') at time zone 'Europe/Zurich');
grant select,update on booking_admission_clock to authenticated;
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select value from pg_temp.booking_admission_clock; $$;

set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)->'settings'='null','fresh console has no fabricated setup');
select pg_temp.booking_assert(public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'))=1,'owner setup save');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_walk_in_v1(uuid,uuid,uuid,uuid,integer,integer,text,text,text)','execute'),'anon may not admit guests');
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_walk_in_slots_v1(uuid,integer,integer)','execute'),'anon may not read walk-in inventory');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.admission_clock_v1()','execute'),'client may not control admission clock');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.walk_in_slots_v1(uuid,timestamptz,integer,integer)','execute'),'client may not supply admission time through a private helper');
do $$
declare s uuid:=pg_temp.booking_id('spot-a'); setup jsonb; preview jsonb; result jsonb; again jsonb; r public.booking_reservations%rowtype; initial_time timestamptz;
 slot record; ordinary uuid;
begin
 setup:=pg_temp.booking_setup('a');
 setup:=jsonb_set(setup,'{areas}',(setup->'areas')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('inactive-area'),'name','Inactive room','is_active',false)));
 setup:=jsonb_set(setup,'{tables}',(setup->'tables')||jsonb_build_array(
   jsonb_build_object('id',pg_temp.booking_id('table-a2'),'area_id',pg_temp.booking_id('area-a'),'label','Tisch 2','seats',6,'is_active',true),
   jsonb_build_object('id',pg_temp.booking_id('inactive-table'),'area_id',pg_temp.booking_id('area-a'),'label','Inactive table','seats',6,'is_active',false),
   jsonb_build_object('id',pg_temp.booking_id('closed-room-table'),'area_id',pg_temp.booking_id('inactive-area'),'label','Closed room table','seats',6,'is_active',true)));
 perform public.booking_console_save_setup_v1(s,1,setup);
 preview:=public.booking_console_walk_in_slots_v1(s,2,60);
 perform pg_temp.booking_assert(jsonb_array_length(preview->'slots')=2,'inactive inventory offered or active tables missing');
 perform pg_temp.booking_assert(jsonb_array_length(preview->'services')=1,'eligible current services missing');
 perform pg_temp.booking_assert(preview#>>'{slots,0,table_label}'='Tisch 1' and preview#>>'{slots,0,seats}'='4'
   and preview#>>'{slots,0,area_name}'='Gastraum','preview must include current resource labels and best-fit ordering');
 initial_time:=(preview->>'observed_at')::timestamptz;
 perform pg_temp.booking_assert((initial_time at time zone 'Europe/Zurich')::time=time '12:07:15','preview did not use server admission clock');
 -- Capture a later write time, rather than trusting the client's preview time.
 update pg_temp.booking_admission_clock set value=value+interval '5 minutes 10 seconds';
 result:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('walk-in'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60,'','','');
 select * into strict r from public.booking_reservations where id=(result->>'id')::uuid;
 perform pg_temp.booking_assert(r.starts_at=initial_time+interval '5 minutes 10 seconds' and r.ends_at=r.starts_at+interval '60 minutes','write reused stale preview time or wrong duration');
 perform pg_temp.booking_assert(r.status='seated' and r.source='walk_in' and r.is_walk_in and r.arrived_at=r.starts_at and r.seated_at=r.starts_at,'walk-in did not enter the real seating lifecycle');
 perform pg_temp.booking_assert(r.guest_name='Walk-in' and r.guest_contact is null and r.note is null,'unnamed admission normalization failed');
 again:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('walk-in'),r.service_id,r.table_id,2,60,'Walk-in','','');
 perform pg_temp.booking_assert(again=result,'identical walk-in replay changed ID/time');
 perform pg_temp.booking_assert((select count(*)=1 from public.booking_audit_events where reservation_id=r.id),'walk-in replay duplicated audit');
 begin
  perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('walk-in'),r.service_id,r.table_id,3,60,'Walk-in','','');
  raise exception 'changed walk-in payload accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('second-party'),r.service_id,r.table_id,2,60);
  raise exception 'second walk-in seated on occupied table';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('cross-spot'),pg_temp.booking_id('service-b'),pg_temp.booking_id('table-b'),2,60);
  raise exception 'cross-spot walk-in accepted';
 exception when invalid_parameter_value then null; end;
 -- Correcting the guest does not break replay or restore the old placeholder.
 perform public.booking_console_amend_v1(s,r.id,pg_temp.booking_id('guest-edit'),0,r.service_id,r.table_id,r.starts_at,60,2,'Known synthetic guest','known@invalid','Organisational note');
 again:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('walk-in'),r.service_id,r.table_id,2,60);
 perform pg_temp.booking_assert(again=result and (select guest_name='Known synthetic guest' and revision=1 from public.booking_reservations where id=r.id),'walk-in replay undid guest correction');
 -- Planned time can end while the visit is still open. It stays unavailable
 -- for another walk-in until explicitly completed by an operator.
 update pg_temp.booking_admission_clock set value=(value at time zone 'Europe/Zurich')::date+time '14:00' at time zone 'Europe/Zurich';
 preview:=public.booking_console_walk_in_slots_v1(s,2,60);
 perform pg_temp.booking_assert(jsonb_array_length(preview->'slots')=1 and not exists(select 1 from jsonb_array_elements(preview->'slots') j where j->>'table_id'=r.table_id::text),'overdue seated visit was treated as physically free');
 perform public.booking_console_set_status_v1(s,r.id,'seated','completed');
 preview:=public.booking_console_walk_in_slots_v1(s,2,60);
 perform pg_temp.booking_assert(jsonb_array_length(preview->'slots')=2,'completion did not release walk-in capacity');
 begin
  perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('invalid-name'),r.service_id,r.table_id,2,60,repeat('X',121));
  raise exception 'overlong guest name accepted';
 exception when check_violation then null; end;
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_reservations where request_id=pg_temp.booking_id('invalid-name')),'failed walk-in left a reservation behind');
 -- A delayed replay after closing still returns the original completed visit.
 update pg_temp.booking_admission_clock set value=value+interval '2 hours';
 again:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('walk-in'),r.service_id,r.table_id,2,60);
 perform pg_temp.booking_assert(again=result and (select status='completed' from public.booking_reservations where id=r.id),'late replay recreated or re-seated a completed visit');
 preview:=public.booking_console_walk_in_slots_v1(s,2,60);
 perform pg_temp.booking_assert(jsonb_array_length(preview->'slots')=0 and jsonb_array_length(preview->'services')=0,'closed service remained eligible');
 -- A future reservation labelled walk_in is not a real immediate admission.
 select * into strict slot from public.booking_console_slots_v1(s,(now() at time zone 'Europe/Zurich')::date+1,2) where table_id=pg_temp.booking_id('table-a2') order by starts_at limit 1;
 ordinary:=public.booking_console_create_v1(s,pg_temp.booking_id('source-only'),slot.service_id,slot.table_id,slot.starts_at,2,'Source only',null,null,'walk_in','pending');
 perform pg_temp.booking_assert((select not is_walk_in from public.booking_reservations where id=ordinary),'source label silently became attendance');
 begin
  perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('source-only'),slot.service_id,slot.table_id,2,60,'Source only');
  raise exception 'ordinary reservation replayed through admission endpoint';
 exception when invalid_parameter_value then null; end;
 update pg_temp.booking_admission_clock set value=slot.starts_at+interval '10 minutes';
 preview:=public.booking_console_walk_in_slots_v1(s,2,60);
 perform pg_temp.booking_assert(jsonb_array_length(preview->'slots')=1 and not exists(select 1 from jsonb_array_elements(preview->'slots') j where j->>'table_id'=slot.table_id::text),'walk-in ignored a pending planned reservation');
 perform public.booking_console_set_status_v1(s,ordinary,'pending','confirmed');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(s,2,60)->'slots')=1,'walk-in ignored a confirmed planned reservation');
 perform public.booking_console_set_status_v1(s,ordinary,'confirmed','cancelled');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(s,2,60)->'slots')=2,'cancelled reservation blocked an immediate admission');
 update pg_temp.booking_admission_clock set value=((now() at time zone 'Europe/Zurich')::date+time '14:30') at time zone 'Europe/Zurich';
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(s,2,30)->'slots')=2,'walk-in ending exactly at close should fit');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(s,2,31)->'slots')=0,'walk-in crossed service closing time');
 begin
  perform public.booking_console_walk_in_slots_v1(s,0,60);
  raise exception 'invalid party accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_walk_in_slots_v1(s,2,15);
  raise exception 'invalid duration accepted';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert(public.booking_console_read_v1(s,(now() at time zone 'Europe/Zurich')::date)#>>'{capabilities,walk_ins}'='true','admission capability not advertised');
end $$;

select pg_temp.booking_actor('booking-other');
do $$ begin
 begin
  perform public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,60);
  raise exception 'cross-owner admission lookup accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.booking_console_walk_in_v1(pg_temp.booking_id('spot-a'),gen_random_uuid(),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60);
  raise exception 'cross-owner admission accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

