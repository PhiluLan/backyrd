-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-combinations-test:'||label)::uuid $$;
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
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_slots_v2(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6))>0,'six guests had no combined choice');
select pg_temp.booking_assert(not exists(select 1 from jsonb_array_elements(public.booking_console_slots_v2(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6)) s where jsonb_array_length(s->'table_ids')<>2),'large party offered an undersized single');

create function pg_temp.create_combined(label text, initial_status text default 'confirmed') returns jsonb language sql as $$
 select public.booking_console_create_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id(label),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),
 ((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',60,6,'Secret group guest','private@booking.invalid','PRIVATE_NOTE','phone',initial_status);
$$;
select pg_temp.create_combined('create-one') as created \gset
select pg_temp.create_combined('create-one') as replayed \gset
select pg_temp.booking_assert(:'created'::jsonb=:'replayed'::jsonb,'create replay changed original outcome');
select pg_temp.booking_assert(jsonb_array_length(:'created'::jsonb->'table_ids')=2,'create outcome omitted members');
select pg_temp.booking_assert(not exists(select 1 from jsonb_array_elements(public.booking_console_slots_v2(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6)) s where (s->>'starts_at')::timestamptz=(:'created'::jsonb->>'starts_at')::timestamptz),'shared table was offered again');
select pg_temp.booking_assert(exists(select 1 from jsonb_array_elements(public.booking_console_slots_v2(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6,(:'created'::jsonb->>'id')::uuid)) s where (s->>'starts_at')::timestamptz=(:'created'::jsonb->>'starts_at')::timestamptz),'amendment did not exclude all own members');
do $$ begin
 begin perform pg_temp.create_combined('create-one','pending'); raise exception 'changed initial status replay accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise; end if; end;
 begin perform pg_temp.create_combined('competing-create'); raise exception 'shared member double booked'; exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
 begin perform public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),3,pg_temp.booking_id('duplicate-set'),'Duplicate',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-a')],8); raise exception 'duplicate active footprint'; exception when unique_violation then null; end;
 begin perform public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),3,pg_temp.booking_id('foreign-group'),'Foreign',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-b')],8); raise exception 'foreign table configured'; exception when invalid_parameter_value then null; end;
end $$;

-- A stale or forged suggestion never becomes an ad-hoc allocation or bypasses the service grid.
do $$ declare ids uuid[]; group_id uuid; party integer; bad integer; begin
 for bad in 1..5 loop
  ids:=case when bad=1 then array[pg_temp.booking_id('table-a')] when bad=2 then array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-three')] when bad=3 then array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-b')] else array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')] end;
  group_id:=case when bad=2 then null else pg_temp.booking_id('group-ab') end;
  party:=case when bad=4 then 9 else 6 end;
  begin
   perform public.booking_console_create_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invalid-'||bad),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),ids,group_id,
    ((now() at time zone 'Europe/Zurich')::date+1+case when bad=5 then time '20:07' else time '20:00' end) at time zone 'Europe/Zurich',60,party,'Invalid synthetic proposal');
   raise exception 'invalid suggestion accepted: %',bad;
  exception when invalid_parameter_value then null; end;
 end loop;
 begin
  perform public.booking_console_amend_v1(pg_temp.booking_id('spot-a'),(select id from public.booking_reservations where request_id=pg_temp.booking_id('create-one')),pg_temp.booking_id('legacy-move'),0,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-three'),
   ((now() at time zone 'Europe/Zurich')::date+1+time '20:00') at time zone 'Europe/Zurich',60,6,'Secret group guest','private@booking.invalid','PRIVATE_NOTE');
  raise exception 'legacy amendment split group';
 exception when invalid_parameter_value then if sqlerrm<>'booking_combination_requires_allocation_rpc' then raise; end if; end;
end $$;

