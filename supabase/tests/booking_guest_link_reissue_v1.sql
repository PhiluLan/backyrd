-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
create function pg_temp.mail_id(label text) returns uuid language sql immutable as $$ select md5('booking-reissue-fixture:'||label)::uuid $$;
create function pg_temp.mail_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to('booking-reissue-fixture:'||label,'UTF8')),'hex') $$;
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
select pg_temp.mail_id(x),x||'@booking.invalid',clock_timestamp(),'{}','{}' from unnest(array['host','viewer','other','new-owner']) x;
insert into public.booking_team_members(spot_id,user_id,owner_id,role)
 select pg_temp.mail_id('spot'),pg_temp.mail_id(x),pg_temp.mail_id('owner'),x from unnest(array['host','viewer']) x;
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_mail_reissue_v1(uuid,uuid,uuid,uuid,bigint,text,text,text)','execute'),'operator could inject a credential');
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_mail_reissue_recover_v1(uuid,uuid,uuid,uuid,bigint,text)','execute'),'anonymous recovery');
select pg_temp.mail_assert(not has_function_privilege('authenticated','booking_private.assert_console_actor_v1(uuid,uuid,text)','execute'),'operator can impersonate another actor');
set local role service_role;
select public.booking_guest_create_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('original'),1,
 (((now() at time zone 'Europe/Zurich')::date+1+time '12:00') at time zone 'Europe/Zurich'),2,
 'Synthetic guest','old@booking.invalid',pg_temp.mail_hash('original-key'),repeat('sealed-original-',5)) as guest \gset
select set_config('booking.reissue.reservation',:'guest'::jsonb->>'id',true);
create function pg_temp.reissue(op text,rev bigint,email text,key text,actor text default 'owner') returns jsonb language sql as $$
 select public.booking_mail_reissue_v1(pg_temp.mail_id(actor),pg_temp.mail_id('spot'),current_setting('booking.reissue.reservation')::uuid,pg_temp.mail_id(op),rev,
  booking_private.mail_recipient_hash_v1(email),pg_temp.mail_hash(key),repeat('sealed-reissued-',5));
$$;
select to_jsonb(a)-'key_hash'-'sealed_key'-'revoked_at'-'delivery_blocked_at'-'delivery_blocked_recipient_hash' as terms from booking_private.guest_access_v1 a where reservation_id=(:'guest'::jsonb->>'id')::uuid \gset
select pg_temp.mail_assert(public.booking_mail_reissue_recover_v1(pg_temp.mail_id('owner'),pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid,pg_temp.mail_id('issue-one'),0,booking_private.mail_recipient_hash_v1('old@booking.invalid')) is null,'recovery invented commit');
select pg_temp.reissue('issue-one',0,'old@booking.invalid','key-one') as one \gset
select pg_temp.mail_assert(:'one'::jsonb->>'revision'='1','reissue revision incorrect');
select pg_temp.mail_assert(:'one'::jsonb=pg_temp.reissue('issue-one',0,'old@booking.invalid','DIFFERENT_RANDOM_KEY'),'replay rotated credential or duplicated intent');
select pg_temp.mail_assert((select key_hash=pg_temp.mail_hash('key-one') from booking_private.guest_access_v1 where reservation_id=(:'guest'::jsonb->>'id')::uuid),'random retry replaced committed capability');
select pg_temp.mail_assert((select to_jsonb(a)-'key_hash'-'sealed_key'-'revoked_at'-'delivery_blocked_at'-'delivery_blocked_recipient_hash' from booking_private.guest_access_v1 a where reservation_id=(:'guest'::jsonb->>'id')::uuid)=:'terms'::jsonb,'reissue changed promised terms or expiry');
select pg_temp.mail_assert((select count(*)=2 from booking_private.guest_mail_outbox_v1 where reservation_id=(:'guest'::jsonb->>'id')::uuid),'reissue did not enqueue exactly once');
select pg_temp.mail_assert((select count(*)=1 from booking_private.guest_mail_outbox_v1 where reservation_id=(:'guest'::jsonb->>'id')::uuid and state='pending'),'obsolete pending intent not stopped');
do $$ begin
 begin perform public.booking_guest_read_v1(current_setting('booking.reissue.reservation')::uuid,pg_temp.mail_hash('original-key')); raise exception 'old capability survived reissue'; exception when no_data_found then null; end;
 begin perform pg_temp.reissue('issue-one',1,'old@booking.invalid','different'); raise exception 'nonce accepted changed revision'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.reissue('issue-one',0,'old@booking.invalid','different','host'); raise exception 'another actor replayed operation'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.reissue('original',1,'old@booking.invalid','different'); raise exception 'creation nonce reused'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.reissue('viewer-op',1,'old@booking.invalid','different','viewer'); raise exception 'viewer issued credential'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.reissue('foreign-op',1,'old@booking.invalid','different','other'); raise exception 'outsider issued credential'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.mail_assert(public.booking_guest_read_v1((:'guest'::jsonb->>'id')::uuid,pg_temp.mail_hash('key-one'))->>'revision'='1','new capability unusable');
