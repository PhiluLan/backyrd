-- Service-only concurrency transition for the existing fixed Basel Population
-- run. The scheduler reads the run configuration, while this RPC is the sole
-- writer and accepts only the Founder-approved, canary-proven ceiling of four.

do $$
declare
  v_definition text;
  v_old_guard constant text := 'v_run.target_configuration->>''researchConcurrencyLimit''<>''2''';
  v_new_guard constant text := 'v_run.target_configuration->>''researchConcurrencyLimit'' not in (''2'',''4'')';
begin
  select pg_get_functiondef('public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)'::regprocedure)
    into v_definition;
  if position(v_old_guard in v_definition)=0 or position(v_new_guard in v_definition)>0 then
    raise exception 'population_throughput_guard_precondition_failed';
  end if;
  execute replace(v_definition,v_old_guard,v_new_guard);
end $$;

create or replace function public.backyrd_set_intelligence_population_concurrency_v1(p_run_id uuid,p_concurrency integer)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_active integer;
  v_rows integer;
begin
  if auth.uid() is not null or coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  if p_concurrency<>4 then raise exception 'population_concurrency_not_approved' using errcode='22023';end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id for update;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'RUNNING'
    or v_run.target_configuration->>'phase'<>'FULL_LAUNCH_CURATION'
    or v_run.target_configuration->>'researchConcurrencyLimit'<>'2'
    or v_run.target_configuration->>'researchQueueBatchSize'<>'5'
    or v_run.target_configuration->>'researchCoverageTarget'<>'415'
    or coalesce((v_run.target_configuration->>'discoveryEnabled')::boolean,true) then
    raise exception 'population_throughput_run_precondition_failed' using errcode='40001';
  end if;
  select count(*) into v_active from public.backyrd_spot_research_jobs_v1
  where population_run_id=p_run_id and state in ('QUEUED','RUNNING');
  if v_active<>0 then raise exception 'population_throughput_jobs_active' using errcode='40001';end if;
  update public.backyrd_city_bootstrap_runs_v1 set
    target_configuration=jsonb_set(target_configuration,'{researchConcurrencyLimit}','4'::jsonb,true)
      || jsonb_build_object('throughputTuning',jsonb_build_object(
        'policyVersion','backyrd-population-throughput-v1',
        'canary','CONCURRENCY_4_PASS',
        'canaryStartedAt','2026-08-30T09:55:06.420532Z',
        'observedConcurrentJobs',4,
        'rateLimitFailures',0,
        'duplicateProviderResponses',0,
        'researchFailures',0,
        'unsupportedAutoAcceptedFacts',0,
        'httpTimeoutDuplicateExecution',false,
        'schedulerIntervalSeconds',120
      )),updated_at=now()
  where id=p_run_id and status='RUNNING';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'population_throughput_update_failed' using errcode='40001';end if;
  return jsonb_build_object('runId',p_run_id,'researchConcurrencyLimit',4,'schedulerIntervalSeconds',120);
end $$;

revoke all on function public.backyrd_set_intelligence_population_concurrency_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.backyrd_set_intelligence_population_concurrency_v1(uuid,integer) to service_role;

comment on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid) is
  'Service-only lease and fail-closed finalization for the fixed 415-Spot Basel launch-curation run, bounded to Founder-approved measured Research concurrency four. No Machine Acceptance authority.';
comment on function public.backyrd_set_intelligence_population_concurrency_v1(uuid,integer) is
  'Service-only one-way transition of the fixed running Basel Population run from Research concurrency two to Founder-approved four at an idle checkpoint. No caller actor and no Machine Acceptance authority.';
