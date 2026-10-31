-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
-- Run only in an isolated fixture database. Activation is transaction-local
-- through the real operator API; ROLLBACK restores the initial OFF state.
begin;
create function pg_temp.assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is not true then raise exception '%',msg;end if;end$$;
create function pg_temp.expect_error(sql text, expected text) returns void language plpgsql as $$declare actual text;begin begin execute sql;exception when others then get stacked diagnostics actual=returned_sqlstate;if actual=expected then return;end if;raise exception 'Expected %, received %',expected,actual;end;raise exception 'Unexpected success: %',sql;end$$;
select pg_temp.assert(not has_function_privilege('anon','public.backyrd_decision_vnext_product_context_v6(uuid,text,text,text,text,text,text,bigint)','execute'),'anon cannot read private context');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v6(uuid,text,text,text,text,text,text,bigint)','execute'),'client cannot forge context authority');
select pg_temp.assert(has_function_privilege('service_role','public.backyrd_decision_vnext_product_context_v6(uuid,text,text,text,text,text,text,bigint)','execute'),'service can call context');
select pg_temp.assert((select bool_and(relrowsecurity) from pg_class where oid in ('public.events_v1'::regclass,'public.event_occurrences_v1'::regclass)),'event RLS retained');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','de000000-0000-4000-8000-000000000001','authenticated','authenticated','decision-event-fixture@test.invalid','','{}','{}',now(),now()) on conflict(id) do nothing;
insert into public.event_venues_v1(id,source_id,source_venue_id,name,normalized_name,city,last_seen_at)
values('de000000-0000-4000-8000-000000000002','manual_admin','decision-event-venue','Test venue','test venue','Basel',now());
insert into public.events_v1(id,primary_source_id,primary_source_event_id,title,categories,status,source_url,dedupe_key,provenance,last_seen_at,published_at,decision_tags,image_storage_path,image_rights_verified)
values('de000000-0000-4000-8000-000000000003','manual_admin','decision-event','Synthetic event',array['MUSIC'],'PUBLISHED','https://example.test/event','decision-event','{}',now(),now(),array['JAZZ'],null,false);
insert into public.event_occurrences_v1(id,event_id,venue_id,start_at,end_at,status,source_url,dedupe_key,last_seen_at,published_at,ticket_status)
select ('de000000-0000-4000-8000-'||lpad((10+n)::text,12,'0'))::uuid,'de000000-0000-4000-8000-000000000003','de000000-0000-4000-8000-000000000002',now()+interval '1 day'*n,now()+interval '1 day'*n+interval '2 hours',case when n=2 then 'CANCELLED' else 'SCHEDULED' end,'https://example.test/event','decision-event-'||n,now(),case when n=3 then null else now() end,case when n=4 then 'SOLD_OUT' else 'UNKNOWN' end
from generate_series(1,4)n;
select pg_temp.expect_error($q$update public.events_v1 set image_storage_path='fixture/image.jpg' where id='de000000-0000-4000-8000-000000000003'$q$,'23514');
update public.events_v1 set decision_activities=array['Tischtennis spielen','Keramik bemalen'] where id='de000000-0000-4000-8000-000000000003';
select pg_temp.expect_error($q$update public.events_v1 set decision_activities=array[' '] where id='de000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.expect_error($q$update public.events_v1 set decision_activities=array[null] where id='de000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.expect_error($q$update public.events_v1 set decision_activities=array_fill('x'::text,array[33]) where id='de000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.expect_error($q$update public.events_v1 set decision_activities=array[repeat('x',161)] where id='de000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.expect_error($q$update public.events_v1 set decision_tags=array['INVENTED'] where id='de000000-0000-4000-8000-000000000003'$q$,'23514');
select pg_temp.expect_error($q$update public.event_occurrences_v1 set ticket_status='GUARANTEED' where event_id='de000000-0000-4000-8000-000000000003'$q$,'23514');
create function pg_temp.context() returns jsonb language sql as $$select public.backyrd_decision_vnext_product_context_v6('de000000-0000-4000-8000-000000000001',repeat('a',64),'Basel',null,repeat('a',64),repeat('b',64),repeat('c',64),1)$$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"de000000-0000-4000-8000-000000000001"}',true);
select pg_temp.expect_error('select pg_temp.context()','42501');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.expect_error('select pg_temp.context()','55000');
select pg_temp.assert((public.backyrd_decision_vnext_product_activate_v1(
  0,repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),clock_timestamp()+interval '1 hour'
)->>'generation')::bigint=1,'real operator activation binds this fixture release only');
set local role service_role;
select pg_temp.assert(jsonb_array_length(pg_temp.context()->'eventOccurrences')=3,'only published occurrences; cancellation retained for explicit exclusion');
select pg_temp.assert(pg_temp.context()->>'status'='NO_CONSENT','no consent produces neutral context');
reset role;
select pg_temp.assert(not has_function_privilege('anon','public.backyrd_decision_vnext_product_context_v7(uuid,text,text,text,text,text,text,bigint)','execute') and not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v7(uuid,text,text,text,text,text,text,bigint)','execute'),'regional context remains server-only');
insert into public.event_venues_v1(id,source_id,source_venue_id,name,normalized_name,city,last_seen_at)
values('de000000-0000-4000-8000-000000000099','manual_admin','regional-fixture','Regional venue','regional venue','Muttenz',now());
insert into public.event_occurrences_v1(id,event_id,venue_id,start_at,end_at,status,source_url,dedupe_key,last_seen_at,published_at,ticket_status)
values('de000000-0000-4000-8000-000000000098','de000000-0000-4000-8000-000000000003','de000000-0000-4000-8000-000000000099',now()+interval '1 day',now()+interval '1 day 2 hours','SCHEDULED','https://example.test/regional','regional-fixture',now(),now(),'UNKNOWN');
set local role service_role;
select pg_temp.assert(jsonb_array_length(pg_temp.context()->'eventOccurrences')=3,'old city RPC remains unchanged');
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.backyrd_decision_vnext_product_context_v7('de000000-0000-4000-8000-000000000001',repeat('a',64),'Basel',null,repeat('a',64),repeat('b',64),repeat('c',64),1)->'eventOccurrences') e where e->>'city'='Muttenz'),'regional RPC includes Muttenz without renaming it Basel');
select pg_temp.assert(public.backyrd_decision_vnext_product_context_v7('de000000-0000-4000-8000-000000000001',repeat('a',64),'Basel',null,repeat('a',64),repeat('b',64),repeat('c',64),1)->>'status'='NO_CONSENT','regional retrieval does not grant personalization consent');

