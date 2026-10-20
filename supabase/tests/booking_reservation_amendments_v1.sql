-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-amendment-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.slots_for_amendment_v1(uuid,date,integer,integer,uuid)','execute'),'client may not bypass exclusion identity checks');
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_amend_v1(uuid,uuid,uuid,bigint,uuid,uuid,timestamptz,integer,integer,text,text,text)','execute'),'anon may not amend');
do $$
declare s uuid:=pg_temp.booking_id('spot-a'); d date:=(now() at time zone 'Europe/Zurich')::date+1;
 setup jsonb; first_slot record; blocked_slot record; target record; r uuid; blocker uuid; rev bigint; snap jsonb;
begin
 setup:=pg_temp.booking_setup('a');
 setup:=jsonb_set(setup,'{tables}',(setup->'tables')||jsonb_build_array(jsonb_build_object('id',pg_temp.booking_id('table-a2'),
   'area_id',pg_temp.booking_id('area-a'),'label','Tisch 2','seats',6,'is_active',true)));
 perform public.booking_console_save_setup_v1(s,1,setup);
 select * into strict first_slot from public.booking_console_slots_v1(s,d,2) where table_id=pg_temp.booking_id('table-a') order by starts_at limit 1;
 r:=public.booking_console_create_v1(s,pg_temp.booking_id('original'),first_slot.service_id,first_slot.table_id,first_slot.starts_at,2,'Original Guest','old@invalid','Original note','phone','pending');
 select * into strict blocked_slot from public.booking_console_slots_v1(s,d,2) where table_id=pg_temp.booking_id('table-a') and starts_at>=first_slot.ends_at order by starts_at limit 1;
 blocker:=public.booking_console_create_v1(s,pg_temp.booking_id('blocker'),blocked_slot.service_id,blocked_slot.table_id,blocked_slot.starts_at,2,'Synthetic blocker');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_amendment_slots_v1(s,r,d,2,60)
   where table_id=first_slot.table_id and starts_at=first_slot.starts_at),'amendment preview must exclude its own booking');
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_amendment_slots_v1(s,r,d,2,60)
   where table_id=blocked_slot.table_id and starts_at=blocked_slot.starts_at),'preview excluded another booking');
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('conflict'),0,blocked_slot.service_id,blocked_slot.table_id,blocked_slot.starts_at,60,2,'Changed Guest');
  raise exception 'overlapping amendment accepted';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert((select starts_at=first_slot.starts_at and guest_name='Original Guest' and revision=0 from public.booking_reservations where id=r),'failed amendment damaged original');
 select * into strict target from public.booking_console_amendment_slots_v1(s,r,d,4,90) where table_id=pg_temp.booking_id('table-a2') order by starts_at limit 1;
 perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('edit'),0,target.service_id,target.table_id,target.starts_at,90,4,' Updated Guest ',' new@invalid ',' Updated note ');
 perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('edit'),0,target.service_id,target.table_id,target.starts_at,90,4,'Updated Guest','new@invalid','Updated note');
 perform pg_temp.booking_assert((select table_id=target.table_id and ends_at=target.starts_at+interval '90 minutes' and party_size=4 and guest_name='Updated Guest'
   and guest_contact='new@invalid' and note='Updated note' and source='phone' and status='pending' and revision=1 from public.booking_reservations where id=r),'atomic amendment or replay failed');
 perform pg_temp.booking_assert((select count(*)=2 from public.booking_audit_events where reservation_id=r),'amendment replay duplicated audit');
 perform pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(s,d,2) where table_id=first_slot.table_id and starts_at=first_slot.starts_at),'original table not released after moving');
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(s,d,2) where table_id=target.table_id and starts_at=target.starts_at),'new interval not occupied');
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('edit'),0,target.service_id,target.table_id,target.starts_at,90,4,'Different payload');
  raise exception 'amend request reused with changed payload';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_amend_v1(s,blocker,pg_temp.booking_id('edit'),0,blocked_slot.service_id,blocked_slot.table_id,blocked_slot.starts_at,60,2,'Synthetic blocker');
  raise exception 'amend request reused across reservations';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('stale'),0,target.service_id,target.table_id,target.starts_at,90,4,'Stale write');
  raise exception 'stale amendment accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('cross-spot'),1,pg_temp.booking_id('service-b'),pg_temp.booking_id('table-b'),target.starts_at,90,4,'Cross-spot write');
  raise exception 'cross-spot resource assignment accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('oversized'),1,target.service_id,target.table_id,target.starts_at,90,7,'Oversized write');
  raise exception 'table capacity exceeded by amendment';
 exception when invalid_parameter_value then null; end;
 -- A no-op does not manufacture a change or consume a new revision.
 perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('noop'),1,target.service_id,target.table_id,target.starts_at,90,4,'Updated Guest','new@invalid','Updated note');
 perform pg_temp.booking_assert((select revision=1 from public.booking_reservations where id=r),'no-op changed revision');
 -- Retrying the immutable ORIGINAL create must not duplicate or undo the edit.
 perform pg_temp.booking_assert(public.booking_console_create_v1(s,pg_temp.booking_id('original'),first_slot.service_id,first_slot.table_id,first_slot.starts_at,2,'Original Guest','old@invalid','Original note','phone','pending')=r,'original create no longer replayable after edit');
 perform pg_temp.booking_assert((select guest_name='Updated Guest' and revision=1 from public.booking_reservations where id=r),'original create retry undid amendment');
 snap:=public.booking_console_read_v1(s,d);
 perform pg_temp.booking_assert(snap#>>'{capabilities,reservation_amendments}'='true','amendments capability missing');
 perform pg_temp.booking_assert(not exists(select 1 from jsonb_array_elements(snap->'reservations') j where j ? 'creation_fingerprint' or j ? 'last_amend_request_id'),'internal replay metadata exposed in read model');
 perform public.booking_console_set_status_v1(s,r,'pending','confirmed');
 select revision into rev from public.booking_reservations where id=r;
 perform pg_temp.booking_assert(rev=2,'status write did not advance amendment revision');
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('status-race'),1,target.service_id,target.table_id,target.starts_at,90,4,'Stale before status change');
  raise exception 'amendment ignored concurrent status change';
 exception when serialization_failure then null; end;
 perform public.booking_console_set_status_v1(s,r,'confirmed','cancelled');
 begin
  perform public.booking_console_amend_v1(s,r,pg_temp.booking_id('terminal'),3,target.service_id,target.table_id,target.starts_at,90,4,'Terminal edit');
  raise exception 'terminal reservation edited';
 exception when invalid_parameter_value then null; end;
 perform pg_temp.booking_assert(public.booking_console_create_v1(s,pg_temp.booking_id('original'),first_slot.service_id,first_slot.table_id,first_slot.starts_at,2,'Original Guest','old@invalid','Original note','phone','pending')=r,'terminal original create replay failed');
 perform pg_temp.booking_assert((select status='cancelled' from public.booking_reservations where id=r),'replay revived cancelled booking');
