-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.pid(label text) returns uuid language sql immutable as $$ select md5('booking-arrival-pacing:'||label)::uuid $$;
create function pg_temp.pass(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Arrival limits: %',msg; end if; end $$;
create function pg_temp.actor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.pid(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.pid(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.start_at(day_offset integer,clock_time time) returns timestamptz language sql as $$ select (((now() at time zone 'Europe/Zurich')::date+day_offset+clock_time) at time zone 'Europe/Zurich') $$;
create function pg_temp.limit_save(request text,revision bigint,minutes integer,guests integer,recover boolean default false) returns jsonb language sql as $$
 select public.booking_console_save_arrival_limit_v1(pg_temp.pid('spot'),pg_temp.pid(request),revision,minutes,guests,auth.uid(),recover) $$;
create function pg_temp.book(request text,table_number integer,day_offset integer,clock_time time,party integer,service text default 'service-a') returns jsonb language sql as $$
 select public.booking_console_create_v2(pg_temp.pid('spot'),pg_temp.pid(request),pg_temp.pid(service),pg_temp.pid('table-'||table_number),array[pg_temp.pid('table-'||table_number)],null,pg_temp.start_at(day_offset,clock_time),60,party,'Synthetic paced booking',null,null,'phone','confirmed') $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.pid(x),x||'-arrival-pacing@booking.invalid',clock_timestamp(),'{}','{}' from unnest(array['owner','new-owner','manager','host','viewer','other']) x;
insert into public.spots(id,name,lat,lng,owner_id,status) values(pg_temp.pid('spot'),'Arrival pacing',47.5,7.5,pg_temp.pid('owner'),'approved'),(pg_temp.pid('other-spot'),'Other pacing spot',47.5,7.5,pg_temp.pid('owner'),'approved');
set local role authenticated;
select pg_temp.actor('owner');
select public.booking_console_save_setup_v1(pg_temp.pid('spot'),0,jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.pid('area'),'name','Room','is_active',true)),
 'tables',(select jsonb_agg(jsonb_build_object('id',pg_temp.pid('table-'||n),'area_id',pg_temp.pid('area'),'label',n::text,'seats',8,'is_active',true)) from generate_series(1,12)n),
 'services',(select jsonb_agg(jsonb_build_object('id',pg_temp.pid(s),'name',s,'weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','24:00','interval_minutes',15,'is_active',true)) from unnest(array['service-a','service-b'])s)));
select public.booking_console_save_public_settings_v1(pg_temp.pid('spot'),1,true,array[pg_temp.pid('service-a'),pg_temp.pid('service-b')],15,90,120,'confirmed','privacy@booking.invalid');
select public.booking_console_save_combination_v1(pg_temp.pid('spot'),2,pg_temp.pid('combined'),'Combined',pg_temp.pid('table-3'),array[pg_temp.pid('table-3'),pg_temp.pid('table-4')],8,true);
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) select pg_temp.pid('spot'),pg_temp.pid(x),pg_temp.pid('owner'),x from unnest(array['manager','host','viewer'])x;
set local role authenticated;
select pg_temp.actor('manager');
do $$ declare r jsonb; original jsonb; begin
 r:=public.booking_console_arrival_limit_v1(pg_temp.pid('spot'));
 perform pg_temp.pass(r->>'revision'='0' and r->>'window_minutes'='15' and r->'max_guests'='null'::jsonb,'default must be unlimited');
 perform pg_temp.pass(pg_temp.limit_save('unknown',0,30,6,true) is null,'recovery created policy');
 r:=pg_temp.limit_save('limit-first',0,30,6);original:=r;
 perform pg_temp.pass(r->>'revision'='1' and r->>'max_guests'='6','policy create');
 perform pg_temp.pass(pg_temp.limit_save('limit-first',0,30,6)=r and pg_temp.limit_save('limit-first',0,30,6,true)=r,'original policy replay');
 perform pg_temp.pass(pg_temp.limit_save('limit-noop',1,30,6)=r,'no-op changed revision');
 begin perform pg_temp.limit_save('limit-first',0,15,6,true);raise exception 'changed intent accepted';exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise;end if;end;
 begin perform pg_temp.limit_save('stale-policy',0,30,5);raise exception 'stale policy accepted';exception when serialization_failure then null;end;
 begin perform pg_temp.limit_save('invalid-minutes',1,20,6);raise exception 'bad interval';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.limit_save('invalid-zero',1,15,0);raise exception 'zero became unlimited';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_save_arrival_limit_v1(pg_temp.pid('spot'),pg_temp.pid('wrong-actor'),1,30,6,pg_temp.pid('owner'));raise exception 'wrong actor';exception when insufficient_privilege then null;end;
 perform set_config('pacing.original_policy',original::text,true);
