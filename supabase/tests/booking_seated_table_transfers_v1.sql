-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-transfer-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_create_v2(uuid,uuid,uuid,uuid,uuid[],uuid,timestamptz,integer,integer,text,text,text,text,text)','execute'),'anonymous v2 creation');
select pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.reservation_requests_v2','SELECT,INSERT,UPDATE,DELETE'),'request history exposed');
select pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.combination_tables_v1','SELECT,INSERT,UPDATE,DELETE'),'raw combination membership exposed');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
create function pg_temp.combination_setup() returns jsonb language sql as $$ select jsonb_set(pg_temp.booking_setup('a'),'{tables}',jsonb_build_array(
 jsonb_build_object('id',pg_temp.booking_id('table-a'),'area_id',pg_temp.booking_id('area-a'),'label','A','seats',4,'is_active',true),
 jsonb_build_object('id',pg_temp.booking_id('table-two'),'area_id',pg_temp.booking_id('area-a'),'label','B','seats',4,'is_active',true),
 jsonb_build_object('id',pg_temp.booking_id('table-three'),'area_id',pg_temp.booking_id('area-a'),'label','C','seats',4,'is_active',true))) $$;
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.combination_setup());
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8);
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-a')],8);
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{settings,revision}'='2','same group save changed revision');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),2,pg_temp.booking_id('group-bc'),'B + C',pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],8);
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{capabilities,table_combinations}'='true','combination capability missing');
reset role;
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select ((now() at time zone 'Europe/Zurich')::date+current_setting('booking.test.transfer_clock')::time) at time zone 'Europe/Zurich' $$;
select set_config('booking.test.transfer_clock','08:00',true);
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60,'Private transfer guest','private@booking.invalid','PRIVATE_NOTE') as admitted \gset
reset role;
insert into public.booking_reservations(spot_id,request_id,service_id,table_id,starts_at,ends_at,party_size,guest_name,source,status)
values(pg_temp.booking_id('spot-a'),pg_temp.booking_id('earlier-unresolved'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-three'),((now() at time zone 'Europe/Zurich')::date+time '08:00') at time zone 'Europe/Zurich',((now() at time zone 'Europe/Zurich')::date+time '09:00') at time zone 'Europe/Zurich',2,'Earlier synthetic party','operator','confirmed');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select set_config('booking.test.transfer_clock','12:00',true);
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_transfer_choices_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,60)->'choices')=1,'overstay did not have exactly the alternate compatible group');
select public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,pg_temp.booking_id('transfer'),0,pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),60) as moved \gset
select pg_temp.booking_assert(:'moved'::jsonb->>'allocation_starts_at'=to_jsonb((((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich'))#>>'{}','server did not set actual movement time');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date)#>>'{reservations,0,starts_at}'=:'admitted'::jsonb->>'starts_at','planned start was rewritten');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date)#>>'{reservations,0,ends_at}'=:'admitted'::jsonb->>'ends_at','planned end was rewritten');
select public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,pg_temp.booking_id('transfer'),0,pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-three'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-bc'),60) as replay \gset
select pg_temp.booking_assert(:'moved'::jsonb=:'replay'::jsonb,'transfer replay changed clock/outcome');
select pg_temp.booking_assert(exists(select 1 from jsonb_array_elements(public.booking_console_walk_in_slots_v2(pg_temp.booking_id('spot-a'),2,60)->'slots') s where s->>'table_id'=pg_temp.booking_id('table-a')::text and s->'combination_id'='null'),'old member stayed occupied');
select pg_temp.booking_assert(not exists(select 1 from jsonb_array_elements(public.booking_console_walk_in_slots_v2(pg_temp.booking_id('spot-a'),2,60)->'slots') s where s->>'table_id' in (pg_temp.booking_id('table-two')::text,pg_temp.booking_id('table-three')::text)),'new physical member was offered again');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid)#>>'{events,0,action}'='seated_tables_transferred','transfer history missing');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid)::text !~* 'Private transfer guest|private@|PRIVATE_NOTE','history copied guest text');
reset role;
select pg_temp.booking_assert(booking_private.closure_affected_v1(pg_temp.booking_id('spot-a'),((now() at time zone 'Europe/Zurich')::date+time '12:15') at time zone 'Europe/Zurich',((now() at time zone 'Europe/Zurich')::date+time '12:45') at time zone 'Europe/Zurich',null,null)=1,'closure impact ignored actual remaining allocation');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_amend_v2(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,pg_temp.booking_id('correction'),1,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),(:'admitted'::jsonb->>'starts_at')::timestamptz,60,6,'Corrected seated name');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date)#>>'{reservations,0,allocation_ends_at}'=:'moved'::jsonb->>'allocation_ends_at','guest correction reset actual occupancy');
select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60,'Private transfer guest','private@booking.invalid','PRIVATE_NOTE') as original_replayed \gset
select pg_temp.booking_assert(:'admitted'::jsonb=:'original_replayed'::jsonb,'original admission replay was changed by transfer');
-- A delayed identical transfer replay does not undo later guest corrections.
select public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,pg_temp.booking_id('transfer'),0,pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),60);
do $$ declare r uuid:=(select id from public.booking_reservations where request_id=pg_temp.booking_id('walk')); begin
 begin perform public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),r,pg_temp.booking_id('transfer'),0,pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),90); raise exception 'changed replay duration accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise; end if; end;
 begin perform public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),r,pg_temp.booking_id('stale'),1,pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),60); raise exception 'stale transfer accepted'; exception when serialization_failure then null; end;
 begin perform public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),r,pg_temp.booking_id('undersized'),2,pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a')],null,60); raise exception 'undersized transfer accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
end $$;
-- An early planned booking on C must not block a move beginning after it ends.
-- A future booking on A does block the whole transfer target set, with rollback.
reset role;
insert into public.booking_reservations(spot_id,request_id,service_id,table_id,starts_at,ends_at,party_size,guest_name,source,status)
values(pg_temp.booking_id('spot-a'),pg_temp.booking_id('future-blocker'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),((now() at time zone 'Europe/Zurich')::date+time '12:30') at time zone 'Europe/Zurich',((now() at time zone 'Europe/Zurich')::date+time '13:30') at time zone 'Europe/Zurich',2,'Upcoming synthetic party','operator','confirmed');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
do $$ declare r uuid:=(select id from public.booking_reservations where request_id=pg_temp.booking_id('walk')); begin
 begin perform public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),r,pg_temp.booking_id('conflicting'),2,pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),60); raise exception 'upcoming booking lost its table'; exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
end $$;
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,'seated','completed');
select public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),(:'admitted'::jsonb->>'id')::uuid,pg_temp.booking_id('transfer'),0,pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),60) as after_departure \gset
select pg_temp.booking_assert(:'moved'::jsonb=:'after_departure'::jsonb,'completed transfer replay reseated the guest');
reset role;
select pg_temp.booking_assert((select count(*) from public.booking_audit_events where spot_id=pg_temp.booking_id('spot-a') and action='seated_tables_transferred')=1,'transfer duplicated audit');
select pg_temp.booking_assert(not exists(select 1 from booking_private.reservation_allocations_v1 a join public.booking_reservations r on r.id=a.reservation_id where r.spot_id=pg_temp.booking_id('spot-a') and a.is_active and (a.starts_at<>coalesce(r.allocation_starts_at,r.starts_at) or a.ends_at<>coalesce(r.allocation_ends_at,r.ends_at) or a.status<>r.status or a.reservation_revision<>r.revision)),'physical range/status drift');
rollback;
