\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p boolean,m text) returns void language plpgsql as $$begin if p is not true then raise exception 'Seasonal event: %',m;end if;end$$;
create function pg_temp.denied(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlstate=expected then return;end if;raise;end;raise exception 'Expected error %',expected;end$$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000','ee000000-0000-4000-8000-000000000001','authenticated','authenticated','seasonal-admin@fixture.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','ee000000-0000-4000-8000-000000000002','authenticated','authenticated','seasonal-user@fixture.invalid','','{}','{}',now(),now());
insert into public.profiles(id,is_admin) values('ee000000-0000-4000-8000-000000000001',true),('ee000000-0000-4000-8000-000000000002',false) on conflict(id) do update set is_admin=excluded.is_admin;
create temp table seasonal_test_payload(input jsonb);
insert into seasonal_test_payload select jsonb_build_object(
 'id','60993b43-8e5a-4cbf-980b-e701a47d11da','seriesKey','basler-herbstmesse','seriesName','Seasonal Fixture','year',2026,
 'title','Seasonal Fixture 2026','description','Synthetic local fixture for the verified seasonal schedule.','city','Basel','organizer','Fixture',
 'sourceUrl','https://example.test/season','checkedAt',clock_timestamp(),'familyFriendly',true,'activities',jsonb_build_array('Jahrmarkt besuchen'),
 'categories',jsonb_build_array('MARKET','FAMILY'),'admissionNote','Ride prices remain unknown.',
 'places',(select jsonb_agg(jsonb_build_object('key',v.key,'name',v.key,'address',v.key||', Basel','city','Basel','latitude',null,'longitude',null,
  'sourceUrl','https://example.test/season/'||v.key,'environment',case when v.key='hallenmesse' then 'INDOOR' else 'OUTDOOR' end,
  'startDate','2026-10-24','endDate',case when v.key='petersplatz' then '2026-11-10' else '2026-11-08' end,
  'hours',case when v.key='petersplatz' then jsonb_build_array(jsonb_build_object('weekdays',jsonb_build_array(1,2,3,4,5,6,7),'start','11:00','end','20:00'))
  else jsonb_build_array(jsonb_build_object('weekdays',jsonb_build_array(1,2,3,4,7),'start',v.opens,'end','22:00'),jsonb_build_object('weekdays',jsonb_build_array(5,6),'start',v.opens,'end','23:00')) end,
  'exceptions',jsonb_build_array(jsonb_build_object('date','2026-10-24','closed',false,'start','12:00','end',case when v.key='petersplatz' then '20:00' else '23:00' end))
 )) from(values ('barfuesserplatz','12:00'),('muensterplatz','12:00'),('messeplatz','11:00'),('rosentalanlage','11:00'),('kasernenareal','12:00'),('hallenmesse','12:00'),('petersplatz','11:00'))v(key,opens))
);
grant select,update on seasonal_test_payload to authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ee000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select pg_temp.denied('select public.admin_save_seasonal_edition_v1((select input from seasonal_test_payload),false,null)','42501');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ee000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select public.admin_save_seasonal_edition_v1((select input from seasonal_test_payload),false,null);
reset role;set local role anon;
select pg_temp.assert(not exists(select 1 from public.event_discovery_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'draft is private');
select pg_temp.assert(not exists(select 1 from public.event_series_v1 where slug='basler-herbstmesse'),'draft series is private');
select pg_temp.denied($q$select public.admin_save_seasonal_edition_v1('{}',true,null)$q$,'42501');
reset role;set local role authenticated;
select public.admin_save_seasonal_edition_v1((select input from seasonal_test_payload),true,(select updated_at from public.events_v1 where id='60993b43-8e5a-4cbf-980b-e701a47d11da'));
select pg_temp.denied($q$select public.admin_save_seasonal_edition_v1((select input from seasonal_test_payload),true,null)$q$,'40001');
reset role;
select pg_temp.assert((select count(*)=114 from public.event_occurrences_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'114 daily intervals across seven venues');
select pg_temp.assert((select count(distinct venue_id)=7 from public.event_discovery_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'all seven actual venues exposed');
select pg_temp.assert(not exists(select 1 from public.event_occurrences_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da' and seasonal_place_key<>'petersplatz' and seasonal_date>'2026-11-08'),'no other venue after Nov 8');
select pg_temp.assert((select max(seasonal_date)='2026-11-10' from public.event_occurrences_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da' and seasonal_place_key='petersplatz'),'Petersplatz continues until Nov 10');
select pg_temp.assert(not exists(select 1 from public.event_occurrences_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da' and seasonal_date='2026-10-24' and start_at<>'2026-10-24T10:00:00Z'),'all opening day starts at local noon, summer time');
select pg_temp.assert((select start_at='2026-10-25T10:00:00Z' from public.event_occurrences_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da' and seasonal_place_key='petersplatz' and seasonal_date='2026-10-25'),'winter time conversion after DST');
select pg_temp.assert((select bool_and(is_free is null and price_min is null and minimum_age is null) from public.events_v1 where id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'no invented ride prices or ages');
set local role anon;
select pg_temp.assert((select count(*)=114 from public.event_discovery_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'published edition readable anonymously through invoker view');
select pg_temp.denied('select seasonal_config from public.events_v1','42501');
reset role;set local role authenticated;
select public.admin_save_seasonal_edition_v1((select input from seasonal_test_payload),true,(select updated_at from public.events_v1 where id='60993b43-8e5a-4cbf-980b-e701a47d11da'));
reset role;
select pg_temp.assert((select count(*)=114 from public.event_occurrences_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'repeated save does not duplicate intervals');
select pg_temp.assert((select count(*)=3 from event_authoring_private.seasonal_audit_v1 where event_id='60993b43-8e5a-4cbf-980b-e701a47d11da'),'audit records draft, publish and update');
select pg_temp.denied('update event_authoring_private.seasonal_audit_v1 set resulting_status=''DRAFT''','55000');
rollback;
