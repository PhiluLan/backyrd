-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-public-test:'||label)::uuid $$;
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
update auth.users set email_confirmed_at=now() where id=pg_temp.booking_id('booking-owner');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),3,true,array[pg_temp.booking_id('service-a')],60,90,120,'confirmed','privacy@booking.invalid','Restaurant notice');
select pg_temp.booking_assert(public.booking_console_public_settings_v1(pg_temp.booking_id('spot-a'))->>'revision'='1','initial public policy revision');
select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),3,true,array[pg_temp.booking_id('service-a')],60,90,120,'confirmed','privacy@booking.invalid','Restaurant notice');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{settings,revision}'='4','idempotent public policy changed restaurant revision');
do $$ begin
 begin perform public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),4,true,array[pg_temp.booking_id('service-b')],60,90,120,'confirmed','privacy@booking.invalid'); raise exception 'foreign public service accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_resource_spot_mismatch' then raise; end if; end;
end $$;
set local role service_role;
select public.booking_guest_availability_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6) as availability \gset
select pg_temp.booking_assert(jsonb_array_length(:'availability'::jsonb->'slots')>0,'no public combined capacity');
select pg_temp.booking_assert(:'availability'::jsonb::text !~ 'table_id|service_id|Familientisch|guest_contact|PRIVATE_NOTE|table_ids|group-ab','public availability leaked internal inventory');
create function pg_temp.guest_create(req text, keyhash text, guest text default 'Synthetic guest') returns jsonb language sql as $$
 select public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id(req),1,((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',6,guest,'GUEST@booking.invalid',keyhash,repeat('sealed-fixture-',5),'PRIVATE_PUBLIC_NOTE');
$$;
select pg_temp.guest_create('guest-one',repeat('a',64)) as created \gset
select pg_temp.guest_create('guest-one',repeat('a',64)) as replay \gset
select pg_temp.booking_assert(:'created'::jsonb=:'replay'::jsonb,'guest creation original outcome changed');
select pg_temp.booking_assert(:'created'::jsonb::text !~ 'table_id|service_id|guest_contact|sealed|PRIVATE_PUBLIC_NOTE','guest receipt leaked internal details');
do $$ begin
 begin perform pg_temp.guest_create('guest-two',repeat('b',64)); raise exception 'shared member double booked publicly'; exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise; end if; end;
 begin perform pg_temp.guest_create('guest-one',repeat('a',64),'Changed guest'); raise exception 'changed guest replay accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise; end if; end;
end $$;
reset role;
select pg_temp.booking_assert((select count(*) from booking_private.guest_mail_outbox_v1 where spot_id=pg_temp.booking_id('spot-a'))=1,'booking/replay duplicated mail intent');
select pg_temp.booking_assert((select count(*) from booking_private.reservation_allocations_v1 where reservation_id=(:'created'::jsonb->>'id')::uuid and is_active)=2,'public allocation omitted members');
select pg_temp.booking_assert((select guest_contact from public.booking_reservations where id=(:'created'::jsonb->>'id')::uuid)='guest@booking.invalid','email normalization differs');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'created'::jsonb->>'id')::uuid)#>>'{events,0,details,actor_role}'='guest','history misattributed guest as operator');
-- Pausing new intake does not strand an existing guest or an unknown creation retry.
select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),4,false,array[pg_temp.booking_id('service-a')],60,90,120,'confirmed','privacy@booking.invalid','Restaurant notice');
set local role service_role;
select pg_temp.booking_assert(pg_temp.guest_create('guest-one',repeat('a',64))=:'created'::jsonb,'pause prevented proven successful creation replay');
select pg_temp.booking_assert(public.booking_guest_read_v1((:'created'::jsonb->>'id')::uuid,repeat('a',64))->>'status'='confirmed','paused intake hid own booking');
select pg_temp.booking_assert(public.booking_guest_recover_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest-one'),repeat('a',64))->>'status'='confirmed','paused intake blocked credential-bound outcome recovery');
do $$ begin
 begin perform public.booking_guest_availability_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6); raise exception 'paused public intake remained open'; exception when no_data_found then if sqlerrm<>'booking_public_unavailable' then raise; end if; end;
 begin perform public.booking_guest_recover_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest-one'),repeat('b',64)); raise exception 'wrong key accepted'; exception when no_data_found then if sqlerrm<>'booking_guest_link_unavailable' then raise; end if; end;
