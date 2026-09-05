-- Gate 7: keep Founder operations health aligned with current, actionable state.
-- Historical terminal Safety jobs remain audit evidence but are not active queue failures.

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
      'embeddingFailed', (
        select count(*) from public.backyrd_embedding_jobs_v1 where status = 'failed'
      ),
      'safetyTextFailed', (
        select count(*)
        from public.safety_text_evaluation_jobs j
        join public.safety_cases c on c.id = j.case_id
        where j.status in ('failed', 'dead_letter')
          and c.case_status not in ('decided', 'closed')
      ),
      'safetyImageFailed', (
        select count(*)
        from public.safety_image_evaluation_jobs j
        join public.safety_cases c on c.id = j.case_id
        where j.status in ('failed', 'dead_letter')
          and c.case_status not in ('decided', 'closed')
      )
    )
  );
$$;

revoke all on function public.backyrd_launch_operations_snapshot_v1() from public, anon, authenticated;
grant execute on function public.backyrd_launch_operations_snapshot_v1() to service_role;
