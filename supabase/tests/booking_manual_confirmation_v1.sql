-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
create function pg_temp.mail_id(label text) returns uuid language sql immutable as $$ select md5('booking-summary-fixture:'||label)::uuid $$;
create function pg_temp.mail_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to('booking-summary-fixture:'||label,'UTF8')),'hex') $$;
create function pg_temp.mail_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Booking mail: %',message; end if; end $$;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(pg_temp.mail_id('owner'),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','mail-owner@booking.invalid',now(),'','{}','{}',now(),now());
insert into public.spots(id,name,lat,lng,owner_id,status) values(pg_temp.mail_id('spot'),'Mail fixture',47.5,7.5,pg_temp.mail_id('owner'),'approved');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.mail_id('owner'),'role','authenticated')::text,true);
select public.booking_console_save_setup_v1(pg_temp.mail_id('spot'),0,jsonb_build_object('duration_minutes',60,'max_party_size',4,
 'areas',jsonb_build_array(jsonb_build_object('id',pg_temp.mail_id('area'),'name','Room','is_active',true)),
 'tables',jsonb_build_array(jsonb_build_object('id',pg_temp.mail_id('table'),'area_id',pg_temp.mail_id('area'),'label','1','seats',4,'is_active',true)),
 'services',jsonb_build_array(jsonb_build_object('id',pg_temp.mail_id('service'),'name','Day','weekdays',jsonb_build_array(0,1,2,3,4,5,6),'opens_at','00:00','closes_at','23:59','interval_minutes',30,'is_active',true))));
select public.booking_console_save_public_settings_v1(pg_temp.mail_id('spot'),1,true,array[pg_temp.mail_id('service')],60,90,120,'confirmed','privacy@booking.invalid');
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select pg_temp.mail_id(x),x||'@booking.invalid',clock_timestamp(),'{}','{}' from unnest(array['manager','host','viewer','other','new-owner']) x;
insert into public.booking_team_members(spot_id,user_id,owner_id,role)
 select pg_temp.mail_id('spot'),pg_temp.mail_id(x),pg_temp.mail_id('owner'),x from unnest(array['manager','host','viewer']) x;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
select public.booking_console_create_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('manual'),pg_temp.mail_id('service'),pg_temp.mail_id('table'),array[pg_temp.mail_id('table')],null,
 (((now() at time zone 'Europe/Zurich')::date+1+time '13:00') at time zone 'Europe/Zurich'),60,2,'Synthetic manual guest','+41 61 555 00 00','PRIVATE_MANUAL_NOTE','phone','confirmed') as manual \gset
select public.booking_console_create_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('pending'),pg_temp.mail_id('service'),pg_temp.mail_id('table'),array[pg_temp.mail_id('table')],null,
 (((now() at time zone 'Europe/Zurich')::date+1+time '15:00') at time zone 'Europe/Zurich'),60,2,'Synthetic request',null,null,'email','pending') as pending \gset
select set_config('summary.manual.id',:'manual'::jsonb->>'id',true);
select set_config('summary.pending.id',:'pending'::jsonb->>'id',true);
reset role;
create function pg_temp.summary(op text,rev bigint,email text,actor text default 'owner',reservation text default 'manual') returns jsonb language sql as $$
 select public.booking_mail_summary_v1(pg_temp.mail_id(actor),pg_temp.mail_id('spot'),current_setting('summary.'||reservation||'.id')::uuid,pg_temp.mail_id(op),rev,email);
