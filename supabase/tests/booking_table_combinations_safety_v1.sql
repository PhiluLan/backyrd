-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-combination-safety-test:'||label)::uuid $$;
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

-- A second physical table and an explicitly configured group remain restaurant-scoped.
reset role;
insert into public.booking_restaurant_tables(id,spot_id,area_id,label,seats) values(pg_temp.booking_id('table-two'),pg_temp.booking_id('spot-a'),pg_temp.booking_id('area-a'),'Second table',4);
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),1,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8);

create function pg_temp.group_create() returns jsonb language sql as $$
 select public.booking_console_create_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('group-create'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',60,6,'Synthetic group');
$$;
create function pg_temp.group_amend() returns uuid language sql as $$
 select public.booking_console_amend_v2(pg_temp.booking_id('spot-a'),current_setting('booking.test.group_id',true)::uuid,pg_temp.booking_id('amend'),0,pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',60,6,'Synthetic group corrected');
$$;
create function pg_temp.group_walk() returns jsonb language sql as $$
 select public.booking_console_walk_in_v2(pg_temp.booking_id('spot-a'),pg_temp.booking_id('group-walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],pg_temp.booking_id('group-ab'),6,60);
$$;
create function pg_temp.group_save() returns bigint language sql as $$
 select public.booking_console_save_combination_v1(pg_temp.booking_id('spot-a'),2,pg_temp.booking_id('group-ab'),'A + B',pg_temp.booking_id('table-a'),array[pg_temp.booking_id('table-a'),pg_temp.booking_id('table-two')],8);
$$;
create function pg_temp.deny(statement text, expected text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlerrm=expected then return; end if; raise; end;
 raise exception 'Booking Console: unexpectedly allowed %',statement;
end $$;
create function pg_temp.deny_all(expected text, including_reads boolean default true) returns void language plpgsql as $$ begin
 perform pg_temp.deny('select pg_temp.group_create()',expected);
 perform pg_temp.deny('select pg_temp.group_amend()',expected);
 perform pg_temp.deny('select pg_temp.group_walk()',expected);
 perform pg_temp.deny('select pg_temp.group_save()',expected);
 if including_reads then
  perform pg_temp.deny('select public.booking_console_slots_v2(pg_temp.booking_id(''spot-a''),(now() at time zone ''Europe/Zurich'')::date+1,6)',expected);
  perform pg_temp.deny('select public.booking_console_walk_in_slots_v2(pg_temp.booking_id(''spot-a''),6,60)',expected);
  perform pg_temp.deny('select public.booking_console_read_v1(pg_temp.booking_id(''spot-a''),current_date)',expected);
 end if;
end $$;
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-manager'),'booking-manager@booking.invalid','manager',repeat('a',64));
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-host'),'booking-host@booking.invalid','host',repeat('b',64));
select public.booking_console_invite_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('invite-viewer'),'booking-viewer@booking.invalid','viewer',repeat('c',64));
select pg_temp.booking_actor('booking-manager');
select public.booking_console_invitation_v1(repeat('a',64),true);
select pg_temp.booking_assert(pg_temp.group_save()=2,'manager configuration access denied');
select pg_temp.booking_actor('booking-host');
select public.booking_console_invitation_v1(repeat('b',64),true);
select pg_temp.deny('select pg_temp.group_save()','booking_operator_required');
select pg_temp.group_create() as host_creation \gset
select set_config('booking.test.group_id',(:'host_creation'::jsonb->>'id'),true);
select pg_temp.group_amend();
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_slots_v2(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,6))>0,'host could not read choices');
select pg_temp.booking_actor('booking-viewer');
select public.booking_console_invitation_v1(repeat('c',64),true);
select pg_temp.deny_all('booking_operator_required',false);
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1)->'reservations')=1,'viewer missing permitted reservation');
select pg_temp.booking_assert((select count(*) from public.booking_table_combinations)=0,'team must use scoped RPC, not owner-only direct read');
select pg_temp.booking_actor('booking-other');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.booking_id('booking-other'),'role','authenticated','user_metadata',jsonb_build_object('booking_role','manager','spot_id',pg_temp.booking_id('spot-a')))::text,true);
select pg_temp.deny_all('booking_operator_required');
select pg_temp.booking_assert((select count(*) from public.booking_table_combinations)=0,'foreign direct root read');
select pg_temp.booking_actor('booking-unverified');
select pg_temp.deny_all('booking_operator_required');

-- Validate grants across every new public boundary and every private helper.
reset role;
do $$ declare f record; t text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('booking_console_slots_v2','booking_console_create_v2','booking_console_amend_v2','booking_console_walk_in_slots_v2','booking_console_walk_in_v2','booking_console_save_combination_v1') loop
  perform pg_temp.booking_assert(not has_function_privilege('anon',f.oid,'execute'),'anonymous callable: '||f.proname);
  perform pg_temp.booking_assert(has_function_privilege('authenticated',f.oid,'execute'),'missing authenticated grant: '||f.proname);
 end loop;
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='booking_private' and (p.proname like '%_v2' or p.proname='combination_projection_v2') loop
  perform pg_temp.booking_assert(not has_function_privilege('authenticated',f.oid,'execute'),'private callable: '||f.proname);
 end loop;
 foreach t in array array['public.booking_table_combinations','booking_private.combination_tables_v1','booking_private.reservation_requests_v2'] loop
  perform pg_temp.booking_assert((select relrowsecurity from pg_class where oid=t::regclass),'missing RLS: '||t);
  perform pg_temp.booking_assert(not has_table_privilege('authenticated',t,'INSERT,UPDATE,DELETE'),'direct mutation grants: '||t);
 end loop;
end $$;
-- Canonical Safety functions and real measures gate both acting staff and restaurant owner.
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-owner'),'write_suspension','booking_combination_fixture');
set local role authenticated;
select pg_temp.booking_actor('booking-manager');
select pg_temp.deny_all('SAFETY_WRITE_RESTRICTED');
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.booking_id('booking-owner') and reason_code='booking_combination_fixture';
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-manager'),'account_restricted','booking_combination_fixture');
set local role authenticated;
select pg_temp.booking_actor('booking-manager');
select pg_temp.deny_all('SAFETY_ACCOUNT_RESTRICTED');
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.booking_id('booking-manager') and reason_code='booking_combination_fixture';
set local role authenticated;
select pg_temp.booking_actor('booking-manager');
select pg_temp.booking_assert(pg_temp.group_save()=2,'manager did not recover after measure revocation');
select pg_temp.group_create(); -- Identical host request: recovery returns its original outcome.
select pg_temp.booking_actor('booking-owner');
select public.booking_console_member_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),0,null);
select pg_temp.booking_actor('booking-host');
select pg_temp.deny_all('booking_operator_required'); -- Even a known successful request cannot bypass revocation.
rollback;
