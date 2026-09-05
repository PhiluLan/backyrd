\set ON_ERROR_STOP on
begin;

create function pg_temp.gate7_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'gate7 launch boundary failed: %', p_message; end if;
end;
$$;

select pg_temp.gate7_assert(
  (public.backyrd_consume_launch_cost_boundary_v1('gate7_test', 'user-a', 2, 3, 4, 5)->>'allowed')::boolean,
  'first request should be allowed'
);
select pg_temp.gate7_assert(
  (public.backyrd_consume_launch_cost_boundary_v1('gate7_test', 'user-a', 2, 3, 4, 5)->>'allowed')::boolean,
  'second request should be allowed'
);
select pg_temp.gate7_assert(
  public.backyrd_consume_launch_cost_boundary_v1('gate7_test', 'user-a', 2, 3, 4, 5)->>'blockedScope' = 'subject_minute',
  'third request should hit subject minute limit'
);
select pg_temp.gate7_assert(
  (public.backyrd_consume_launch_cost_boundary_v1('gate7_test', 'user-b', 2, 3, 4, 5)->>'allowed')::boolean,
  'another subject should remain allowed'
);
select pg_temp.gate7_assert(
  (public.backyrd_consume_launch_cost_boundary_v1('gate7_test', 'user-c', 2, 3, 4, 5)->>'allowed')::boolean,
  'fourth global request should be allowed'
);
select pg_temp.gate7_assert(
  public.backyrd_consume_launch_cost_boundary_v1('gate7_test', 'user-d', 2, 3, 4, 5)->>'blockedScope' = 'global_minute',
  'fifth global request should be blocked'
);
select pg_temp.gate7_assert(
  (select request_count = 4 and blocked_count = 1 from public.backyrd_launch_cost_counters_v1
   where operation='gate7_test' and scope='global_minute' and bucket_key='all'),
  'accepted and blocked counters should stay distinct'
);

do $$
begin
  begin
    perform public.backyrd_consume_launch_cost_boundary_v1('BAD OPERATION', 'x', 1, 1, 1, 1);
    raise exception 'malformed operation was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.backyrd_consume_launch_cost_boundary_v1('gate7_test', '', 1, 1, 1, 1);
    raise exception 'empty subject was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

select pg_temp.gate7_assert(has_table_privilege('service_role', 'public.backyrd_launch_cost_counters_v1', 'SELECT'), 'service role needs counter visibility');
select pg_temp.gate7_assert(not has_table_privilege('authenticated', 'public.backyrd_launch_cost_counters_v1', 'SELECT'), 'authenticated must not inspect counters');
select pg_temp.gate7_assert(has_function_privilege('service_role', 'public.backyrd_launch_operations_snapshot_v1()', 'EXECUTE'), 'service role needs operations snapshot');
select pg_temp.gate7_assert(not has_function_privilege('authenticated', 'public.backyrd_launch_operations_snapshot_v1()', 'EXECUTE'), 'authenticated must not call operations snapshot');
select pg_temp.gate7_assert(has_function_privilege('service_role', 'public.backyrd_has_claimable_embedding_job_v1()', 'EXECUTE'), 'service role needs bounded embedding queue visibility');
select pg_temp.gate7_assert(not has_function_privilege('authenticated', 'public.backyrd_has_claimable_embedding_job_v1()', 'EXECUTE'), 'authenticated must not inspect embedding queue state');

rollback;
