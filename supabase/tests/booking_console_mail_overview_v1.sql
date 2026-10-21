-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
create function pg_temp.mail_id(label text) returns uuid language sql immutable as $$ select md5('booking-mail-overview:'||label)::uuid $$;
create function pg_temp.mail_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to('booking-mail-overview:'||label,'UTF8')),'hex') $$;
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
select pg_temp.mail_id(x),x||'@booking.invalid',now(),'{}','{}' from unnest(array['viewer','host','manager','outsider','new-owner']) x;
insert into public.booking_team_members(spot_id,user_id,owner_id,role)
 select pg_temp.mail_id('spot'),pg_temp.mail_id(x),pg_temp.mail_id('owner'),x from unnest(array['viewer','host','manager']) x;
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_console_mail_v1(uuid,uuid,uuid)','execute'),'anonymous overview grant');
select pg_temp.mail_assert(not has_table_privilege('authenticated','booking_private.guest_mail_outbox_v1','SELECT'),'raw outbox exposed');
select pg_temp.mail_assert(not has_table_privilege('authenticated','booking_private.guest_access_v1','SELECT'),'guest credentials exposed');
set local role service_role;
select public.booking_guest_create_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('create'),1,
 (((now() at time zone 'Europe/Zurich')::date+1+time '12:00') at time zone 'Europe/Zurich'),2,
 'PRIVATE_GUEST','private-recipient@booking.invalid',pg_temp.mail_hash('credential'),repeat('SEALED_SECRET_',5),'PRIVATE_NOTE') as guest \gset