create function pg_temp.amend_combined(req text, rev bigint, guest text) returns uuid language sql as $$
 select public.booking_console_amend_v2(pg_temp.booking_id('spot-a'),(select id from public.booking_reservations where request_id=pg_temp.booking_id('create-one')),pg_temp.booking_id(req),rev,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),
 ((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',60,6,guest,'corrected@booking.invalid','CORRECTED_NOTE');
$$;
select pg_temp.amend_combined('amend-one',0,'Corrected guest');
select pg_temp.amend_combined('amend-one',0,'Corrected guest');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid)#>>'{events,0,details,before,table_id}'=pg_temp.booking_id('table-a')::text,'old primary history overwritten');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid)#>'{events,0,details,before,table_ids}'=(:'created'::jsonb->'table_ids'),'old members history overwritten');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid)#>>'{events,0,details,after,table_id}'=pg_temp.booking_id('table-two')::text,'new primary history missing');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid)::text !~* 'Secret group|private@|PRIVATE_NOTE|CORRECTED_NOTE|corrected@','guest text copied into history');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),3,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8,false);
select pg_temp.booking_assert(pg_temp.create_combined('create-one')=:'created'::jsonb,'creation replay after amendment/group archive changed');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),4,pg_temp.booking_id('group-bc'),'B + C',pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],8,false);
select pg_temp.amend_combined('amend-two',1,'Latest corrected guest');
select pg_temp.amend_combined('amend-one',0,'Corrected guest');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1)#>>'{reservations,0,guest_name}'='Latest corrected guest','old amendment replay reapplied guest fields');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1)#>>'{reservations,0,revision}'='2','old amendment replay changed revision');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1)#>'{reservations,0,table_ids}')=2,'archived group lost saved members');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),5,pg_temp.combination_setup());
do $$ declare j jsonb; begin
 begin perform pg_temp.amend_combined('stale',0,'Latest corrected guest'); raise exception 'stale amendment saved'; exception when serialization_failure then null; end;
 j:=jsonb_set(pg_temp.combination_setup(),'{tables,1,is_active}','false');
 begin perform public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),6,j); raise exception 'reserved member retired'; exception when invalid_parameter_value then if sqlerrm<>'booking_combination_reserved_resources' then raise; end if; end;
 j:=jsonb_set(jsonb_set(pg_temp.combination_setup(),'{tables,1,seats}','2'),'{tables,2,seats}','2');
 begin perform public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),6,j); raise exception 'reserved capacity reduced below party'; exception when invalid_parameter_value then if sqlerrm<>'booking_table_has_larger_reservation' then raise; end if; end;
end $$;

-- The real service state machine covers every saved member after a prior planned end.
reset role;
update public.booking_reservations set starts_at=((now() at time zone 'Europe/Zurich')::date+time '00:00') at time zone 'Europe/Zurich',ends_at=((now() at time zone 'Europe/Zurich')::date+time '00:30') at time zone 'Europe/Zurich',revision=revision+1 where id=(:'created'::jsonb->>'id')::uuid;
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select ((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich' $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),6,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8,true);
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid,'confirmed','seated');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v2(pg_temp.booking_id('spot-a'),6,60)->'slots')=0,'walk-in ignored occupied secondary member');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid,'seated','completed');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_walk_in_slots_v2(pg_temp.booking_id('spot-a'),6,60)->'slots')>0,'combined departure failed to release members');
select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60) as walk \gset
select public.booking_console_amend_v2(pg_temp.booking_id('spot-a'),(:'walk'::jsonb->>'id')::uuid,pg_temp.booking_id('walk-name'),0,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),(:'walk'::jsonb->>'starts_at')::timestamptz,60,6,'Walk-in corrected');
select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60) as walk_replayed \gset
select pg_temp.booking_assert(:'walk'::jsonb=:'walk_replayed'::jsonb,'walk replay changed original outcome after guest edit');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),(:'walk'::jsonb->>'id')::uuid,'seated','completed');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),7,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8,false);
select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60) as completed_replay \gset
select pg_temp.booking_assert(:'walk'::jsonb=:'completed_replay'::jsonb,'completed walk-in replay admitted a second party');
reset role;
select pg_temp.booking_assert((select count(*) from public.booking_reservations where spot_id=pg_temp.booking_id('spot-a'))=2,'replay created extra parents');
select pg_temp.booking_assert(not exists(select 1 from booking_private.reservation_allocations_v1 a join public.booking_reservations r on r.id=a.reservation_id where r.spot_id=pg_temp.booking_id('spot-a') and a.is_active and (a.status<>r.status or a.reservation_revision<>r.revision)),'member state drifted');
rollback;