select pg_temp.assert(jsonb_array_length(pg_temp.context()->'worldSnapshots')=0,'events do not require an existing Spot');
select pg_temp.assert((pg_temp.context()->'eventOccurrences'->0)->>'imageStoragePath' is null,'unverified image rights never leak');
select pg_temp.assert((pg_temp.context()->'eventOccurrences'->0)->'tags'='["JAZZ"]','explicit genres preserved');
select pg_temp.assert((pg_temp.context()->'eventOccurrences'->0)->'activities'='["Tischtennis spielen","Keramik bemalen"]','specific activities survive authoritative retrieval');
select pg_temp.assert((pg_temp.context()->'eventOccurrences'->0)->>'matchedSpotId' is null,'free venue does not fabricate Spot identity');
select pg_temp.assert(exists(select 1 from jsonb_array_elements(pg_temp.context()->'eventOccurrences') e where e->>'ticketStatus'='SOLD_OUT'),'ticket status stays per occurrence');
reset role;
select pg_temp.expect_error($q$select public.backyrd_decision_vnext_product_context_v6(null,repeat('a',64),'Basel',null,repeat('a',64),repeat('b',64),repeat('c',64),1)$q$,'42501');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"de000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
with changed as (update public.events_v1 set decision_tags=array['LIVE_MUSIC'],decision_activities=array['Unapproved activity'] where id='de000000-0000-4000-8000-000000000003' returning id)
select pg_temp.assert((select count(*)=0 from changed),'ordinary users cannot edit event features');
reset role;
rollback;