end $$;

select pg_temp.booking_actor('booking-other');
do $$ begin
 begin
  perform public.booking_console_amendment_slots_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('missing'),current_date+1,2,60);
  raise exception 'cross-owner amendment slots accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.booking_console_amend_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('missing'),gen_random_uuid(),0,
    pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),now()+interval '1 day',60,2,'Forbidden');
  raise exception 'cross-owner amendment accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Guest corrections remain possible after arrival even when the planned start
-- is in the past; this must not turn into an allocation/availability rewrite.
insert into public.booking_reservations(id,spot_id,table_id,service_id,request_id,guest_name,party_size,starts_at,ends_at,status,source)
values(pg_temp.booking_id('current'),pg_temp.booking_id('spot-a'),pg_temp.booking_id('table-a2'),pg_temp.booking_id('service-a'),
 pg_temp.booking_id('current-create'),'Current synthetic guest',2,
 ((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich',
 ((now() at time zone 'Europe/Zurich')::date+time '13:00') at time zone 'Europe/Zurich','confirmed','phone');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
do $$ declare r public.booking_reservations%rowtype; s uuid:=pg_temp.booking_id('spot-a'); begin
 perform public.booking_console_set_status_v1(s,pg_temp.booking_id('current'),'confirmed','arrived');
 select * into strict r from public.booking_reservations where id=pg_temp.booking_id('current');
 perform public.booking_console_amend_v1(s,r.id,pg_temp.booking_id('current-edit'),1,r.service_id,r.table_id,r.starts_at,60,2,'Corrected current guest','correct@invalid','Organisational note');
 perform pg_temp.booking_assert((select status='arrived' and arrived_at is not null and revision=2 and guest_name='Corrected current guest'
   and starts_at=r.starts_at and ends_at=r.ends_at from public.booking_reservations where id=r.id),'guest correction changed attendance/allocation');
 begin
  perform public.booking_console_amend_v1(s,r.id,pg_temp.booking_id('arrived-move'),2,r.service_id,r.table_id,r.starts_at,90,2,'Corrected current guest','correct@invalid','Organisational note');
  raise exception 'arrived reservation reallocated';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- A prior day's visit can be left seated after its planned interval. Planned
-- availability remains distinct, but a second physical seating must fail.
insert into public.booking_reservations(id,spot_id,table_id,service_id,request_id,guest_name,party_size,starts_at,ends_at,status,source,arrived_at,seated_at)
values(pg_temp.booking_id('unclosed'),pg_temp.booking_id('spot-a'),pg_temp.booking_id('table-a2'),pg_temp.booking_id('service-a'),
 pg_temp.booking_id('unclosed-create'),'Synthetic prior visit',2,
 (((now() at time zone 'Europe/Zurich')::date-1)+time '12:00') at time zone 'Europe/Zurich',
 (((now() at time zone 'Europe/Zurich')::date-1)+time '13:00') at time zone 'Europe/Zurich','seated','phone',now()-interval '1 day',now()-interval '1 day');
do $$ begin
 begin
  insert into public.booking_reservations(spot_id,table_id,service_id,request_id,guest_name,party_size,starts_at,ends_at,status,source)
  select spot_id,table_id,service_id,gen_random_uuid(),'Synthetic simultaneous party',2,starts_at+interval '3 hours',ends_at+interval '3 hours','seated','phone'
  from public.booking_reservations where id=pg_temp.booking_id('unclosed');
  raise exception 'simultaneous seating bypassed index';
 exception when unique_violation then null; end;
end $$;
set local role authenticated;
do $$ declare s uuid:=pg_temp.booking_id('spot-a'); d date:=(now() at time zone 'Europe/Zurich')::date; snap jsonb; begin
 snap:=public.booking_console_read_v1(s,d);
 perform pg_temp.booking_assert(snap#>>'{capabilities,current_seating}'='true','current seating capability missing');
 perform pg_temp.booking_assert(jsonb_array_length(snap->'unclosed_visits')=1,'prior-day seated visit hidden');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_read_v1(s,d-1)->'unclosed_visits')=0,'current occupancy mixed into historical diary');
 begin
  perform public.booking_console_set_status_v1(s,pg_temp.booking_id('current'),'arrived','seated');
  raise exception 'second party seated on an occupied physical table';
 exception when invalid_parameter_value then
  perform pg_temp.booking_assert(sqlerrm='booking_table_occupied','wrong simultaneous seating rejection');
 end;
 perform public.booking_console_set_status_v1(s,pg_temp.booking_id('unclosed'),'seated','completed');
 perform public.booking_console_set_status_v1(s,pg_temp.booking_id('current'),'arrived','seated');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_read_v1(s,d)->'unclosed_visits')=0,'completed prior visit remained unclosed');
end $$;
reset role;
rollback;

