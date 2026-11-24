-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-special-hours-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_save_hours_v1(uuid,bigint,uuid,uuid,date,time,time,boolean,boolean,integer,text,boolean,boolean)','execute'),'anonymous hours grant');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.service_windows_v1(uuid,date)','execute'),'private windows exposed');
select pg_temp.booking_assert(not has_table_privilege('authenticated','public.booking_service_hours','INSERT,UPDATE,DELETE'),'direct hours writes');
select pg_temp.booking_assert((select relrowsecurity from pg_class where oid='public.booking_service_hours'::regclass),'hours RLS missing');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'));
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));
reset role;
update public.booking_restaurant_services set weekdays=array[(extract(dow from (now() at time zone 'Europe/Zurich')::date+3)::integer)],opens_at='18:00',closes_at='22:00';
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select ((now() at time zone 'Europe/Zurich')::date+1)::text as d \gset
select pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d',2)),'weekly closed date unexpectedly open');
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_id('hours'),pg_temp.booking_id('service-a'),:'d','18:00','02:00',true,false,30);
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_id('hours'),pg_temp.booking_id('service-a'),:'d','18:00','02:00',true,false,30);
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),:'d')#>>'{settings,revision}'='2','identical save changed revision');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),:'d')#>>'{capabilities,special_hours}'='true','capability missing');
select pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d',2) where (starts_at at time zone 'Europe/Zurich')::time='23:30'),'night start not offered');
select pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d'::date+1,2) where (starts_at at time zone 'Europe/Zurich')::time='00:30'),'carryover not offered on its actual calendar date');
select pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d'::date+1,2) where (starts_at at time zone 'Europe/Zurich')::time>='02:00'),'slot crosses service end');
select pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d',2) where (starts_at at time zone 'Europe/Zurich')::date<>:'d'::date),'calendar query leaked next day starts');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),:'d'::date+1)#>>'{special_hours,0,book_date}'=:'d','previous service context lost');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_week_v1(pg_temp.booking_id('spot-a'),:'d')->'days'->0->'special_hours')=1,'week missing special hours');

-- A real post-midnight reservation survives reverting to weekly hours only after acknowledgement.
select public.booking_console_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('night-request'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),(:'d'::date+1+time '01:00') at time zone 'Europe/Zurich',2,'Synthetic night guest') as rid \gset
select set_config('booking.test.night_date',:'d',true);
do $$ declare d date:=current_setting('booking.test.night_date')::date; begin
 begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),2,pg_temp.booking_id('hours'),pg_temp.booking_id('service-a'),d,p_archive=>true); raise exception 'archive erased booking eligibility without acknowledgement'; exception when invalid_parameter_value then
  if sqlerrm<>'booking_hours_has_reservations' then raise; end if; end;
end $$;
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),:'d')#>>'{settings,revision}'='2','rejected archive changed revision');
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),2,pg_temp.booking_id('hours'),pg_temp.booking_id('service-a'),:'d',p_keep_existing=>true,p_archive=>true);
select pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d'::date+1,2)),'archive did not restore weekly hours');
select public.booking_console_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('night-request'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),(:'d'::date+1+time '01:00') at time zone 'Europe/Zurich',2,'Synthetic night guest');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),:'d'::date+1)#>>'{reservations,0,status}'='confirmed','archive changed existing guest');
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),3,pg_temp.booking_id('hours'),pg_temp.booking_id('service-a'),:'d','18:00','02:00',true,false,30);

-- A next-day calendar closure blocks a booking crossing midnight; touching the boundary is allowed.
select public.booking_console_save_closure_v1(pg_temp.booking_id('spot-a'),4,pg_temp.booking_id('block'),:'d'::date+1,'00:00','01:00');
select pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d',2) where (starts_at at time zone 'Europe/Zurich')::time='23:30'),'next-day closure bypassed by prior-day start');
select pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),:'d',2) where (starts_at at time zone 'Europe/Zurich')::time='23:00'),'non-overlapping end boundary was blocked');

-- The same service windows apply to actual admission after midnight.
reset role;
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select (current_setting('booking.test.night_date')::date+1+time '00:30') at time zone 'Europe/Zurich' $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,30)->'slots')=0,'walk-in ignored next-day block');
select public.booking_console_save_closure_v1(pg_temp.booking_id('spot-a'),5,pg_temp.booking_id('block'),:'d'::date+1,p_remove=>true);
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,30)->'slots')>0,'walk-in lost previous-day night window');
select public.booking_console_walk_in_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('night-walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,30);

-- Resource boundaries, stale writes, and direct RLS remain enforced.
do $$ declare d date:=current_setting('booking.test.night_date')::date; begin
 begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_id('stale'),pg_temp.booking_id('service-a'),d+2,'18:00','23:00'); raise exception 'stale hours saved'; exception when serialization_failure then null; end;
 begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),6,pg_temp.booking_id('foreign'),pg_temp.booking_id('service-b'),d,'18:00','23:00'); raise exception 'foreign service accepted'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-b'),1,pg_temp.booking_id('hours'),pg_temp.booking_id('service-b'),d,'18:00','23:00'); raise exception 'foreign resource ID accepted'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),6,pg_temp.booking_id('long'),pg_temp.booking_id('service-a'),d+2,'18:00','20:00',true); raise exception 'over 24 civil hours accepted'; exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.booking_actor('booking-other');
