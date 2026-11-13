-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-transfer-safety-test:'||label)::uuid $$;
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

reset role;
insert into public.booking_restaurant_tables(id,spot_id,area_id,label,seats) values
 (pg_temp.booking_id('table-two'),pg_temp.booking_id('spot-a'),pg_temp.booking_id('area-a'),'Second',4),
 (pg_temp.booking_id('table-three'),pg_temp.booking_id('spot-a'),pg_temp.booking_id('area-a'),'Third',4);
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select ((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich' $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8);
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),2,pg_temp.booking_id('group-bc'),'B + C',pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],8);
select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('admission'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60) as admitted \gset
select set_config('booking.test.transfer_id',(:'admitted'::jsonb->>'id'),true);
create function pg_temp.transfer() returns jsonb language sql as $$
 select public.booking_console_transfer_v1(pg_temp.booking_id('spot-a'),current_setting('booking.test.transfer_id')::uuid,pg_temp.booking_id('move'),0,pg_temp.booking_id('table-two'),array[pg_temp.booking_id('table-two'),pg_temp.booking_id('table-three')],pg_temp.booking_id('group-bc'),60);
$$;
create function pg_temp.deny_transfer(expected text) returns void language plpgsql as $$ begin
 begin perform pg_temp.transfer(); raise exception 'unauthorized transfer allowed'; exception when others then if sqlerrm<>expected then raise; end if; end;
 begin perform public.booking_console_transfer_choices_v1(pg_temp.booking_id('spot-a'),current_setting('booking.test.transfer_id')::uuid,60); raise exception 'unauthorized preview allowed'; exception when others then if sqlerrm<>expected then raise; end if; end;
end $$;
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-host'),'booking-host@booking.invalid','host',repeat('b',64));
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-viewer'),'booking-viewer@booking.invalid','viewer',repeat('c',64));
select pg_temp.booking_actor('booking-viewer');
select public.booking_console_invitation_v1(repeat('c',64),true);
select pg_temp.deny_transfer('booking_operator_required');
select pg_temp.booking_actor('booking-other');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.booking_id('booking-other'),'role','authenticated','user_metadata',jsonb_build_object('booking_role','manager','spot_id',pg_temp.booking_id('spot-a')))::text,true);
select pg_temp.deny_transfer('booking_operator_required');
select pg_temp.booking_actor('booking-host');
select public.booking_console_invitation_v1(repeat('b',64),true);
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_transfer_choices_v1(pg_temp.booking_id('spot-a'),current_setting('booking.test.transfer_id')::uuid,60)->'choices')=1,'host cannot preview movement');
select pg_temp.transfer() as transferred \gset
reset role;
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_transfer_v1(uuid,uuid,uuid,bigint,uuid,uuid[],uuid,integer)','execute'),'anonymous movement');
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_transfer_choices_v1(uuid,uuid,integer)','execute'),'anonymous preview');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.transfer_choices_v1(uuid,public.booking_reservations,timestamptz,integer)','execute'),'raw private preview exposed');
select pg_temp.booking_assert(not has_table_privilege('authenticated','public.booking_reservations','UPDATE'),'direct physical window mutation');
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-owner'),'write_suspension','booking_transfer_fixture');
set local role authenticated;
select pg_temp.booking_actor('booking-host');
select pg_temp.deny_transfer('SAFETY_WRITE_RESTRICTED');
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.booking_id('booking-owner') and reason_code='booking_transfer_fixture';
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-host'),'account_restricted','booking_transfer_fixture');
set local role authenticated;
select pg_temp.booking_actor('booking-host');
select pg_temp.deny_transfer('SAFETY_ACCOUNT_RESTRICTED');
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.booking_id('booking-host') and reason_code='booking_transfer_fixture';
set local role authenticated;
select pg_temp.booking_actor('booking-host');
select pg_temp.booking_assert(pg_temp.transfer()=:'transferred'::jsonb,'successful transfer did not recover/replay after Safety revocation');
select pg_temp.booking_actor('booking-owner');
select public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),0,null);
select pg_temp.booking_actor('booking-host');
select pg_temp.deny_transfer('booking_operator_required');
rollback;
