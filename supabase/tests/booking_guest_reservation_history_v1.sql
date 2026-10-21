-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.hid(label text) returns uuid language sql immutable as $$ select md5('booking-guest-history:'||label)::uuid $$;
create function pg_temp.hassert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Guest history: %',message; end if; end $$;
create function pg_temp.hactor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.hid(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.hid(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.hsetup(s text) returns jsonb language sql as $$ select jsonb_build_object('duration_minutes',60,'max_party_size',8,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.hid('area-'||s),'name','Room','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.hid('table-'||s),'area_id',pg_temp.hid('area-'||s),'label','1','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id',pg_temp.hid('service-'||s),'name','Day','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true))) $$;
create function pg_temp.hcard(label text,revision bigint default null,name text default 'Synthetic card') returns jsonb language sql as $$
 select jsonb_build_object('kind','save','id',pg_temp.hid(label),'revision',revision,'name',name,'email','synthetic-history@booking.invalid','phone',null) $$;
create function pg_temp.hcreate(request text,hour integer,guest text default 'card-a',rev bigint default 0,recover boolean default false) returns jsonb language sql as $$
 select public.booking_console_create_v3(pg_temp.hid('spot-a'),pg_temp.hid(request),pg_temp.hid('service-a'),pg_temp.hid('table-a'),array[pg_temp.hid('table-a')],null,
 (((clock_timestamp() at time zone 'Europe/Zurich')::date+1+make_time(hour,0,0)) at time zone 'Europe/Zurich'),60,2,'Saved booking facts','synthetic-history@booking.invalid','PRIVATE_BOOKING_NOTE','phone','confirmed',case when guest is null then null else pg_temp.hid(guest) end,rev,auth.uid(),recover) $$;
create function pg_temp.hlink(rid uuid,guest text,lr bigint,rr bigint default 0,gr bigint default 0) returns jsonb language sql as $$
 select jsonb_build_object('kind',case when guest is null then 'detach' else 'assign' end,'reservation_id',rid,'reservation_revision',rr,'link_revision',lr,'guest_id',case when guest is null then null else pg_temp.hid(guest) end,'guest_revision',case when guest is null then null else gr end) $$;
create function pg_temp.hwrite(request text,intent jsonb,recover boolean default false) returns jsonb language sql as $$ select public.booking_console_reservation_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid(request),intent,auth.uid(),recover) $$;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.hid(x),x||'-history@booking.invalid',clock_timestamp(),'{}','{}' from unnest(array['owner','new-owner','host','viewer','manager','outsider']) x;
insert into public.spots(id,name,lat,lng,owner_id,status) values
 (pg_temp.hid('spot-a'),'Guest history A',47.5,7.5,pg_temp.hid('owner'),'approved'),(pg_temp.hid('spot-b'),'Guest history B',47.5,7.5,pg_temp.hid('owner'),'approved');