$$;
select pg_temp.mail_assert(not has_table_privilege('authenticated','booking_private.guest_mail_outbox_v1','SELECT,INSERT,UPDATE,DELETE'),'private outbox exposed');
select pg_temp.mail_assert((select relrowsecurity from pg_class where oid='booking_private.guest_mail_outbox_v1'::regclass),'outbox RLS missing');
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_mail_summary_v1(uuid,uuid,uuid,uuid,bigint,text)','execute'),'anonymous summary write');
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_mail_summary_recover_v1(uuid,uuid,uuid,uuid,bigint,text)','execute'),'actor impersonation');
select pg_temp.mail_assert(not has_function_privilege('authenticated','booking_private.mail_snapshot_for_outbox_v1(booking_private.guest_mail_outbox_v1)','execute'),'private recipient context exposed');
set local role authenticated;
select pg_temp.mail_assert(public.booking_console_read_v1(pg_temp.mail_id('spot'),current_date)#>>'{capabilities,manual_guest_mail}'='true','manual capability missing');
do $$ begin begin perform pg_temp.summary('denied-client',0,'guest@booking.invalid');raise exception 'client could dispatch';exception when insufficient_privilege then null;end;end $$;
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_summary_recover_v1(pg_temp.mail_id('owner'),pg_temp.mail_id('spot'),current_setting('summary.manual.id')::uuid,pg_temp.mail_id('first'),0,'guest@booking.invalid') is null,'absent request falsely settled');
select pg_temp.summary('first',0,'guest@booking.invalid') as first \gset
select set_config('summary.first.message',:'first'::jsonb->>'message_id',true);
select pg_temp.mail_assert(:'first'::jsonb->>'revision'='1','revision-zero manual issuance');
select pg_temp.mail_assert(pg_temp.summary('first',0,'guest@booking.invalid')=:'first'::jsonb,'duplicate summary');
select pg_temp.mail_assert(public.booking_mail_summary_recover_v1(pg_temp.mail_id('owner'),pg_temp.mail_id('spot'),current_setting('summary.manual.id')::uuid,pg_temp.mail_id('first'),0,'guest@booking.invalid')=:'first'::jsonb,'lost response recovery');
select pg_temp.mail_assert((select count(*)=1 from booking_private.guest_mail_outbox_v1 where reservation_id=current_setting('summary.manual.id')::uuid),'duplicate outbox');
select pg_temp.mail_assert(not exists(select 1 from booking_private.guest_access_v1 where reservation_id=current_setting('summary.manual.id')::uuid),'invented guest access');
select pg_temp.mail_assert((select guest_contact='+41 61 555 00 00' and note='PRIVATE_MANUAL_NOTE' from public.booking_reservations where id=current_setting('summary.manual.id')::uuid),'manual contacts overwritten');
select pg_temp.mail_assert(not exists(select 1 from booking_private.guest_mail_outbox_v1 where reservation_id=current_setting('summary.manual.id')::uuid and (manual_summary ? 'sealed_key' or manual_summary ? 'key_hash' or manual_summary ? 'cancellation_deadline' or manual_summary ? 'guest_notice')),'invented terms or credentials');
select pg_temp.mail_assert(not exists(select 1 from public.booking_audit_events where reservation_id=current_setting('summary.manual.id')::uuid and (details::text like '%guest@booking.invalid%' or details::text like '%PRIVATE_MANUAL_NOTE%')),'audit leaked private text');
do $$ begin
 begin perform pg_temp.summary('first',0,'changed@booking.invalid');raise exception 'nonce reused for new recipient';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.summary('first',0,'guest@booking.invalid','host');raise exception 'cross actor replay';exception when invalid_parameter_value then null;end;
 begin perform pg_temp.summary('viewer-write',1,'guest@booking.invalid','viewer');raise exception 'viewer wrote';exception when insufficient_privilege then null;end;
 begin perform pg_temp.summary('other-write',1,'guest@booking.invalid','other');raise exception 'outsider wrote';exception when insufficient_privilege then null;end;
 begin perform pg_temp.summary('invalid-email',1,E'guest@booking.invalid\nBcc:private@example.test');raise exception 'header injection';exception when invalid_parameter_value then null;end;
 begin update booking_private.guest_mail_outbox_v1 set manual_summary=jsonb_set(manual_summary,'{email}','"forged@booking.invalid"') where id=current_setting('summary.first.message')::uuid;raise exception 'summary mutable';exception when check_violation then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('viewer')::text,true);
