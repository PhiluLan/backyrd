-- Synthetic, local-only restore corpus; invoke only through the guarded drill.
begin;
do $$ begin if current_setting('backyrd.booking_restore_fixture',true) is distinct from 'isolated' then raise exception 'isolated_restore_fixture_required'; end if; end $$;
set local timezone='UTC';
create function pg_temp.mail_id(label text) returns uuid language sql immutable as $$ select md5('booking-restore-fixture:'||label)::uuid $$;
create function pg_temp.mail_hash(label text) returns text language sql immutable as $$ select encode(sha256(convert_to('booking-restore-fixture:'||label,'UTF8')),'hex') $$;
create function pg_temp.mail_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Booking mail: %',message; end if; end $$;
insert into auth.users(id,instance_id,aud,role,email,email_confirmed_at,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(pg_temp.mail_id('owner'),'00000000-0000-0000-0000-000000000000','authenticated','authenticated','restore-owner@booking.invalid',now(),'','{}','{}',now(),now());
insert into public.spots(id,name,lat,lng,owner_id,status) values(pg_temp.mail_id('spot'),'Restore fixture',47.5,7.5,pg_temp.mail_id('owner'),'approved');
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
select pg_temp.mail_id(x),'restore-'||x||'@booking.invalid',clock_timestamp(),'{}','{}' from unnest(array['manager','host','viewer','other','new-owner']) x;
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
select public.booking_mail_summary_v1(pg_temp.mail_id('owner'),pg_temp.mail_id('spot'),current_setting('summary.manual.id')::uuid,pg_temp.mail_id('summary-op'),0,'restore-recipient@booking.invalid');
select public.booking_guest_create_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('online-op'),1,(((now() at time zone 'Europe/Zurich')::date+1+time '17:00') at time zone 'Europe/Zurich'),2,'Synthetic online guest','restore-online@booking.invalid',repeat('b',64),repeat('sealed-fixture-',5),'SYNTHETIC_GUEST_NOTE');
-- Populated contact-card lifecycle; all writes use the real operator-bound RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('host')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.mail_id('host'),'role','authenticated')::text,true);
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-active-create'),
 jsonb_build_object('kind','save','id',pg_temp.mail_id('card-active'),'revision',null,'name','Synthetic card original','email','restore-card@booking.invalid','phone','+41 61 000 00 00'),pg_temp.mail_id('host'));
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-active-edit'),
 jsonb_build_object('kind','save','id',pg_temp.mail_id('card-active'),'revision',0,'name','Synthetic card corrected','email','restore-corrected@booking.invalid','phone','+41 61 000 00 00'),pg_temp.mail_id('host'));
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-archived-create'),
 jsonb_build_object('kind','save','id',pg_temp.mail_id('card-archived'),'revision',null,'name','Synthetic card archived','email',null,'phone',null),pg_temp.mail_id('host'));
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-restored-create'),
 jsonb_build_object('kind','save','id',pg_temp.mail_id('card-restored'),'revision',null,'name','Synthetic card restored','email',null,'phone',null),pg_temp.mail_id('host'));
-- Four persistent associations exercise current, corrected, detached and archived
-- identity after a real backup. Saved booking contacts remain independent facts.
do $$ declare label text; hour integer:=19; saved jsonb; rid uuid; begin
 foreach label in array array['linked','corrected','detached','archived'] loop
  saved:=public.booking_console_create_v3(pg_temp.mail_id('spot'),pg_temp.mail_id('history-'||label),pg_temp.mail_id('service'),pg_temp.mail_id('table'),array[pg_temp.mail_id('table')],null,
   (((now() at time zone 'Europe/Zurich')::date+1+make_time(hour,0,0)) at time zone 'Europe/Zurich'),60,2,'Synthetic history '||label,'restore-history@booking.invalid','PRIVATE_RESTORE_HISTORY_NOTE','phone','confirmed',
   pg_temp.mail_id(case when label='archived' then 'card-archived' else 'card-active' end),case when label='archived' then 0 else 1 end,pg_temp.mail_id('host'));
  rid:=(saved->>'id')::uuid;
  if label in ('corrected','detached') then
   perform public.booking_console_reservation_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('history-'||label||'-change'),jsonb_build_object(
    'kind',case when label='detached' then 'detach' else 'assign' end,'reservation_id',rid,'reservation_revision',0,'link_revision',1,
    'guest_id',case when label='detached' then null else pg_temp.mail_id('card-restored') end,'guest_revision',case when label='detached' then null else 0 end),pg_temp.mail_id('host'));
  end if;
  hour:=hour+1;
 end loop;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.mail_id('manager')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.mail_id('manager'),'role','authenticated')::text,true);
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-archived-archive'),
 jsonb_build_object('kind','archive','id',pg_temp.mail_id('card-archived'),'revision',0,'archived',true),pg_temp.mail_id('manager'));
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-restored-archive'),
 jsonb_build_object('kind','archive','id',pg_temp.mail_id('card-restored'),'revision',0,'archived',true),pg_temp.mail_id('manager'));
select public.booking_console_guest_write_v1(pg_temp.mail_id('spot'),pg_temp.mail_id('card-restored-restore'),
 jsonb_build_object('kind','archive','id',pg_temp.mail_id('card-restored'),'revision',1,'archived',false),pg_temp.mail_id('manager'));
reset role;
commit;
