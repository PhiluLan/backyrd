begin;

-- backyrd:authorization-positive
set local role service_role;
insert into public.backyrd_nuknuk_request_activity_v1
  (outcome, path, clarification, candidate_count, model_calls, model_ms, librarian_ms, total_ms, failure_stage)
values ('MATCHES','SIMPLE',true,3,1,120,210,550,null),
  ('TIMEOUT','FULL',false,null,1,2000,null,2020,'INTERPRETATION');
insert into public.backyrd_nuknuk_request_activity_v1
  (recorded_at, outcome, path, clarification, model_calls, total_ms)
values (now() - interval '8 days','ERROR','NO_MODEL_CALL',false,0,1);

do $$
declare overview jsonb := public.backyrd_nuknuk_activity_overview_v1();
begin
  if overview->'totals' <> '{"requests":2,"matches":1,"provisional":0,"clarifications":1,"errors":1,"medianMs":550,"p95Ms":2020}'::jsonb
    or jsonb_array_length(overview->'recent') <> 2 then
    raise exception 'NukNuk activity overview did not match expected statistics';
  end if;
end $$;
reset role;

-- backyrd:authorization-negative
set local role authenticated;
do $$
begin
  begin perform public.backyrd_nuknuk_activity_overview_v1(); raise exception 'authenticated can read activity';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.backyrd_nuknuk_request_activity_v1; raise exception 'authenticated can select activity';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
declare retention text;
begin
  if has_function_privilege('anon', 'public.backyrd_nuknuk_activity_overview_v1()', 'execute')
    or has_table_privilege('anon', 'public.backyrd_nuknuk_request_activity_v1', 'select') then
    raise exception 'anon can read activity';
  end if;
  select command into strict retention from cron.job where jobname = 'backyrd-nuknuk-activity-retention-v1';
  execute retention;
  if (select count(*) from public.backyrd_nuknuk_request_activity_v1) <> 2 then
    raise exception 'NukNuk activity retention did not remove only the expired row';
  end if;
end $$;

rollback;