end $$;
select public.booking_guest_cancel_v1((:'created'::jsonb->>'id')::uuid,repeat('a',64),pg_temp.booking_id('cancel'),0) as cancelled \gset
select public.booking_guest_cancel_v1((:'created'::jsonb->>'id')::uuid,repeat('a',64),pg_temp.booking_id('cancel'),0) as cancelled_again \gset
select pg_temp.booking_assert(:'cancelled'::jsonb=:'cancelled_again'::jsonb and :'cancelled'::jsonb->>'status'='cancelled','cancel replay changed outcome');
select pg_temp.booking_assert(public.booking_guest_recover_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest-one'),repeat('a',64))->>'status'='cancelled','recovery returned an obsolete creation status');
reset role;
select pg_temp.booking_assert((select count(*) from booking_private.guest_mail_outbox_v1 where spot_id=pg_temp.booking_id('spot-a'))=2,'cancel/replay duplicated mail intent');
select pg_temp.booking_assert(not exists(select 1 from booking_private.reservation_allocations_v1 where reservation_id=(:'created'::jsonb->>'id')::uuid and is_active and status<>'cancelled'),'guest cancellation did not release all members');
-- A stale contact link is revoked atomically with an operator contact correction.
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),5,true,array[pg_temp.booking_id('service-a')],60,90,120,'pending','privacy@booking.invalid','Restaurant notice');
set local role service_role;
select public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest-pending'),3,((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',6,'Pending guest','pending@booking.invalid',repeat('c',64),repeat('sealed-',10)) as pending \gset
select pg_temp.booking_assert(:'pending'::jsonb->>'status'='pending','request-mode policy fabricated confirmation');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),(:'pending'::jsonb->>'id')::uuid,'pending','confirmed');
reset role;
select pg_temp.booking_assert((select count(*) from booking_private.guest_mail_outbox_v1 where reservation_id=(:'pending'::jsonb->>'id')::uuid)=2,'operator confirmation omitted guest update intent');
select pg_temp.booking_assert((select state from booking_private.guest_mail_outbox_v1 where reservation_id=(:'pending'::jsonb->>'id')::uuid and event_kind='created')='suppressed','obsolete request confirmation remained sendable');
update public.booking_reservations set note='PRIVATE_OPERATOR_NOTE',revision=revision+1 where id=(:'pending'::jsonb->>'id')::uuid;
select pg_temp.booking_assert((select count(*) from booking_private.guest_mail_outbox_v1 where reservation_id=(:'pending'::jsonb->>'id')::uuid)=2,'private note generated guest mail');
update public.booking_reservations set guest_contact='corrected@booking.invalid',revision=revision+1 where id=(:'pending'::jsonb->>'id')::uuid;
select pg_temp.booking_assert((select revoked_at is not null from booking_private.guest_access_v1 where reservation_id=(:'pending'::jsonb->>'id')::uuid),'old email kept guest access');
select pg_temp.booking_assert(not exists(select 1 from booking_private.guest_mail_outbox_v1 where reservation_id=(:'pending'::jsonb->>'id')::uuid and state<>'suppressed'),'wrong-recipient mail intent not suppressed');
set local role service_role;
do $$ begin
 begin perform public.booking_guest_read_v1((select id from public.booking_reservations where request_id=pg_temp.booking_id('guest-pending')),repeat('c',64)); raise exception 'revoked contact link accepted'; exception when no_data_found then if sqlerrm<>'booking_guest_link_unavailable' then raise; end if; end;
end $$;

-- Recipient quotas remain bounded even when old bookings have been cancelled.
set local role service_role;
select public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('quota-two'),3,((now() at time zone 'Europe/Zurich')::date+1+time '20:00') at time zone 'Europe/Zurich',6,'Quota fixture two','guest@booking.invalid',repeat('d',64),repeat('sealed-',10)) as quota_two \gset
select public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('quota-three'),3,((now() at time zone 'Europe/Zurich')::date+1+time '21:00') at time zone 'Europe/Zurich',6,'Quota fixture three','guest@booking.invalid',repeat('e',64),repeat('sealed-',10));
do $$ begin
 begin perform public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('quota-four'),3,((now() at time zone 'Europe/Zurich')::date+1+time '22:00') at time zone 'Europe/Zurich',6,'Quota fixture four','guest@booking.invalid',repeat('f',64),repeat('sealed-',10)); raise exception 'recipient quota bypass'; exception when invalid_parameter_value then if sqlerrm<>'booking_guest_request_unavailable' then raise; end if; end;
end $$;
reset role;
select pg_temp.booking_assert((select count(*) from public.booking_reservations where spot_id=pg_temp.booking_id('spot-a') and source='website')=4,'quota failure orphaned a reservation');
select set_config('booking.test.quota_id',(:'quota_two'::jsonb->>'id'),true);
update booking_private.guest_access_v1 set cancellation_deadline=clock_timestamp()-interval '1 second' where reservation_id=current_setting('booking.test.quota_id')::uuid;
set local role service_role;
do $$ begin
 begin perform public.booking_guest_cancel_v1(current_setting('booking.test.quota_id')::uuid,repeat('d',64),pg_temp.booking_id('past-cutoff'),0); raise exception 'cancel cutoff bypassed'; exception when invalid_parameter_value then if sqlerrm<>'booking_guest_cancel_unavailable' then raise; end if; end;
end $$;
reset role;
select pg_temp.booking_assert((select status from public.booking_reservations where id=current_setting('booking.test.quota_id')::uuid)='pending','denied cancellation changed saved state');
-- Unresolved physical overstays are not silently promised to another public guest.
update public.booking_reservations set status='seated',starts_at=((now() at time zone 'Europe/Zurich')::date-1+time '20:00') at time zone 'Europe/Zurich',ends_at=((now() at time zone 'Europe/Zurich')::date-1+time '21:00') at time zone 'Europe/Zurich',revision=revision+1 where id=current_setting('booking.test.quota_id')::uuid;
set local role service_role;
select pg_temp.booking_assert(jsonb_array_length(public.booking_guest_availability_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6)->'slots')=0,'overstay was publicly offered before staff resolved it');
reset role;
update public.booking_reservations set status='completed',revision=revision+1 where id=current_setting('booking.test.quota_id')::uuid;
set local role service_role;
select pg_temp.booking_assert(jsonb_array_length(public.booking_guest_availability_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6)->'slots')>0,'completed visit still hid public capacity');
reset role;
select pg_temp.booking_assert((select count(*) from booking_private.guest_mail_outbox_v1 where spot_id=pg_temp.booking_id('spot-a'))=6,'quota/cutoff/private changes created unexpected mail intents');
rollback;