select public.booking_mail_claim_v1(pg_temp.mail_id('old-lease')) as old_job \gset
select public.booking_mail_prepare_v1((:'old_job'::jsonb->>'id')::uuid,pg_temp.mail_id('old-lease'),:'old_job'::jsonb->>'context_hash',repeat('sealed-payload-',5),repeat('a',64));
select pg_temp.mail_assert((select recipient_hash=booking_private.mail_recipient_hash_v1('old@booking.invalid') from booking_private.guest_mail_outbox_v1 where id=(:'old_job'::jsonb->>'id')::uuid),'prepared recipient not frozen');
select public.booking_mail_begin_v1((:'old_job'::jsonb->>'id')::uuid,pg_temp.mail_id('old-lease'),repeat('a',64));
select public.booking_mail_finish_v1((:'old_job'::jsonb->>'id')::uuid,pg_temp.mail_id('old-lease'),'accepted','old-provider');

-- Correct contact through the real amendment API, then explicitly issue anew.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
create function pg_temp.correct_contact(email text,rev bigint,nonce text) returns void language plpgsql as $$ declare r jsonb; begin
 select value into r from jsonb_array_elements(public.booking_console_read_v1(pg_temp.mail_id('spot'),(now() at time zone 'Europe/Zurich')::date+1)->'reservations') where value->>'id'=current_setting('booking.reissue.reservation');
 perform public.booking_console_amend_v2(pg_temp.mail_id('spot'),(r->>'id')::uuid,pg_temp.mail_id(nonce),rev,(r->>'service_id')::uuid,(r->>'table_id')::uuid,array[(r->>'table_id')::uuid],null,(r->>'starts_at')::timestamptz,60,2,r->>'guest_name',email,null);
end $$;
select pg_temp.correct_contact('new@booking.invalid',1,'correct-one');
set local role service_role;
select pg_temp.reissue('issue-two',2,'new@booking.invalid','key-two') as two \gset
select public.booking_mail_event_v1('old-bounce',(:'old_job'::jsonb->>'id')::uuid,'old-provider','bounced',clock_timestamp());
select pg_temp.mail_assert((select delivery_blocked_at is null from booking_private.guest_access_v1 where reservation_id=(:'guest'::jsonb->>'id')::uuid),'old recipient bounce blocked corrected email');
select pg_temp.mail_assert((select state='pending' from booking_private.guest_mail_outbox_v1 where id=(:'two'::jsonb->>'message_id')::uuid),'old bounce suppressed new intent');
select public.booking_mail_claim_v1(pg_temp.mail_id('new-lease')) as new_job \gset
select public.booking_mail_prepare_v1((:'new_job'::jsonb->>'id')::uuid,pg_temp.mail_id('new-lease'),:'new_job'::jsonb->>'context_hash',repeat('sealed-new-payload-',4),repeat('b',64));
select public.booking_mail_begin_v1((:'new_job'::jsonb->>'id')::uuid,pg_temp.mail_id('new-lease'),repeat('b',64));
select public.booking_mail_finish_v1((:'new_job'::jsonb->>'id')::uuid,pg_temp.mail_id('new-lease'),'accepted','new-provider');
select public.booking_mail_event_v1('new-bounce',(:'new_job'::jsonb->>'id')::uuid,'new-provider','bounced',clock_timestamp());
select pg_temp.mail_assert((select delivery_blocked_recipient_hash=booking_private.mail_recipient_hash_v1('new@booking.invalid') from booking_private.guest_access_v1 where reservation_id=(:'guest'::jsonb->>'id')::uuid),'current-recipient bounce did not block');
do $$ begin
 begin perform pg_temp.reissue('blocked',3,'new@booking.invalid','blocked-key'); raise exception 'same bounced recipient unblocked'; exception when invalid_parameter_value then if sqlerrm<>'booking_mail_recipient_blocked' then raise; end if; end;
 begin update booking_private.guest_mail_outbox_v1 set recipient_hash=repeat('d',64) where id=(select id from booking_private.guest_mail_outbox_v1 where provider_id='new-provider'); raise exception 'recipient binding mutable'; exception when check_violation then null; end;
