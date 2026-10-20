-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-public-safety-test:'||label)::uuid $$;
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


select public.booking_console_save_public_settings_v1(pg_temp.booking_id('spot-a'),1,true,array[pg_temp.booking_id('service-a')],60,90,120,'confirmed','privacy@booking.invalid');
create function pg_temp.public_create() returns jsonb language sql as $$ select public.booking_guest_create_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('request'),1,((now() at time zone 'Europe/Zurich')::date+1+time '18:00') at time zone 'Europe/Zurich',2,'Synthetic public guest','guest@booking.invalid',repeat('a',64),repeat('sealed-',10)); $$;
create function pg_temp.deny_rpc(statement text,expected text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlerrm=expected then return; end if; raise; end;
 raise exception 'Booking Console: unexpectedly allowed %',statement;
end $$;
-- Actual PostgreSQL grants, rather than a caller-controlled JWT role string, protect intake.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin
 begin perform pg_temp.public_create(); raise exception 'authenticated forged service role bypassed grant'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare f record; t text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('booking_guest_availability_v1','booking_guest_create_v1','booking_guest_read_v1','booking_guest_cancel_v1') loop
  perform pg_temp.booking_assert(not has_function_privilege('anon',f.oid,'execute'),'anonymous direct guest RPC: '||f.proname);
  perform pg_temp.booking_assert(not has_function_privilege('authenticated',f.oid,'execute'),'authenticated direct guest RPC: '||f.proname);
  perform pg_temp.booking_assert(has_function_privilege('service_role',f.oid,'execute'),'service channel missing: '||f.proname);
 end loop;
 foreach t in array array['booking_private.guest_access_v1','booking_private.guest_mail_outbox_v1','public.booking_public_settings'] loop
  perform pg_temp.booking_assert((select relrowsecurity from pg_class where oid=t::regclass),'missing RLS: '||t);
  perform pg_temp.booking_assert(not has_table_privilege('authenticated',t,'INSERT,UPDATE,DELETE'),'client mutation: '||t);
 end loop;
 perform pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.guest_access_v1','SELECT'),'guest link hashes/ciphertext exposed');
 perform pg_temp.booking_assert(not has_table_privilege('anon','public.booking_public_settings','SELECT'),'public raw settings exposed');
end $$;
set local role service_role;
select pg_temp.public_create() as created \gset
select set_config('booking.test.guest_id',(:'created'::jsonb->>'id'),true);
select pg_temp.booking_assert(public.booking_guest_read_v1(current_setting('booking.test.guest_id')::uuid,repeat('a',64))->>'guest_name'='Synthetic public guest','positive own guest link failed');
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-owner'),'write_suspension','booking_public_fixture');
set local role service_role;
select pg_temp.deny_rpc('select pg_temp.public_create()','SAFETY_WRITE_RESTRICTED');
select pg_temp.deny_rpc('select public.booking_guest_availability_v1(pg_temp.booking_id(''spot-a''),(now() at time zone ''Europe/Zurich'')::date+1,2)','SAFETY_WRITE_RESTRICTED');
select pg_temp.deny_rpc('select public.booking_guest_read_v1(current_setting(''booking.test.guest_id'')::uuid,repeat(''a'',64))','SAFETY_WRITE_RESTRICTED');
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.booking_id('booking-owner') and reason_code='booking_public_fixture';
set local role service_role;
select pg_temp.booking_assert(pg_temp.public_create()=:'created'::jsonb,'Safety recovery changed original guest outcome');
reset role;
-- The same canonical Distribution visibility rule used by the public Spot reader applies here.
insert into public.distribution_trust_states(content_item_id,engine_version,automatic_state,effective_state,evaluation_source)
select i.id,(select version from public.distribution_trust_engine_versions order by created_at desc limit 1),'quarantined','quarantined','automatic'
from public.safety_content_items i where i.entity_type='spot' and i.entity_id=pg_temp.booking_id('spot-a')
on conflict(content_item_id) do update set effective_state='quarantined';
select pg_temp.booking_assert(not public.distribution_trust_entity_is_eligible_v1('spot',pg_temp.booking_id('spot-a'),'discovery'),'fixture quarantine did not take effect');
set local role service_role;
select pg_temp.deny_rpc('select public.booking_guest_availability_v1(pg_temp.booking_id(''spot-a''),(now() at time zone ''Europe/Zurich'')::date+1,2)','booking_public_unavailable');
reset role;
update public.distribution_trust_states set effective_state='normal',automatic_state='normal' where content_item_id in (select id from public.safety_content_items where entity_type='spot' and entity_id=pg_temp.booking_id('spot-a'));
select pg_temp.booking_assert(public.distribution_trust_entity_is_eligible_v1('spot',pg_temp.booking_id('spot-a'),'discovery'),'visibility recovery did not restore fixture');
set local role service_role;
select pg_temp.booking_assert(public.booking_guest_availability_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1,2)->>'spot_id'=pg_temp.booking_id('spot-a')::text,'visibility recovery did not restore availability');
reset role;
-- Transfer of restaurant ownership requires a fresh opt-in; old configuration is not inherited as consent.
update public.spots set owner_id=pg_temp.booking_id('booking-transfer') where id=pg_temp.booking_id('spot-a');
set local role service_role;
select pg_temp.deny_rpc('select public.booking_guest_availability_v1(pg_temp.booking_id(''spot-a''),(now() at time zone ''Europe/Zurich'')::date+1,2)','booking_public_unavailable');
reset role;
update booking_private.guest_access_v1 set expires_at=clock_timestamp()-interval '1 second' where reservation_id=current_setting('booking.test.guest_id')::uuid;
set local role service_role;
select pg_temp.deny_rpc('select public.booking_guest_read_v1(current_setting(''booking.test.guest_id'')::uuid,repeat(''a'',64))','booking_guest_link_unavailable');
rollback;
