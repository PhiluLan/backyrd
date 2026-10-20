-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.lifecycle_id(label text) returns uuid language sql immutable as $$ select md5('booking-lifecycle:'||label)::uuid $$;
create function pg_temp.lifecycle_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Booking lifecycle: %',message; end if; end $$;
create function pg_temp.lifecycle_actor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.lifecycle_id(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.lifecycle_id(label),'role','authenticated')::text,true);
end $$;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select pg_temp.lifecycle_id(x),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',x||'@lifecycle.invalid','','{}','{}',now(),now()
from unnest(array['owner','other']) x;
insert into public.spots(id,name,lat,lng,owner_id,status) values
 (pg_temp.lifecycle_id('spot'),'Lifecycle fixture',47.5,7.5,pg_temp.lifecycle_id('owner'),'approved');
set local role authenticated;
select pg_temp.lifecycle_actor('owner');
select public.booking_console_save_setup_v1(pg_temp.lifecycle_id('spot'),0,jsonb_build_object(
 'duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.lifecycle_id('area'),'name','Room','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.lifecycle_id('table'),'area_id',pg_temp.lifecycle_id('area'),'label','T1','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id',pg_temp.lifecycle_id('service'),'name','Service','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true))));
do $$ declare slot record; r uuid; begin
 select * into strict slot from public.booking_console_slots_v1(pg_temp.lifecycle_id('spot'),(now() at time zone 'Europe/Zurich')::date+1,2) limit 1;
 r:=public.booking_console_create_v1(pg_temp.lifecycle_id('spot'),pg_temp.lifecycle_id('future-request'),slot.service_id,slot.table_id,slot.starts_at,2,'Synthetic future guest');
 begin
  perform public.booking_console_set_status_v1(pg_temp.lifecycle_id('spot'),r,'confirmed','arrived');
  raise exception 'future arrival accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_set_status_v1(pg_temp.lifecycle_id('spot'),r,'confirmed','seated');
  raise exception 'future seating accepted';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.lifecycle_assert((select arrived_at is null and seated_at is null from public.booking_reservations where id=r),'rejected future attendance wrote timestamps');
end $$;
reset role;
-- Deterministic current-day fixture; no dependency on the hour the suite runs.
-- Separately exercise inventory predicates for both newly occupying states.
-- These synthetic future rows are installed as postgres fixtures only; the
-- checked public transition above proves future attendance cannot be entered.
create function pg_temp.lifecycle_inventory_assert() returns void language plpgsql as $$
declare r public.booking_reservations%rowtype; snap jsonb; setup jsonb; begin
 select * into strict r from public.booking_reservations where request_id=pg_temp.lifecycle_id('future-request');
 perform pg_temp.lifecycle_assert(not exists(select 1 from public.booking_console_slots_v1(r.spot_id,(r.starts_at at time zone 'Europe/Zurich')::date,2) s
  where s.table_id=r.table_id and s.starts_at=r.starts_at),'attendance state not blocking slot lookup');
 begin
  perform public.booking_console_create_v1(r.spot_id,gen_random_uuid(),r.service_id,r.table_id,r.starts_at,2,'Synthetic collision');
  raise exception 'create ignored attendance occupancy';
 exception when invalid_parameter_value then null; end;
 snap:=public.booking_console_read_v1(r.spot_id,(r.starts_at at time zone 'Europe/Zurich')::date);
 setup:=jsonb_build_object('duration_minutes',60,'max_party_size',8,'areas',snap->'areas','tables',snap->'tables','services',snap->'services');
 setup:=jsonb_set(setup,'{tables,0,seats}','1');
 begin
  perform public.booking_console_save_setup_v1(r.spot_id,1,setup);
  raise exception 'attendance state lost capacity protection';
 exception when invalid_parameter_value then null; end;
end $$;
update public.booking_reservations set status='arrived' where request_id=pg_temp.lifecycle_id('future-request');
set local role authenticated;
select pg_temp.lifecycle_inventory_assert();
reset role;
update public.booking_reservations set status='seated' where request_id=pg_temp.lifecycle_id('future-request');
set local role authenticated;
select pg_temp.lifecycle_inventory_assert();
reset role;
insert into public.booking_reservations(id,spot_id,table_id,service_id,request_id,guest_name,party_size,starts_at,ends_at,status,source,created_by)
values(pg_temp.lifecycle_id('current'),pg_temp.lifecycle_id('spot'),pg_temp.lifecycle_id('table'),pg_temp.lifecycle_id('service'),pg_temp.lifecycle_id('request'),
 'Synthetic current guest',4,((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich',
 ((now() at time zone 'Europe/Zurich')::date+time '13:00') at time zone 'Europe/Zurich','confirmed','phone',pg_temp.lifecycle_id('owner'));
set local role authenticated;
do $$ declare s uuid:=pg_temp.lifecycle_id('spot'); r uuid:=pg_temp.lifecycle_id('current'); snap jsonb; setup jsonb; begin
 snap:=public.booking_console_read_v1(s,(now() at time zone 'Europe/Zurich')::date);
 perform pg_temp.lifecycle_assert(snap#>>'{capabilities,service_lifecycle}'='true','capability not advertised');
 perform public.booking_console_set_status_v1(s,r,'confirmed','arrived');
 perform public.booking_console_set_status_v1(s,r,'confirmed','arrived'); -- Lost-response retry.
 perform pg_temp.lifecycle_assert((select status='arrived' and arrived_at is not null and seated_at is null from public.booking_reservations where id=r),'arrival timestamp or status missing');
 perform pg_temp.lifecycle_assert((select count(*)=1 from public.booking_audit_events where reservation_id=r),'arrival retry duplicated audit');
 begin
  perform public.booking_console_set_status_v1(s,r,'confirmed','cancelled');
  raise exception 'stale status accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.booking_console_set_status_v1(s,r,'arrived','completed');
  raise exception 'completion skipped seating';
 exception when invalid_parameter_value then null; end;
 perform public.booking_console_set_status_v1(s,r,'arrived','seated');
 perform public.booking_console_set_status_v1(s,r,'arrived','seated');
 perform pg_temp.lifecycle_assert((select arrived_at is not null and seated_at>=arrived_at and completed_at is null from public.booking_reservations where id=r),'seating timestamps missing');
 -- The v1 setup entry remains protected for both new occupying states.
 setup:=jsonb_build_object('duration_minutes',60,'max_party_size',8,'areas',snap->'areas','tables',snap->'tables','services',snap->'services');
 setup:=jsonb_set(setup,'{tables,0,seats}','1');
 if (select ends_at>now() from public.booking_reservations where id=r) then
  begin
   perform public.booking_console_save_setup_v1(s,1,setup);
   raise exception 'seated capacity reduced below guest count';
  exception when invalid_parameter_value then null; end;
 end if;
 begin
  perform public.booking_console_set_status_v1(s,r,'seated','cancelled');
  raise exception 'seated party cancelled without departure';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- The exclusion rule itself, independent of client/RPC validation.
do $$ begin
 begin
  insert into public.booking_reservations(spot_id,table_id,service_id,request_id,guest_name,party_size,starts_at,ends_at,status,source)
  select spot_id,table_id,service_id,gen_random_uuid(),'Synthetic overlap',2,starts_at,ends_at,'confirmed','operator'
  from public.booking_reservations where id=pg_temp.lifecycle_id('current');
  raise exception 'seated table double booked';
 exception when exclusion_violation then null; end;
end $$;
set local role authenticated;
select pg_temp.lifecycle_actor('other');
select pg_temp.lifecycle_assert(not exists(select 1 from public.booking_reservations),'cross-owner attendance data exposed');
do $$ begin
 begin
  perform public.booking_console_set_status_v1(pg_temp.lifecycle_id('spot'),pg_temp.lifecycle_id('current'),'seated','completed');
  raise exception 'cross-owner departure accepted';
 exception when insufficient_privilege then null; end;
end $$;
select pg_temp.lifecycle_actor('owner');
select public.booking_console_set_status_v1(pg_temp.lifecycle_id('spot'),pg_temp.lifecycle_id('current'),'seated','completed');
select public.booking_console_set_status_v1(pg_temp.lifecycle_id('spot'),pg_temp.lifecycle_id('current'),'seated','completed');
select pg_temp.lifecycle_assert((select status='completed' and completed_at>=seated_at and ends_at>starts_at from public.booking_reservations where id=pg_temp.lifecycle_id('current')),'departure must preserve planned interval and record timestamp');
select pg_temp.lifecycle_assert((select count(*)=3 from public.booking_audit_events where reservation_id=pg_temp.lifecycle_id('current')),'transition retries duplicated audit');
do $$ begin
 begin
  perform public.booking_console_set_status_v1(pg_temp.lifecycle_id('spot'),pg_temp.lifecycle_id('current'),'completed','seated');
  raise exception 'completed visit reactivated';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Departure releases the scheduled interval without deleting history.
insert into public.booking_reservations(spot_id,table_id,service_id,request_id,guest_name,party_size,starts_at,ends_at,status,source)
select spot_id,table_id,service_id,gen_random_uuid(),'Synthetic replacement',2,starts_at,ends_at,'confirmed','operator'
from public.booking_reservations where id=pg_temp.lifecycle_id('current');
select pg_temp.lifecycle_assert(not has_function_privilege('anon','public.booking_console_set_status_v1(uuid,uuid,text,text)','execute'),'anon status grant changed');
select pg_temp.lifecycle_assert(not has_table_privilege('authenticated','public.booking_reservations','INSERT,UPDATE,DELETE'),'direct write grant changed');
rollback;
