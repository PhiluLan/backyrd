-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.cid(label text) returns uuid language sql immutable as $$ select md5('arrival-console:'||label)::uuid $$;
create function pg_temp.cassert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Arrival Console: %',msg;end if;end $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values(pg_temp.cid('owner'),'arrival-console@booking.invalid',now(),'{}','{}'),(pg_temp.cid('viewer'),'arrival-console-viewer@booking.invalid',now(),'{}','{}');
insert into public.spots(id,name,lat,lng,owner_id,status) values(pg_temp.cid('spot'),'Arrival Console',47.5,7.5,pg_temp.cid('owner'),'approved');
create temp table arrival_console_wire(value jsonb);
grant select,insert on pg_temp.arrival_console_wire to authenticated;
set local role authenticated;
do $$ declare snapshot jsonb; empty_policy jsonb; saved jsonb; recovered jsonb; begin
 perform set_config('request.jwt.claim.sub',pg_temp.cid('owner')::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cid('owner'),'role','authenticated')::text,true);
 perform public.booking_console_save_setup_v1(pg_temp.cid('spot'),0,jsonb_build_object('duration_minutes',60,'max_party_size',8,
  'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.cid('area'),'name','Room','is_active',true)),
  'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.cid('table'),'area_id',pg_temp.cid('area'),'label','1','seats',8,'is_active',true)),
  'services',jsonb_build_array(jsonb_build_object('id',pg_temp.cid('service'),'name','Day','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','24:00','interval_minutes',30,'is_active',true))));
 snapshot:=public.booking_console_read_v1(pg_temp.cid('spot'),current_date);
 perform pg_temp.cassert(snapshot#>>'{capabilities,arrival_limits}'='true' and snapshot#>>'{capabilities,service_reports}'='true' and snapshot#>>'{capabilities,guest_history}'='true','forward capability dropped existing behavior');
 empty_policy:=public.booking_console_arrival_limit_v1(pg_temp.cid('spot'));
 saved:=public.booking_console_save_arrival_limit_v1(pg_temp.cid('spot'),pg_temp.cid('save'),0,60,8,pg_temp.cid('owner'));
 recovered:=public.booking_console_save_arrival_limit_v1(pg_temp.cid('spot'),pg_temp.cid('save'),0,60,8,pg_temp.cid('owner'),true);
 perform pg_temp.cassert(saved=recovered and saved->>'revision'='1','editor original intent recovery');
 insert into pg_temp.arrival_console_wire values(jsonb_build_object('spot',pg_temp.cid('spot'),'snapshot',snapshot,'initial',empty_policy,'saved',saved,'recovered',recovered));
end $$;
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) values(pg_temp.cid('spot'),pg_temp.cid('viewer'),pg_temp.cid('owner'),'viewer');
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.cid('viewer')::text,true);
 perform pg_temp.cassert(public.booking_console_arrival_limit_v1(pg_temp.cid('spot'))->>'max_guests'='8','Viewer lost policy read');
 begin perform public.booking_console_save_arrival_limit_v1(pg_temp.cid('spot'),pg_temp.cid('viewer-save'),1,30,9,pg_temp.cid('viewer'));raise exception 'Viewer configured pacing';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'ARRIVAL_CONSOLE_WIRE:'||value::text from pg_temp.arrival_console_wire;
rollback;
