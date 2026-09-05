-- Gate 7: atomic, service-only launch cost boundaries and operational health.
-- Counters contain opaque actor identifiers only; no request payloads, tokens,
-- IP addresses, or Product content are persisted.

create table if not exists public.backyrd_launch_cost_counters_v1 (
  operation text not null,
  scope text not null check (scope in ('subject_minute', 'subject_day', 'global_minute', 'global_day')),
  bucket_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  last_request_at timestamptz not null default now(),
  primary key (operation, scope, bucket_key)
);

alter table public.backyrd_launch_cost_counters_v1 enable row level security;
revoke all on table public.backyrd_launch_cost_counters_v1 from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.backyrd_launch_cost_counters_v1 to service_role;

create or replace function public.backyrd_consume_launch_cost_boundary_v1(
  p_operation text,
  p_subject_key text,
  p_subject_minute_limit integer,
  p_subject_day_limit integer,
  p_global_minute_limit integer,
  p_global_day_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_operation text := nullif(btrim(p_operation), '');
  v_subject text := nullif(btrim(p_subject_key), '');
  v_row record;
  v_limit integer;
  v_blocked_scope text := null;
begin
  if v_operation is null or v_operation !~ '^[a-z0-9_:-]{2,80}$'
    or v_subject is null or length(v_subject) > 160
    or p_subject_minute_limit not between 1 and 10000
    or p_subject_day_limit not between p_subject_minute_limit and 1000000
    or p_global_minute_limit not between p_subject_minute_limit and 1000000
    or p_global_day_limit not between p_global_minute_limit and 10000000 then
    raise exception 'invalid_launch_cost_boundary_input' using errcode = '22023';
  end if;

  insert into public.backyrd_launch_cost_counters_v1(operation, scope, bucket_key, window_started_at)
  values
    (v_operation, 'global_day', 'all', date_trunc('day', v_now)),
    (v_operation, 'global_minute', 'all', date_trunc('minute', v_now)),
    (v_operation, 'subject_day', v_subject, date_trunc('day', v_now)),
    (v_operation, 'subject_minute', v_subject, date_trunc('minute', v_now))
  on conflict (operation, scope, bucket_key) do nothing;

  -- The fixed ordering makes concurrent requests serialize without deadlocks.
  for v_row in
    select operation, scope, bucket_key, window_started_at, request_count
    from public.backyrd_launch_cost_counters_v1
    where operation = v_operation
      and ((scope like 'global_%' and bucket_key = 'all')
        or (scope like 'subject_%' and bucket_key = v_subject))
    order by scope, bucket_key
    for update
  loop
    if v_row.scope like '%_minute' and v_row.window_started_at < date_trunc('minute', v_now) then
      update public.backyrd_launch_cost_counters_v1
      set window_started_at = date_trunc('minute', v_now), request_count = 0, blocked_count = 0
      where operation = v_row.operation and scope = v_row.scope and bucket_key = v_row.bucket_key;
      v_row.request_count := 0;
    elsif v_row.scope like '%_day' and v_row.window_started_at < date_trunc('day', v_now) then
      update public.backyrd_launch_cost_counters_v1
      set window_started_at = date_trunc('day', v_now), request_count = 0, blocked_count = 0
      where operation = v_row.operation and scope = v_row.scope and bucket_key = v_row.bucket_key;
      v_row.request_count := 0;
    end if;

    v_limit := case v_row.scope
      when 'subject_minute' then p_subject_minute_limit
      when 'subject_day' then p_subject_day_limit
      when 'global_minute' then p_global_minute_limit
      when 'global_day' then p_global_day_limit
    end;
    if v_row.request_count >= v_limit and v_blocked_scope is null then
      v_blocked_scope := v_row.scope;
    end if;
  end loop;

  if v_blocked_scope is not null then
    update public.backyrd_launch_cost_counters_v1
    set blocked_count = blocked_count + 1, last_request_at = v_now
    where operation = v_operation and scope = v_blocked_scope
      and bucket_key = case when v_blocked_scope like 'global_%' then 'all' else v_subject end;
    return jsonb_build_object('allowed', false, 'blockedScope', v_blocked_scope);
  end if;

  update public.backyrd_launch_cost_counters_v1
  set request_count = request_count + 1, last_request_at = v_now
  where operation = v_operation
    and ((scope like 'global_%' and bucket_key = 'all')
      or (scope like 'subject_%' and bucket_key = v_subject));

  delete from public.backyrd_launch_cost_counters_v1
  where last_request_at < v_now - interval '48 hours';

  return jsonb_build_object('allowed', true);
end;
$$;

revoke all on function public.backyrd_consume_launch_cost_boundary_v1(text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.backyrd_consume_launch_cost_boundary_v1(text, text, integer, integer, integer, integer) to service_role;

create or replace function public.backyrd_has_claimable_embedding_job_v1()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.backyrd_embedding_jobs_v1
    where status = 'pending'
      or (status = 'processing' and locked_at < now() - interval '5 minutes')
      or (status = 'failed' and attempts < max_attempts)
  );
$$;

revoke all on function public.backyrd_has_claimable_embedding_job_v1() from public, anon, authenticated;
grant execute on function public.backyrd_has_claimable_embedding_job_v1() to service_role;

create or replace function public.backyrd_launch_operations_snapshot_v1()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog, storage, cron
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'database', jsonb_build_object(
      'sizeBytes', pg_database_size(current_database()),
      'connectionsUsed', (select count(*) from pg_stat_activity where datname = current_database()),
      'connectionsActive', (select count(*) from pg_stat_activity where datname = current_database() and state = 'active'),
      'connectionLimit', current_setting('max_connections')::integer,
      'ungrantedLocks', (select count(*) from pg_locks where granted = false)
    ),
    'storage', jsonb_build_object(
      'objectCount', (select count(*) from storage.objects),
      'bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where metadata ? 'size')
    ),
    'backgroundJobs', jsonb_build_object(
      'active', (select count(*) from cron.job where active),
      'failed24h', (select count(*) from cron.job_run_details where status = 'failed' and start_time >= now() - interval '24 hours')
    ),
    'providerBoundaries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'operation', operation, 'scope', scope, 'windowStartedAt', window_started_at,
        'requestCount', request_count, 'blockedCount', blocked_count,
        'lastRequestAt', last_request_at
      ) order by operation, scope)
      from public.backyrd_launch_cost_counters_v1
      where bucket_key = 'all'
    ), '[]'::jsonb),
    'queues', jsonb_build_object(
      'embeddingFailed', (select count(*) from public.backyrd_embedding_jobs_v1 where status = 'FAILED'),
      'safetyTextFailed', (select count(*) from public.safety_text_evaluation_jobs where status in ('failed', 'dead_letter')),
      'safetyImageFailed', (select count(*) from public.safety_image_evaluation_jobs where status in ('failed', 'dead_letter'))
    )
  );
$$;

revoke all on function public.backyrd_launch_operations_snapshot_v1() from public, anon, authenticated;
grant execute on function public.backyrd_launch_operations_snapshot_v1() to service_role;

comment on table public.backyrd_launch_cost_counters_v1 is
  'Gate-7 operational counters for bounded variable-cost paths. Opaque subject keys only; no Product payloads or credentials.';