end $$;
select pg_temp.actor('host');
do $$ declare r jsonb; slots jsonb; rid uuid; begin
 r:=pg_temp.book('first',1,1,'13:00',4);rid:=(r->>'id')::uuid;perform set_config('pacing.first',rid::text,true);
 perform pg_temp.book('second',2,1,'13:15',2,'service-b');
 begin perform pg_temp.book('third',5,1,'13:00',1);raise exception 'restaurant-wide cap bypass';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
 perform pg_temp.pass(pg_temp.book('first',1,1,'13:00',4)=r,'full bucket blocked original replay');
 slots:=public.booking_console_slots_v2(pg_temp.pid('spot'),(pg_temp.start_at(1,'13:00') at time zone 'Europe/Zurich')::date,1,null,60,null,null,'13:00');
 perform pg_temp.pass(jsonb_array_length(slots)=0,'v2 preview exposes full bucket');
 perform pg_temp.pass(not exists(select 1 from public.booking_console_slots_v1(pg_temp.pid('spot'),(pg_temp.start_at(1,'13:00') at time zone 'Europe/Zurich')::date,1)s where s.starts_at=pg_temp.start_at(1,'13:00')),'v1 preview exposes full bucket');
 perform pg_temp.pass(jsonb_array_length(public.booking_console_slots_v2(pg_temp.pid('spot'),(pg_temp.start_at(1,'13:00') at time zone 'Europe/Zurich')::date,4,rid,60,null,null,'13:00'))>0,'amendment counted its own party twice');
 perform pg_temp.book('boundary',5,1,'13:30',6);
 begin perform public.booking_console_create_v1(pg_temp.pid('spot'),pg_temp.pid('legacy'),pg_temp.pid('service-a'),pg_temp.pid('table-6'),pg_temp.start_at(1,'13:30'),1,'Legacy',null,null,'phone','confirmed');raise exception 'legacy write bypass';exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise;end if;end;
 begin perform public.booking_console_create_v3(pg_temp.pid('spot'),pg_temp.pid('v3'),pg_temp.pid('service-a'),pg_temp.pid('table-6'),array[pg_temp.pid('table-6')],null,pg_temp.start_at(1,'13:30'),60,1,'V3',null,null,'phone','confirmed',null,null,auth.uid());raise exception 'v3 write bypass';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
 begin perform pg_temp.limit_save('host-config',1,30,8);raise exception 'Host managed policy';exception when insufficient_privilege then null;end;
 perform pg_temp.pass(public.booking_console_arrival_limit_v1(pg_temp.pid('spot'))->>'revision'='1','Host read denied');
end $$;
reset role;
-- Public availability and actual creation share the same global window count.
set local role service_role;
do $$ declare r jsonb; begin
 r:=public.booking_guest_availability_v1(pg_temp.pid('spot'),(pg_temp.start_at(1,'13:00') at time zone 'Europe/Zurich')::date,1);
 perform pg_temp.pass(not exists(select 1 from jsonb_array_elements(r->'slots')s where (s->>'starts_at')::timestamptz=pg_temp.start_at(1,'13:00')),'public preview bypass');
 begin perform public.booking_guest_create_v1(pg_temp.pid('spot'),pg_temp.pid('public-full'),1,pg_temp.start_at(1,'13:00'),1,'Public','arrival@booking.invalid',encode(sha256(convert_to('booking-arrival-pacing:public-full','UTF8')),'hex'),repeat('sealed-',10));raise exception 'public write bypass';exception when invalid_parameter_value then if sqlerrm<>'booking_slot_unavailable' then raise;end if;end;
 perform public.booking_guest_create_v1(pg_temp.pid('spot'),pg_temp.pid('public-next'),1,pg_temp.start_at(1,'14:30'),2,'Public','arrival@booking.invalid',encode(sha256(convert_to('booking-arrival-pacing:public-next','UTF8')),'hex'),repeat('sealed-',10));