select pg_temp.booking_assert((select count(*) from public.booking_service_hours)=0,'hours RLS leaked another owner');
do $$ begin begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),6,pg_temp.booking_id('unauthorized'),pg_temp.booking_id('service-a'),current_date+2,'18:00','23:00'); raise exception 'non-owner configured hours'; exception when insufficient_privilege then null; end; end $$;
reset role;
-- Administrative fixtures are isolated/rolled back; client access still uses canonical scoped RPCs.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.booking_id(x),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x||'@booking.invalid','','{}','{}',now(),now() from unnest(array['booking-host','booking-manager']) x;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) select pg_temp.booking_id('spot-a'),pg_temp.booking_id(x),pg_temp.booking_id('booking-owner'),r from (values('booking-host','host'),('booking-manager','manager')) t(x,r);
set local role authenticated;
select pg_temp.booking_actor('booking-host');
do $$ begin begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),6,pg_temp.booking_id('host-hours'),pg_temp.booking_id('service-a'),current_date+4,'18:00','23:00'); raise exception 'host configured hours'; exception when insufficient_privilege then null; end; end $$;
select pg_temp.booking_actor('booking-manager');
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),6,pg_temp.booking_id('manager-hours'),pg_temp.booking_id('service-a'),current_date+4,'18:00','23:00');
select pg_temp.booking_assert((select count(*) from public.booking_service_hours)=0,'manager has raw hours access');
-- Weekly overnight configuration uses the same windows and remains compatible with omitted new keys.
do $$ declare j jsonb:=pg_temp.booking_setup('a'); d date:=(now() at time zone 'Europe/Zurich')::date+8; begin
 j:=jsonb_set(j,'{services,0,opens_at}','"18:00"'); j:=jsonb_set(j,'{services,0,closes_at}','"02:00"');
 j:=jsonb_set(j,'{services,0,weekdays}',jsonb_build_array(extract(dow from d)::integer));
 j:=jsonb_set(j,'{services,0,ends_next_day}','true');
 perform public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),7,j);
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),d,2) where (starts_at at time zone 'Europe/Zurich')::time='23:30'),'weekly night start missing');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),d+1,2) where (starts_at at time zone 'Europe/Zurich')::time='00:30'),'weekly next-day carryover missing');
 perform public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),8,j#-'{services,0,ends_next_day}');
 perform pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),d)#>>'{services,0,ends_next_day}'='true','legacy omitted key reset existing overnight service');
end $$;
reset role;
create or replace function booking_private.planning_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select (((now() at time zone 'Europe/Zurich')::date+20)+time '00:30') at time zone 'Europe/Zurich' $$;
set local role authenticated;
select pg_temp.booking_actor('booking-manager');
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),9,pg_temp.booking_id('ongoing-night'),pg_temp.booking_id('service-a'),(now() at time zone 'Europe/Zurich')::date+19,'18:00','03:00',true);
select public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),10,pg_temp.booking_id('ongoing-night'),pg_temp.booking_id('service-a'),(now() at time zone 'Europe/Zurich')::date+19,p_closed=>true);
do $$ begin
 begin perform public.booking_console_save_hours_v1(pg_temp.booking_id('spot-a'),11,pg_temp.booking_id('finished-night'),pg_temp.booking_id('service-a'),(now() at time zone 'Europe/Zurich')::date+19,'18:00','00:00',true);
  raise exception 'finished previous service was edited'; exception when invalid_parameter_value then if sqlerrm<>'booking_hours_not_running' then raise; end if; end;
end $$;
reset role;

-- A twelve-hour civil service crosses actual eleven/thirteen-hour DST nights.
do $$ declare y integer:=extract(year from now())::integer+2; spring date; autumn date; begin
 spring:=make_date(y,4,1)-1; spring:=spring-extract(dow from spring)::integer;
 autumn:=make_date(y,11,1)-1; autumn:=autumn-extract(dow from autumn)::integer;
 insert into public.booking_service_hours(id,spot_id,service_id,book_date,opens_at,closes_at,next_day,interval_minutes,starts_at,ends_at)
 select pg_temp.booking_id('dst-'||d),pg_temp.booking_id('spot-a'),pg_temp.booking_id('service-a'),d-1,'18:00','06:00',true,30,
  booking_private.civil_boundary_v1(d-1,'18:00',false),booking_private.civil_boundary_v1(d,'06:00',true) from unnest(array[spring,autumn]) d;
 perform pg_temp.booking_assert((select ends_at-starts_at=interval '11 hours' from booking_private.service_windows_v1(pg_temp.booking_id('spot-a'),spring-1) where service_id=pg_temp.booking_id('service-a')),'spring night fabricated an hour');
 perform pg_temp.booking_assert((select ends_at-starts_at=interval '13 hours' from booking_private.service_windows_v1(pg_temp.booking_id('spot-a'),autumn-1) where service_id=pg_temp.booking_id('service-a')),'autumn night lost an hour');
 begin
  insert into public.booking_service_hours(id,spot_id,service_id,book_date,opens_at,closes_at,interval_minutes,starts_at,ends_at)
   values(pg_temp.booking_id('gap'),pg_temp.booking_id('spot-a'),pg_temp.booking_id('service-a'),spring,'02:30','04:00',30,
    (spring+time '02:30') at time zone 'Europe/Zurich',(spring+time '04:00') at time zone 'Europe/Zurich');
  raise exception 'nonexistent civil opening accepted'; exception when check_violation then null; end;
end $$;
rollback;
