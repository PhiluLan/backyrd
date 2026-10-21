-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;

create function pg_temp.booking_id(label text) returns uuid language sql immutable as $$ select md5('booking-history-test:'||label)::uuid $$;
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

select pg_temp.booking_assert(not has_function_privilege('anon','public.booking_console_history_v1(uuid,uuid,uuid)','execute'),'anonymous history grant');
select pg_temp.booking_assert(not has_function_privilege('authenticated','booking_private.reservation_audit_v1(public.booking_reservations,public.booking_reservations)','execute'),'private history helper exposed');
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-a'),0,pg_temp.booking_setup('a'));
select public.booking_console_save_setup_v1(pg_temp.booking_id('spot-b'),0,pg_temp.booking_setup('b'));
select pg_temp.booking_assert(public.booking_console_read_v1(pg_temp.booking_id('spot-a'),current_date)#>>'{capabilities,reservation_history}'='true','history capability missing');

create function pg_temp.booking_create(label text, suffix text default 'a') returns uuid language plpgsql as $$
declare s record; begin
 select service_id,table_id,starts_at into s from public.booking_reservations where spot_id=pg_temp.booking_id('spot-'||suffix) and request_id=pg_temp.booking_id(label);
 if not found then select service_id,table_id,starts_at into s from public.booking_console_slots_v1(pg_temp.booking_id('spot-'||suffix),(now() at time zone 'Europe/Zurich')::date+1,2) order by starts_at limit 1; end if;
 return public.booking_console_create_v1(pg_temp.booking_id('spot-'||suffix),pg_temp.booking_id(label),s.service_id,s.table_id,s.starts_at,2,'Secret Guest','private@example.invalid','PRIVATE_NOTE','phone','pending');
end $$;
select pg_temp.booking_create('create-a') as rid \gset
select pg_temp.booking_create('create-a'); -- identical retry must not add an event
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')->'events')=1,'create replay duplicated history');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')#>>'{events,0,details,after,status}'='pending','create state missing');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')#>>'{events,0,details,actor_role}'='owner','actor role not captured');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),:'rid','pending','confirmed');
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),:'rid','pending','confirmed');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')->'events')=2,'status replay duplicated history');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')#>>'{events,0,details,before,status}'='pending','old status missing');

-- A real host changes guest text and party size through the canonical amendment RPC.
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role)
 select pg_temp.booking_id('spot-a'),pg_temp.booking_id(x),pg_temp.booking_id('booking-owner'),r
 from (values('booking-host','host'),('booking-viewer','viewer')) t(x,r);