end $$;
select pg_temp.mail_assert(public.booking_guest_read_v1((:'guest'::jsonb->>'id')::uuid,pg_temp.mail_hash('key-two'))->>'revision'='3','bounce revoked legitimate self-service');
set local role authenticated;
select pg_temp.correct_contact('third@booking.invalid',3,'correct-two');
set local role service_role;
select pg_temp.reissue('issue-three',4,'third@booking.invalid','key-three') as three \gset
select pg_temp.mail_assert((select delivery_blocked_at is null and delivery_blocked_recipient_hash is null from booking_private.guest_access_v1 where reservation_id=(:'guest'::jsonb->>'id')::uuid),'different corrected recipient remained blocked');
select pg_temp.mail_assert(:'three'::jsonb=pg_temp.reissue('issue-three',4,'third@booking.invalid','random-again'),'quota blocked exact replay');
do $$ begin
 begin perform pg_temp.reissue('fourth',5,'third@booking.invalid','fourth-key'); raise exception 'per-reservation quota bypassed'; exception when invalid_parameter_value then if sqlerrm<>'booking_mail_reissue_rate_limited' then raise; end if; end;
end $$;

reset role;
select pg_temp.mail_assert((select count(*)=3 from public.booking_audit_events where reservation_id=(:'guest'::jsonb->>'id')::uuid and action='guest_link_reissued'),'missing or duplicated issue audit');
select pg_temp.mail_assert(not exists(select 1 from public.booking_audit_events where reservation_id=(:'guest'::jsonb->>'id')::uuid and details::text ~ 'sealed-|@booking.invalid|key-three'),'audit leaked recipient or credentials');
-- Replay remains subject to current membership, ownership and both Safety actors.
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.mail_id('owner'),'write_suspension','booking_reissue_fixture');
set local role service_role;
do $$ begin begin perform pg_temp.reissue('issue-three',4,'third@booking.invalid','random'); raise exception 'replay bypassed owner Safety'; exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise; end if; end; end $$;
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.mail_id('owner') and reason_code='booking_reissue_fixture';
update public.booking_team_members set revoked_at=clock_timestamp() where user_id=pg_temp.mail_id('host');
set local role service_role;
do $$ begin begin perform pg_temp.reissue('revoked-op',5,'third@booking.invalid','random','host'); raise exception 'revoked host issued link'; exception when insufficient_privilege then null; end; end $$;
reset role;
update public.spots set owner_id=pg_temp.mail_id('new-owner') where id=pg_temp.mail_id('spot');
set local role service_role;
do $$ begin begin perform pg_temp.reissue('issue-three',4,'third@booking.invalid','random'); raise exception 'old owner replayed after transfer'; exception when insufficient_privilege then null; end; end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin begin perform pg_temp.reissue('forged-role',5,'third@booking.invalid','random'); raise exception 'forged role injected credential'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
