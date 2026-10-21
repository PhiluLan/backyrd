-- Rolled-back source/target pacing acceptance. Local synthetic drill only.
begin;
do $$ begin if current_setting('backyrd.booking_restore_fixture',true) is distinct from 'isolated' then raise exception 'isolated_restore_fixture_required';end if;end $$;
create function pg_temp.aid(label text) returns uuid language sql immutable as $$ select md5('booking-restore-fixture:'||label)::uuid $$;
create function pg_temp.aassert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Arrival restore: %',msg;end if;end $$;
create function pg_temp.aactor(label text) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub',pg_temp.aid(label)::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.aid(label),'role','authenticated')::text,true);
end $$;
create function pg_temp.asave(request text,revision bigint,minutes integer,guests integer,recover boolean default false) returns jsonb language sql as $$
 select public.booking_console_save_arrival_limit_v1(pg_temp.aid('spot'),pg_temp.aid(request),revision,minutes,guests,auth.uid(),recover) $$;
create temp table arrival_restore_observation(value jsonb);
create temp table arrival_restore_original as select request_id,outcome from booking_private.arrival_limit_requests_v1 where spot_id=pg_temp.aid('spot');
create temp table arrival_restore_bookings as select id,to_jsonb(r) facts from public.booking_reservations r;
grant select on pg_temp.arrival_restore_original to authenticated;
grant select,insert on pg_temp.arrival_restore_observation to authenticated;
do $$ declare t text; r text; starts timestamptz; begin
 perform pg_temp.aassert((select count(*)=1 from booking_private.arrival_limits_v1 where spot_id=pg_temp.aid('spot')),'one populated policy required');
 perform pg_temp.aassert((select count(*)=5 from booking_private.arrival_limit_requests_v1 where spot_id=pg_temp.aid('spot')),'five original policy receipts required');
 perform pg_temp.aassert((select count(*)=4 from public.booking_audit_events where spot_id=pg_temp.aid('spot') and action='arrival_limit_saved'),'four policy changes required');
 select starts_at into strict starts from public.booking_reservations where spot_id=pg_temp.aid('spot') and request_id=pg_temp.aid('manual');
 perform set_config('restore.arrival_start',starts::text,true);perform set_config('restore.arrival_day',(starts at time zone 'Europe/Zurich')::date::text,true);
 foreach t in array array['arrival_limits_v1','arrival_limit_requests_v1'] loop
  perform pg_temp.aassert((select relrowsecurity from pg_class where oid=('booking_private.'||t)::regclass),'RLS absent');
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.aassert(not has_table_privilege(r,'booking_private.'||t,'SELECT,INSERT,UPDATE,DELETE'),'raw grant restored');
   execute format('set local role %I',r);
   begin execute format('select count(*) from booking_private.%I',t);raise exception 'raw policy read';exception when insufficient_privilege then null;end;
   reset role;
  end loop;
 end loop;