end $$;
reset role;
set local role authenticated;
select pg_temp.actor('host');
do $$ begin
 perform pg_temp.book('manual-with-public',1,1,'14:30',4);
 begin perform pg_temp.book('manual-after-public',12,1,'14:45',1,'service-b');raise exception 'public contribution omitted';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
 perform public.booking_console_create_v2(pg_temp.pid('spot'),pg_temp.pid('combo'),pg_temp.pid('service-a'),pg_temp.pid('table-3'),array[pg_temp.pid('table-3'),pg_temp.pid('table-4')],pg_temp.pid('combined'),pg_temp.start_at(2,'13:00'),60,6,'Combined',null,null,'operator','confirmed');
 begin perform pg_temp.book('after-combo',5,2,'13:15',1);raise exception 'combined parent omitted';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
end $$;
reset role;
-- Lowering a limit preserves every stored booking. Shrinks/contact-only edits
-- remain possible; increases/moves into an overfull bucket remain forbidden.
create temp table pacing_saved_before as select id,to_jsonb(r) facts from public.booking_reservations r;
set local role authenticated;
select pg_temp.actor('manager');
select pg_temp.limit_save('limit-lower',1,30,3);
select pg_temp.pass(pg_temp.limit_save('limit-first',0,30,6,true)=current_setting('pacing.original_policy')::jsonb,'later policy replaced original result');
select pg_temp.actor('host');
select public.booking_console_amend_v2(pg_temp.pid('spot'),current_setting('pacing.first')::uuid,pg_temp.pid('shrink'),0,pg_temp.pid('service-a'),pg_temp.pid('table-1'),array[pg_temp.pid('table-1')],null,pg_temp.start_at(1,'13:00'),60,3,'Corrected booking',null,null);
do $$ begin
 begin perform public.booking_console_amend_v2(pg_temp.pid('spot'),current_setting('pacing.first')::uuid,pg_temp.pid('increase'),1,pg_temp.pid('service-a'),pg_temp.pid('table-1'),array[pg_temp.pid('table-1')],null,pg_temp.start_at(1,'13:00'),60,4,'Corrected booking',null,null);raise exception 'increase over lower cap';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
end $$;
reset role;
select pg_temp.pass((select count(*) from public.booking_reservations)=(select count(*) from pacing_saved_before),'policy deleted or created bookings');
select pg_temp.pass(not exists((select id,to_jsonb(r) facts from public.booking_reservations r where id<>current_setting('pacing.first')::uuid) except (select id,facts from pacing_saved_before where id<>current_setting('pacing.first')::uuid)),'policy rewrote unrelated reservations');
-- Direct privileged parent writes must also obey limits. Parent count never
-- multiplies by allocation members. Only explicitly excluded statuses free load.
insert into public.booking_reservations(id,spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source)
values(pg_temp.pid('completed'),pg_temp.pid('spot'),pg_temp.pid('completed-r'),pg_temp.pid('service-a'),pg_temp.pid('table-8'),'Synthetic completed',3,pg_temp.start_at(3,'13:00'),pg_temp.start_at(3,'14:00'),'completed','operator');
do $$ begin
 begin insert into public.booking_reservations(spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source) values(pg_temp.pid('spot'),pg_temp.pid('raw-full'),pg_temp.pid('service-b'),pg_temp.pid('table-9'),'Synthetic raw',1,pg_temp.start_at(3,'13:15'),pg_temp.start_at(3,'14:15'),'pending','operator');raise exception 'completed contribution omitted';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