select pg_temp.mail_assert(public.booking_console_mail_v2(pg_temp.mail_id('spot'),current_setting('summary.manual.id')::uuid)#>>'{messages,0,recipient}'='guest@booking.invalid','scoped staff recipient missing');
select pg_temp.mail_assert(not (public.booking_console_mail_v1(pg_temp.mail_id('spot'),current_setting('summary.manual.id')::uuid)#>'{messages,0}' ? 'recipient'),'legacy recipient boundary widened');
select set_config('request.jwt.claim.sub',pg_temp.mail_id('other')::text,true);
do $$ begin begin perform public.booking_console_mail_v2(pg_temp.mail_id('spot'),current_setting('summary.manual.id')::uuid);raise exception 'outsider saw recipients';exception when insufficient_privilege then null;end;end $$;
set local role service_role;
select public.booking_mail_claim_v1(pg_temp.mail_id('lease')) as claim \gset
select pg_temp.mail_assert(:'claim'::jsonb#>>'{snapshot,message_mode}'='manual_summary' and :'claim'::jsonb#>>'{snapshot,email}'='guest@booking.invalid','manual worker context missing');
select pg_temp.mail_assert(public.booking_mail_prepare_v1((:'claim'::jsonb->>'id')::uuid,pg_temp.mail_id('lease'),:'claim'::jsonb->>'context_hash',repeat('synthetic-payload-',5),repeat('a',64)),'manual prepare failed');
select pg_temp.mail_assert(public.booking_mail_begin_v1((:'claim'::jsonb->>'id')::uuid,pg_temp.mail_id('lease'),repeat('a',64)) is not null,'manual begin failed');
select public.booking_mail_finish_v1((:'claim'::jsonb->>'id')::uuid,pg_temp.mail_id('lease'),'accepted','summary-fixture-provider');
select public.booking_mail_event_v1('summary-fixture-bounce',(:'claim'::jsonb->>'id')::uuid,'summary-fixture-provider','bounced',clock_timestamp());
do $$ begin begin perform pg_temp.summary('blocked-recipient',1,'guest@booking.invalid');raise exception 'known bounce bypassed';exception when invalid_parameter_value then if sqlerrm<>'booking_mail_recipient_blocked' then raise;end if;end;end $$;
select pg_temp.summary('corrected',1,'corrected@booking.invalid','manager') as corrected \gset
select pg_temp.mail_assert(:'corrected'::jsonb->>'revision'='2','corrected explicit recipient failed');
select pg_temp.mail_assert(pg_temp.summary('stale',1,'another@booking.invalid')->>'not_committed'='true','stale summary could overwrite');
select pg_temp.mail_assert(pg_temp.summary('first',0,'guest@booking.invalid')=:'first'::jsonb,'historical outcome lost after newer state');
select pg_temp.summary('host-pending',0,'pending@booking.invalid','host','pending') as host_message \gset
reset role;
update public.booking_team_members set revoked_at=clock_timestamp() where spot_id=pg_temp.mail_id('spot') and user_id=pg_temp.mail_id('host');
set local role service_role;
do $$ begin begin perform pg_temp.summary('host-pending',0,'pending@booking.invalid','host','pending');raise exception 'revoked host replay';exception when insufficient_privilege then null;end;end $$;
select pg_temp.mail_assert((select booking_private.mail_snapshot_for_outbox_v1(o) is null from booking_private.guest_mail_outbox_v1 o where id=(:'host_message'::jsonb->>'message_id')::uuid),'revoked host could dispatch');
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.mail_id('owner'),'write_suspension','summary_fixture');
set local role service_role;
do $$ begin begin perform pg_temp.summary('owner-safety',2,'next@booking.invalid','manager');raise exception 'owner Safety bypassed';exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise;end if;end;end $$;
reset role;
update public.safety_account_measures set status='revoked' where reason_code='summary_fixture';
update public.spots set owner_id=pg_temp.mail_id('new-owner') where id=pg_temp.mail_id('spot');
set local role service_role;
do $$ begin begin perform pg_temp.summary('first',0,'guest@booking.invalid');raise exception 'old owner replay';exception when insufficient_privilege then null;end;end $$;
select pg_temp.mail_assert((select booking_private.mail_snapshot_for_outbox_v1(o) is null from booking_private.guest_mail_outbox_v1 o where id=(:'corrected'::jsonb->>'message_id')::uuid),'former manager dispatch after transfer');
reset role;
rollback;
