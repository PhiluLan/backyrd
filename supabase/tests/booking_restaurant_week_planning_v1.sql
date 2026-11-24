-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-week-planning-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_week_v1(uuid,date,uuid,uuid)','execute'),'anon week grant');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.range_blocked_v1(uuid,timestamptz,timestamptz,uuid,uuid)','execute'),'private eligibility helper exposed');
select pg_temp.booking_assert(not has_table_privilege('authenticated','public.booking_restaurant_closures','INSERT,UPDATE,DELETE'),'direct closure writes granted');

do $$ declare s uuid:=pg_temp.booking_id('spot-a'); d date:=(now() at time zone 'Europe/Zurich')::date+1;
 setup jsonb; r uuid; result jsonb; week jsonb; item jsonb; original_start timestamptz; original_end timestamptz;
begin
 setup:=pg_temp.booking_setup('a');
 setup:=jsonb_set(setup,'{areas}',(setup->'areas')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('area-a2'),'name','Terrace','is_active',true)));
 setup:=jsonb_set(setup,'{tables}',(setup->'tables')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('table-a2'),'area_id',pg_temp.booking_id('area-a2'),'label','Terrace 2','seats',6,'is_active',true)));
 setup:=jsonb_set(setup,'{services}',(setup->'services')||jsonb_build_array((setup#>'{services,0}')||jsonb_build_object('id',pg_temp.booking_id('service-a2'),'name','Second service')));
 perform public.booking_console_save_setup_v1(s,1,setup);
 original_start:=(d+time '18:00') at time zone 'Europe/Zurich'; original_end:=original_start+interval '1 hour';
 r:=public.booking_console_create_v1(s,pg_temp.booking_id('create-original'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),original_start,2,'Synthetic guest',null,null,'phone','confirmed');
 begin
  perform public.booking_console_save_closure_v1(s,2,pg_temp.booking_id('closed-day'),d);
  raise exception 'closure silently accepted existing reservations';
 exception when invalid_parameter_value then if sqlerrm<>'booking_closure_has_reservations' then raise; end if; end;
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_closures),'failed closure left partial data');
 result:=public.booking_console_save_closure_v1(s,2,pg_temp.booking_id('closed-day'),d,p_keep_existing=>true);
 perform pg_temp.booking_assert((result->>'revision')::int=3 and (result->>'existing_reservations')::int=1,'closure response/affected count');
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(s,d,2)),'closed day still allocates');
 perform pg_temp.booking_assert(public.booking_console_create_v1(s,pg_temp.booking_id('create-original'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),original_start,2,'Synthetic guest',null,null,'phone','confirmed')=r,'closure broke original request replay');
 begin
  perform public.booking_console_create_v1(s,pg_temp.booking_id('new-closed-request'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a2'),original_start,2,'Rejected guest');
  raise exception 'new booking bypassed closure';
 exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
 perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('guest-edit'),0,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),original_start,60,2,'Corrected guest');
 perform pg_temp.booking_assert((select status='confirmed' and starts_at=original_start and ends_at=original_end from public.booking_reservations where id=r),'closure cancelled or changed booking');
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('blocked-amend'),1,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),original_start+interval '1 hour',60,2,'Corrected guest');
  raise exception 'amendment bypassed closure';
 exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
 perform public.booking_console_create_v1(s,pg_temp.booking_id('pending-next'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a2'),((d+1)+time '18:00') at time zone 'Europe/Zurich',3,'Synthetic pending guest',null,null,'phone','pending');
 perform public.booking_console_create_v1(s,pg_temp.booking_id('cancelled-next'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),((d+1)+time '18:00') at time zone 'Europe/Zurich',2,'Synthetic cancelled guest');
 perform public.booking_console_set_status_v1(s,(select id from public.booking_reservations where spot_id=s and request_id=pg_temp.booking_id('cancelled-next')),'confirmed','cancelled');
 week:=public.booking_console_week_v1(s,d-3);
 perform pg_temp.booking_assert(jsonb_array_length(week->'days')=7,'week must contain seven ordered dates');
 perform pg_temp.booking_assert((week#>>'{days,4,active_reservations}')::int=1 and (week#>>'{days,4,active_guests}')::int=3 and (week#>>'{days,4,pending}')::int=1 and (week#>>'{days,4,cancelled}')::int=1,'weekly active/pending/cancellation scope');
 item:=week#>'{days,3}';
 perform pg_temp.booking_assert(item->>'date'=d::text and (item->>'active_reservations')::int=1 and (item->>'active_guests')::int=2 and (item->>'closed')::boolean,'weekly closed day lost existing counts');
 perform pg_temp.booking_assert(not (week::text like '%Corrected guest%'),'weekly summary exposes guest identities');
 week:=public.booking_console_week_v1(s,d-3,null,pg_temp.booking_id('area-a2'));
 perform pg_temp.booking_assert((week#>>'{days,3,active_reservations}')::int=0,'area totals are unscoped');
 perform pg_temp.booking_assert((public.booking_console_save_closure_v1(s,3,pg_temp.booking_id('closed-day'),d,p_remove=>true)->>'revision')::int=4,'remove closure');
 perform pg_temp.booking_assert((public.booking_console_save_closure_v1(s,3,pg_temp.booking_id('closed-day'),d,p_remove=>true)->>'revision')::int=4,'remove retry duplicated revision');
 result:=public.booking_console_save_closure_v1(s,4,pg_temp.booking_id('partial'),d,time '18:00',time '19:00',pg_temp.booking_id('service-a'),pg_temp.booking_id('area-a'),'Private event',true);
 perform pg_temp.booking_assert((result->>'revision')::int=5,'scoped closure save');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(s,d,2) where service_id=pg_temp.booking_id('service-a') and table_id=pg_temp.booking_id('table-a2') and starts_at=original_start),'room closure hid another room');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(s,d,2) where service_id=pg_temp.booking_id('service-a2') and table_id=pg_temp.booking_id('table-a') and starts_at=original_end),'service closure hid another service');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(s,d,2) where service_id=pg_temp.booking_id('service-a') and table_id=pg_temp.booking_id('table-a') and ends_at=original_start),'closure start endpoint is not half-open');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(s,d,2) where service_id=pg_temp.booking_id('service-a') and table_id=pg_temp.booking_id('table-a') and starts_at=original_end),'closure end endpoint is not half-open');
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_amendment_slots_v1(s,r,d,2,60) where service_id=pg_temp.booking_id('service-a') and table_id=pg_temp.booking_id('table-a') and starts_at=original_start),'amendment suggestions ignore block');
 begin
  perform public.booking_console_save_closure_v1(s,4,pg_temp.booking_id('partial'),d,time '17:00',time '19:00',p_keep_existing=>true);
  raise exception 'stale closure overwrote newer setup';
 exception when serialization_failure then null; end;
 perform pg_temp.booking_assert((public.booking_console_save_closure_v1(s,4,pg_temp.booking_id('partial'),d,time '18:00',time '19:00',pg_temp.booking_id('service-a'),pg_temp.booking_id('area-a'),'Private event',true)->>'revision')::int=5,'identical retry did not replay');
 begin
  perform public.booking_console_save_closure_v1(s,5,pg_temp.booking_id('bad'),d,p_area_id=>pg_temp.booking_id('area-b'));
  raise exception 'cross-spot area accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.booking_console_week_v1(s,d,pg_temp.booking_id('service-b'));
  raise exception 'cross-spot service week accepted';
 exception when insufficient_privilege then null; end;
 perform pg_temp.booking_assert((public.booking_console_read_v1(s,d)#>>'{capabilities,week_planning}')::boolean,'week capability missing');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_read_v1(s,d)->'closures')=1,'daily read missing closure');
 perform pg_temp.booking_assert((select count(*) from public.booking_audit_events where spot_id=s and action='closure_saved')=2,'closure retries duplicated audit');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_audit_events where spot_id=s and action='closure_saved' and details#>>'{after,note}'='Private event' and (details->>'existing_reservations')::int=1),'closure audit lacks affected rule');
 perform public.booking_console_save_closure_v1(s,5,pg_temp.booking_id('partial'),d,p_remove=>true);
end $$;

-- Deterministic admission time; client has no clock override.
reset role;
create temporary table booking_plan_clock(t timestamptz);
insert into booking_plan_clock values((((now() at time zone 'Europe/Zurich')::date)+time '12:00') at time zone 'Europe/Zurich');
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select t from pg_temp.booking_plan_clock $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
do $$ declare s uuid:=pg_temp.booking_id('spot-a'); d date:=(now() at time zone 'Europe/Zurich')::date; admitted jsonb; again jsonb; begin
 perform public.booking_console_save_closure_v1(s,6,pg_temp.booking_id('today'),d);
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v1(s,2,60)->'slots')=0,'walk-in preview ignores closure');
 begin
  perform public.booking_console_walk_in_v1(s,pg_temp.booking_id('admission'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60);
  raise exception 'walk-in admitted during closure';
 exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
 perform public.booking_console_save_closure_v1(s,7,pg_temp.booking_id('today'),d,p_remove=>true);
 admitted:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('admission'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60);
 perform public.booking_console_save_closure_v1(s,8,pg_temp.booking_id('today'),d,p_keep_existing=>true);
 again:=public.booking_console_walk_in_v1(s,pg_temp.booking_id('admission'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60);
 perform pg_temp.booking_assert(again=admitted,'closure broke admitted visit replay');
end $$;

-- Actual UTC duration across the next spring and autumn transitions.
do $$ declare s uuid:=pg_temp.booking_id('spot-a'); first_day date:=(now() at time zone 'Europe/Zurich')::date;
 spring date; autumn date; setup jsonb; item record; duration interval; rev bigint:=9; begin
 select d into strict spring from (select first_day+i d from generate_series(1,365) i) days
 where ((d+1)::timestamp at time zone 'Europe/Zurich')-(d::timestamp at time zone 'Europe/Zurich')=interval '23 hours' limit 1;
 select d into strict autumn from (select first_day+i d from generate_series(1,365) i) days
 where ((d+1)::timestamp at time zone 'Europe/Zurich')-(d::timestamp at time zone 'Europe/Zurich')=interval '25 hours' limit 1;
 setup:=jsonb_build_object('duration_minutes',60,'max_party_size',8,
  'areas',(select jsonb_agg(to_jsonb(a)) from public.booking_restaurant_areas a where spot_id=s),
  'tables',(select jsonb_agg(to_jsonb(t)) from public.booking_restaurant_tables t where spot_id=s),
  'services',(select jsonb_agg(to_jsonb(x)) from public.booking_restaurant_services x where spot_id=s));
 setup:=jsonb_set(setup,'{services}',(setup->'services')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('dst-service'),'name','DST','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','01:00','closes_at','04:00','interval_minutes',30,'is_active',true)));
 perform public.booking_console_save_setup_v1(s,rev,setup); rev:=rev+1;
 perform pg_temp.booking_assert((select count(*)=3 from public.booking_console_slots_v1(s,spring,2) where service_id=pg_temp.booking_id('dst-service') and table_id=pg_temp.booking_id('table-a')),'spring slots cross closing time or fabricate local time');
 perform pg_temp.booking_assert((select count(*)=7 from public.booking_console_slots_v1(s,autumn,2) where service_id=pg_temp.booking_id('dst-service') and table_id=pg_temp.booking_id('table-a')),'autumn loses repeated hour');
 perform pg_temp.booking_assert((select count(*)=2 from public.booking_console_slots_v1(s,autumn,2) where service_id=pg_temp.booking_id('dst-service') and table_id=pg_temp.booking_id('table-a') and (starts_at at time zone 'Europe/Zurich')::time=time '02:00'),'ambiguous starts not distinct');
 for item in select * from public.booking_console_slots_v1(s,spring,2) where service_id=pg_temp.booking_id('dst-service') loop
  perform pg_temp.booking_assert(item.ends_at-item.starts_at=interval '1 hour' and item.ends_at<=((spring+time '04:00') at time zone 'Europe/Zurich'),'invalid actual duration');
 end loop;
 begin
  perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('gap'),spring,time '02:15',time '03:30');
  raise exception 'nonexistent local time silently shifted';
 exception when invalid_parameter_value then if sqlerrm<>'invalid_booking_closure_time' then raise; end if; end;
 perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('spring'),spring); rev:=rev+1;
 perform pg_temp.booking_assert((select ends_at-starts_at=interval '23 hours' from public.booking_restaurant_closures where id=pg_temp.booking_id('spring')),'spring full day length');
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(s,spring,2)),'spring closure leaks slots');
 perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('spring'),spring,p_remove=>true); rev:=rev+1;
 perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('autumn'),autumn); rev:=rev+1;
 perform pg_temp.booking_assert((select ends_at-starts_at=interval '25 hours' from public.booking_restaurant_closures where id=pg_temp.booking_id('autumn')),'autumn full day length');
 perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('autumn'),autumn,p_remove=>true); rev:=rev+1;
 perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('fold'),autumn,time '02:00',time '02:30');
 perform pg_temp.booking_assert((select ends_at-starts_at=interval '90 minutes' from public.booking_restaurant_closures where id=pg_temp.booking_id('fold')),'fold closure fails to cover both boundary occurrences');
 rev:=rev+1;
 perform public.booking_console_save_closure_v1(s,rev,pg_temp.booking_id('fold'),autumn,p_remove=>true); rev:=rev+1;
 setup:=jsonb_set(setup,'{services}',(setup->'services')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('fold-opening-service'),'name','Opens during fold','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','02:00','closes_at','03:00','interval_minutes',30,'is_active',true)));
 perform public.booking_console_save_setup_v1(s,rev,setup);
 perform pg_temp.booking_assert((select count(*)=3 from public.booking_console_slots_v1(s,autumn,2) where service_id=pg_temp.booking_id('fold-opening-service') and table_id=pg_temp.booking_id('table-a2')),'service opening in fold lost early occurrence');
 begin
  perform public.booking_console_save_closure_v1(s,rev+1,pg_temp.booking_id('seconds'),autumn,time '12:00:01',time '13:00');
  raise exception 'non-minute boundary accepted';
 exception when invalid_parameter_value then null; end;
 perform public.booking_console_save_closure_v1(s,rev+1,pg_temp.booking_id('midnight'),autumn,time '18:00',time '24:00');
 perform pg_temp.booking_assert((select ends_at-starts_at=interval '6 hours' and (ends_at at time zone 'Europe/Zurich')::time=time '00:00' from public.booking_restaurant_closures where id=pg_temp.booking_id('midnight')),'partial closure cannot end at midnight');