end $$;
update public.booking_reservations set status='no_show' where id=pg_temp.pid('completed');
set local role authenticated;
select pg_temp.actor('host');
select pg_temp.book('after-no-show',9,3,'13:15',3);
reset role;
-- Multi-row privileged writes must not count from a stale statement snapshot.
do $$ begin
 begin
  insert into public.booking_reservations(spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source)
  values(pg_temp.pid('spot'),pg_temp.pid('batch-a'),pg_temp.pid('service-a'),pg_temp.pid('table-1'),'Batch A',2,pg_temp.start_at(5,'13:00'),pg_temp.start_at(5,'14:00'),'confirmed','operator'),
   (pg_temp.pid('spot'),pg_temp.pid('batch-b'),pg_temp.pid('service-b'),pg_temp.pid('table-2'),'Batch B',2,pg_temp.start_at(5,'13:15'),pg_temp.start_at(5,'14:15'),'pending','operator');
  raise exception 'multi-row statement exceeded cap';
 exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
 perform pg_temp.pass(not exists(select 1 from public.booking_reservations where request_id in (pg_temp.pid('batch-a'),pg_temp.pid('batch-b'))),'failed batch retained a partial booking');
end $$;
insert into public.booking_reservations(id,spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source)
select pg_temp.pid('excluded-'||s),pg_temp.pid('spot'),pg_temp.pid('excluded-request-'||s),pg_temp.pid('service-a'),pg_temp.pid('table-1'),'Excluded status',8,pg_temp.start_at(5,'13:00'),pg_temp.start_at(5,'14:00'),s,'operator' from unnest(array['cancelled','declined'])s;
set local role authenticated;
select pg_temp.actor('host');
select pg_temp.book('after-excluded',2,5,'13:00',3);
reset role;
do $$ begin
 begin update public.booking_reservations set status='confirmed' where id=pg_temp.pid('excluded-cancelled');raise exception 'reactivation exceeded cap';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
end $$;
-- DST bins use actual instants: repeated 02:00 hours are separate, and a spring
-- gap creates no phantom bucket. Midnight has a half-open boundary.
do $$ begin
 perform pg_temp.pass(booking_private.arrival_allowed_v1(pg_temp.pid('spot'),'2026-10-25T00:15Z',3,null),'first autumn bin');
end $$;
insert into public.booking_reservations(spot_id,request_id,service_id,table_id,guest_name,party_size,starts_at,ends_at,status,source)
values(pg_temp.pid('spot'),pg_temp.pid('dst'),pg_temp.pid('service-a'),pg_temp.pid('table-10'),'Synthetic DST',3,'2026-10-25T00:00Z','2026-10-25T00:30Z','completed','operator');
select pg_temp.pass(not booking_private.arrival_allowed_v1(pg_temp.pid('spot'),'2026-10-25T00:29:59.999999Z',1,null) and booking_private.arrival_allowed_v1(pg_temp.pid('spot'),'2026-10-25T00:30Z',3,null) and booking_private.arrival_allowed_v1(pg_temp.pid('spot'),'2026-10-25T01:00Z',3,null),'DST/half-open bins collapsed');
select pg_temp.pass(booking_private.arrival_allowed_v1(pg_temp.pid('spot'),'2026-03-29T01:00Z',3,null),'spring real instant rejected');
-- Clock-bound walk-in preview and write, frozen only in this rollback fixture.
create temp table pacing_clock(value timestamptz);
insert into pacing_clock values(pg_temp.start_at(4,'12:07:15'));
create or replace function booking_private.admission_clock_v1() returns timestamptz language sql volatile set search_path='' as $$ select value from pg_temp.pacing_clock; $$;
grant select on pg_temp.pacing_clock to authenticated;
set local role authenticated;
select pg_temp.actor('host');
select public.booking_console_walk_in_v2(pg_temp.pid('spot'),pg_temp.pid('walk'),pg_temp.pid('service-a'),pg_temp.pid('table-11'),array[pg_temp.pid('table-11')],null,3,60,'Walk-in',null,null);
do $$ begin
 perform pg_temp.pass(jsonb_array_length(public.booking_console_walk_in_slots_v2(pg_temp.pid('spot'),1,60)->'slots')=0,'walk-in preview bypass');
 perform pg_temp.pass(jsonb_array_length(public.booking_console_walk_in_slots_v1(pg_temp.pid('spot'),1,60)->'slots')=0,'legacy walk-in preview bypass');
 begin perform public.booking_console_walk_in_v2(pg_temp.pid('spot'),pg_temp.pid('walk-full'),pg_temp.pid('service-b'),pg_temp.pid('table-12'),array[pg_temp.pid('table-12')],null,1,60,'Walk-in',null,null);raise exception 'walk-in write bypass';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
