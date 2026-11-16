create table public.backyrd_nuknuk_request_activity_v1 (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  outcome text not null check (outcome in ('MATCHES','PROVISIONAL','EMPTY','CLARIFICATION','NEW_PLAN','OFF_TOPIC','UNRESOLVED','TIMEOUT','ERROR')),
  path text not null check (path in ('SIMPLE','FULL','SIMPLE_TO_FULL','DIALOGUE','NO_MODEL_CALL')),
  clarification boolean not null,
  candidate_count integer check (candidate_count between 0 and 1000),
  model_calls integer not null check (model_calls between 0 and 10),
  model_ms integer check (model_ms >= 0),
  librarian_ms integer check (librarian_ms >= 0),
  total_ms integer not null check (total_ms >= 0),
  failure_stage text check (failure_stage in ('INTERPRETATION','EVALUATION','RESPONSE_BUILD','IDEMPOTENCY','LEARNING','FINAL_OUTPUT'))
);
create index backyrd_nuknuk_request_activity_recent_v1
  on public.backyrd_nuknuk_request_activity_v1 (recorded_at desc, id desc);

alter table public.backyrd_nuknuk_request_activity_v1 enable row level security;
revoke all on public.backyrd_nuknuk_request_activity_v1 from public, anon, authenticated;
grant select, insert on public.backyrd_nuknuk_request_activity_v1 to service_role;

comment on table public.backyrd_nuknuk_request_activity_v1 is
  'NukNuk operations only. No query text, account IDs, or product request identifiers. Seven-day retention.';

create function public.backyrd_nuknuk_activity_overview_v1()
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  with recent as (
    select * from public.backyrd_nuknuk_request_activity_v1
    where recorded_at >= now() - interval '24 hours'
  ), totals as (
    select count(*) as requests,
      count(*) filter (where outcome = 'MATCHES') as matches,
      count(*) filter (where outcome = 'PROVISIONAL') as provisional,
      count(*) filter (where clarification) as clarifications,
      count(*) filter (where outcome in ('ERROR', 'TIMEOUT')) as errors,
      percentile_disc(0.5) within group (order by total_ms) as "medianMs",
      percentile_disc(0.95) within group (order by total_ms) as "p95Ms"
    from recent
  ), latest as (
    select * from recent order by recorded_at desc, id desc limit 50
  )
  select jsonb_build_object(
    'checkedAt', now(),
    'totals', (select to_jsonb(totals) from totals),
    'recent', (select coalesce(jsonb_agg(to_jsonb(latest) order by recorded_at desc, id desc), '[]'::jsonb) from latest)
  );
$$;
revoke all on function public.backyrd_nuknuk_activity_overview_v1() from public, anon, authenticated;
grant execute on function public.backyrd_nuknuk_activity_overview_v1() to service_role;

select cron.schedule('backyrd-nuknuk-activity-retention-v1', '43 * * * *', $cron$
  delete from public.backyrd_nuknuk_request_activity_v1
  where recorded_at < now() - interval '7 days';
$cron$);
