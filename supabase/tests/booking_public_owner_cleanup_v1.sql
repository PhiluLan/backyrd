-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-public-owner-cleanup-test:'||label)::uuid $$;
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
from unnest(array['booking-owner','booking-other','booking-host','booking-viewer','booking-manager','booking-unverified','booking-expiring','booking-transfer']) x;
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

update auth.users set email_confirmed_at=now() where id in (select pg_temp.booking_id(x) from unnest(array['booking-owner','booking-other','booking-host','booking-viewer','booking-manager','booking-expiring','booking-transfer']) x);
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)->'settings'='null','fresh console has no fabricated setup');
select pg_temp.booking_assert(public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'))=1,'owner setup save');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));


select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),1,true,array[pg_temp.booking_id('service-a')],60,90,120,'confirmed','former@booking.invalid','Former policy');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest-original'),1,((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',2,'Retained guest','guest@booking.invalid',repeat('a',64),repeat('sealed-',10)) as booked \gset
reset role;
update public.spots set owner_id=pg_temp.booking_id('booking-transfer') where id in (pg_temp.booking_id('spot-a'),pg_temp.booking_id('spot-b'));
-- Existing account deletion requires ownership transfer first; emulate its Auth
-- deletion boundary after that transfer, not a deletion of an active operator.
set local role authenticated;
select pg_temp.booking_actor('booking-transfer');
do $$ begin
 begin delete from auth.users where id=pg_temp.booking_id('booking-owner'); raise exception 'ordinary client deleted Auth account'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.users where id=pg_temp.booking_id('booking-owner');
select pg_temp.booking_assert(not exists(select 1 from auth.users where id=pg_temp.booking_id('booking-owner')),'former Auth account still blocked');
select pg_temp.booking_assert(not exists(select 1 from public.booking_public_settings where spot_id=pg_temp.booking_id('spot-a')),'former owner public contact/config survived Auth erasure');
select pg_temp.booking_assert((select owner_id from public.spots where id=pg_temp.booking_id('spot-a'))=pg_temp.booking_id('booking-transfer'),'erasure changed new restaurant owner');
select pg_temp.booking_assert((select count(*) from public.booking_reservations where spot_id=pg_temp.booking_id('spot-a'))=1,'owner erasure deleted guest booking');
select pg_temp.booking_assert((select count(*) from booking_private.guest_access_v1 where spot_id=pg_temp.booking_id('spot-a'))=1,'owner erasure deleted guest access');
select pg_temp.booking_assert((select count(*) from booking_private.guest_mail_outbox_v1 where spot_id=pg_temp.booking_id('spot-a'))=1,'owner erasure deleted guest mail intent');
select pg_temp.booking_assert((select last_revision from booking_private.public_policy_epochs_v1 where spot_id=pg_temp.booking_id('spot-a'))=1,'policy epoch disappeared with former owner');
select pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.public_policy_epochs_v1','SELECT,INSERT,UPDATE,DELETE'),'private policy counter exposed');
set local role service_role;
select pg_temp.booking_assert(public.booking_guest_read_v1((:'booked'::jsonb->>'id')::uuid,repeat('a',64))->>'guest_name'='Retained guest','new owner lost guest capability continuity');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
do $$ begin
 begin perform public.booking_console_public_settings_v1(pg_temp.booking_id('spot-a')); raise exception 'deleted owner JWT kept access'; exception when insufficient_privilege then if sqlerrm<>'booking_operator_required' then raise; end if; end;
end $$;
select pg_temp.booking_actor('booking-transfer');
select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),2,true,array[pg_temp.booking_id('service-a')],60,90,60,'pending','next-owner@booking.invalid','New policy');
select pg_temp.booking_assert(public.booking_console_public_settings_v1(pg_temp.booking_id('spot-a'))->>'revision'='2','recreated public policy reused former terms version');
select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),2,true,array[pg_temp.booking_id('service-a')],60,90,60,'pending','next-owner@booking.invalid','New policy');
select pg_temp.booking_assert(public.booking_console_public_settings_v1(pg_temp.booking_id('spot-a'))->>'revision'='2','identical policy retry advanced epoch');
set local role service_role;
do $$ begin
 begin perform public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('stale-form'),1,((now() at time zone 'Europe/Zurich')::date+1+time '20:00') at time zone 'Europe/Zurich',2,'Stale form guest','stale@booking.invalid',repeat('b',64),repeat('sealed-',10)); raise exception 'old terms form accepted after owner erasure/republication'; exception when serialization_failure then if sqlerrm<>'booking_public_policy_changed' then raise; end if; end;
end $$;
select pg_temp.booking_assert(public.booking_guest_read_v1((:'booked'::jsonb->>'id')::uuid,repeat('a',64))->>'cancellation_deadline'=:'booked'::jsonb->>'cancellation_deadline','new owner policy rewrote existing guest cancellation promise');
select public.booking_guest_cancel_v1((:'booked'::jsonb->>'id')::uuid,repeat('a',64),pg_temp.booking_id('cancel'),0);
reset role;
select pg_temp.booking_assert((select status from public.booking_reservations where id=(:'booked'::jsonb->>'id')::uuid)='cancelled','retained guest cannot cancel after owner erasure');
rollback;