end $$;
select pg_temp.actor('viewer');
select pg_temp.pass(public.booking_console_arrival_limit_v1(pg_temp.pid('spot'))->>'max_guests'='3','Viewer read');
do $$ begin begin perform pg_temp.limit_save('viewer-write',2,30,null);raise exception 'Viewer changed policy';exception when insufficient_privilege then null;end;end $$;
select pg_temp.actor('other');
do $$ begin begin perform public.booking_console_arrival_limit_v1(pg_temp.pid('spot'));raise exception 'outsider read';exception when insufficient_privilege then null;end;end $$;
reset role;
-- Actual role denials and RLS on the new private tables.
do $$ declare t text; r text; begin
 foreach t in array array['arrival_limits_v1','arrival_limit_requests_v1'] loop
  perform pg_temp.pass((select relrowsecurity from pg_class where oid=('booking_private.'||t)::regclass),'RLS missing');
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.pass(not has_table_privilege(r,'booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'raw privilege');
   execute format('set local role %I',r);
   begin execute format('select count(*) from booking_private.%I',t);raise exception 'raw read';exception when insufficient_privilege then null;end;
   reset role;
  end loop;
 end loop;
end $$;
set local role service_role;
do $$ begin begin perform public.booking_console_arrival_limit_v1(pg_temp.pid('spot'));raise exception 'worker RPC';exception when insufficient_privilege then null;end;end $$;
reset role;
set local role anon;
do $$ begin begin perform public.booking_console_arrival_limit_v1(pg_temp.pid('spot'));raise exception 'anonymous RPC';exception when insufficient_privilege then null;end;end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.pid('owner'),'write_suspension','booking_arrival_fixture');
set local role authenticated;
select pg_temp.actor('manager');
do $$ begin begin perform pg_temp.limit_save('limit-first',0,30,6,true);raise exception 'Safety replay';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;end $$;
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.pid('owner') and reason_code='booking_arrival_fixture';
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.pid('spot') and user_id=pg_temp.pid('manager');
set local role authenticated;
select pg_temp.actor('manager');
do $$ begin begin perform pg_temp.limit_save('limit-first',0,30,6,true);raise exception 'revoked replay';exception when insufficient_privilege then null;end;end $$;
reset role;
update public.spots set owner_id=pg_temp.pid('new-owner') where id=pg_temp.pid('spot');
set local role authenticated;
select pg_temp.actor('new-owner');
do $$ begin begin perform pg_temp.limit_save('limit-first',0,30,6,true);raise exception 'new owner recovered prior intent';exception when invalid_parameter_value then null;end;end $$;
select pg_temp.limit_save('disable',2,15,null);
select pg_temp.pass(public.booking_console_arrival_limit_v1(pg_temp.pid('spot'))->'max_guests'='null'::jsonb,'disable failed');
select pg_temp.limit_save('hourly',3,60,7);
select pg_temp.pass(public.booking_console_arrival_limit_v1(pg_temp.pid('spot'))->>'window_minutes'='60','hourly configuration rejected');
select pg_temp.actor('owner');
do $$ begin begin perform public.booking_console_arrival_limit_v1(pg_temp.pid('spot'));raise exception 'old Owner read current policy';exception when insufficient_privilege then null;end;end $$;
rollback;