end $$;
set local role authenticated;
do $$ declare policy jsonb; review jsonb; original jsonb:='{}'; op record; outcome jsonb; before_time timestamptz; begin
 for op in select * from (values ('arrival-first','owner',0,30,8,1),('arrival-lower','manager',1,60,1,2),('arrival-noop','manager',2,60,1,2),('arrival-disable','manager',2,15,null::integer,3),('arrival-enable','manager',3,30,1,4))x(request,actor,revision,minutes,guests,result_revision) loop
  perform pg_temp.aactor(op.actor);
  outcome:=pg_temp.asave(op.request,op.revision,op.minutes,op.guests,true);
  perform pg_temp.aassert(outcome=(select o.outcome from pg_temp.arrival_restore_original o where o.request_id=pg_temp.aid(op.request)),'recovery replaced original response');
  perform pg_temp.aassert((outcome->>'revision')::bigint=op.result_revision,'original revision lost');
  perform pg_temp.aassert(pg_temp.asave(op.request,op.revision,op.minutes,op.guests)=outcome,'exact replay changed response');
  original:=original||jsonb_build_object(op.request,outcome);
 end loop;
 perform pg_temp.aactor('manager');policy:=public.booking_console_arrival_limit_v1(pg_temp.aid('spot'));
 perform pg_temp.aassert(policy->>'revision'='4' and policy->>'window_minutes'='30' and policy->>'max_guests'='1','current enabled rule lost');
 before_time:=clock_timestamp();review:=public.booking_console_arrival_review_v1(pg_temp.aid('spot'),current_setting('restore.arrival_day')::date);
 perform pg_temp.aassert((review->>'observed_at')::timestamptz>=before_time and (review->>'observed_at')::timestamptz<=clock_timestamp(),'live observation time invalid');
 perform pg_temp.aassert(review->'policy'=policy and review#>>'{totals,reservations}'='7' and review#>>'{totals,guests}'='14' and review#>>'{totals,excluded_reservations}'='0','current policy/facts review changed');
 perform pg_temp.aassert((select count(*)=7 from jsonb_array_elements(review->'windows')w where (w->>'guests')::integer>1),'lower limit rewrote existing planning facts');
 perform pg_temp.aassert(review::text not like '%PRIVATE_%' and review::text not like '%guest_name%' and review::text not like '%guest_contact%','review projection leaked');
 begin perform pg_temp.asave('arrival-first',0,30,9,true);raise exception 'changed intent accepted';exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise;end if;end;
 begin perform pg_temp.asave('stale-after-restore',3,30,9);raise exception 'stale revision accepted';exception when serialization_failure then null;end;
 begin perform public.booking_console_save_arrival_limit_v1(pg_temp.aid('spot'),pg_temp.aid('wrong-policy-actor'),4,30,9,pg_temp.aid('owner'),true);raise exception 'actor mismatch accepted';exception when insufficient_privilege then null;end;
 perform pg_temp.aactor('host');
 perform pg_temp.aassert(public.booking_console_arrival_limit_v1(pg_temp.aid('spot'))=policy,'Host read lost');
 begin perform pg_temp.asave('host-policy',4,30,9);raise exception 'Host configured policy';exception when insufficient_privilege then null;end;
 perform pg_temp.aactor('viewer');
 perform pg_temp.aassert(public.booking_console_arrival_limit_v1(pg_temp.aid('spot'))=policy,'Viewer read lost');
 begin perform pg_temp.asave('viewer-policy',4,30,9);raise exception 'Viewer configured policy';exception when insufficient_privilege then null;end;
 perform pg_temp.aactor('other');
 begin perform public.booking_console_arrival_review_v1(pg_temp.aid('spot'),current_setting('restore.arrival_day')::date);raise exception 'outsider review';exception when insufficient_privilege then null;end;
 insert into pg_temp.arrival_restore_observation values(jsonb_build_object('policy',policy,'review',review,'original',original));
end $$;
reset role;
-- Recovery/replay is read-only: receipts, policy and audit stay unchanged.
select pg_temp.aassert((select count(*)=5 from booking_private.arrival_limit_requests_v1 where spot_id=pg_temp.aid('spot')) and (select count(*)=4 from public.booking_audit_events where spot_id=pg_temp.aid('spot') and action='arrival_limit_saved'),'replay duplicated policy history');
set local role service_role;
do $$ begin
 begin perform public.booking_console_arrival_limit_v1(pg_temp.aid('spot'));raise exception 'worker policy RPC';exception when insufficient_privilege then null;end;
 begin perform public.booking_console_arrival_review_v1(pg_temp.aid('spot'),current_setting('restore.arrival_day')::date);raise exception 'worker review RPC';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.booking_console_arrival_limit_v1(pg_temp.aid('spot'));raise exception 'anonymous policy RPC';exception when insufficient_privilege then null;end;end $$;
reset role;
-- Actual writes work after restoration. A free physical table cannot bypass the
-- current intake cap; raising the cap permits one new booking. Roll these proof
-- writes back separately before checking the complete saved public inventory.
savepoint arrival_restore_fresh_writes;
set local role authenticated;
do $$ declare outcome jsonb; begin
 perform pg_temp.aactor('host');
 begin perform public.booking_console_create_v2(pg_temp.aid('spot'),pg_temp.aid('post-restore-full'),pg_temp.aid('service'),pg_temp.aid('table-extra'),array[pg_temp.aid('table-extra')],null,current_setting('restore.arrival_start')::timestamptz,60,1,'Synthetic after restore',null,null,'phone','confirmed');raise exception 'restored cap bypass';exception when invalid_parameter_value then if sqlerrm<>'booking_arrival_limit_exceeded' then raise;end if;end;
 perform pg_temp.aactor('manager');outcome:=pg_temp.asave('post-restore-policy',4,30,4);perform pg_temp.aassert(outcome->>'revision'='5','new policy change failed');
 perform pg_temp.aassert(pg_temp.asave('post-restore-policy',4,30,4,true)=outcome,'new original receipt not recoverable');
 perform pg_temp.aactor('host');outcome:=public.booking_console_create_v2(pg_temp.aid('spot'),pg_temp.aid('post-restore-booking'),pg_temp.aid('service'),pg_temp.aid('table-extra'),array[pg_temp.aid('table-extra')],null,current_setting('restore.arrival_start')::timestamptz,60,1,'Synthetic after restore',null,null,'phone','confirmed');
 perform pg_temp.aassert(outcome->>'id' is not null,'new booking missing');
end $$;
reset role;
rollback to savepoint arrival_restore_fresh_writes;
release savepoint arrival_restore_fresh_writes;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.aid('owner'),'write_suspension','arrival_restore_fixture');
set local role authenticated;
do $$ begin perform pg_temp.aactor('manager');begin perform pg_temp.asave('arrival-lower',1,60,1,true);raise exception 'Safety recovery bypass';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;end $$;
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.aid('owner') and reason_code='arrival_restore_fixture';
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.aid('spot') and user_id=pg_temp.aid('manager');
set local role authenticated;
do $$ begin perform pg_temp.aactor('manager');begin perform pg_temp.asave('arrival-lower',1,60,1,true);raise exception 'revoked Manager recovered';exception when insufficient_privilege then null;end;end $$;
reset role;
update public.spots set owner_id=pg_temp.aid('new-owner') where id=pg_temp.aid('spot');
set local role authenticated;
do $$ declare policy jsonb; begin perform pg_temp.aactor('new-owner');
 policy:=public.booking_console_arrival_limit_v1(pg_temp.aid('spot'));perform pg_temp.aassert(policy->>'revision'='4' and policy->>'max_guests'='1','resource configuration lost on Owner handover');
 begin perform pg_temp.asave('arrival-first',0,30,8,true);raise exception 'new Owner recovered old actor receipt';exception when invalid_parameter_value then if sqlerrm<>'booking_request_reused' then raise;end if;end;
 perform pg_temp.aactor('owner');begin perform public.booking_console_arrival_limit_v1(pg_temp.aid('spot'));raise exception 'old Owner retained access';exception when insufficient_privilege then null;end;
end $$;
reset role;
select pg_temp.aassert(not exists((select id,to_jsonb(r) facts from public.booking_reservations r) except (select id,facts from arrival_restore_bookings)) and not exists((select id,facts from arrival_restore_bookings) except (select id,to_jsonb(r) facts from public.booking_reservations r)),'probe changed saved bookings');
select value from arrival_restore_observation;
rollback;
