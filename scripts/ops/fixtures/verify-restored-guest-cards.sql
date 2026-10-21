-- Source and restored-target acceptance, rolled back. Never an incident command.
begin;
do $$ begin if current_setting('backyrd.booking_restore_fixture',true) is distinct from 'isolated' then raise exception 'isolated_restore_fixture_required'; end if; end $$;
create function pg_temp.card_id(label text) returns uuid language sql immutable as $$ select md5('booking-restore-fixture:'||label)::uuid $$;
create function pg_temp.card_assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Guest card restore: %',message; end if; end $$;
create function pg_temp.card_actor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.card_id(label)::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.card_id(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.card_original() returns jsonb language sql as $$ select jsonb_build_object('kind','save','id',pg_temp.card_id('card-active'),'revision',null,'name','Synthetic card original','email','restore-card@booking.invalid','phone','+41 61 000 00 00') $$;
create temp table restore_card_observation(facts jsonb);
grant select,insert on pg_temp.restore_card_observation to authenticated;
do $$ declare t text; begin
 perform pg_temp.card_assert((select count(*)=3 from booking_private.guest_cards_v1 where spot_id=pg_temp.card_id('spot')),'three populated cards required');
 perform pg_temp.card_assert((select count(*)=7 from booking_private.guest_card_requests_v1 where spot_id=pg_temp.card_id('spot')),'seven original request receipts required');
 perform pg_temp.card_assert((select count(*)=7 from booking_private.guest_card_events_v1 where spot_id=pg_temp.card_id('spot')),'seven original change events required');
 foreach t in array array['guest_cards_v1','guest_card_requests_v1','guest_card_events_v1'] loop
  perform pg_temp.card_assert((select relrowsecurity from pg_class where oid=('booking_private.'||t)::regclass),'RLS absent');
  perform pg_temp.card_assert(not has_table_privilege('anon','booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'anonymous raw grant');
  perform pg_temp.card_assert(not has_table_privilege('authenticated','booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'staff raw grant');
  perform pg_temp.card_assert(not has_table_privilege('service_role','booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'worker raw grant');
 end loop;
end $$;
set local role authenticated;
do $$ declare active jsonb; archived jsonb; detail jsonb; restored jsonb; outcome jsonb; begin
 perform pg_temp.card_actor('manager');
 active:=public.booking_console_guests_v1(pg_temp.card_id('spot'));
 archived:=public.booking_console_guests_v1(pg_temp.card_id('spot'),'',true);
 detail:=public.booking_console_guest_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-active'));
 restored:=public.booking_console_guest_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-restored'));
 perform pg_temp.card_assert(jsonb_array_length(active->'guests')=2 and jsonb_array_length(archived->'guests')=1,'archive directory membership');
 perform pg_temp.card_assert(detail#>>'{guest,name}'='Synthetic card corrected' and detail#>>'{guest,revision}'='1','correction/revision lost');
 perform pg_temp.card_assert(restored#>>'{guest,revision}'='2' and restored#>>'{guest,is_archived}'='false','restored lifecycle lost');
 perform pg_temp.card_assert(jsonb_array_length(detail->'events')=2 and jsonb_array_length(restored->'events')=3,'metadata history lost');
 perform pg_temp.card_assert((detail->'events')::text not like '%restore-card@booking.invalid%' and not (detail->'guest')?'owner_id','private projection leaked');
 perform pg_temp.card_actor('host');
 outcome:=public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-active-create'),pg_temp.card_original(),pg_temp.card_id('host'),true);
 perform pg_temp.card_assert(outcome->>'revision'='0','original create result replaced by current correction');
 perform pg_temp.card_assert(public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-active-create'),pg_temp.card_original(),pg_temp.card_id('host'))=outcome,'exact replay changed result');
 insert into pg_temp.restore_card_observation values(jsonb_build_object('active',active,'archived',archived,'detail',detail,'restored',restored,'originalOutcome',outcome));
 begin perform public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('wrong-actor'),pg_temp.card_original(),pg_temp.card_id('manager'),true); raise exception 'wrong operator accepted'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_guest_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-archived')); raise exception 'Host read archived card'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('stale-edit'),pg_temp.card_original()||'{"revision":0}'::jsonb,pg_temp.card_id('host')); raise exception 'stale revision accepted'; exception when serialization_failure then null; end;
 perform pg_temp.card_actor('viewer');
 perform pg_temp.card_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.card_id('spot'))->'guests')=2,'Viewer lost active access');
 begin perform public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('viewer-write'),pg_temp.card_original(),pg_temp.card_id('viewer')); raise exception 'Viewer wrote card'; exception when insufficient_privilege then null; end;
 perform pg_temp.card_actor('other');
 begin perform public.booking_console_guests_v1(pg_temp.card_id('spot')); raise exception 'outsider accessed directory'; exception when insufficient_privilege then null; end;
end $$;
-- Actual raw access denials, not just catalog inspection.
do $$ declare t text; begin
 foreach t in array array['guest_cards_v1','guest_card_requests_v1','guest_card_events_v1'] loop
  begin execute format('select count(*) from booking_private.%I',t); raise exception 'staff read private table'; exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
set local role service_role;
do $$ declare t text; begin
 foreach t in array array['guest_cards_v1','guest_card_requests_v1','guest_card_events_v1'] loop
  begin execute format('select count(*) from booking_private.%I',t); raise exception 'worker read private table'; exception when insufficient_privilege then null; end;
 end loop;
 begin perform public.booking_console_guests_v1(pg_temp.card_id('spot')); raise exception 'worker invoked directory'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.booking_console_guests_v1(pg_temp.card_id('spot')); raise exception 'anonymous directory'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- New operations work after restore, but this probe never commits them.
set local role authenticated;
do $$ declare r jsonb; begin
 perform pg_temp.card_actor('host');
 r:=public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('post-restore-edit'),pg_temp.card_original()||jsonb_build_object('revision',1,'name','Synthetic after restore'),pg_temp.card_id('host'));
 perform pg_temp.card_assert(r->>'revision'='2','fresh correction failed');
 perform pg_temp.card_actor('manager');
 r:=public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('post-restore-unarchive'),jsonb_build_object('kind','archive','id',pg_temp.card_id('card-archived'),'revision',1,'archived',false),pg_temp.card_id('manager'));
 perform pg_temp.card_assert(r->>'revision'='2' and r->>'is_archived'='false','fresh unarchive failed');
end $$;
reset role;
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.card_id('spot') and user_id=pg_temp.card_id('host');
set local role authenticated;
do $$ begin
 perform pg_temp.card_actor('host');
 begin perform public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-active-create'),pg_temp.card_original(),pg_temp.card_id('host'),true); raise exception 'revoked Host recovered receipt'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.spots set owner_id=pg_temp.card_id('new-owner') where id=pg_temp.card_id('spot');
set local role authenticated;
do $$ begin
 perform pg_temp.card_actor('new-owner');
 perform pg_temp.card_assert(jsonb_array_length(public.booking_console_guests_v1(pg_temp.card_id('spot'))->'guests')=0,'new Owner inherited old directory');
 begin perform public.booking_console_guest_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-active')); raise exception 'new Owner read prior card'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_guest_write_v1(pg_temp.card_id('spot'),pg_temp.card_id('card-active-create'),pg_temp.card_original(),pg_temp.card_id('new-owner'),true); raise exception 'new Owner recovered prior receipt'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select facts from pg_temp.restore_card_observation;
rollback;
