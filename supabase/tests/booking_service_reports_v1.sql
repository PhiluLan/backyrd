-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.rid(label text) returns uuid language sql immutable as $$ select md5('booking-service-report:'||label)::uuid $$;
create function pg_temp.rassert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Booking report: %',message; end if; end $$;
create function pg_temp.ractor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.rid(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.rid(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.rsetup(s text) returns jsonb language sql as $$ select jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.rid('area-'||s),'name','Room','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.rid('table-'||s),'area_id',pg_temp.rid('area-'||s),'label','1','seats',4,'is_active',true),jsonb_build_object('id',pg_temp.rid('table2-'||s),'area_id',pg_temp.rid('area-'||s),'label','2','seats',4,'is_active',true)),
 'services',(select jsonb_agg(jsonb_build_object('id',pg_temp.rid(k||'-'||s),'name',k,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true)) from unnest(array['service','inactive','combined']) k)) $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) select pg_temp.rid(x),x||'-report@booking.invalid',clock_timestamp(),'{}','{}' from unnest(array['owner','manager','host','viewer','other']) x;
insert into public.spots(id,name,lat,lng,owner_id,status) select pg_temp.rid('spot-'||x),'Report fixture '||x,47.5,7.5,pg_temp.rid('owner'),'approved' from unnest(array['a','b','empty']) x;
set local role authenticated;
select pg_temp.ractor('owner');
select public.booking_console_save_setup_v1(pg_temp.rid('spot-a'),0,pg_temp.rsetup('a'));
select public.booking_console_save_setup_v1(pg_temp.rid('spot-b'),0,pg_temp.rsetup('b'));
select pg_temp.rassert(public.booking_console_read_v1(pg_temp.rid('spot-a'),current_date)#>>'{capabilities,service_reports}'='true','report capability missing');
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) select pg_temp.rid('spot-a'),pg_temp.rid(x),pg_temp.rid('owner'),x from unnest(array['manager','host','viewer']) x;
insert into public.booking_reservations(id,spot_id,request_id,service_id,table_id,guest_name,guest_contact,note,party_size,starts_at,ends_at,status,source)
select pg_temp.rid('status-'||n),pg_temp.rid('spot-a'),pg_temp.rid('create-'||n),pg_temp.rid('service-a'),pg_temp.rid('table-a'),'PRIVATE_GUEST_NAME','PRIVATE_GUEST_CONTACT','PRIVATE_GUEST_NOTE',n+1,
 '2026-10-25T00:00:00Z'::timestamptz+make_interval(hours=>n),'2026-10-25T00:30:00Z'::timestamptz+make_interval(hours=>n),
 (array['pending','confirmed','arrived','seated','completed','cancelled','declined','no_show'])[n+1],(array['phone','email','walk_in','operator','website'])[1+n%5] from generate_series(0,7) n;
insert into public.booking_reservations(id,spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source)
select pg_temp.rid(label),pg_temp.rid('spot-a'),pg_temp.rid('op-'||label),pg_temp.rid(svc),pg_temp.rid('table-a'),'PRIVATE_BOUNDARY_GUEST',party,t,t+interval '1 hour','cancelled','operator' from (values
 ('fall-before','service-a',1,'2026-10-24T21:59:59.999999Z'::timestamptz),
 ('fall-start','service-a',2,'2026-10-24T22:00:00Z'::timestamptz),
 ('fall-last','service-a',3,'2026-10-25T22:59:59.999999Z'::timestamptz),
 ('fall-after','service-a',4,'2026-10-25T23:00:00Z'::timestamptz),
 ('spring-start','service-a',2,'2026-03-28T23:00:00Z'::timestamptz),
 ('spring-last','service-a',2,'2026-03-29T21:59:59.999999Z'::timestamptz),
 ('spring-after','service-a',2,'2026-03-29T22:00:00Z'::timestamptz),
 ('inactive-row','inactive-a',5,'2026-10-25T12:00:00Z'::timestamptz)) x(label,svc,party,t);
