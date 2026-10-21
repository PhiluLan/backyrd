-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.wid(label text) returns uuid language sql immutable as $$ select md5('arrival-window-review:'||label)::uuid $$;
create function pg_temp.wassert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Arrival review: %',msg;end if;end $$;
create function pg_temp.wactor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.wid(label)::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.wid(label),'role','authenticated')::text,true);
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.wid(x),x||'-arrival-review@booking.invalid',now(),'{}','{}' from unnest(array['owner','manager','host','viewer','other'])x;
insert into public.spots(id,name,lat,lng,owner_id,status) values(pg_temp.wid('spot'),'Arrival review',47.5,7.5,pg_temp.wid('owner'),'approved'),(pg_temp.wid('unconfigured'),'Unconfigured',47.5,7.5,pg_temp.wid('owner'),'approved');
set local role authenticated;
select pg_temp.wactor('owner');
select public.booking_console_save_setup_v1(pg_temp.wid('spot'),0,jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.wid('area'),'name','Room','is_active',true)),
 'tables',(select jsonb_agg(jsonb_build_object('id',pg_temp.wid('table-'||n),'area_id',pg_temp.wid('area'),'label',n::text,'seats',4,'is_active',true)) from generate_series(1,4)n),
 'services',(select jsonb_agg(jsonb_build_object('id',pg_temp.wid(s),'name',s,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','24:00','interval_minutes',30,'is_active',true)) from unnest(array['service-a','service-b'])s)));
select public.booking_console_save_combination_v1(pg_temp.wid('spot'),1,pg_temp.wid('combined'),'Combined',pg_temp.wid('table-1'),array[pg_temp.wid('table-1'),pg_temp.wid('table-2')],8);
select public.booking_console_create_v2(pg_temp.wid('spot'),pg_temp.wid('combined-booking'),pg_temp.wid('service-a'),pg_temp.wid('table-1'),array[pg_temp.wid('table-1'),pg_temp.wid('table-2')],pg_temp.wid('combined'),(((now() at time zone 'Europe/Zurich')::date+100+time '17:00') at time zone 'Europe/Zurich'),60,6,'PRIVATE_COMBINED',null,null,'operator','confirmed');
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) select pg_temp.wid('spot'),pg_temp.wid(x),pg_temp.wid('owner'),x from unnest(array['manager','host','viewer'])x;
-- All eight statuses in one actual elapsed window; inactive services still count.
insert into public.booking_reservations(spot_id,request_id,service_id,table_id,guest_name,guest_contact,note,party_size,starts_at,ends_at,status,source)
select pg_temp.wid('spot'),pg_temp.wid(s),pg_temp.wid('service-a'),case when s in ('pending','confirmed','arrived','seated') then pg_temp.wid('table-'||n) else pg_temp.wid('table-1') end,'PRIVATE_NAME','PRIVATE_CONTACT','PRIVATE_NOTE',2,'2026-10-25T00:00Z','2026-10-25T00:10Z',s,'operator'
from unnest(array['pending','confirmed','arrived','seated','completed','cancelled','declined','no_show']) with ordinality x(s,n);
insert into public.booking_reservations(spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source) values
(pg_temp.wid('spot'),pg_temp.wid('other-service'),pg_temp.wid('service-b'),pg_temp.wid('table-1'),'PRIVATE_OTHER',3,'2026-10-25T00:15Z','2026-10-25T00:20Z','completed','website'),
(pg_temp.wid('spot'),pg_temp.wid('midnight'),pg_temp.wid('service-a'),pg_temp.wid('table-1'),'PRIVATE_MIDNIGHT',2,'2026-10-24T22:00Z','2026-10-24T22:10Z','completed','phone'),
(pg_temp.wid('spot'),pg_temp.wid('before-midnight'),pg_temp.wid('service-a'),pg_temp.wid('table-1'),'PRIVATE_BEFORE',7,'2026-10-24T21:59:59.999999Z','2026-10-24T22:00Z','completed','phone'),
(pg_temp.wid('spot'),pg_temp.wid('boundary'),pg_temp.wid('service-a'),pg_temp.wid('table-1'),'PRIVATE_BOUNDARY',3,'2026-10-25T00:30Z','2026-10-25T00:40Z','completed','email'),
(pg_temp.wid('spot'),pg_temp.wid('repeat'),pg_temp.wid('service-a'),pg_temp.wid('table-1'),'PRIVATE_REPEAT',4,'2026-10-25T01:00Z','2026-10-25T01:10Z','completed','walk_in'),
(pg_temp.wid('spot'),pg_temp.wid('after-midnight'),pg_temp.wid('service-a'),pg_temp.wid('table-1'),'PRIVATE_AFTER',8,'2026-10-25T23:00Z','2026-10-25T23:10Z','completed','phone');
update public.booking_restaurant_services set is_active=false where id=pg_temp.wid('service-b');
set local role authenticated;
select pg_temp.wactor('manager');
select public.booking_console_save_arrival_limit_v1(pg_temp.wid('spot'),pg_temp.wid('limit'),0,30,6,pg_temp.wid('manager'));
reset role;
create temp table window_review_inventory as select id,to_jsonb(r) facts from public.booking_reservations r;
create temp table window_review_wire(value jsonb);
grant select,insert on pg_temp.window_review_wire to authenticated;
set local role authenticated;
do $$ declare actor text; r jsonb; w jsonb; before_time timestamptz; begin
 foreach actor in array array['owner','manager','host','viewer'] loop
  perform pg_temp.wactor(actor);before_time:=clock_timestamp();r:=public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25');
  perform pg_temp.wassert(public.booking_console_read_v1(pg_temp.wid('spot'),'2026-10-25')#>>'{capabilities,arrival_review}'='true','capability absent');
  perform pg_temp.wassert(r->>'spot_id'=pg_temp.wid('spot')::text and r->>'date'='2026-10-25' and r->>'timezone'='Europe/Zurich','scope binding');
  perform pg_temp.wassert((r->>'observed_at')::timestamptz>=before_time,'server observation time');
  perform pg_temp.wassert(r#>>'{policy,revision}'='1' and r#>>'{policy,window_minutes}'='30' and r#>>'{policy,max_guests}'='6','current policy absent');
  perform pg_temp.wassert(r#>>'{totals,reservations}'='9' and r#>>'{totals,guests}'='22' and r#>>'{totals,excluded_reservations}'='3' and r#>>'{totals,excluded_guests}'='6','status/restaurant parent totals');
  perform pg_temp.wassert(jsonb_array_length(r->'windows')=50,'fall 25-hour grid');
  select x into w from jsonb_array_elements(r->'windows')x where (x->>'starts_at')::timestamptz='2026-10-25T00:00Z';
  perform pg_temp.wassert(w->>'guests'='13' and w->>'reservations'='6','same bin across service/source statuses');
  perform pg_temp.wassert((select x->>'guests'='3' from jsonb_array_elements(r->'windows')x where (x->>'starts_at')::timestamptz='2026-10-25T00:30Z'),'half-open bin boundary');
  perform pg_temp.wassert((select x->>'guests'='4' from jsonb_array_elements(r->'windows')x where (x->>'starts_at')::timestamptz='2026-10-25T01:00Z'),'repeated hour collapsed');
  perform pg_temp.wassert(r::text not like '%PRIVATE_%' and r::text not like '%guest_name%' and r::text not like '%guest_contact%' and r::text not like '%reservation_id%' and r::text not like '%table_id%' and r::text not like '%actor_id%','private facts projected');
 end loop;
 insert into pg_temp.window_review_wire values(r);
 perform pg_temp.wassert(jsonb_array_length(public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-03-29')->'windows')=46,'spring 23-hour grid');
 perform pg_temp.wassert(public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-01-01')#>>'{totals,reservations}'='0','empty day fabricated rows');
 perform pg_temp.wassert(jsonb_array_length(public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-01-01')->'windows')=48,'empty grid missing');
 perform pg_temp.wassert(public.booking_console_arrival_review_v1(pg_temp.wid('spot'),(now() at time zone 'Europe/Zurich')::date+100)#>>'{totals,guests}'='6','combined parent counted more than once');
 begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),null);raise exception 'null day';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'infinity');raise exception 'infinite day';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'1969-12-31');raise exception 'unsupported historical offset';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'9999-12-31');raise exception 'unsupported end day';exception when invalid_parameter_value then null;end;
 perform pg_temp.wactor('other');
 begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25');raise exception 'outsider';exception when insufficient_privilege then null;end;
 perform pg_temp.wactor('owner');
 begin perform public.booking_console_arrival_review_v1(pg_temp.wid('unconfigured'),'2026-10-25');raise exception 'missing setup';exception when invalid_parameter_value then if sqlerrm<>'booking_setup_required' then raise;end if;end;
end $$;
select pg_temp.wactor('manager');
select public.booking_console_save_arrival_limit_v1(pg_temp.wid('spot'),pg_temp.wid('disabled'),1,15,null,pg_temp.wid('manager'));
select pg_temp.wassert(jsonb_array_length(public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25')->'windows')=100 and public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25')#>'{policy,max_guests}'='null'::jsonb,'disabled 15-minute grid');
select public.booking_console_save_arrival_limit_v1(pg_temp.wid('spot'),pg_temp.wid('hourly'),2,60,4,pg_temp.wid('manager'));
select pg_temp.wassert(jsonb_array_length(public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25')->'windows')=25 and public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25')#>>'{totals,guests}'='22','hourly grid lost original facts');
reset role;
set local role service_role;
do $$ begin begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25');raise exception 'worker read';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role anon;
do $$ begin begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25');raise exception 'anonymous read';exception when insufficient_privilege then null;end;end $$;
reset role;
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.wid('spot') and user_id=pg_temp.wid('viewer');
set local role authenticated;
select pg_temp.wactor('viewer');
do $$ begin begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25');raise exception 'revoked Viewer';exception when insufficient_privilege then null;end;end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.wid('owner'),'write_suspension','booking_arrival_review_fixture');
set local role authenticated;
select pg_temp.wactor('manager');
do $$ begin begin perform public.booking_console_arrival_review_v1(pg_temp.wid('spot'),'2026-10-25');raise exception 'Safety bypass';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;end $$;
reset role;
select pg_temp.wassert(not exists((select id,to_jsonb(r) facts from public.booking_reservations r) except (select id,facts from window_review_inventory)) and not exists((select id,facts from window_review_inventory) except (select id,to_jsonb(r) facts from public.booking_reservations r)),'review changed saved booking facts');
select 'ARRIVAL_REVIEW_WIRE:'||value::text from window_review_wire;
rollback;