set local role authenticated;
select pg_temp.hactor('owner');
select public.booking_console_save_setup_v1(pg_temp.hid('spot-a'),0,pg_temp.hsetup('a'));
select public.booking_console_save_setup_v1(pg_temp.hid('spot-b'),0,pg_temp.hsetup('b'));
select public.booking_console_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('a-create'),pg_temp.hcard('card-a'),auth.uid());
select public.booking_console_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('b-create'),pg_temp.hcard('card-b'),auth.uid());
select public.booking_console_guest_write_v1(pg_temp.hid('spot-b'),pg_temp.hid('cross-create'),pg_temp.hcard('card-cross'),auth.uid());
select pg_temp.hassert(public.booking_console_read_v1(pg_temp.hid('spot-a'),current_date)#>>'{capabilities,guest_history}'='true','capability missing');
reset role;
insert into public.booking_team_members(spot_id,user_id,owner_id,role) select pg_temp.hid('spot-a'),pg_temp.hid(x),pg_temp.hid('owner'),x from unnest(array['host','viewer','manager']) x;
set local role authenticated;
select pg_temp.hactor('host');
do $$ declare saved jsonb; original jsonb; details jsonb; before_count bigint; begin
 perform pg_temp.hassert(pg_temp.hcreate('linked-create',13,'card-a',0,true) is null,'empty recovery wrote');
 saved:=pg_temp.hcreate('linked-create',13);perform set_config('test.guest_history_linked',(saved->>'id'),true);
 perform pg_temp.hassert(saved#>>'{guest_link,revision}'='1' and saved#>>'{guest_link,guest_id}'=pg_temp.hid('card-a')::text,'atomic association missing');
 perform pg_temp.hassert(pg_temp.hcreate('linked-create',13)=saved,'original create replay');
 perform set_config('test.guest_history_create_result',saved::text,true);
 begin perform pg_temp.hcreate('linked-create',13,'card-b');raise exception 'changed guest replay';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.hcreate('stale-card-create',15,'card-a',99);raise exception 'stale card accepted';exception when serialization_failure then null;end;
 begin perform pg_temp.hcreate('cross-card-create',15,'card-cross');raise exception 'cross venue card accepted';exception when serialization_failure then null;end;
 begin perform pg_temp.hcreate('conflicting-create',13,'card-b');raise exception 'inventory conflict accepted';exception when invalid_parameter_value then null;end;
 saved:=pg_temp.hcreate('unlinked-create',14,null,null);perform set_config('test.guest_history_unlinked',saved->>'id',true);
 perform pg_temp.hassert(saved#>>'{guest_link,revision}'='0' and saved#>'{guest_link,guest_id}'='null'::jsonb,'unlinked create inferred identity');
 perform pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'))->'reservations')=1,'unlinked matching contact added history');
 perform public.booking_console_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('a-edit'),pg_temp.hcard('card-a',0,'Corrected card'),auth.uid());
 perform pg_temp.hassert(pg_temp.hcreate('linked-create',13)=current_setting('test.guest_history_create_result')::jsonb,'card correction rewrote original result');
 details:=public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'));
 perform pg_temp.hassert(details#>>'{reservations,0,guest_name}'='Saved booking facts' and details::text not like '%PRIVATE_BOOKING_NOTE%' and details::text not like '%synthetic-history@booking.invalid%','historical facts or minimization');
end $$;
reset role;
select pg_temp.hassert((select count(*)=2 from public.booking_reservations where spot_id=pg_temp.hid('spot-a')),'failed create left booking');
select pg_temp.hassert((select count(*)=2 from booking_private.reservation_guest_requests_v1 where spot_id=pg_temp.hid('spot-a')),'failed create left association receipt');
create temp table saved_history_reservations as select id,to_jsonb(r) facts from public.booking_reservations r where spot_id=pg_temp.hid('spot-a');
set local role authenticated;
select pg_temp.hactor('host');
do $$ declare rid uuid:=current_setting('test.guest_history_unlinked')::uuid; first_result jsonb; r jsonb; begin
 perform pg_temp.hassert(pg_temp.hwrite('attach-b',pg_temp.hlink(rid,'card-b',0),true) is null,'unused attach recovery wrote');
 first_result:=pg_temp.hwrite('attach-b',pg_temp.hlink(rid,'card-b',0));
 perform pg_temp.hassert(first_result->>'revision'='1','first attach revision');
 r:=pg_temp.hwrite('noop-b',pg_temp.hlink(rid,'card-b',1));perform pg_temp.hassert(r=first_result,'no-op changed link');
 begin perform pg_temp.hwrite('stale-link',pg_temp.hlink(rid,'card-a',0,0,1));raise exception 'stale link accepted';exception when serialization_failure then null;end;
 begin perform pg_temp.hwrite('stale-booking',pg_temp.hlink(rid,'card-a',1,99,1));raise exception 'stale booking accepted';exception when serialization_failure then null;end;
 r:=pg_temp.hwrite('correct-a',pg_temp.hlink(rid,'card-a',1,0,1));perform pg_temp.hassert(r->>'revision'='2','correction failed');
 perform pg_temp.hassert(pg_temp.hwrite('attach-b',pg_temp.hlink(rid,'card-b',0),true)=first_result,'original association recovery replaced outcome');
 perform pg_temp.hassert(pg_temp.hwrite('attach-b',pg_temp.hlink(rid,'card-b',0))=first_result,'original replay changed link');
 perform pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-b'))->'reservations')=0,'corrected identity kept unrelated history');
 r:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot-a'),rid);
 perform pg_temp.hassert(r#>>'{guest,id}'=pg_temp.hid('card-a')::text and jsonb_array_length(r->'events')=2,'no-op/replay duplicated audit');
 r:=pg_temp.hwrite('detach-a',pg_temp.hlink(rid,null,2));perform pg_temp.hassert(r->>'revision'='3' and r->'guest_id'='null'::jsonb,'explicit detach failed');
 perform pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'))->'reservations')=1,'detach left personal history');
 begin perform public.booking_console_reservation_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('wrong-actor'),pg_temp.hlink(rid,null,3),pg_temp.hid('owner'));raise exception 'expected actor ignored';exception when insufficient_privilege then null;end;
 begin perform pg_temp.hwrite('invalid-extra',pg_temp.hlink(rid,null,3)||'{"note":"untrusted"}'::jsonb);raise exception 'extra intent keys accepted';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.hwrite('invalid-type',pg_temp.hlink(rid,null,3)||'{"link_revision":"3"}'::jsonb);raise exception 'string revision accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select pg_temp.hassert(not exists((select id,to_jsonb(r) facts from public.booking_reservations r where spot_id=pg_temp.hid('spot-a')) except (select id,facts from saved_history_reservations)) and not exists((select id,facts from saved_history_reservations) except (select id,to_jsonb(r) facts from public.booking_reservations r where spot_id=pg_temp.hid('spot-a'))),'association correction changed saved booking facts');
set local role authenticated;
select pg_temp.hactor('manager');
select public.booking_console_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('archive-a'),jsonb_build_object('kind','archive','id',pg_temp.hid('card-a'),'revision',1,'archived',true),auth.uid());
select pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'))->'reservations')=1,'Manager lost archived history');
select pg_temp.hactor('host');
select pg_temp.hassert(pg_temp.hcreate('linked-create',13)=current_setting('test.guest_history_create_result')::jsonb,'archival changed original replay');
do $$ declare r jsonb; begin
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'));raise exception 'Host read archived history';exception when invalid_parameter_value then null;end;
 r:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot-a'),current_setting('test.guest_history_linked')::uuid);
 perform pg_temp.hassert(r#>'{guest,name}'='null'::jsonb and r#>'{guest,revision}'='null'::jsonb,'archived card details leaked through booking');
 begin perform pg_temp.hcreate('archived-create',15,'card-a',2);raise exception 'new archived association';exception when serialization_failure then null;end;
end $$;
select pg_temp.hactor('manager');
select public.booking_console_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('restore-a'),jsonb_build_object('kind','archive','id',pg_temp.hid('card-a'),'revision',2,'archived',false),auth.uid());
select pg_temp.hactor('viewer');
select pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'))->'reservations')=1,'Viewer lost read');
do $$ begin
 begin perform pg_temp.hwrite('viewer-write',pg_temp.hlink(current_setting('test.guest_history_linked')::uuid,null,1));raise exception 'Viewer changed association';exception when insufficient_privilege then null;end;
 begin perform pg_temp.hcreate('viewer-create',16);raise exception 'Viewer created';exception when insufficient_privilege then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot-b'),pg_temp.hid('card-cross'));raise exception 'cross venue read';exception when insufficient_privilege then null;end;
end $$;
select pg_temp.hactor('outsider');
do $$ begin
 begin perform public.booking_console_reservation_guest_v1(pg_temp.hid('spot-a'),current_setting('test.guest_history_linked')::uuid);raise exception 'outsider link read';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Actual raw-role denial and RLS, including the privileged worker role.
do $$ declare t text; r text; begin
 foreach t in array array['reservation_guests_v1','reservation_guest_requests_v1','reservation_guest_events_v1'] loop
  perform pg_temp.hassert((select relrowsecurity from pg_class where oid=('booking_private.'||t)::regclass),'association RLS missing');
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.hassert(not has_table_privilege(r,'booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'raw table grant');
  end loop;
 end loop;
end $$;
set local role service_role;
do $$ begin
 begin perform count(*) from booking_private.reservation_guests_v1;raise exception 'worker raw read';exception when insufficient_privilege then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'));raise exception 'worker history RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.booking_console_reservation_guest_v1(pg_temp.hid('spot-a'),current_setting('test.guest_history_linked')::uuid);raise exception 'anonymous link RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Existing callers remain compatible and are never silently adopted by v3.
set local role authenticated;
select pg_temp.hactor('owner');
select public.booking_console_create_v2(pg_temp.hid('spot-a'),pg_temp.hid('legacy-create'),pg_temp.hid('service-a'),pg_temp.hid('table-a'),array[pg_temp.hid('table-a')],null,
 (((clock_timestamp() at time zone 'Europe/Zurich')::date+1+time '16:00') at time zone 'Europe/Zurich'),60,2,'Legacy matching contact','synthetic-history@booking.invalid',null,'phone','confirmed');
do $$ begin
 begin perform pg_temp.hcreate('legacy-create',16,'card-b',0,true);raise exception 'legacy nonce silently adopted';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_create_v3(pg_temp.hid('spot-a'),pg_temp.hid('wrong-create-actor'),pg_temp.hid('service-a'),pg_temp.hid('table-a'),array[pg_temp.hid('table-a')],null,
  (((clock_timestamp() at time zone 'Europe/Zurich')::date+1+time '17:00') at time zone 'Europe/Zurich'),60,2,'Invalid actor',null,null,'phone','confirmed',pg_temp.hid('card-b'),0,pg_temp.hid('manager'));
  raise exception 'create expected actor ignored';exception when insufficient_privilege then null;end;
 perform pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-b'))->'reservations')=0,'legacy matching contact inferred identity');
end $$;
reset role;
-- Tied timestamps span pages without duplicating rows or leaking contact/note.
insert into public.booking_reservations(id,spot_id,request_id,service_id,table_id,guest_name,guest_contact,note,party_size,starts_at,ends_at,status,source)
select pg_temp.hid('page-r-'||n),pg_temp.hid('spot-a'),pg_temp.hid('page-create-'||n),pg_temp.hid('service-a'),pg_temp.hid('table-a'),'Synthetic cancelled reservation','PRIVATE_HISTORY_CONTACT','PRIVATE_HISTORY_NOTE',2,
 '2026-10-25T00:30:00Z','2026-10-25T01:30:00Z','cancelled','operator' from generate_series(1,30) n;
set local role authenticated;
select pg_temp.hactor('owner');
do $$ declare n integer; a jsonb; b jsonb; begin
 for n in 1..30 loop perform pg_temp.hwrite('page-link-'||n,pg_temp.hlink(pg_temp.hid('page-r-'||n),'card-b',0));end loop;
 a:=public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-b'));
 b:=public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-b'),(a#>>'{next_cursor,starts_at}')::timestamptz,(a#>>'{next_cursor,id}')::uuid);
 perform pg_temp.hassert(jsonb_array_length(a->'reservations')=25 and jsonb_array_length(b->'reservations')=5 and b->'next_cursor'='null'::jsonb,'history keyset bounds');
 perform pg_temp.hassert((select count(distinct x->>'id')=30 from jsonb_array_elements((a->'reservations')||(b->'reservations')) x),'tied rows skipped or repeated');
 perform pg_temp.hassert((a::text||b::text) not like '%PRIVATE_HISTORY_%' and a#>>'{reservations,0,status}'='cancelled','history exposed contacts or changed attendance facts');
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-b'),now(),null);raise exception 'partial cursor accepted';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-b'),'infinity',pg_temp.hid('page-r-1'));raise exception 'infinite cursor accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
-- Original Owner and operator Safety/revocation fences precede recovery.
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.hid('owner'),'write_suspension','booking_guest_history_fixture');
set local role authenticated;
select pg_temp.hactor('host');
do $$ begin
 begin perform pg_temp.hcreate('linked-create',13,'card-a',0,true);raise exception 'Safety bypass';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;
end $$;
reset role;
update public.safety_account_measures set status='revoked' where reason_code='booking_guest_history_fixture' and user_id=pg_temp.hid('owner');
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.hid('spot-a') and user_id=pg_temp.hid('host');
set local role authenticated;
select pg_temp.hactor('host');
do $$ begin
 begin perform pg_temp.hcreate('linked-create',13,'card-a',0,true);raise exception 'revoked original create';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.spots set owner_id=pg_temp.hid('new-owner') where id=pg_temp.hid('spot-a');
set local role authenticated;
select pg_temp.hactor('new-owner');
do $$ declare rid uuid:=current_setting('test.guest_history_linked')::uuid; r jsonb; begin
 r:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot-a'),rid);
 perform pg_temp.hassert(r->'guest'='null'::jsonb and r->>'revision'='0' and jsonb_array_length(r->'events')=0,'former directory association inherited');
 begin perform pg_temp.hcreate('linked-create',13,'card-a',0,true);raise exception 'new owner original recovery';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('card-a'));raise exception 'new owner former history';exception when invalid_parameter_value then null;end;
 perform public.booking_console_guest_write_v1(pg_temp.hid('spot-a'),pg_temp.hid('new-card-create'),pg_temp.hcard('new-card'),auth.uid());
 r:=pg_temp.hwrite('new-owner-assign',pg_temp.hlink(rid,'new-card',0));
 perform pg_temp.hassert(r->>'revision'='1','new controller explicit association failed');
 perform pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot-a'),pg_temp.hid('new-card'))->'reservations')=1,'new association history missing');
end $$;
rollback;
