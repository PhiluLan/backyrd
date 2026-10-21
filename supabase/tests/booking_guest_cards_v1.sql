-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

-- Preserve pre-existing restored reservations as well as an empty clean boot.
create temp table booking_inventory_before as
 select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) facts from public.booking_reservations r;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-guest-card-test:'||label)::uuid $$;
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

create function pg_temp.card_intent(label text,rev bigint default null,n text default 'Synthetic Guest',e text default 'guest@booking.invalid',p text default '+41 (61) 123 45 67') returns jsonb language sql as $$
 select jsonb_build_object('kind','save','id',pg_temp.booking_id(label),'revision',rev,'name',n,'email',e,'phone',p);
$$;
create function pg_temp.card_archive(label text,rev bigint,archived boolean) returns jsonb language sql as $$
 select jsonb_build_object('kind','archive','id',pg_temp.booking_id(label),'revision',rev,'archived',archived);
$$;
create function pg_temp.card_write(spot uuid,request uuid,intent jsonb,recover boolean default false) returns jsonb language sql as $$
 select public.booking_console_guest_write_v1(spot,request,intent,auth.uid(),recover);
$$;
select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_guests_v1(uuid,text,boolean,timestamptz,uuid)','execute'),'anonymous directory grant');
select pg_temp.booking_assert(not has_function_privilege('service_role','public.booking_console_guest_write_v1(uuid,uuid,jsonb,uuid,boolean)','execute'),'worker directory grant');
do $$ declare t text; begin
 foreach t in array array['guest_cards_v1','guest_card_requests_v1','guest_card_events_v1'] loop
  perform pg_temp.booking_assert((select relrowsecurity from pg_class where oid=('booking_private.'||t)::regclass),'missing guest RLS');
  perform pg_temp.booking_assert(not has_table_privilege('authenticated','booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'direct staff guest grant');
  perform pg_temp.booking_assert(not has_table_privilege('service_role','booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'direct worker guest grant');
 end loop;
end $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'));
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{capabilities,guest_cards}'='true','directory capability absent');
do $$ declare first_result jsonb; result jsonb; details jsonb; begin
 begin perform public.booking_console_guest_write_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('actor-mismatch'),pg_temp.card_intent('wrong-actor-card'),pg_temp.booking_id('booking-other')); raise exception 'expected actor ignored'; exception when insufficient_privilege then null; end;
 perform pg_temp.booking_assert(pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('create'),pg_temp.card_intent('guest'),true) is null,'empty recovery mutated');
 first_result:=pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('create'),pg_temp.card_intent('guest'));
 perform pg_temp.booking_assert(first_result->>'id'=pg_temp.booking_id('guest')::text and first_result->>'revision'='0','create outcome');
 perform pg_temp.booking_assert(pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('create'),pg_temp.card_intent('guest'))=first_result,'create replay');
 result:=pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('edit'),pg_temp.card_intent('guest',0,'Corrected Guest','corrected@booking.invalid'));
 perform pg_temp.booking_assert(result->>'revision'='1','edit CAS');
 perform pg_temp.booking_assert(pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('create'),pg_temp.card_intent('guest'),true)=first_result,'recovery replaced original outcome');
 details:=public.booking_console_guest_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest'));
 perform pg_temp.booking_assert(details#>>'{guest,name}'='Corrected Guest' and jsonb_array_length(details->'events')=2,'canonical read/audit count');
 perform pg_temp.booking_assert(not (details->'guest') ? 'owner_id' and (details->'events')::text not like '%corrected@booking.invalid%','directory overexposure');
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('create'),pg_temp.card_intent('guest',null,'Other')); raise exception 'nonce reused with new intent'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('stale'),pg_temp.card_intent('guest',0,'Stale')); raise exception 'stale edit'; exception when serialization_failure then null; end;
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('recreate'),pg_temp.card_intent('guest')); raise exception 'existing ID recreated'; exception when serialization_failure then null; end;
 result:=pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('noop'),pg_temp.card_intent('guest',1,'Corrected Guest','corrected@booking.invalid'));
 perform pg_temp.booking_assert(result->>'revision'='1' and jsonb_array_length(public.booking_console_guest_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest'))->'events')=2,'no-op generated changes');
 perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('duplicate'),pg_temp.card_intent('duplicate',null,'Corrected Guest','corrected@booking.invalid'));
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-a'),'CORRECTED@booking.invalid')->'guests')=2,'contacts implicitly merged or case lookup failed');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-a'),'4161123')->'guests')=2,'phone normalization');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-a'),'%__')->'guests')=0,'wildcard search');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-b'),'')->'guests')=0,'cross-restaurant directory');
 begin perform public.booking_console_guest_v1(pg_temp.booking_id('spot-b'),pg_temp.booking_id('guest')); raise exception 'cross-restaurant card read'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) values
