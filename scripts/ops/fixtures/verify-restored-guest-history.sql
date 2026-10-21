-- Rolled-back source/target acceptance. Synthetic local drill only.
begin;
do $$ begin if current_setting('backyrd.booking_restore_fixture',true) is distinct from 'isolated' then raise exception 'isolated_restore_fixture_required'; end if; end $$;
create function pg_temp.hid(label text) returns uuid language sql immutable as $$ select md5('booking-restore-fixture:'||label)::uuid $$;
create function pg_temp.hassert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Guest history restore: %',message; end if; end $$;
create function pg_temp.hactor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.hid(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.hid(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.hrid(label text) returns uuid language sql as $$ select current_setting('restore.history.'||label)::uuid $$;
create function pg_temp.hintent(label text,guest text,link_revision bigint,reservation_revision bigint default 0,guest_revision bigint default 1) returns jsonb language sql as $$
 select jsonb_build_object('kind',case when guest is null then 'detach' else 'assign' end,'reservation_id',pg_temp.hrid(label),'reservation_revision',reservation_revision,'link_revision',link_revision,
 'guest_id',case when guest is null then null else pg_temp.hid(guest) end,'guest_revision',case when guest is null then null else guest_revision end) $$;
create function pg_temp.hwrite(request text,intent jsonb,recover boolean default false) returns jsonb language sql as $$
 select public.booking_console_reservation_guest_write_v1(pg_temp.hid('spot'),pg_temp.hid(request),intent,auth.uid(),recover) $$;
create function pg_temp.hcreate(label text,recover boolean default true) returns jsonb language sql as $$
 select public.booking_console_create_v3(pg_temp.hid('spot'),pg_temp.hid('history-'||label),pg_temp.hid('service'),pg_temp.hid('table'),array[pg_temp.hid('table')],null,
 current_setting('restore.history.start_'||label)::timestamptz,60,2,'Synthetic history '||label,'restore-history@booking.invalid','PRIVATE_RESTORE_HISTORY_NOTE','phone','confirmed',
 pg_temp.hid(case when label='archived' then 'card-archived' else 'card-active' end),case when label='archived' then 0 else 1 end,auth.uid(),recover) $$;
create temp table restore_history_observation(facts jsonb);
create temp table restore_history_original as select request_id,outcome from booking_private.reservation_guest_requests_v1 where spot_id=pg_temp.hid('spot');
create temp table restore_history_bookings as select id,to_jsonb(r) facts from public.booking_reservations r;
grant select on pg_temp.restore_history_original to authenticated;
grant select,insert on pg_temp.restore_history_observation to authenticated;
do $$ declare label text; r record; t text; role_name text; begin
 perform pg_temp.hassert((select count(*)=4 from booking_private.reservation_guests_v1 where spot_id=pg_temp.hid('spot')),'four populated links required');
 perform pg_temp.hassert((select count(*)=6 from booking_private.reservation_guest_requests_v1 where spot_id=pg_temp.hid('spot')),'six original receipts required');
 perform pg_temp.hassert((select count(*)=6 from booking_private.reservation_guest_events_v1 where spot_id=pg_temp.hid('spot')),'six metadata events required');
 foreach label in array array['linked','corrected','detached','archived'] loop
  select id,starts_at into strict r from public.booking_reservations where spot_id=pg_temp.hid('spot') and request_id=pg_temp.hid('history-'||label);
  perform set_config('restore.history.'||label,r.id::text,true);
  perform set_config('restore.history.start_'||label,r.starts_at::text,true);
 end loop;
 foreach t in array array['reservation_guests_v1','reservation_guest_requests_v1','reservation_guest_events_v1'] loop
  perform pg_temp.hassert((select relrowsecurity from pg_class where oid=('booking_private.'||t)::regclass),'RLS absent');
  foreach role_name in array array['anon','authenticated','service_role'] loop
   perform pg_temp.hassert(not has_table_privilege(role_name,'booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'raw grant restored');
  end loop;
 end loop;
end $$;
set local role authenticated;
do $$ declare label text; r jsonb; active jsonb; corrected jsonb; detached jsonb; archived jsonb; active_history jsonb; corrected_history jsonb; archived_history jsonb; original jsonb:='{}'; begin
 perform pg_temp.hactor('host');
 active:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('linked'));
 corrected:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('corrected'));
 detached:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('detached'));
 archived:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('archived'));
 perform pg_temp.hassert(active#>>'{guest,name}'='Synthetic card corrected' and active->>'revision'='1','current link/card missing');
 perform pg_temp.hassert(corrected#>>'{guest,id}'=pg_temp.hid('card-restored')::text and corrected->>'revision'='2' and jsonb_array_length(corrected->'events')=2,'corrected link lost');
 perform pg_temp.hassert(detached->'guest'='null'::jsonb and detached->>'revision'='2' and jsonb_array_length(detached->'events')=2,'detached identity/history lost');
 perform pg_temp.hassert(archived#>>'{guest,is_archived}'='true' and archived#>'{guest,name}'='null'::jsonb and archived#>'{guest,revision}'='null'::jsonb,'Host archive redaction lost');
 active_history:=public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-active'));
 corrected_history:=public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-restored'));
 perform pg_temp.hassert(jsonb_array_length(active_history->'reservations')=1 and active_history#>>'{reservations,0,id}'=pg_temp.hrid('linked')::text,'old or detached identity reappeared');
 perform pg_temp.hassert(jsonb_array_length(corrected_history->'reservations')=1 and corrected_history#>>'{reservations,0,id}'=pg_temp.hrid('corrected')::text,'corrected history missing');
 perform pg_temp.hassert((active_history::text||corrected_history::text||active::text||corrected::text||detached::text||archived::text) not like '%PRIVATE_RESTORE_HISTORY_NOTE%' and (active_history::text||corrected_history::text) not like '%restore-history@booking.invalid%','private booking contact/note projected');
 foreach label in array array['linked','corrected','detached','archived'] loop
  r:=pg_temp.hcreate(label);
  perform pg_temp.hassert(r=(select outcome from pg_temp.restore_history_original where request_id=pg_temp.hid('history-'||label)),'create recovery replaced original result');
  perform pg_temp.hassert(pg_temp.hcreate(label,false)=r,'exact create replay changed outcome');
  original:=original||jsonb_build_object(label,r);
 end loop;
 r:=pg_temp.hwrite('history-corrected-change',pg_temp.hintent('corrected','card-restored',1,0,0),true);
 perform pg_temp.hassert(r=(select outcome from pg_temp.restore_history_original where request_id=pg_temp.hid('history-corrected-change')),'correction recovery changed original result');
 original:=original||jsonb_build_object('correction',r);
 r:=pg_temp.hwrite('history-detached-change',pg_temp.hintent('detached',null,1),true);
 perform pg_temp.hassert(r=(select outcome from pg_temp.restore_history_original where request_id=pg_temp.hid('history-detached-change')),'detach recovery changed original result');
 original:=original||jsonb_build_object('detach',r);
 begin perform pg_temp.hwrite('history-corrected-change',pg_temp.hintent('corrected','card-active',1),true);raise exception 'changed intent accepted';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.hwrite('stale-restored-link',pg_temp.hintent('detached','card-active',1));raise exception 'stale revision accepted';exception when serialization_failure then null;end;
 begin perform pg_temp.hwrite('stale-restored-booking',pg_temp.hintent('detached','card-active',2,99));raise exception 'stale booking accepted';exception when serialization_failure then null;end;
 begin perform public.booking_console_reservation_guest_write_v1(pg_temp.hid('spot'),pg_temp.hid('wrong-actor'),pg_temp.hintent('detached','card-active',2),pg_temp.hid('manager'),true);raise exception 'wrong actor accepted';exception when insufficient_privilege then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-archived'));raise exception 'Host read archived history';exception when invalid_parameter_value then null;end;
 -- New writes remain usable after restoration; no probe changes commit.
 r:=pg_temp.hwrite('post-restore-reattach',pg_temp.hintent('detached','card-active',2));
 perform pg_temp.hassert(r->>'revision'='3' and r->>'guest_id'=pg_temp.hid('card-active')::text,'new association failed');
 perform pg_temp.hassert(pg_temp.hwrite('post-restore-reattach',pg_temp.hintent('detached','card-active',2),true)=r,'new receipt not recoverable');
 perform pg_temp.hactor('manager');
 archived_history:=public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-archived'));
 perform pg_temp.hassert(jsonb_array_length(archived_history->'reservations')=1,'Manager archived history lost');
 r:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('archived'));
 perform pg_temp.hassert(r#>>'{guest,name}'='Synthetic card archived','Manager archive projection missing');
 insert into pg_temp.restore_history_observation values(jsonb_build_object('active',active,'corrected',corrected,'detached',detached,'archived',archived,'activeHistory',active_history,'correctedHistory',corrected_history,'archivedHistory',archived_history,'original',original));
 perform pg_temp.hactor('viewer');
 perform pg_temp.hassert(jsonb_array_length(public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-restored'))->'reservations')=1,'Viewer read lost');
 begin perform pg_temp.hwrite('viewer-link',pg_temp.hintent('linked',null,1));raise exception 'Viewer wrote';exception when insufficient_privilege then null;end;
 perform pg_temp.hactor('other');
 begin perform public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('linked'));raise exception 'outsider read link';exception when insufficient_privilege then null;end;
end $$;
-- Exercise every raw-table denial with the actual role, including worker bypassrls.
do $$ declare t text; begin foreach t in array array['reservation_guests_v1','reservation_guest_requests_v1','reservation_guest_events_v1'] loop
 begin execute format('select count(*) from booking_private.%I',t);raise exception 'staff raw read';exception when insufficient_privilege then null;end;
end loop;end $$;
reset role;
set local role service_role;
do $$ declare t text; begin foreach t in array array['reservation_guests_v1','reservation_guest_requests_v1','reservation_guest_events_v1'] loop
 begin execute format('select count(*) from booking_private.%I',t);raise exception 'worker raw read';exception when insufficient_privilege then null;end;
end loop;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-active'));raise exception 'worker history RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ declare t text; begin foreach t in array array['reservation_guests_v1','reservation_guest_requests_v1','reservation_guest_events_v1'] loop
 begin execute format('select count(*) from booking_private.%I',t);raise exception 'anonymous raw read';exception when insufficient_privilege then null;end;
end loop;
 begin perform public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('linked'));raise exception 'anonymous link RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.hid('owner'),'write_suspension','booking_restore_history_fixture');
set local role authenticated;
do $$ begin perform pg_temp.hactor('host');
 begin perform pg_temp.hcreate('linked');raise exception 'Safety recovery bypass';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;
end $$;
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.hid('owner') and reason_code='booking_restore_history_fixture';
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.hid('spot') and user_id=pg_temp.hid('host');
set local role authenticated;
do $$ begin perform pg_temp.hactor('host');
 begin perform pg_temp.hcreate('linked');raise exception 'revoked Host recovered';exception when insufficient_privilege then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-active'));raise exception 'revoked Host read history';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.spots set owner_id=pg_temp.hid('new-owner') where id=pg_temp.hid('spot');
set local role authenticated;
do $$ declare r jsonb; begin perform pg_temp.hactor('new-owner');
 r:=public.booking_console_reservation_guest_v1(pg_temp.hid('spot'),pg_temp.hrid('linked'));
 perform pg_temp.hassert(r->'guest'='null'::jsonb and r->>'revision'='0' and jsonb_array_length(r->'events')=0,'new Owner inherited old identity');
 begin perform pg_temp.hcreate('linked');raise exception 'new Owner recovered old create';exception when invalid_parameter_value then null;end;
 begin perform public.booking_console_guest_reservations_v1(pg_temp.hid('spot'),pg_temp.hid('card-active'));raise exception 'new Owner read old history';exception when invalid_parameter_value then null;end;
end $$;
reset role;
select pg_temp.hassert(not exists((select id,to_jsonb(r) facts from public.booking_reservations r) except (select id,facts from pg_temp.restore_history_bookings)) and not exists((select id,facts from pg_temp.restore_history_bookings) except (select id,to_jsonb(r) facts from public.booking_reservations r)),'history probe changed saved booking facts');
select facts from pg_temp.restore_history_observation;
rollback;
