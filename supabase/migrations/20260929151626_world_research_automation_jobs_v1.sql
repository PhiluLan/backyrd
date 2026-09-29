-- Automated World research is proposal-only. Only the service role can see
-- exports, provider response IDs, or generated documents; Admin review still
-- uses the existing World research preview/import boundary.
create table public.world_research_automation_jobs_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id),
  spot_name text not null check (length(spot_name) between 1 and 240),
  actor_id uuid not null,
  export_document jsonb not null check (jsonb_typeof(export_document) = 'object'),
  result_document jsonb check (result_document is null or jsonb_typeof(result_document) = 'object'),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'RUNNING', 'READY_FOR_REVIEW', 'FAILED')),
  provider_response_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 3),
  poll_count integer not null default 0 check (poll_count >= 0),
  available_at timestamptz not null default now(),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index world_research_automation_jobs_v1_active_spot
  on public.world_research_automation_jobs_v1(spot_id)
  where status in ('QUEUED', 'RUNNING');
create index world_research_automation_jobs_v1_claim
  on public.world_research_automation_jobs_v1(status, available_at, created_at);
create index world_research_automation_jobs_v1_actor
  on public.world_research_automation_jobs_v1(actor_id, created_at desc);

alter table public.world_research_automation_jobs_v1 enable row level security;
revoke all on public.world_research_automation_jobs_v1 from public, anon, authenticated;
grant select, insert, update on public.world_research_automation_jobs_v1 to service_role;

create function public.world_research_automation_enqueue_v1(
  p_actor_id uuid, p_spot_id uuid, p_export_document jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_existing public.world_research_automation_jobs_v1%rowtype;
declare v_new public.world_research_automation_jobs_v1%rowtype;
begin
  if p_actor_id is null or p_spot_id is null
    or jsonb_typeof(p_export_document) <> 'object'
    or p_export_document->>'contractVersion' <> 'backyrd.world-research-batch@1.1'
    or coalesce(jsonb_typeof(p_export_document->'batch'->'spots'), 'null') <> 'array'
    or jsonb_array_length(p_export_document->'batch'->'spots') <> 1
    or p_export_document#>>'{batch,spots,0,spotId}' <> p_spot_id::text then
    raise exception 'world_research_automation_export_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('world-research:' || p_actor_id::text));
  select * into v_existing from public.world_research_automation_jobs_v1
    where spot_id = p_spot_id and status in ('QUEUED', 'RUNNING')
    order by created_at desc limit 1;
  if found then
    -- A repeated button press creates a fresh export UUID. Reuse the active
    -- actor/spot job rather than interpreting that new hash as a new request.
    if v_existing.actor_id = p_actor_id then
      return jsonb_build_object('jobId', v_existing.id, 'status', v_existing.status, 'reused', true);
    end if;
    raise exception 'world_research_automation_spot_busy' using errcode = '23505';
  end if;
  if (select count(*) from public.world_research_automation_jobs_v1
      where actor_id = p_actor_id and created_at >= now() - interval '1 day') >= 10 then
    raise exception 'world_research_automation_daily_limit' using errcode = '22023';
  end if;
  insert into public.world_research_automation_jobs_v1(spot_id, spot_name, actor_id, export_document)
    values (p_spot_id, p_export_document#>>'{batch,spots,0,name}', p_actor_id, p_export_document) returning * into v_new;
  return jsonb_build_object('jobId', v_new.id, 'status', v_new.status, 'reused', false);
end $$;

create function public.world_research_automation_claim_v1(
  p_lease_seconds integer default 90
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_job public.world_research_automation_jobs_v1%rowtype;
declare v_token uuid := gen_random_uuid();
begin
  if p_lease_seconds not between 30 and 300 then
    raise exception 'world_research_automation_lease_invalid' using errcode = '22023';
  end if;
  update public.world_research_automation_jobs_v1
    set status = 'FAILED', failure_code = 'world_research_automation_attempt_limit',
        lease_token = null, lease_expires_at = null, completed_at = now(), updated_at = now()
    where status in ('QUEUED', 'RUNNING') and (status = 'QUEUED' or lease_expires_at < now())
      and (attempts >= 3 and provider_response_id is null or poll_count >= 60 or created_at < now() - interval '2 hours');
  select * into v_job from public.world_research_automation_jobs_v1
    where ((status = 'QUEUED' and available_at <= now())
      or (status = 'RUNNING' and lease_expires_at < now()))
      and (attempts < 3 or provider_response_id is not null) and poll_count < 60
      and created_at >= now() - interval '2 hours'
    order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.world_research_automation_jobs_v1
    set status = 'RUNNING', lease_token = v_token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        attempts = attempts + case when v_job.provider_response_id is null then 1 else 0 end,
        updated_at = now()
    where id = v_job.id;
  return jsonb_build_object('jobId', v_job.id, 'leaseToken', v_token,
    'exportDocument', v_job.export_document,
    'providerResponseId', v_job.provider_response_id, 'pollCount', v_job.poll_count);
end $$;

revoke all on function public.world_research_automation_enqueue_v1(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.world_research_automation_enqueue_v1(uuid, uuid, jsonb) to service_role;
revoke all on function public.world_research_automation_claim_v1(integer) from public, anon, authenticated;
grant execute on function public.world_research_automation_claim_v1(integer) to service_role;

comment on table public.world_research_automation_jobs_v1 is
  'Durable, service-only World research proposals. No canonical fact or Decision write authority.';
