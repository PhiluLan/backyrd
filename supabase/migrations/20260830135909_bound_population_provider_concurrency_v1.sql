-- The scheduler request may time out before a long-lived Edge worker stops.
-- Bound provider work in the database claim itself so overlapping worker
-- invocations cannot exceed the run's approved Research concurrency.

create or replace function public.backyrd_claim_spot_research_job_v2(
  p_runner_id text,
  p_lease_seconds integer default 45,
  p_population_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_job public.backyrd_spot_research_jobs_v1%rowtype;
  v_pass public.backyrd_spot_research_passes_v2%rowtype;
  v_token uuid:=gen_random_uuid();
  v_concurrency_limit integer;
  v_provider_slots integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'research_service_only' using errcode='42501';
  end if;
  if p_population_run_id is null then
    raise exception 'population_run_required' using errcode='22023';
  end if;

  -- Serialize the slot decision for this run. A shared lock allowed two
  -- simultaneous claimers to observe the same free provider slot.
  select * into v_run
  from public.backyrd_city_bootstrap_runs_v1
  where id=p_population_run_id
  for update;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'RUNNING' then
    raise exception 'population_run_not_running' using errcode='55000';
  end if;
  v_concurrency_limit:=case
    when v_run.target_configuration->>'researchConcurrencyLimit' in ('2','4')
      then (v_run.target_configuration->>'researchConcurrencyLimit')::integer
    else 2
  end;

  update public.backyrd_spot_research_passes_v2 p
  set state='QUEUED',updated_at=now()
  from public.backyrd_spot_research_jobs_v1 j
  where p.job_id=j.id
    and p.pass_key=j.current_pass
    and j.population_run_id=p_population_run_id
    and j.state='RUNNING'
    and j.lease_expires_at<=now();

  update public.backyrd_spot_research_jobs_v1
  set state='QUEUED',lease_token=null,lease_expires_at=null,runner_id=null,
      available_at=now(),updated_at=now()
  where population_run_id=p_population_run_id
    and state='RUNNING'
    and lease_expires_at<=now();

  -- Count both provider responses known to still be active and claims that
  -- have reserved a slot but have not yet persisted their response id.
  select count(*) into v_provider_slots
  from public.backyrd_spot_research_jobs_v1 j
  join public.backyrd_spot_research_passes_v2 p
    on p.job_id=j.id and p.pass_key=j.current_pass
  where j.population_run_id=p_population_run_id
    and j.state in ('QUEUED','RUNNING')
    and (
      (p.provider_response_id is not null and p.provider_status in ('queued','in_progress'))
      or (j.state='RUNNING' and p.provider_response_id is null)
    );

  -- Polling an existing provider response consumes no new provider slot and
  -- remains allowed at the cap. A fresh response may start only below it.
  select j.* into v_job
  from public.backyrd_spot_research_jobs_v1 j
  join public.backyrd_spot_research_passes_v2 p
    on p.job_id=j.id and p.pass_key=j.current_pass
  where j.population_run_id=p_population_run_id
    and j.state='QUEUED'
    and j.contract_version='backyrd-spot-research-agent-v2.1'
    and j.available_at<=now()
    and p.state in ('PENDING','QUEUED','RUNNING')
    and (
      (p.provider_response_id is not null and p.provider_status in ('queued','in_progress'))
      or v_provider_slots<v_concurrency_limit
    )
  order by
    case when p.provider_response_id is not null and p.provider_status in ('queued','in_progress') then 0 else 1 end,
    j.queued_at
  for update of j skip locked
  limit 1;
  if not found then return null; end if;

  select * into v_pass
  from public.backyrd_spot_research_passes_v2
  where job_id=v_job.id and pass_key=v_job.current_pass
  for update;
  if not found or v_pass.state not in ('PENDING','QUEUED','RUNNING') then
    raise exception 'research_pass_state_invalid' using errcode='22023';
  end if;

  update public.backyrd_spot_research_passes_v2
  set state='RUNNING',started_at=coalesce(started_at,now()),updated_at=now()
  where job_id=v_job.id and pass_key=v_job.current_pass;
  update public.backyrd_spot_research_jobs_v1
  set state='RUNNING',phase='PASS_'||v_job.current_pass||'_RUNNING',
      lease_token=v_token,
      lease_expires_at=now()+make_interval(secs=>greatest(20,least(p_lease_seconds,300))),
      runner_id=left(p_runner_id,120),started_at=coalesce(started_at,now()),updated_at=now()
  where id=v_job.id;

  return jsonb_build_object(
    'jobId',v_job.id,'spotId',v_job.spot_id,'actorId',v_job.actor_id,
    'leaseToken',v_token,'sourceScope',v_job.source_scope,
    'providerResponseId',v_pass.provider_response_id,
    'attemptToken',v_pass.attempt_token,'attempts',v_pass.attempts,
    'passKey',v_job.current_pass,'model',v_job.model,
    'contractVersion',v_job.contract_version,
    'populationRunId',v_job.population_run_id
  );
end $$;

revoke all on function public.backyrd_claim_spot_research_job_v2(text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.backyrd_claim_spot_research_job_v2(text,integer,uuid) to service_role;

comment on function public.backyrd_claim_spot_research_job_v2(text,integer,uuid) is
  'Service-only run-scoped Research claim with a serialized provider-response concurrency bound; overlapping or timed-out workers cannot exceed the run limit.';
