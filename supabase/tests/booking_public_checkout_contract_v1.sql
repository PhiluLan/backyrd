-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
create function pg_temp.mail_id(label text) returns uuid language sql immutable as $$ select md5('booking-checkout-fixture:'||label)::uuid $$;
create function pg_temp.mail_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to('booking-checkout-fixture:'||label,'UTF8')),'hex') $$;
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
select pg_temp.mail_assert(not has_table_privilege('authenticated','booking_private.public_settings_requests_v1','SELECT,INSERT,UPDATE,DELETE'),'configuration journal exposed');
select pg_temp.mail_assert((select relrowsecurity from pg_class where oid='booking_private.public_settings_requests_v1'::regclass),'journal RLS missing');
select pg_temp.mail_assert(not has_function_privilege('anon','public.booking_console_public_settings_v2(uuid)','execute'),'anonymous configuration');
select pg_temp.mail_assert(not has_function_privilege('authenticated','public.booking_guest_checkout_recover_v1(uuid,uuid,text,bigint,timestamptz)','execute'),'operator anonymous proof impersonation');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
select pg_temp.mail_assert(public.booking_console_read_v1(pg_temp.mail_id('spot'),current_date)#>>'{capabilities,public_booking}'='true','checkout capability missing');
select pg_temp.mail_assert(public.booking_console_public_settings_v2(pg_temp.mail_id('spot'))->>'actor_id'=pg_temp.mail_id('owner')::text,'verified actor missing');
select pg_temp.mail_assert(public.booking_console_public_settings_v2(pg_temp.mail_id('spot'))->>'restaurant_revision'='2','configuration root revision wrong');
set local role service_role;
select public.booking_guest_create_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('first'),1,
 (((now() at time zone 'Europe/Zurich')::date+1+time '12:00') at time zone 'Europe/Zurich'),2,'Synthetic guest','first@booking.invalid',pg_temp.mail_hash('first'),repeat('sealed-fixture-',5)) as first \gset
select pg_temp.mail_assert(:'first'::jsonb#>>'{policy_snapshot,policy_revision}'='1' and :'first'::jsonb#>>'{policy_snapshot,confirmation_status}'='confirmed','original public text not captured');
select pg_temp.mail_assert(public.booking_guest_checkout_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('first'),pg_temp.mail_hash('first'),1,(:'first'::jsonb->>'starts_at')::timestamptz)->>'id'=:'first'::jsonb->>'id','committed recovery missing');
do $$ begin
 begin perform public.booking_guest_checkout_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('not-started'),pg_temp.mail_hash('unknown'),1,clock_timestamp()+interval '1 day'); raise exception 'unobserved write falsely settled'; exception when no_data_found then null; end;
end $$;
set local role authenticated;
select jsonb_build_object('enabled',true,'service_ids',jsonb_build_array(pg_temp.mail_id('service')),'notice_minutes',60,'horizon_days',90,'cancellation_minutes',0,'confirmation_status','pending','privacy_contact','new-privacy@booking.invalid','guest_notice',repeat('ä',1000)) as settings \gset
select public.booking_console_save_public_settings_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('save'),2,:'settings'::jsonb) as saved \gset
select pg_temp.mail_assert(:'saved'::jsonb->>'restaurant_revision'='3' and :'saved'::jsonb->>'policy_revision'='2','settings intent did not save');
select pg_temp.mail_assert(public.booking_console_save_public_settings_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('save'),2,:'settings'::jsonb)=:'saved'::jsonb,'exact retry duplicated policy');
select pg_temp.mail_assert(public.booking_console_public_settings_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('save'),2,:'settings'::jsonb)=:'saved'::jsonb,'configuration outcome recovery missing');
select pg_temp.mail_assert(public.booking_console_public_settings_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('absent'),2,:'settings'::jsonb)->>'not_committed'='true','obsolete absent config intent not settled');
select pg_temp.mail_assert(public.booking_console_public_settings_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('future'),3,:'settings'::jsonb) is null,'current absent config intent falsely settled');
select set_config('checkout.test.settings',:'settings',true);
do $$ begin
 begin perform public.booking_console_save_public_settings_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('save'),2,jsonb_set(current_setting('checkout.test.settings')::jsonb,'{enabled}','false')); raise exception 'same nonce changed settings'; exception when invalid_parameter_value then null; end;