update public.booking_restaurant_services set is_active=false where id=pg_temp.rid('inactive-a');
insert into public.booking_reservations(id,spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source)
values(pg_temp.rid('other-booking'),pg_temp.rid('spot-b'),pg_temp.rid('other-op'),pg_temp.rid('service-b'),pg_temp.rid('table-b'),'PRIVATE_OTHER_RESTAURANT',30,'2026-10-25T12:00:00Z','2026-10-25T13:00:00Z','confirmed','operator');
create temp table report_inventory_before as select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) facts from public.booking_reservations r;
set local role authenticated;
select pg_temp.ractor('viewer');
do $$ declare r jsonb; s jsonb; before_time timestamptz:=clock_timestamp(); begin
 r:=public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25');
 perform pg_temp.rassert(r->>'spot_id'=pg_temp.rid('spot-a')::text and r#>>'{scope,from_date}'='2026-10-25' and r#>'{scope,service_id}'='null'::jsonb,'returned scope mismatch');
 perform pg_temp.rassert(r#>>'{totals,reservations}'='11' and r#>>'{totals,guests}'='46','parent booking/party totals');
 perform pg_temp.rassert(jsonb_array_length(r#>'{totals,statuses}')=8 and jsonb_array_length(r->'days')=1 and jsonb_array_length(r->'services')=2 and jsonb_array_length(r->'sources')=5,'complete report dimensions');
 perform pg_temp.rassert((select x->>'reservations'='4' and x->>'guests'='16' from jsonb_array_elements(r#>'{totals,statuses}') x where x->>'status'='cancelled'),'cancelled party totals');
 perform pg_temp.rassert((select x->>'reservations'='1' and x->>'guests'='5' from jsonb_array_elements(r#>'{totals,statuses}') x where x->>'status'='completed'),'actual completed status facts');
 perform pg_temp.rassert((r->>'observed_at')::timestamptz>=before_time and (r->>'observed_at')::timestamptz<=clock_timestamp(),'observation time missing');
 perform pg_temp.rassert(r::text not like '%PRIVATE_%' and r::text not like '%guest_name%' and r::text not like '%guest_contact%' and r::text not like '%owner_id%' and r::text not like '%Other restaurant%','guest or cross-restaurant data exposed');
 s:=public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25',pg_temp.rid('service-a'));
 perform pg_temp.rassert(s#>>'{totals,reservations}'='10' and s#>>'{totals,guests}'='41' and jsonb_array_length(s->'services')=1,'service scope ignored');
 s:=public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25',pg_temp.rid('inactive-a'));
 perform pg_temp.rassert(s#>>'{totals,reservations}'='1' and s#>>'{services,0,is_active}'='false','archived historical service hidden');
 perform pg_temp.rassert(public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-26','2026-10-26')#>>'{totals,guests}'='4','fall half-open end');
 perform pg_temp.rassert(public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-03-29','2026-03-29')#>>'{totals,reservations}'='2','23-hour spring day');
 r:=public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-01-01','2026-01-31');
 perform pg_temp.rassert(jsonb_array_length(r->'days')=31 and r#>>'{totals,reservations}'='0' and jsonb_array_length(r->'services')=0,'empty 31-day period fabricated facts');
 perform pg_temp.rassert((select sum((x->>'guests')::bigint)=0 from jsonb_array_elements(r->'days') x),'zero days not retained');
 begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-01-01','2026-02-01');raise exception 'unbounded period';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-02-02','2026-02-01');raise exception 'reversed period';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),null,'2026-02-01');raise exception 'missing period';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'infinity','infinity');raise exception 'infinite period';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25',pg_temp.rid('service-b'));raise exception 'foreign service';exception when insufficient_privilege then null;end;
 begin perform public.booking_console_report_v1(pg_temp.rid('spot-b'),'2026-10-25','2026-10-25');raise exception 'foreign restaurant';exception when insufficient_privilege then null;end;
end $$;
select pg_temp.ractor('host');
select pg_temp.rassert(public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25')#>>'{totals,reservations}'='11','Host report denied');
select pg_temp.ractor('manager');
select pg_temp.rassert(public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25')#>>'{totals,reservations}'='11','Manager report denied');
select pg_temp.ractor('other');
do $$ begin begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25');raise exception 'outsider report';exception when insufficient_privilege then null;end;end $$;
reset role;
select pg_temp.rassert((select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.booking_reservations r)=(select facts from report_inventory_before),'report changed booking facts');
-- A real two-table booking still contributes one reservation and six party seats.
set local role authenticated;
select pg_temp.ractor('owner');
select public.booking_console_save_combination_v1(pg_temp.rid('spot-a'),1,pg_temp.rid('group'),'Group',pg_temp.rid('table-a'),array[pg_temp.rid('table-a'),pg_temp.rid('table2-a')],8,true);
select public.booking_console_create_v2(pg_temp.rid('spot-a'),pg_temp.rid('combined-create'),pg_temp.rid('combined-a'),pg_temp.rid('table-a'),array[pg_temp.rid('table-a'),pg_temp.rid('table2-a')],pg_temp.rid('group'),
 (((clock_timestamp() at time zone 'Europe/Zurich')::date+100+time '12:00') at time zone 'Europe/Zurich'),60,6,'PRIVATE_COMBINED_GUEST',null,null,'phone','confirmed');
select pg_temp.rassert(public.booking_console_report_v1(pg_temp.rid('spot-a'),(clock_timestamp() at time zone 'Europe/Zurich')::date+100,(clock_timestamp() at time zone 'Europe/Zurich')::date+100,pg_temp.rid('combined-a'))#>>'{totals,reservations}'='1','combined booking duplicated');
select pg_temp.rassert(public.booking_console_report_v1(pg_temp.rid('spot-a'),(clock_timestamp() at time zone 'Europe/Zurich')::date+100,(clock_timestamp() at time zone 'Europe/Zurich')::date+100,pg_temp.rid('combined-a'))#>>'{totals,guests}'='6','combined party multiplied');
do $$ begin begin perform public.booking_console_report_v1(pg_temp.rid('spot-empty'),'2026-10-25','2026-10-25');raise exception 'missing setup reported zero';exception when invalid_parameter_value then null;end;end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.rid('owner'),'write_suspension','booking_report_fixture');
set local role authenticated;
select pg_temp.ractor('viewer');
do $$ begin begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25');raise exception 'owner Safety bypass';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;end $$;
reset role;
update public.safety_account_measures set status='revoked' where reason_code='booking_report_fixture' and user_id=pg_temp.rid('owner');
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.rid('spot-a') and user_id=pg_temp.rid('viewer');
set local role authenticated;
select pg_temp.ractor('viewer');
do $$ begin begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25');raise exception 'revoked report';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role service_role;
do $$ begin begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25');raise exception 'worker report grant';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role anon;
do $$ begin begin perform public.booking_console_report_v1(pg_temp.rid('spot-a'),'2026-10-25','2026-10-25');raise exception 'anonymous report';exception when insufficient_privilege then null;end;end $$;
rollback;
