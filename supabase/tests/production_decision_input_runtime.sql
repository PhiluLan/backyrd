\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'decision input runtime test failed: %', p_message;
  end if;
end $$;

do $$
declare
  v_user_a uuid := '31000000-0000-4000-8000-000000000001';
  v_user_b uuid := '31000000-0000-4000-8000-000000000002';
  v_decision uuid := '31000000-0000-4000-8000-000000000010';
  v_category uuid;
  v_spot uuid := '31000000-0000-4000-8000-000000000020';
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',v_user_a,'authenticated','authenticated','s3-a@fixture.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_user_b,'authenticated','authenticated','s3-b@fixture.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(v_user_a),(v_user_b) on conflict do nothing;
  insert into public.categories(name) values('Sprint 3 Bar') returning id into v_category;
  insert into public.spots(id,name,city,country,category_id,status,lat,lng)
  values(v_spot,'Sprint 3 Bar','Basel','Switzerland',v_category,'approved',47.56,7.59);
  insert into public.decision_sessions(id,user_id,city,created_at)
  values(v_decision,v_user_a,'Basel','2026-08-21T18:00:00Z');
end $$;

select pg_temp.assert(
  (select enabled is false from public.backyrd_decision_input_runtime_settings_v1 where singleton),
  'runtime is disabled by default'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
  begin
    perform public.backyrd_read_decision_candidate_facts_v1(array['31000000-0000-4000-8000-000000000020'::uuid]);
    raise exception 'authenticated client read privileged candidate facts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.backyrd_persist_decision_input_trace_v1(
      '31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000001',
      repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),'{}','LOW_OR_UNKNOWN','{}',repeat('e',64),'VALID'
    );
    raise exception 'authenticated client persisted a trace';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.backyrd_decision_input_runtime_settings_v1 set enabled=true;
    raise exception 'authenticated client enabled runtime';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.backyrd_decision_input_runtime_settings_v1 set enabled=true where singleton;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);

select pg_temp.assert(
  (select count(*)=1 and bool_and(status='approved' and city='Basel' and category_name='Sprint 3 Bar')
   from public.backyrd_read_decision_candidate_facts_v1(array['31000000-0000-4000-8000-000000000020'::uuid])),
  'service reads bounded candidate facts'
);

select public.backyrd_persist_decision_input_trace_v1(
  '31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000001',
  repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),
  jsonb_build_object('31000000-0000-4000-8000-000000000020',repeat('f',64)),
  'LOW_OR_UNKNOWN',jsonb_build_object('n3','frozen','n5','frozen'),repeat('e',64),'VALID'
) \gset trace_

select public.backyrd_persist_decision_input_trace_v1(
  '31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000001',
  repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),
  jsonb_build_object('31000000-0000-4000-8000-000000000020',repeat('f',64)),
  'LOW_OR_UNKNOWN',jsonb_build_object('n3','frozen','n5','frozen'),repeat('e',64),'VALID'
) \gset replay_

select pg_temp.assert(:'trace_backyrd_persist_decision_input_trace_v1'::uuid=:'replay_backyrd_persist_decision_input_trace_v1'::uuid,'same package replay is idempotent');

do $$
begin
  begin
    perform public.backyrd_persist_decision_input_trace_v1(
      '31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000002',
      repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),'{}','LOW_OR_UNKNOWN','{}',repeat('e',64),'VALID'
    );
    raise exception 'cross-user trace persisted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.backyrd_persist_decision_input_trace_v1(
      '31000000-0000-4000-8000-000000000010','31000000-0000-4000-8000-000000000001',
      repeat('a',64),repeat('b',64),repeat('c',64),repeat('d',64),'{}','LOW_OR_UNKNOWN','{}',repeat('9',64),'VALID'
    );
    raise exception 'conflicting frozen package replay succeeded';
  exception when unique_violation then null;
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
begin
  begin
    perform 1 from public.backyrd_decision_input_traces_v1;
    raise exception 'authenticated client read a private trace';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