end $$;

reset role;
update pg_temp.booking_plan_clock set t=(
 select ((d+time '02:00') at time zone 'Europe/Zurich')-interval '1 hour'
 from (select (now() at time zone 'Europe/Zurich')::date+i as d from generate_series(1,365) i) days
 where ((d+1)::timestamp at time zone 'Europe/Zurich')-(d::timestamp at time zone 'Europe/Zurich')=interval '25 hours' limit 1);
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(exists(select 1 from jsonb_array_elements(public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,60)->'slots') slot where slot->>'service_id'=pg_temp.booking_id('fold-opening-service')::text and slot->>'table_id'=pg_temp.booking_id('table-a2')::text),'walk-in opening differs from planned fold service');

reset role;
insert into public.booking_restaurant_closures(id,spot_id,book_date,starts_at,ends_at)
values(pg_temp.booking_id('past-replay'),pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date-1,
 (((now() at time zone 'Europe/Zurich')::date-1)::timestamp at time zone 'Europe/Zurich'),
 (((now() at time zone 'Europe/Zurich')::date)::timestamp at time zone 'Europe/Zurich'));
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert((public.booking_console_save_closure_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_id('past-replay'),(now() at time zone 'Europe/Zurich')::date-1)->>'revision')::bigint=(select revision from public.booking_restaurant_settings where spot_id=pg_temp.booking_id('spot-a')),'identical saved closure cannot replay after its date passes');

select pg_temp.booking_actor('booking-other');
select pg_temp.booking_assert(not exists(select 1 from public.booking_restaurant_closures),'cross-owner closure read');
do $$ begin
 begin perform public.booking_console_week_v1(pg_temp.booking_id('spot-a'),current_date); raise exception 'cross-owner week accepted'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_save_closure_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_id('bad-owner'),current_date); raise exception 'cross-owner closure accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin
  insert into public.booking_restaurant_closures(id,spot_id,book_date,starts_at,ends_at) values(pg_temp.booking_id('bad-clock'),pg_temp.booking_id('spot-a'),current_date,now(),now()+interval '1 hour');
  raise exception 'privileged closure write bypassed civil boundary check';
 exception when check_violation then null; end;
end $$;
reset role;
rollback;