select public.booking_mail_claim_v1(pg_temp.mail_id('lease')) as job \gset
select public.booking_mail_prepare_v1((:'job'::jsonb->>'id')::uuid,pg_temp.mail_id('lease'),:'job'::jsonb->>'context_hash',repeat('SEALED_BODY_',6),repeat('b',64));
select public.booking_mail_begin_v1((:'job'::jsonb->>'id')::uuid,pg_temp.mail_id('lease'),repeat('b',64));
select public.booking_mail_finish_v1((:'job'::jsonb->>'id')::uuid,pg_temp.mail_id('lease'),'accepted','PRIVATE_PROVIDER_ID');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
select public.booking_console_mail_v1(pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid) as overview \gset
select pg_temp.mail_assert(:'overview'::jsonb#>>'{messages,0,state}'='accepted','provider acceptance not projected');
select pg_temp.mail_assert(:'overview'::jsonb->>'revision'='0' and :'overview'::jsonb->>'guest_access'='active','revision-zero credential projection failed');
select pg_temp.mail_assert(:'overview' !~ 'PRIVATE_|SEALED_|payload|provider|key_hash|lease_id|guest_contact|request_id','overview leaked credentials, contact or provider internals');
select pg_temp.mail_assert(public.booking_console_read_v1(pg_temp.mail_id('spot'),current_date)#>>'{capabilities,guest_mail}'='true','capability missing');
set local role service_role;
select public.booking_mail_event_v1('delay',(:'job'::jsonb->>'id')::uuid,'PRIVATE_PROVIDER_ID','delayed',clock_timestamp());
set local role authenticated;
select pg_temp.mail_assert(public.booking_console_mail_v1(pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid)#>>'{messages,0,delayed}'='true','delayed callback not shown');
set local role service_role;
select public.booking_mail_event_v1('delivered',(:'job'::jsonb->>'id')::uuid,'PRIVATE_PROVIDER_ID','delivered',clock_timestamp());
select public.booking_mail_event_v1('late-accepted',(:'job'::jsonb->>'id')::uuid,'PRIVATE_PROVIDER_ID','accepted',clock_timestamp());
set local role authenticated;
select pg_temp.mail_assert(public.booking_console_mail_v1(pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid)#>>'{messages,0,state}'='delivered','late provider event regressed delivery');
select pg_temp.mail_assert(public.booking_console_mail_v1(pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid)#>>'{messages,0,delayed}'='false','old delay hid delivery');
set local role service_role;
select public.booking_mail_event_v1('bounce',(:'job'::jsonb->>'id')::uuid,'PRIVATE_PROVIDER_ID','bounced',clock_timestamp());
set local role authenticated;
select pg_temp.mail_assert(public.booking_console_mail_v1(pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid)->>'delivery_blocked'='true','delivery block not shown');

-- Verified team access uses canonical roles, current ownership, revocation and Safety.
-- Hosts cannot SELECT raw reservations; pass the known fixture id via transaction-local setting.
select set_config('booking.overview.reservation',:'guest'::jsonb->>'id',true);
create function pg_temp.overview_read() returns jsonb language sql as $$
 select public.booking_console_mail_v1(pg_temp.mail_id('spot'),current_setting('booking.overview.reservation')::uuid);
$$;
do $$ declare actor text; begin
 foreach actor in array array['viewer','host','manager'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.mail_id(actor)::text,true);
  perform pg_temp.mail_assert(jsonb_array_length(pg_temp.overview_read()->'messages')=1,'team could not read scoped overview');
 end loop;
 perform set_config('request.jwt.claim.sub',pg_temp.mail_id('outsider')::text,true);
 begin perform pg_temp.overview_read(); raise exception 'outsider read overview'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.booking_team_members set revoked_at=now() where user_id=pg_temp.mail_id('viewer');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('viewer')::text,true);
do $$ begin begin perform pg_temp.overview_read(); raise exception 'revoked viewer read overview'; exception when insufficient_privilege then null; end; end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.mail_id('owner'),'write_suspension','mail_overview_fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('host')::text,true);
do $$ begin begin perform pg_temp.overview_read(); raise exception 'host bypassed owner Safety'; exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise; end if; end; end $$;
reset role;
update public.safety_account_measures set status='revoked' where user_id=pg_temp.mail_id('owner') and reason_code='mail_overview_fixture';
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.mail_id('host'),'account_restricted','mail_overview_fixture');
set local role authenticated;
do $$ begin begin perform pg_temp.overview_read(); raise exception 'host bypassed actor Safety'; exception when raise_exception then if sqlerrm<>'SAFETY_ACCOUNT_RESTRICTED' then raise; end if; end; end $$;
reset role;
update public.spots set owner_id=pg_temp.mail_id('new-owner') where id=pg_temp.mail_id('spot');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('manager')::text,true);
do $$ begin begin perform pg_temp.overview_read(); raise exception 'old team read after ownership transfer'; exception when insufficient_privilege then null; end; end $$;
reset role;
update public.spots set owner_id=pg_temp.mail_id('owner') where id=pg_temp.mail_id('spot');

-- Nonempty pagination with tied creation times; no raw body is needed to inspect queued intent.
update public.booking_reservations set revision=60 where id=(:'guest'::jsonb->>'id')::uuid;
insert into booking_private.guest_mail_outbox_v1(id,spot_id,reservation_id,reservation_revision,event_kind,created_at,updated_at)
 select pg_temp.mail_id('older-'||i),pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid,i,'changed',timestamptz '2020-01-01',timestamptz '2020-01-01' from generate_series(1,55) i;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
select pg_temp.overview_read() as first_page \gset
select public.booking_console_mail_v1(pg_temp.mail_id('spot'),(:'guest'::jsonb->>'id')::uuid,(:'first_page'::jsonb->>'next_cursor')::uuid) as last_page \gset
select pg_temp.mail_assert(jsonb_array_length(:'first_page'::jsonb->'messages')=50 and jsonb_array_length(:'last_page'::jsonb->'messages')=6,'bounded keyset page sizes wrong');
select pg_temp.mail_assert(:'last_page'::jsonb->>'next_cursor' is null,'final page cursor fabricated');
select pg_temp.mail_assert(not exists(select 1 from jsonb_array_elements(:'first_page'::jsonb->'messages') a join jsonb_array_elements(:'last_page'::jsonb->'messages') b on a->>'id'=b->>'id'),'tied timestamps duplicated messages');
do $$ begin
 begin perform public.booking_console_mail_v1(pg_temp.mail_id('spot'),current_setting('booking.overview.reservation')::uuid,pg_temp.mail_id('foreign-cursor')); raise exception 'foreign cursor accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.booking_console_mail_v1(pg_temp.mail_id('foreign-spot'),current_setting('booking.overview.reservation')::uuid); raise exception 'cross-spot lookup accepted'; exception when insufficient_privilege then null; end;
 begin perform public.booking_console_mail_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('missing')); raise exception 'missing reservation accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update booking_private.guest_access_v1 set revoked_at=clock_timestamp() where reservation_id=(:'guest'::jsonb->>'id')::uuid;
set local role authenticated;
select pg_temp.mail_assert(pg_temp.overview_read()->>'guest_access'='revoked','contact revocation not shown');
reset role;
update booking_private.guest_access_v1 set revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where reservation_id=(:'guest'::jsonb->>'id')::uuid;
set local role authenticated;
select pg_temp.mail_assert(pg_temp.overview_read()->>'guest_access'='expired','expiry not shown');
set local role anon;
do $$ begin begin perform public.booking_console_mail_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('missing')); raise exception 'anonymous read'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
