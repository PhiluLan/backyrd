-- backyrd:authorization-positive
-- backyrd:authorization-negative
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is not true then raise exception '%',msg; end if; end$$;
create function pg_temp.expect_error(sql text,expected text) returns void language plpgsql as $$declare actual text; begin begin execute sql; exception when others then get stacked diagnostics actual=returned_sqlstate; if actual=expected then return; end if; raise exception 'Expected %, got %',expected,actual; end; raise exception 'Unexpected success: %',sql; end$$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',('ed000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','event-author-'||n||'@test.invalid','','{}','{}',now(),now() from generate_series(1,3)n;
update public.profiles set is_admin=true where id='ed000000-0000-4000-8000-000000000003';
insert into public.spots(id,name,lat,lng,city,address,status,owner_id) values
('ed000000-0000-4000-8000-000000000010','Synthetic event spot',47.56,7.59,'Basel','Fixture 1','approved','ed000000-0000-4000-8000-000000000001'),
('ed000000-0000-4000-8000-000000000011','Other spot',47.56,7.59,'Basel','Fixture 2','approved','ed000000-0000-4000-8000-000000000002');
create function pg_temp.input() returns jsonb language sql as $$select jsonb_build_object('title','Fixture Ping Pong','description','Ein gemeinsamer Abend','categories',jsonb_build_array('SPORT'),'activities',jsonb_build_array('Tischtennis spielen'),'free',true,'recurrence',jsonb_build_object('startDate',current_date+1,'startTime','18:00','endTime','01:00','frequency','WEEKLY','interval',2))$$;
create temp table saved(id uuid);
grant all on saved to authenticated;
select pg_temp.assert(not has_function_privilege('anon','public.save_spot_event_v1(uuid,uuid,timestamptz,text,jsonb)','execute'),'anon cannot write');
select pg_temp.assert(not has_function_privilege('anon','public.list_spot_events_v1(uuid)','execute'),'anon cannot list private drafts');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
insert into saved select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',null,null,'SUBMIT',pg_temp.input());
select pg_temp.assert(jsonb_array_length(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010'))=1,'owner sees submitted draft');
select pg_temp.assert(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')->0->>'submitted'='true','submitted status explicit');
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',null,null,'PUBLISH',pg_temp.input())$q$,'42501');
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000011',null,null,'SUBMIT',pg_temp.input())$q$,'42501');
select pg_temp.expect_error($q$select public.list_spot_events_v1('ed000000-0000-4000-8000-000000000011')$q$,'P0001');
select pg_temp.assert(not exists(select 1 from public.events_v1 where id=(select id from saved)),'owner has no raw draft select');
select pg_temp.assert(not exists(select 1 from public.event_discovery_v1 where event_id=(select id from saved)),'draft absent from public discovery');
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',null,null,'SUBMIT',pg_temp.input()||'{"categories":["INVENTED"]}'::jsonb)$q$,'23514');
select pg_temp.assert(jsonb_array_length(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010'))=1,'failed validation rolls back entire event transaction');
reset role;
select pg_temp.assert((select primary_source_id='manual_owner' and authoring_spot_id='ed000000-0000-4000-8000-000000000010' and created_by='ed000000-0000-4000-8000-000000000001' from public.events_v1 where id=(select id from saved)),'owner provenance cannot spoof admin');
select pg_temp.assert((select count(*)>10 from public.event_occurrences_v1 where event_id=(select id from saved)),'fortnightly recurrence materialized');
select pg_temp.assert((select bool_and(end_at>start_at and end_at-start_at=interval '7 hours') from public.event_occurrences_v1 where event_id=(select id from saved)),'overnight date correct across Zurich calendar');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',(select id from saved),(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')->0->>'updatedAt')::timestamptz,'PUBLISH',pg_temp.input());
select pg_temp.assert(exists(select 1 from public.event_discovery_v1 where event_id=(select id from saved) and is_free and matched_spot_id='ed000000-0000-4000-8000-000000000010'),'published canonical owner event reaches App view with free admission and spot link');
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',(select id from saved),'2000-01-01','PUBLISH',pg_temp.input())$q$,'40001');
reset role;
select pg_temp.assert((select count(*)=2 from event_authoring_private.audit where event_id=(select id from saved)),'submit and publish audited with actor');
-- Real service-authorized retrieval: approved owner events enter the same Engine contract.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.backyrd_decision_vnext_product_activate_v1(0,repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),clock_timestamp()+interval '1 hour');
set local role service_role;
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.backyrd_decision_vnext_product_context_v6('ed000000-0000-4000-8000-000000000001',repeat('a',64),'Basel',null,repeat('a',64),repeat('b',64),repeat('c',64),1)->'eventOccurrences') e where e->>'source'='manual_owner' and e->'activities'='["Tischtennis spielen"]'),'Engine receives published owner provenance and explicit activity');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
with changed as (update public.events_v1 set status='PUBLISHED' where id=(select id from saved) returning id) select pg_temp.assert(not exists(select 1 from changed),'other user cannot change event directly');
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000011',(select id from saved),now(),'CANCEL','{}')$q$,'42501');
reset role;
-- Ownership removal is effective immediately, without waiting for token renewal.
update public.spots set owner_id='ed000000-0000-4000-8000-000000000002' where id='ed000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',(select id from saved),now(),'CANCEL','{}')$q$,'42501');
reset role;
-- Current Owner may withdraw a published event, then draft edits remove it from public discovery.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',(select id from saved),(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')->0->>'updatedAt')::timestamptz,'DRAFT',pg_temp.input());
select pg_temp.assert(not exists(select 1 from public.event_discovery_v1 where event_id=(select id from saved)),'owner changes withdraw publication until reviewed');
select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',(select id from saved),(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')->0->>'updatedAt')::timestamptz,'CANCEL','{}');
select pg_temp.assert(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')->0->>'status'='CANCELLED','owner can cancel own linked event');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',null,null,'DRAFT',pg_temp.input()||'{"requestId":"ed000000-0000-4000-8000-000000000021"}'::jsonb);
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',null,null,'DRAFT',pg_temp.input()||'{"requestId":"ed000000-0000-4000-8000-000000000021"}'::jsonb)$q$,'40001');
select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010','ed000000-0000-4000-8000-000000000021',(select (e->>'updatedAt')::timestamptz from jsonb_array_elements(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')) e where e->>'id'='ed000000-0000-4000-8000-000000000021'),'CANCEL','{}');
reset role;
select pg_temp.assert((select published_at is null from public.events_v1 where id='ed000000-0000-4000-8000-000000000021'),'cancelling an unreviewed draft does not publish it');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010',null,null,'PUBLISH',pg_temp.input()||'{"requestId":"ed000000-0000-4000-8000-000000000022"}'::jsonb);
select pg_temp.assert(exists(select 1 from public.event_discovery_v1 where event_id='ed000000-0000-4000-8000-000000000022' and source='manual_admin'),'admin creates and publishes directly in canonical source');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ed000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select pg_temp.assert((select e->>'editable'='false' from jsonb_array_elements(public.list_spot_events_v1('ed000000-0000-4000-8000-000000000010')) e where e->>'id'='ed000000-0000-4000-8000-000000000022'),'owner sees admin-managed event as read-only');
select pg_temp.expect_error($q$select public.save_spot_event_v1('ed000000-0000-4000-8000-000000000010','ed000000-0000-4000-8000-000000000022',now(),'DRAFT',pg_temp.input())$q$,'42501');
reset role;
rollback;
