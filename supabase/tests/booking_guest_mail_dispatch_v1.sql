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
reset role;
-- Pause public intake: existing transactional communication must remain independent.
set local role authenticated;
select public.booking_console_save_public_settings_v1(pg_temp.mail_id('spot'),2,false,array[pg_temp.mail_id('service')],60,90,120,'confirmed','privacy@booking.invalid');
reset role;
update public.booking_reservations set note='PRIVATE INTERNAL NOTE',revision=revision+1 where id=(:'one'::jsonb->>'id')::uuid;
set local role service_role;
select public.booking_mail_claim_v1(pg_temp.mail_id('lease-one')) as claim_one \gset
select pg_temp.mail_assert(:'claim_one'::jsonb->>'reservation_id'=:'one'::jsonb->>'id','metadata-only revision dropped initial confirmation');
select pg_temp.mail_assert(:'claim_one'::jsonb::text not like '%PRIVATE INTERNAL NOTE%','mail snapshot copied staff note');
select pg_temp.mail_assert(public.booking_mail_claim_v1(pg_temp.mail_id('lease-one'))=:'claim_one'::jsonb,'claim replay extended lease or changed identity');
set local timezone='Pacific/Auckland';
select pg_temp.mail_assert(public.booking_mail_claim_v1(pg_temp.mail_id('lease-one'))->>'context_hash'=:'claim_one'::jsonb->>'context_hash','session timezone changed immutable context');
set local timezone='UTC';
select pg_temp.mail_assert(not public.booking_mail_prepare_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('wrong-lease'),:'claim_one'::jsonb->>'context_hash',repeat('sealed-payload-',5),repeat('d',64)),'wrong worker prepared payload');
select pg_temp.mail_assert(public.booking_mail_begin_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-one'),repeat('d',64)) is null,'unprepared message dispatched');
select pg_temp.mail_assert(public.booking_mail_prepare_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-one'),:'claim_one'::jsonb->>'context_hash',repeat('sealed-payload-',5),repeat('d',64)),'valid payload rejected');
select pg_temp.mail_assert(public.booking_mail_prepare_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-one'),:'claim_one'::jsonb->>'context_hash',repeat('sealed-payload-',5),repeat('d',64)),'same prepare replay rejected');
do $$ declare o booking_private.guest_mail_outbox_v1%rowtype; begin
 select * into o from booking_private.guest_mail_outbox_v1 where lease_id=pg_temp.mail_id('lease-one');
 begin perform public.booking_mail_prepare_v1(o.id,o.lease_id,o.payload_context,repeat('changed-payload-',5),o.payload_digest); raise exception 'changed retry payload accepted'; exception when check_violation then if sqlerrm<>'booking_mail_payload_frozen' then raise; end if; end;
 begin update booking_private.guest_mail_outbox_v1 set payload_digest=repeat('f',64) where id=o.id; raise exception 'frozen payload mutated'; exception when check_violation then null; end;
end $$;
select public.booking_mail_begin_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-one'),repeat('d',64)) as dispatch_one \gset
select pg_temp.mail_assert(:'dispatch_one'::jsonb->>'idempotency_key'='backyrd-booking/'||(:'claim_one'::jsonb->>'id'),'unstable provider key');
select pg_temp.mail_assert(public.booking_mail_begin_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-one'),repeat('d',64))=:'dispatch_one'::jsonb,'begin replay changed body/window');
select pg_temp.mail_assert((select attempts=1 from booking_private.guest_mail_outbox_v1 where id=(:'claim_one'::jsonb->>'id')::uuid),'begin replay consumed second attempt');
reset role;
-- Contact correction after dispatch cannot recall the provider; it prevents retries.
update public.booking_reservations set guest_contact='corrected@booking.invalid',revision=revision+1 where id=(:'one'::jsonb->>'id')::uuid;
select pg_temp.mail_assert((select state='sending' and superseded_at is not null from booking_private.guest_mail_outbox_v1 where id=(:'claim_one'::jsonb->>'id')::uuid),'in-flight send misrepresented as unsent');
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_finish_v1((:'claim_one'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-one'),'retry'),'uncertain completion rejected');
select pg_temp.mail_assert((select state='review_required' from booking_private.guest_mail_outbox_v1 where id=(:'claim_one'::jsonb->>'id')::uuid),'wrong-recipient retry was enabled');

select public.booking_mail_claim_v1(pg_temp.mail_id('lease-two')) as claim_two \gset
select pg_temp.mail_assert(:'claim_two'::jsonb->>'reservation_id'=:'two'::jsonb->>'id','superseded mail reclaimed');
select public.booking_mail_prepare_v1((:'claim_two'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-two'),:'claim_two'::jsonb->>'context_hash',repeat('payload-two-',5),repeat('e',64));
select public.booking_mail_begin_v1((:'claim_two'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-two'),repeat('e',64));
select clock_timestamp()::text as event_time \gset
-- A real signed callback may arrive before the send response. Its stronger state wins.
select pg_temp.mail_assert(public.booking_mail_event_v1('delivery-two',(:'claim_two'::jsonb->>'id')::uuid,'provider-two','delivered',:'event_time'::timestamptz),'early delivery callback denied');
select pg_temp.mail_assert(not public.booking_mail_finish_v1((:'claim_two'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-two'),'accepted','provider-two'),'late send response rewrote callback');
select public.booking_mail_event_v1('sent-two',(:'claim_two'::jsonb->>'id')::uuid,'provider-two','accepted',:'event_time'::timestamptz);
select pg_temp.mail_assert((select state='delivered' from booking_private.guest_mail_outbox_v1 where id=(:'claim_two'::jsonb->>'id')::uuid),'out-of-order acceptance regressed delivery');
select pg_temp.mail_assert(public.booking_mail_event_v1('delivery-two',(:'claim_two'::jsonb->>'id')::uuid,'provider-two','delivered',:'event_time'::timestamptz),'identical event replay rejected');
select pg_temp.mail_assert(not public.booking_mail_event_v1('wrong-provider',(:'claim_two'::jsonb->>'id')::uuid,'provider-wrong','bounced',:'event_time'::timestamptz),'foreign provider ID rebound message');
do $$ declare o uuid; begin
 select id into o from booking_private.guest_mail_outbox_v1 where provider_id='provider-two';
 begin perform public.booking_mail_event_v1('delivery-two',o,'provider-two','bounced',clock_timestamp()); raise exception 'changed event replay accepted'; exception when invalid_parameter_value then if sqlerrm<>'booking_mail_event_reused' then raise; end if; end;
end $$;
select public.booking_mail_event_v1('bounce-two',(:'claim_two'::jsonb->>'id')::uuid,'provider-two','bounced',:'event_time'::timestamptz);
select public.booking_mail_event_v1('complaint-two',(:'claim_two'::jsonb->>'id')::uuid,'provider-two','complained',:'event_time'::timestamptz);
select public.booking_mail_event_v1('late-delivery-two',(:'claim_two'::jsonb->>'id')::uuid,'provider-two','delivered',:'event_time'::timestamptz);
select pg_temp.mail_assert((select state='complained' from booking_private.guest_mail_outbox_v1 where id=(:'claim_two'::jsonb->>'id')::uuid),'late delivery hid complaint');
select pg_temp.mail_assert(public.booking_guest_read_v1((:'two'::jsonb->>'id')::uuid,pg_temp.mail_hash('two'))->>'id'=:'two'::jsonb->>'id','delivery block revoked guest self-service');

select public.booking_mail_claim_v1(pg_temp.mail_id('lease-three')) as claim_three \gset
select public.booking_mail_prepare_v1((:'claim_three'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-three'),:'claim_three'::jsonb->>'context_hash',repeat('payload-three-',5),repeat('f',64));
select public.booking_mail_begin_v1((:'claim_three'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-three'),repeat('f',64)) as dispatch_three \gset
select public.booking_mail_finish_v1((:'claim_three'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-three'),'retry');
select pg_temp.mail_assert((select state='pending' and next_attempt_at>clock_timestamp() from booking_private.guest_mail_outbox_v1 where id=(:'claim_three'::jsonb->>'id')::uuid),'retry not delayed');
update booking_private.guest_mail_outbox_v1 set next_attempt_at=clock_timestamp()-interval '1 second' where id=(:'claim_three'::jsonb->>'id')::uuid;
select public.booking_mail_claim_v1(pg_temp.mail_id('lease-three-retry')) as retry_three \gset
select pg_temp.mail_assert(:'retry_three'::jsonb->>'payload_sealed'=repeat('payload-three-',5),'retry changed immutable encrypted payload');
select pg_temp.mail_assert(not public.booking_mail_finish_v1((:'claim_three'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-three'),'accepted','stale-worker'),'stale worker acknowledged new lease');
select public.booking_mail_begin_v1((:'claim_three'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-three-retry'),repeat('f',64)) as retry_dispatch \gset
select pg_temp.mail_assert(:'dispatch_three'::jsonb->>'retry_until'=:'retry_dispatch'::jsonb->>'retry_until','retry reset 23-hour dedupe window');
select public.booking_mail_finish_v1((:'claim_three'::jsonb->>'id')::uuid,pg_temp.mail_id('lease-three-retry'),'accepted','provider-three');
select pg_temp.mail_assert((select state='accepted' and attempts=2 from booking_private.guest_mail_outbox_v1 where id=(:'claim_three'::jsonb->>'id')::uuid),'provider acceptance fabricated delivery');
reset role;
-- Seed an old unknown dispatch directly in isolated fixtures; immutable production
-- timestamps cannot be rewritten to make an expired provider key look fresh.
insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind,state,lease_id,lease_until,first_attempt_at,attempts,payload_sealed,payload_digest,payload_context,payload_prepared_at)
 values(pg_temp.mail_id('spot'),(:'three'::jsonb->>'id')::uuid,99,'changed','sending',pg_temp.mail_id('old-worker'),clock_timestamp()-interval '22 hours',clock_timestamp()-interval '23 hours 1 second',1,repeat('expired-payload-',5),repeat('f',64),booking_private.request_fingerprint_v2(booking_private.mail_snapshot_v1((:'three'::jsonb->>'id')::uuid)),clock_timestamp()-interval '24 hours');
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_claim_v1(pg_temp.mail_id('expired-retry')) is null,'expired provider idempotency key reused');
select pg_temp.mail_assert((select state='review_required' from booking_private.guest_mail_outbox_v1 where reservation_id=(:'three'::jsonb->>'id')::uuid and reservation_revision=99),'old unknown send not routed to review');
select pg_temp.mail_assert(not public.booking_mail_event_v1('never-attempted',pg_temp.mail_id('missing'),'fake','delivered',clock_timestamp()),'unknown outbox accepted delivery');
reset role;
-- Owner restrictions and verified identity are rechecked at the actual dispatch
-- boundary, even if a worker already prepared a valid encrypted payload.
insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind)
 values(pg_temp.mail_id('spot'),(:'three'::jsonb->>'id')::uuid,100,'changed');
set local role service_role;
select public.booking_mail_claim_v1(pg_temp.mail_id('safety-lease')) as safety_claim \gset
select public.booking_mail_prepare_v1((:'safety_claim'::jsonb->>'id')::uuid,pg_temp.mail_id('safety-lease'),:'safety_claim'::jsonb->>'context_hash',repeat('safety-payload-',5),repeat('a',64));
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.mail_id('owner'),'write_suspension','booking_mail_fixture');
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_begin_v1((:'safety_claim'::jsonb->>'id')::uuid,pg_temp.mail_id('safety-lease'),repeat('a',64)) is null,'prepared payload bypassed current owner Safety');
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.mail_id('owner') and reason_code='booking_mail_fixture';
update auth.users set email_confirmed_at=null where id=pg_temp.mail_id('owner');
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_begin_v1((:'safety_claim'::jsonb->>'id')::uuid,pg_temp.mail_id('safety-lease'),repeat('a',64)) is null,'unverified current owner dispatched');
reset role;
update auth.users set email_confirmed_at=clock_timestamp() where id=pg_temp.mail_id('owner');
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_begin_v1((:'safety_claim'::jsonb->>'id')::uuid,pg_temp.mail_id('safety-lease'),repeat('a',64)) is not null,'Safety recovery did not revalidate the original lease');
do $$ begin
 begin update booking_private.guest_mail_outbox_v1 set first_attempt_at=clock_timestamp()+interval '1 second' where lease_id=pg_temp.mail_id('safety-lease'); raise exception 'provider dedupe clock rewritten'; exception when check_violation then if sqlerrm<>'booking_mail_payload_frozen' then raise; end if; end;
end $$;
select public.booking_mail_finish_v1((:'safety_claim'::jsonb->>'id')::uuid,pg_temp.mail_id('safety-lease'),'rejected');
reset role;
insert into booking_private.guest_mail_outbox_v1(spot_id,reservation_id,reservation_revision,event_kind,state,first_attempt_at,attempts,payload_sealed,payload_digest,payload_context,payload_prepared_at)
 values(pg_temp.mail_id('spot'),(:'three'::jsonb->>'id')::uuid,101,'changed','pending',clock_timestamp(),8,repeat('exhausted-payload-',5),repeat('f',64),booking_private.request_fingerprint_v2(booking_private.mail_snapshot_v1((:'three'::jsonb->>'id')::uuid)),clock_timestamp());
set local role service_role;
select pg_temp.mail_assert(public.booking_mail_claim_v1(pg_temp.mail_id('attempt-budget')) is null,'exhausted dispatch budget reused');
select pg_temp.mail_assert((select state='review_required' from booking_private.guest_mail_outbox_v1 where reservation_id=(:'three'::jsonb->>'id')::uuid and reservation_revision=101),'exhausted attempts not routed to review');
reset role;
rollback;
