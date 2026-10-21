-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-allocations-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.reservation_allocations_v1','SELECT,INSERT,UPDATE,DELETE'),'raw allocation client access');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.assign_reservation_tables_v1(uuid,uuid,bigint,uuid[])','execute'),'private assignment exposed');
select pg_temp.booking_assert(not has_function_privilege('anon','booking_private.sync_reservation_allocations_v1()','execute'),'sync trigger callable');
select pg_temp.booking_assert((select relrowsecurity from pg_class where oid='booking_private.reservation_allocations_v1'::regclass),'allocation RLS missing');
select pg_temp.booking_assert(not exists(select 1 from public.booking_reservations r left join booking_private.reservation_allocations_v1 a on a.reservation_id=r.id and a.table_id=r.table_id and a.is_active
 where a.reservation_id is null or a.spot_id<>r.spot_id or a.starts_at<>r.starts_at or a.ends_at<>r.ends_at or a.status<>r.status or a.reservation_revision<>r.revision),'existing booking backfill differs from canonical record');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,jsonb_set(pg_temp.booking_setup('a'),'{tables}',jsonb_build_array(
 jsonb_build_object('id',pg_temp.booking_id('table-a'),'area_id',pg_temp.booking_id('area-a'),'label','Primary','seats',4,'is_active',true),
 jsonb_build_object('id',pg_temp.booking_id('table-two'),'area_id',pg_temp.booking_id('area-a'),'label','Second','seats',4,'is_active',true),
 jsonb_build_object('id',pg_temp.booking_id('table-three'),'area_id',pg_temp.booking_id('area-a'),'label','Third','seats',4,'is_active',true))));
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));
select public.booking_console_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('request-one'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),
 ((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',4,'Synthetic allocation party') as rid \gset
select public.booking_console_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('request-two'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-two'),
 ((now() at time zone 'Europe/Zurich')::date+1+time '19:00') at time zone 'Europe/Zurich',2,'Synthetic next party') as other \gset
reset role;
select pg_temp.booking_assert((select count(*) from booking_private.reservation_allocations_v1 where reservation_id=:'rid' and is_active)=1,'legacy create omitted allocation');
select pg_temp.booking_assert(booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),:'rid',0,array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')])=1,'atomic assignment failed');
select pg_temp.booking_assert(booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),:'rid',0,array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-a')])=1,'permuted retry changed revision');
select pg_temp.booking_assert((select count(*) from public.booking_audit_events where reservation_id=:'rid' and action='reservation_tables_assigned')=1,'replay duplicated assignment audit');

-- Larger parties fit across members, while insufficient capacity fails transactionally.
do $$ declare r uuid; begin
 select id into r from public.booking_reservations where request_id=pg_temp.booking_id('request-one');
 begin
  update public.booking_reservations set party_size=6 where id=r;
  perform booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),r,1,array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-three')]);
  perform pg_temp.booking_assert((select count(*) from booking_private.reservation_allocations_v1 where reservation_id=r and is_active)=2,'six-person allocation did not retain both tables');
  raise exception using errcode='ZX001';
 exception when sqlstate 'ZX001' then null; end;
 begin
  update public.booking_reservations set party_size=6 where id=r;
  perform booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),r,1,array[pg_temp.booking_id('table-a')]);
  raise exception 'insufficient capacity accepted'; exception when invalid_parameter_value then if sqlerrm<>'invalid_booking_party_size' then raise; end if; end;
end $$;

-- Direct canonical updates cannot bypass the secondary-table exclusion constraint.
do $$ declare r public.booking_reservations%rowtype; o public.booking_reservations%rowtype; begin
 select * into r from public.booking_reservations where request_id=pg_temp.booking_id('request-one');
 select * into o from public.booking_reservations where request_id=pg_temp.booking_id('request-two');
 begin update public.booking_reservations set starts_at=r.starts_at,ends_at=r.ends_at where id=o.id;
  raise exception 'secondary table double allocation accepted'; exception when exclusion_violation then null; end;
 perform pg_temp.booking_assert((select starts_at=o.starts_at from public.booking_reservations where id=o.id),'failed allocation changed canonical booking');
 begin perform booking_private.assign_reservation_tables_v1(r.spot_id,r.id,0,array[r.table_id,pg_temp.booking_id('table-three')]); raise exception 'stale assignment accepted'; exception when serialization_failure then null; end;
 begin perform booking_private.assign_reservation_tables_v1(r.spot_id,r.id,1,array[r.table_id,r.table_id]); raise exception 'duplicate tables accepted'; exception when invalid_parameter_value then null; end;
 begin perform booking_private.assign_reservation_tables_v1(r.spot_id,r.id,1,array[r.table_id,pg_temp.booking_id('table-b')]); raise exception 'foreign table accepted'; exception when invalid_parameter_value then null; end;
 begin perform booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-b'),r.id,1,array[pg_temp.booking_id('table-b')]); raise exception 'foreign reservation accepted'; exception when invalid_parameter_value then null; end;