end $$;
set local role service_role;
select pg_temp.mail_assert(public.booking_guest_read_v1((:'first'::jsonb->>'id')::uuid,pg_temp.mail_hash('first'))#>>'{policy_snapshot,privacy_contact}'='privacy@booking.invalid','old privacy contact was replaced');
select pg_temp.mail_assert(public.booking_guest_read_v1((:'first'::jsonb->>'id')::uuid,pg_temp.mail_hash('first'))#>>'{policy_snapshot,cancellation_minutes}'='120','old cancellation promise was replaced');
select public.booking_guest_create_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('second'),2,
 (((now() at time zone 'Europe/Zurich')::date+1+time '16:00') at time zone 'Europe/Zurich'),2,'Synthetic guest','second@booking.invalid',pg_temp.mail_hash('second'),repeat('sealed-fixture-',5)) as second \gset
select pg_temp.mail_assert(:'second'::jsonb->>'status'='pending','request falsely confirmed');
select pg_temp.mail_assert(length(:'second'::jsonb#>>'{policy_snapshot,guest_notice}')=1000,'multilingual policy snapshot truncated');
select pg_temp.mail_assert((select octet_length(outcome::text)>2048 and octet_length(outcome::text)<=8192 from booking_private.reservation_requests_v2 where request_id=pg_temp.mail_id('second')),'large valid replay receipt not exercised');
do $$ begin
 begin update booking_private.guest_access_v1 set policy_snapshot='{}'::jsonb; raise exception 'saved policy mutable'; exception when check_violation then null; end;
end $$;
select pg_temp.mail_assert(public.booking_guest_checkout_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('never'),pg_temp.mail_hash('never'),1,clock_timestamp()+interval '1 day')->>'not_committed'='true','public monotonic policy did not settle rejected intent');
select pg_temp.mail_assert(public.booking_guest_checkout_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('first'),pg_temp.mail_hash('first'),1,(:'first'::jsonb->>'starts_at')::timestamptz)->>'id'=:'first'::jsonb->>'id','new policy hid original committed outcome');
select pg_temp.mail_assert(jsonb_array_length(public.booking_guest_availability_v1(pg_temp.mail_id('spot'),current_date+1,20)->'slots')=0 and public.booking_guest_availability_v1(pg_temp.mail_id('spot'),current_date+1,20)->>'max_party_size'='4','large-group helper leaks false slots or hides configured limit');
select pg_temp.mail_assert(jsonb_array_length(public.booking_guest_availability_v1(pg_temp.mail_id('spot'),current_date+365,2)->'slots')=0,'out-of-horizon slots offered');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('manager')::text,true);
select pg_temp.mail_assert(public.booking_console_public_settings_v2(pg_temp.mail_id('spot'))->>'actor_id'=pg_temp.mail_id('manager')::text,'manager read failed');
do $$ begin
 begin perform public.booking_console_public_settings_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('save'),2,current_setting('checkout.test.settings')::jsonb); raise exception 'another actor replayed configuration'; exception when invalid_parameter_value then null; end;
end $$;
select public.booking_console_save_public_settings_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('manager-pause'),3,jsonb_set(:'settings'::jsonb,'{enabled}','false'));
set local role service_role;
do $$ begin
 begin perform public.booking_guest_checkout_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('unknown-paused'),pg_temp.mail_hash('unknown'),2,clock_timestamp()+interval '1 day'); raise exception 'private paused revision exposed'; exception when no_data_found then null; end;
end $$;
select pg_temp.mail_assert(public.booking_guest_checkout_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('past'),pg_temp.mail_hash('past'),2,clock_timestamp()-interval '1 minute')->>'not_committed'='true','past-start intent not settled');
set local role authenticated;
do $$ declare actor text; begin
 foreach actor in array array['host','viewer','other'] loop
  perform set_config('request.jwt.claim.sub',pg_temp.mail_id(actor)::text,true);
  begin perform public.booking_console_public_settings_v2(pg_temp.mail_id('spot')); raise exception 'non-manager read policy'; exception when insufficient_privilege then null; end;
  begin perform public.booking_console_save_public_settings_v2(pg_temp.mail_id('spot'),pg_temp.mail_id('denied'),4,current_setting('checkout.test.settings')::jsonb); raise exception 'non-manager wrote policy'; exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
insert into public.safety_account_measures(user_id,measure_type,reason_code) values(pg_temp.mail_id('owner'),'write_suspension','checkout_fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('manager')::text,true);
do $$ begin begin perform public.booking_console_public_settings_v2(pg_temp.mail_id('spot')); raise exception 'manager bypassed owner Safety'; exception when raise_exception then if sqlerrm<>'SAFETY_WRITE_RESTRICTED' then raise; end if; end; end $$;
reset role;
update public.safety_account_measures set status='revoked' where reason_code='checkout_fixture';
update public.booking_team_members set revoked_at=clock_timestamp() where user_id=pg_temp.mail_id('manager');
set local role authenticated;
do $$ begin begin perform public.booking_console_public_settings_v2(pg_temp.mail_id('spot')); raise exception 'revoked manager retained rules'; exception when insufficient_privilege then null; end; end $$;
reset role;
update public.spots set owner_id=pg_temp.mail_id('new-owner') where id=pg_temp.mail_id('spot');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('new-owner')::text,true);
select pg_temp.mail_assert(public.booking_console_public_settings_v2(pg_temp.mail_id('spot'))->'settings'='null'::jsonb,'new owner saw old controller configuration');
select pg_temp.mail_assert(public.booking_console_public_settings_v1(pg_temp.mail_id('spot')) is null,'legacy read no longer returns SQL null');
select set_config('request.jwt.claim.sub',pg_temp.mail_id('owner')::text,true);
do $$ begin begin perform public.booking_console_public_settings_recover_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('save'),2,current_setting('checkout.test.settings')::jsonb); raise exception 'old owner replayed after transfer'; exception when insufficient_privilege then null; end; end $$;
set local role anon;
do $$ begin begin perform public.booking_console_public_settings_v2(pg_temp.mail_id('spot')); raise exception 'anonymous rules'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;
