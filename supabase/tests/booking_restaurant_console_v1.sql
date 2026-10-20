-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-console-test:'||label)::uuid $$;
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

do $$
declare s uuid:=pg_temp.booking_id('spot-a'); d date:=(now() at time zone 'Europe/Zurich')::date+1; setup jsonb; slot record; booking uuid; replay uuid;
begin
 perform pg_temp.booking_assert((select count(*)=1 from public.booking_restaurant_tables where spot_id=s),'owner RLS read');
 begin
   perform public.booking_console_save_setup_v1(s,0,pg_temp.booking_setup('a'));
   raise exception 'stale setup succeeded';
 exception when serialization_failure then null; end;
 begin
   perform public.booking_console_save_setup_v1(s,1,pg_temp.booking_setup('b'));
   raise exception 'cross-spot identifiers succeeded';
 exception when insufficient_privilege then null; end;
 begin
   update public.booking_restaurant_tables set seats=30 where spot_id=s;
   raise exception 'direct update succeeded';
 exception when insufficient_privilege then null; end;
 select * into strict slot from public.booking_console_slots_v1(s,d,2) limit 1;
 booking:=public.booking_console_create_v1(s,pg_temp.booking_id('request-a'),slot.service_id,slot.table_id,slot.starts_at,2,'Synthetic Guest','guest@invalid','Window','phone','pending');
 replay:=public.booking_console_create_v1(s,pg_temp.booking_id('request-a'),slot.service_id,slot.table_id,slot.starts_at,2,'Synthetic Guest','guest@invalid','Window','phone','pending');
 perform pg_temp.booking_assert(replay=booking,'retry must replay same reservation');
 perform pg_temp.booking_assert((select count(*)=1 from public.booking_reservations where spot_id=s),'retry duplicated');
 begin
   perform public.booking_console_create_v1(s,pg_temp.booking_id('request-a'),slot.service_id,null,slot.starts_at,2,'Synthetic Guest','guest@invalid','Window','phone','pending');
   raise exception 'reused request accepted changed payload';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.booking_console_create_v1(s,pg_temp.booking_id('request-overlap'),slot.service_id,slot.table_id,slot.starts_at,2,'Other Guest');
   raise exception 'overlap succeeded';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(s,d,2) where starts_at=slot.starts_at and table_id=slot.table_id),'pending must occupy inventory');
 setup:=jsonb_set(pg_temp.booking_setup('a'),'{tables,0,seats}','1');
 begin
   perform public.booking_console_save_setup_v1(s,1,setup);
   raise exception 'capacity reduction below reservation succeeded';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert((select revision=1 from public.booking_restaurant_settings where spot_id=s),'failed setup changed revision');
 perform public.booking_console_set_status_v1(s,booking,'pending','confirmed');
 begin
   perform public.booking_console_set_status_v1(s,booking,'pending','cancelled');
   raise exception 'stale transition succeeded';
 exception when serialization_failure then null; end;
 begin
   perform public.booking_console_set_status_v1(s,booking,'confirmed','no_show');
   raise exception 'future no-show succeeded';
 exception when invalid_parameter_value then null; end;
 perform public.booking_console_set_status_v1(s,booking,'confirmed','cancelled');
 begin
   perform public.booking_console_set_status_v1(s,booking,'cancelled','confirmed');
   raise exception 'terminal reservation reactivated';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(s,d,2) where starts_at=slot.starts_at and table_id=slot.table_id),'cancellation did not release table');
 perform pg_temp.booking_assert((select count(*)=3 from public.booking_audit_events where reservation_id=booking),'missing audit trail');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_read_v1(s,d)->'reservations')=1,'saved reservation missing from fresh read');
 -- Deactivation retires inventory without deleting historical data.
 setup:=jsonb_set(pg_temp.booking_setup('a'),'{areas,0,is_active}','false');
 perform public.booking_console_save_setup_v1(s,1,setup);
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(s,d,2)),'inactive area remained bookable');
end $$;

select pg_temp.booking_actor('booking-other');
select pg_temp.booking_assert(not exists(select 1 from public.booking_reservations),'cross-owner guest data exposed');
select pg_temp.booking_assert(not exists(select 1 from public.booking_audit_events),'cross-owner audit exposed');
select pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_settings),'cross-owner setup exposed');
select pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_areas),'cross-owner areas exposed');
select pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_tables),'cross-owner tables exposed');
select pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_services),'cross-owner services exposed');
do $$ begin
 begin
   perform public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date);
   raise exception 'cross-owner read succeeded';
 exception when insufficient_privilege then null; end;
 begin
   perform public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),2,pg_temp.booking_setup('a'));
   raise exception 'cross-owner write succeeded';
 exception when insufficient_privilege then null; end;
 begin
   perform public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),current_date+1,2);
   raise exception 'cross-owner slots succeeded';
 exception when insufficient_privilege then null; end;
 begin
   perform public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),gen_random_uuid(),'pending','confirmed');
   raise exception 'cross-owner status change succeeded';
 exception when insufficient_privilege then null; end;
 begin
   perform public.booking_console_create_v1(pg_temp.booking_id('spot-a'),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),now(),2,'Intruder');
   raise exception 'cross-owner booking succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