(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-viewer'),pg_temp.booking_id('booking-owner'),'viewer'),
(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-host'),pg_temp.booking_id('booking-owner'),'host'),
(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-manager'),pg_temp.booking_id('booking-owner'),'manager');
set local role authenticated;
select pg_temp.booking_actor('booking-viewer');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-a'))->'guests')=2,'viewer directory denied');
do $$ begin
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('viewer-write'),pg_temp.card_intent('viewer')); raise exception 'viewer wrote'; exception when insufficient_privilege then null; end;
 begin perform count(*) from booking_private.guest_cards_v1; raise exception 'viewer direct read'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.booking_actor('booking-host');
select pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('host-edit'),pg_temp.card_intent('guest',1,'Host Corrected','corrected@booking.invalid'));
do $$ begin
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('host-archive'),pg_temp.card_archive('guest',2,true)); raise exception 'host archived'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.booking_actor('booking-manager');
select pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('archive'),pg_temp.card_archive('guest',2,true));
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-a'),'',true)->'guests')=1,'manager archive directory');
select pg_temp.booking_actor('booking-host');
do $$ begin
 begin perform public.booking_console_guest_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest')); raise exception 'host read archived contact'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('archived-save'),pg_temp.card_intent('guest',3,'Wrong')); raise exception 'edit archived'; exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.booking_actor('booking-manager');
select pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('restore'),pg_temp.card_archive('guest',3,false));
select pg_temp.booking_actor('booking-other');
do $$ begin
 begin perform public.booking_console_guests_v1(pg_temp.booking_id('spot-a')); raise exception 'outsider read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into booking_private.guest_cards_v1(id,spot_id,owner_id,name,updated_at)
select pg_temp.booking_id('batch-'||n),pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-owner'),'Batch Guest','2026-10-21T00:00:00Z' from generate_series(1,30) n;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
do $$ declare a jsonb; b jsonb; invalid jsonb; begin
 a:=public.booking_console_guests_v1(pg_temp.booking_id('spot-a'),'Batch');
 b:=public.booking_console_guests_v1(pg_temp.booking_id('spot-a'),'Batch',false,(a#>>'{next_cursor,updated_at}')::timestamptz,(a#>>'{next_cursor,id}')::uuid);
 perform pg_temp.booking_assert(jsonb_array_length(a->'guests')=25 and jsonb_array_length(b->'guests')=5 and b->'next_cursor'='null'::jsonb,'directory page bounds');
 perform pg_temp.booking_assert((select count(distinct x->>'id')=30 from jsonb_array_elements((a->'guests')||(b->'guests')) x),'tied updated timestamps lost/duplicated cards');
 foreach invalid in array array[
  pg_temp.card_intent('bad',null,' '),pg_temp.card_intent('bad',null,'Name','not-email'),pg_temp.card_intent('bad',null,E'Name\n'),
  pg_temp.card_intent('bad')||'{"owner_id":"00000000-0000-0000-0000-000000000000"}'::jsonb,
  pg_temp.card_intent('bad')||'{"revision":0.5}'::jsonb,pg_temp.card_intent('bad')||'{"phone":123}'::jsonb,
  pg_temp.card_intent('bad')||'{"revision":9007199254740992}'::jsonb
 ] loop
  begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('bad'),invalid); raise exception 'invalid card intent accepted'; exception when invalid_parameter_value then null; end;
 end loop;
end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-owner'),'write_suspension','booking_guest_fixture');
set local role authenticated;
select pg_temp.booking_actor('booking-host');
do $$ begin
 begin perform public.booking_console_guests_v1(pg_temp.booking_id('spot-a')); raise exception 'owner Safety bypass'; exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise; end if; end;
end $$;
reset role;
update public.safety_account_measures set status='revoked' where reason_code='booking_guest_fixture';
update public.booking_team_members set revoked_at=now() where user_id=pg_temp.booking_id('booking-host');
set local role authenticated;
select pg_temp.booking_actor('booking-host');
do $$ begin
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('host-edit'),pg_temp.card_intent('guest',1,'Host Corrected','corrected@booking.invalid'),true); raise exception 'revoked replay'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.spots set owner_id=pg_temp.booking_id('booking-other') where id=pg_temp.booking_id('spot-a');
set local role authenticated;
select pg_temp.booking_actor('booking-other');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.booking_id('spot-a'))->'guests')=0,'new controller inherited former guest directory');
do $$ begin
 begin perform public.booking_console_guest_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('guest')); raise exception 'new controller read former card'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('create'),pg_temp.card_intent('guest'),true); raise exception 'new controller recovered former outcome'; exception when invalid_parameter_value then null; end;
end $$;
select pg_temp.card_write(pg_temp.booking_id('spot-a'),pg_temp.booking_id('new-owner-create'),pg_temp.card_intent('new-owner-guest'));
reset role;
select pg_temp.booking_assert((select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.booking_reservations r)=(select facts from booking_inventory_before),'guest directory mutated booking inventory');
rollback;
