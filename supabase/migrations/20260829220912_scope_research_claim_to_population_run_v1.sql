-- Intelligence Population workers must only claim jobs from the requested run.
-- The unscoped v1 contract remains available to its existing scheduled/manual
-- callers; launch-curation orchestration uses this additive service-only v2.

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
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'research_service_only' using errcode='42501';
  end if;
  if p_population_run_id is null then
    raise exception 'population_run_required' using errcode='22023';
  end if;

  select * into v_run
  from public.backyrd_city_bootstrap_runs_v1
  where id=p_population_run_id
  for share;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'RUNNING' then
    raise exception 'population_run_not_running' using errcode='55000';
  end if;

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

  select * into v_job
  from public.backyrd_spot_research_jobs_v1
  where population_run_id=p_population_run_id
    and state='QUEUED'
    and contract_version='backyrd-spot-research-agent-v2.1'
    and available_at<=now()
  order by queued_at
  for update skip locked
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
  'Service-only run-scoped research claim for bounded Intelligence Population; never claims or recovers jobs from another run.';