set local role authenticated;
select pg_temp.booking_actor('booking-host');
do $$ declare r public.booking_reservations%rowtype; h jsonb; begin
 -- Host intentionally cannot SELECT the raw reservation; obtain its allocation through the read RPC.
 h:=public.booking_console_read_v1(pg_temp.booking_id('spot-a'),(now() at time zone 'Europe/Zurich')::date+1)->'reservations'->0;
 perform public.booking_console_amend_v1(pg_temp.booking_id('spot-a'),(h->>'id')::uuid,pg_temp.booking_id('amend'),1,
  (h->>'service_id')::uuid,(h->>'table_id')::uuid,(h->>'starts_at')::timestamptz,60,3,'Corrected Secret','corrected@example.invalid','CORRECTED_NOTE');
 perform public.booking_console_amend_v1(pg_temp.booking_id('spot-a'),(h->>'id')::uuid,pg_temp.booking_id('amend'),1,
  (h->>'service_id')::uuid,(h->>'table_id')::uuid,(h->>'starts_at')::timestamptz,60,3,'Corrected Secret','corrected@example.invalid','CORRECTED_NOTE');
 h:=public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(h->>'id')::uuid);
 perform pg_temp.booking_assert(jsonb_array_length(h->'events')=3,'amend replay duplicated history');
 perform pg_temp.booking_assert(h#>>'{events,0,details,before,party_size}'='2' and h#>>'{events,0,details,after,party_size}'='3','party diff missing');
 perform pg_temp.booking_assert(h#>>'{events,0,details,actor_role}'='host' and h#>>'{events,0,actor_is_you}'='true','host attribution missing');
 perform pg_temp.booking_assert(h#>'{events,0,details,changed_fields}'='["guest_name","guest_contact","note"]'::jsonb,'guest change markers missing');
 perform pg_temp.booking_assert(h::text !~* 'Secret|example.invalid|PRIVATE_NOTE|CORRECTED_NOTE|fingerprint|request_id','guest text or credentials copied into history');
 perform pg_temp.booking_assert(h->>'revision'='2','history revision not canonical');
 perform pg_temp.booking_assert((select count(*) from public.booking_audit_events)=0,'host has raw audit access');
end $$;
select pg_temp.booking_actor('booking-owner');
do $$ declare r public.booking_reservations%rowtype; slot record; begin
 select * into r from public.booking_reservations where request_id=pg_temp.booking_id('create-a');
 select * into slot from public.booking_console_amendment_slots_v1(r.spot_id,r.id,(now() at time zone 'Europe/Zurich')::date+2,3,90) order by starts_at limit 1;
 perform public.booking_console_amend_v1(r.spot_id,r.id,pg_temp.booking_id('move'),r.revision,slot.service_id,slot.table_id,slot.starts_at,90,3,r.guest_name,r.guest_contact,r.note);
 perform pg_temp.booking_assert((public.booking_console_history_v1(r.spot_id,r.id)#>>'{events,0,details,before,starts_at}')::timestamptz=r.starts_at,'previous time overwritten');
 perform pg_temp.booking_assert((public.booking_console_history_v1(r.spot_id,r.id)#>>'{events,0,details,after,starts_at}')::timestamptz=slot.starts_at,'rescheduled time missing');
end $$;
select public.booking_console_set_status_v1(pg_temp.booking_id('spot-a'),:'rid','confirmed','cancelled');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')#>>'{events,0,details,before,status}'='confirmed','cancel before missing');
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid')#>>'{events,0,details,after,status}'='cancelled','cancel after missing');

-- A real immediately-seated walk-in has its own event and replay is event-free.
reset role;
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select ((now() at time zone 'Europe/Zurich')::date+time '12:00') at time zone 'Europe/Zurich' $$;
set local role authenticated;
select pg_temp.booking_actor('booking-owner');
select public.booking_console_walk_in_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60) as walk \gset
select public.booking_console_walk_in_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('walk'),pg_temp.booking_id('service-a'),pg_temp.booking_id('table-a'),2,60);
select pg_temp.booking_assert(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'walk'::jsonb->>'id')::uuid)#>>'{events,0,details,after,status}'='seated','walk-in history missing');
select pg_temp.booking_assert(jsonb_array_length(public.booking_console_history_v1(pg_temp.booking_id('spot-a'),(:'walk'::jsonb->>'id')::uuid)->'events')=1,'walk replay duplicated history');

-- Existing unstructured entries stay honest; unrelated internal details are excluded.
reset role;
insert into public.booking_audit_events(id,spot_id,reservation_id,action,details,created_at)
select pg_temp.booking_id('legacy-'||i),pg_temp.booking_id('spot-a'),:'rid','reservation_amended','{"internal":"MUST_NOT_LEAK"}',timestamptz '2020-01-01 00:00:00Z'
from generate_series(1,55) i;
set local role authenticated;
select pg_temp.booking_actor('booking-viewer');
select pg_temp.booking_assert((select count(*) from public.booking_audit_events)=0,'viewer has raw audit access');
select public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid') as page_one \gset
select public.booking_console_history_v1(pg_temp.booking_id('spot-a'),:'rid',(:'page_one'::jsonb->>'next_cursor')::uuid) as page_two \gset
select pg_temp.booking_assert(jsonb_array_length(:'page_one'::jsonb->'events')=50 and jsonb_array_length(:'page_two'::jsonb->'events')=10,'keyset page counts wrong');
select pg_temp.booking_assert((:'page_two'::jsonb->>'next_cursor') is null,'last page cursor fabricated');
select pg_temp.booking_assert((:'page_one'||:'page_two') not like '%MUST_NOT_LEAK%','legacy details leaked');
select pg_temp.booking_assert(not exists(select 1 from jsonb_array_elements(:'page_one'::jsonb->'events') a join jsonb_array_elements(:'page_two'::jsonb->'events') b on a->>'id'=b->>'id'),'keyset repeated event with tied timestamps');
select pg_temp.booking_assert((:'page_two'::jsonb)#>'{events,0,details}'='null'::jsonb,'legacy entry invented values');

do $$ begin
 begin perform public.booking_console_history_v1(pg_temp.booking_id('spot-b'),pg_temp.booking_id('unknown')); raise exception 'viewer crossed spot'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.booking_actor('booking-owner');
do $$ declare r uuid; other_cursor uuid; begin
 select id into r from public.booking_reservations where request_id=pg_temp.booking_id('create-a');
 select id into other_cursor from public.booking_audit_events where reservation_id<>r and spot_id=pg_temp.booking_id('spot-a') limit 1;
 perform pg_temp.booking_assert(other_cursor is not null,'cross-reservation cursor fixture missing');
 begin perform public.booking_console_history_v1(pg_temp.booking_id('spot-a'),r,other_cursor); raise exception 'another reservation cursor accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_history_v1(pg_temp.booking_id('spot-a'),r,pg_temp.booking_id('foreign-event')); raise exception 'foreign cursor accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_history_v1(pg_temp.booking_id('spot-b'),r); raise exception 'cross-reservation lookup accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update public.booking_team_members set revoked_at=now() where user_id=pg_temp.booking_id('booking-viewer');
set local role authenticated;
select pg_temp.booking_actor('booking-viewer');
do $$ begin
 begin perform public.booking_console_history_v1(pg_temp.booking_id('spot-a'),pg_temp.booking_id('unknown')); raise exception 'revoked viewer retained history'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
