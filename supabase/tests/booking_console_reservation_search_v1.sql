-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-search-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_search_v1(uuid,text,date,date,timestamptz,uuid)','execute'),'anonymous lookup grant');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'));
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{capabilities,reservation_search}'='true','lookup capability missing');
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) values(pg_temp.booking_id('spot-a'),pg_temp.booking_id('booking-viewer'),pg_temp.booking_id('booking-owner'),'viewer');
insert into public.booking_reservations(id,spot_id,request_id,table_id,service_id,guest_name,guest_contact,note,party_size,starts_at,ends_at,status,source)
select pg_temp.booking_id('r-'||n),pg_temp.booking_id('spot-a'),pg_temp.booking_id('request-'||n),pg_temp.booking_id('table-a'),pg_temp.booking_id('service-a'),
 'Ada Example',case when n=1 then '+41 (61) 123 45 67' else 'ada@booking.invalid' end,'PRIVATE_NOTE_ONLY',2,'2026-10-25T00:30:00Z','2026-10-25T01:00:00Z','cancelled','operator'
from generate_series(1,30) n;
insert into public.booking_reservations(id,spot_id,request_id,table_id,service_id,guest_name,party_size,starts_at,ends_at,status,source)
values(pg_temp.booking_id('other'),pg_temp.booking_id('spot-b'),pg_temp.booking_id('other-request'),pg_temp.booking_id('table-b'),pg_temp.booking_id('service-b'),'Ada Other Spot',2,'2026-10-25T01:30:00Z','2026-10-25T02:00:00Z','confirmed','operator');
insert into public.booking_reservations(id,spot_id,request_id,table_id,service_id,guest_name,party_size,starts_at,ends_at,status,source)
select pg_temp.booking_id('boundary-'||n),pg_temp.booking_id('spot-a'),pg_temp.booking_id('boundary-request-'||n),pg_temp.booking_id('table-a'),pg_temp.booking_id('service-a'),'Boundary',2,
 t,t+interval '30 minutes','cancelled','operator' from (values (1,'2026-10-24T22:00:00Z'::timestamptz),(2,'2026-10-25T23:00:00Z'::timestamptz)) x(n,t);
-- Compare exact saved facts, including unrelated restored reservations.
create temp table booking_inventory_before as
 select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) facts from public.booking_reservations r;
set local role authenticated;
select pg_temp.booking_actor('booking-viewer');
do $$ declare a jsonb; b jsonb; q text; begin
 a:=public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'  ADA  ','2026-10-25','2026-10-25');
 perform pg_temp.booking_assert(jsonb_array_length(a->'reservations')=25 and a->'next_cursor' is not null,'bounded first page');
 b:=public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Ada','2026-10-25','2026-10-25',(a#>>'{next_cursor,starts_at}')::timestamptz,(a#>>'{next_cursor,id}')::uuid);
 perform pg_temp.booking_assert(jsonb_array_length(b->'reservations')=5 and b->'next_cursor'='null'::jsonb,'terminal second page');
 perform pg_temp.booking_assert((select count(distinct x->>'id')=30 from jsonb_array_elements((a->'reservations')||(b->'reservations')) x),'tied starts lost or repeated rows');
 perform pg_temp.booking_assert(not (a::text||b::text) like '%PRIVATE_NOTE_ONLY%' and not (a::text||b::text) like '%Other Spot%','excess or cross-spot fields');
 perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Boundary','2026-10-25','2026-10-25')->'reservations')=1,'Zurich 25-hour day boundaries');
 a:=public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'4161123','2026-10-25','2026-10-25');
 perform pg_temp.booking_assert(jsonb_array_length(a->'reservations')=1,'formatted phone lookup');
 foreach q in array array['%__','PRIVATE_NOTE_ONLY','absent@booking.invalid'] loop
   perform pg_temp.booking_assert(jsonb_array_length(public.booking_console_search_v1(pg_temp.booking_id('spot-a'),q,'2026-10-25','2026-10-25')->'reservations')=0,'literal search or notes visibility');
 end loop;
 foreach q in array array['','  ','ad',repeat('x',121),E'abc\n'] loop
   begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-a'),q,'2026-10-25','2026-10-25'); raise exception 'invalid query accepted'; exception when invalid_parameter_value then null; end;
 end loop;
 begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Ada','2026-01-01','2027-01-02'); raise exception 'unbounded range'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Ada','2026-10-25','2026-10-25','2026-10-24T12:00Z',pg_temp.booking_id('r-1')); raise exception 'out-of-range cursor'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-b'),'Ada','2026-10-25','2026-10-25'); raise exception 'cross-spot viewer'; exception when insufficient_privilege then null; end;
 perform pg_temp.booking_assert(not exists(select 1 from public.booking_reservations),'viewer bypassed raw RLS');
end $$;
select pg_temp.booking_actor('booking-other');
do $$ begin
 begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Ada','2026-10-25','2026-10-25'); raise exception 'outsider read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.booking_id('booking-owner'),'write_suspension','booking_search_fixture');
set local role authenticated;
select pg_temp.booking_actor('booking-viewer');
do $$ begin
 begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Ada','2026-10-25','2026-10-25'); raise exception 'owner Safety bypassed';
 exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise; end if; end;
end $$;
reset role;
update public.safety_account_measures set status='revoked' where reason_code='booking_search_fixture' and user_id=pg_temp.booking_id('booking-owner');
update public.booking_team_members set revoked_at=now() where user_id=pg_temp.booking_id('booking-viewer');
set local role authenticated;
select pg_temp.booking_actor('booking-viewer');
do $$ begin
 begin perform public.booking_console_search_v1(pg_temp.booking_id('spot-a'),'Ada','2026-10-25','2026-10-25'); raise exception 'revoked read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.booking_assert((select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.booking_reservations r)=(select facts from booking_inventory_before),'lookup changed inventory');
rollback;