end $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(not exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,2)
 where (starts_at at time zone 'Europe/Zurich')::time='18:00' and table_id in (pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two'))),'legacy availability missed combined members');
select pg_temp.booking_assert(exists(select 1 from public.booking_console_slots_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,2)
 where (starts_at at time zone 'Europe/Zurich')::time='18:00' and table_id=pg_temp.booking_id('table-three')),'unallocated table was blocked');
do $$ declare r jsonb; begin
 r:=public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1)->'reservations'->0;
 begin perform public.booking_console_amend_v1(pg_temp.booking_id('spot-a'),(r->>'id')::uuid,pg_temp.booking_id('unsafe-primary-move'),1,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-three'),(r->>'starts_at')::timestamptz,60,4,'Synthetic allocation party');
  raise exception 'legacy primary move silently dropped combined members'; exception when invalid_parameter_value then if sqlerrm<>'booking_combination_requires_allocation_rpc' then raise; end if; end;
end $$;
reset role;
select pg_temp.booking_assert((select count(*) from booking_private.reservation_allocations_v1 where reservation_id=:'rid' and is_active)=2,'failed primary move changed members');
select pg_temp.booking_assert(booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),:'rid',1,array[pg_temp.booking_id('table-a')])=2,'member retirement failed');
select pg_temp.booking_assert((select count(*) from booking_private.reservation_allocations_v1 where reservation_id=:'rid' and not is_active)=1,'retired membership was lost');
select pg_temp.booking_assert(booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),:'rid',2,array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')])=3,'member reactivation failed');

-- Simulate two already saved visits with non-overlapping earlier planned times today.
-- Real attendance RPCs must still prevent sharing a secondary table after an overstay.
update public.booking_reservations set starts_at=((now() at time zone 'Europe/Zurich')::date+time '00:00') at time zone 'Europe/Zurich',
 ends_at=((now() at time zone 'Europe/Zurich')::date+time '00:30') at time zone 'Europe/Zurich',revision=revision+1 where id=:'rid';
update public.booking_reservations set starts_at=((now() at time zone 'Europe/Zurich')::date+time '01:00') at time zone 'Europe/Zurich',
 ends_at=((now() at time zone 'Europe/Zurich')::date+time '02:00') at time zone 'Europe/Zurich',revision=revision+1 where id=:'other';
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select ((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich' $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),:'rid','confirmed','seated');
do $$ declare r uuid; cname text; begin
 select id into r from public.booking_reservations where request_id=pg_temp.booking_id('request-two');
 begin perform public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),r,'confirmed','seated'); raise exception 'second party occupied secondary table';
 exception when unique_violation then get stacked diagnostics cname=constraint_name; perform pg_temp.booking_assert(cname='booking_allocation_one_seated','wrong seating boundary tested'); end;
 perform pg_temp.booking_assert((select status='confirmed' from public.booking_reservations where id=r),'failed seating changed booking');
end $$;
select pg_temp.booking_assert(not exists(select 1 from jsonb_array_elements(public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,30)->'slots') s where s->>'table_id'=pg_temp.booking_id('table-two')::text),'walk-in missed secondary physical occupancy');
select pg_temp.booking_assert(exists(select 1 from jsonb_array_elements(public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,30)->'slots') s where s->>'table_id'=pg_temp.booking_id('table-three')::text),'walk-in falsely blocked free table');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),:'rid','seated','completed');
select pg_temp.booking_assert(exists(select 1 from jsonb_array_elements(public.booking_console_walk_in_slots_v1(pg_temp.booking_id('spot-a'),2,30)->'slots') s where s->>'table_id'=pg_temp.booking_id('table-two')::text),'departure did not release secondary table');
reset role;
select pg_temp.booking_assert(not exists(select 1 from booking_private.reservation_allocations_v1 a join public.booking_reservations r on r.id=a.reservation_id
 where a.reservation_id=:'rid' and a.is_active and (a.status<>r.status or a.starts_at<>r.starts_at or a.ends_at<>r.ends_at or a.reservation_revision<>r.revision)),'canonical state did not synchronize all members');
set local role authenticated;
select pg_temp.booking_actor('booking-other');
do $$ begin begin perform public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date); raise exception 'other owner read allocation booking'; exception when insufficient_privilege then null; end; end $$;
reset role;
do $$ begin begin perform booking_private.assign_reservation_tables_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('unknown'),0,array[pg_temp.booking_id('table-a')]); raise exception 'private helper bypassed live operator access'; exception when insufficient_privilege then null; end; end $$;
rollback;
