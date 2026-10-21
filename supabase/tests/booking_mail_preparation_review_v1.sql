-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
create function pg_temp.mail_id(label text) returns uuid language sql immutable as $$ select md5('booking-mail-fixture:'||label)::uuid $$;
create function pg_temp.mail_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to('booking-mail-fixture:'||label,'UTF8')),'hex') $$;
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
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_mail_claim_v1(uuid)','execute'),'anonymous claim');
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_mail_prepare_v1(uuid,uuid,text,text,text)','execute'),'operator payload injection');
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_mail_begin_v1(uuid,uuid,text)','execute'),'operator dispatch');
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_mail_finish_v1(uuid,uuid,text,text)','execute'),'anonymous fake acceptance');
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_mail_event_v1(text,uuid,text,text,timestamptz)','execute'),'operator fake delivery');
select pg_temp.mail_assert(not has_table_privilege('authenticated','booking_private.guest_mail_events_v1','SELECT,INSERT,UPDATE,DELETE'),'delivery ledger exposed');
select pg_temp.mail_assert((select relrowsecurity from pg_class where oid='booking_private.guest_mail_events_v1'::regclass),'delivery ledger lacks RLS');
set local role anon;
do $$ begin begin perform public.booking_mail_claim_v1(pg_temp.mail_id('denied')); raise exception 'anonymous claim accepted'; exception when insufficient_privilege then null; end; end $$;
set local role authenticated;
do $$ begin begin perform public.booking_mail_event_v1('forged',pg_temp.mail_id('forged'),'forged','delivered',now()); raise exception 'forged delivery accepted'; exception when insufficient_privilege then null; end; end $$;
set local role service_role;
create function pg_temp.mail_create(label text,hour integer,keyhash text) returns jsonb language sql as $$
 select public.booking_guest_create_v1(pg_temp.mail_id('spot'),pg_temp.mail_id(label),1,(((now() at time zone 'Europe/Zurich')::date+1+make_time(hour,0,0)) at time zone 'Europe/Zurich'),2,'Synthetic guest',label||'@booking.invalid',keyhash,repeat('sealed-fixture-',5));
$$;
select pg_temp.mail_create('one',10,pg_temp.mail_hash('one')) as one \gset
select pg_temp.mail_create('two',12,pg_temp.mail_hash('two')) as two \gset
select pg_temp.mail_create('three',14,pg_temp.mail_hash('three')) as three \gset

-- A broken/preparation-only job can be quarantined without lying about a send.
select public.booking_mail_claim_v1(pg_temp.mail_id('unprepared-lease')) as unprepared \gset
select pg_temp.mail_assert(not public.booking_mail_finish_v1((:'unprepared'::jsonb->>'id')::uuid,pg_temp.mail_id('wrong-lease'),'review'),'foreign worker quarantined lease');
select pg_temp.mail_assert(not public.booking_mail_finish_v1((:'unprepared'::jsonb->>'id')::uuid,pg_temp.mail_id('unprepared-lease'),'rejected'),'unattempted message fabricated provider rejection');
select pg_temp.mail_assert(public.booking_mail_finish_v1((:'unprepared'::jsonb->>'id')::uuid,pg_temp.mail_id('unprepared-lease'),'review'),'unprepared payload could not enter review');
select pg_temp.mail_assert((select state='review_required' and first_attempt_at is null and attempts=0 and payload_sealed is null from booking_private.guest_mail_outbox_v1 where id=(:'unprepared'::jsonb->>'id')::uuid),'preparation review fabricated dispatch');
select public.booking_mail_claim_v1(pg_temp.mail_id('prepared-review-lease')) as prepared \gset
select public.booking_mail_prepare_v1((:'prepared'::jsonb->>'id')::uuid,pg_temp.mail_id('prepared-review-lease'),:'prepared'::jsonb->>'context_hash',repeat('sealed-review-payload-',4),repeat('a',64));
select pg_temp.mail_assert(not public.booking_mail_finish_v1((:'prepared'::jsonb->>'id')::uuid,pg_temp.mail_id('prepared-review-lease'),'accepted','fake-provider'),'provider accepted before dispatch');
select pg_temp.mail_assert(public.booking_mail_finish_v1((:'prepared'::jsonb->>'id')::uuid,pg_temp.mail_id('prepared-review-lease'),'review'),'frozen payload review failed');
select pg_temp.mail_assert((select first_attempt_at is null and attempts=0 and payload_sealed is not null from booking_private.guest_mail_outbox_v1 where id=(:'prepared'::jsonb->>'id')::uuid),'prepared review lost body or invented attempt');
select public.booking_mail_claim_v1(pg_temp.mail_id('provider-suppressed-lease')) as suppressed \gset
select public.booking_mail_prepare_v1((:'suppressed'::jsonb->>'id')::uuid,pg_temp.mail_id('provider-suppressed-lease'),:'suppressed'::jsonb->>'context_hash',repeat('sealed-suppressed-payload-',3),repeat('b',64));
select public.booking_mail_begin_v1((:'suppressed'::jsonb->>'id')::uuid,pg_temp.mail_id('provider-suppressed-lease'),repeat('b',64));
select pg_temp.mail_assert(public.booking_mail_event_v1('provider-suppressed',(:'suppressed'::jsonb->>'id')::uuid,'provider-suppressed-id','suppressed',clock_timestamp()),'provider suppression event rejected');
select pg_temp.mail_assert((select state='suppressed' and provider_id='provider-suppressed-id' from booking_private.guest_mail_outbox_v1 where id=(:'suppressed'::jsonb->>'id')::uuid),'provider suppression falsely marked bounce/delivery');
select pg_temp.mail_assert((select delivery_blocked_at is not null and revoked_at is null from booking_private.guest_access_v1 where reservation_id=(:'suppressed'::jsonb->>'reservation_id')::uuid),'suppression did not stop mail or revoked guest link');
select public.booking_mail_event_v1('late-sent-after-suppression',(:'suppressed'::jsonb->>'id')::uuid,'provider-suppressed-id','accepted',clock_timestamp());
select pg_temp.mail_assert((select state='suppressed' from booking_private.guest_mail_outbox_v1 where id=(:'suppressed'::jsonb->>'id')::uuid),'late sent event hid provider suppression');
select pg_temp.mail_assert(public.booking_guest_read_v1((:'three'::jsonb->>'id')::uuid,pg_temp.mail_hash('three'))->>'revision'='0','new guest receipt is not revision zero or suppressed link failed');
reset role;
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_mail_finish_v1(uuid,uuid,text,text)','execute'),'replaced finish granted operator dispatch');
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_mail_event_v1(text,uuid,text,text,timestamptz)','execute'),'replaced event granted anonymous callback');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ begin begin perform public.booking_mail_finish_v1(pg_temp.mail_id('forged'),pg_temp.mail_id('forged'),'review'); raise exception 'forged JWT role bypassed SQL execute'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
