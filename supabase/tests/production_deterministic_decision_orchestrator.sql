\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(p boolean,m text) returns void language plpgsql as $$begin if p is not true then raise exception 's4 test failed: %',m;end if;end$$;

do $$ declare u uuid:='41000000-0000-4000-8000-000000000001';o uuid:='41000000-0000-4000-8000-000000000002';d uuid:='41000000-0000-4000-8000-000000000010';s uuid:='41000000-0000-4000-8000-000000000020';c uuid;
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','s4@fixture.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',o,'authenticated','authenticated','s4o@fixture.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u),(o) on conflict do nothing;
 insert into public.categories(name) values('Sprint 4 Bar') returning id into c;
 insert into public.spots(id,name,city,country,category_id,status,lat,lng) values(s,'S4 Spot','Basel','Switzerland',c,'approved',47.56,7.59);
 insert into public.decision_sessions(id,user_id,city) values(d,u,'Basel');
 insert into public.decision_impressions(decision_id,spot_id,rank) values(d,s,1);
end$$;
select pg_temp.assert((select enabled=false from public.backyrd_decision_orchestrator_settings_v1 where singleton),'disabled by default');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$begin
 begin perform public.backyrd_read_decision_result_cards_v1(array['41000000-0000-4000-8000-000000000020'::uuid]);raise exception 'client read cards';exception when insufficient_privilege then null;end;
 begin update public.backyrd_decision_orchestrator_settings_v1 set enabled=true;raise exception 'client enabled';exception when insufficient_privilege then null;end;
 begin perform 1 from public.backyrd_deterministic_decision_traces_v1;raise exception 'client read trace';exception when insufficient_privilege then null;end;
end$$;
reset role;

update public.backyrd_decision_input_runtime_settings_v1 set enabled=true where singleton;
update public.backyrd_decision_orchestrator_settings_v1 set enabled=true where singleton;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select public.backyrd_persist_decision_input_trace_v1(
 '41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),
 jsonb_build_object('41000000-0000-4000-8000-000000000020',repeat('e',64)),'LOW_OR_UNKNOWN','{}',repeat('f',64),'VALID');
select pg_temp.assert((select count(*)=1 from public.backyrd_read_decision_result_cards_v1(array['41000000-0000-4000-8000-000000000020'::uuid])),'bounded spot card read');

select public.backyrd_persist_deterministic_decision_trace_v1(
 '41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000001',repeat('f',64),repeat('b',64),repeat('a',64),repeat('c',64),repeat('d',64),
 jsonb_build_object('41000000-0000-4000-8000-000000000020',repeat('e',64)),jsonb_build_object('41000000-0000-4000-8000-000000000020',repeat('1',64)),
 'backyrd-deterministic-ranking-v1',repeat('2',64),'{}',array['41000000-0000-4000-8000-000000000020'::uuid],
 'LOW_OR_UNKNOWN','DETERMINISTIC_NORTH_STAR',repeat('3',64),'COMPLETE_VALID','{}') \gset first_
select public.backyrd_persist_deterministic_decision_trace_v1(
 '41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000001',repeat('f',64),repeat('b',64),repeat('a',64),repeat('c',64),repeat('d',64),
 jsonb_build_object('41000000-0000-4000-8000-000000000020',repeat('e',64)),jsonb_build_object('41000000-0000-4000-8000-000000000020',repeat('1',64)),'backyrd-deterministic-ranking-v1',repeat('2',64),'{}',array['41000000-0000-4000-8000-000000000020'::uuid],
 'LOW_OR_UNKNOWN','DETERMINISTIC_NORTH_STAR',repeat('3',64),'COMPLETE_VALID','{}') \gset replay_
select pg_temp.assert(:'first_backyrd_persist_deterministic_decision_trace_v1'::uuid=:'replay_backyrd_persist_deterministic_decision_trace_v1'::uuid,'response-loss replay idempotent');

do $$begin
 begin perform public.backyrd_persist_deterministic_decision_trace_v1('41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000002',repeat('f',64),repeat('b',64),repeat('a',64),repeat('c',64),repeat('d',64),'{}','{}','v',repeat('2',64),'{}','{}','LOW_OR_UNKNOWN','DETERMINISTIC_NORTH_STAR',repeat('3',64),'COMPLETE_VALID','{}');raise exception 'cross user accepted';exception when insufficient_privilege then null;end;
 begin perform public.backyrd_persist_deterministic_decision_trace_v1('41000000-0000-4000-8000-000000000010','41000000-0000-4000-8000-000000000001',repeat('f',64),repeat('b',64),repeat('a',64),repeat('c',64),repeat('d',64),'{}','{}','v',repeat('2',64),'{}',array['41000000-0000-4000-8000-000000000099'::uuid],'LOW_OR_UNKNOWN','DETERMINISTIC_NORTH_STAR',repeat('3',64),'COMPLETE_VALID','{}');raise exception 'injected candidate accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
