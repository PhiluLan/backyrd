-- Raise only the existing fixed Basel Intelligence Population run from two to
-- three Research workers. Concurrency three was proven in an isolated
-- Production canary before this migration: three simultaneous jobs, no 429,
-- no duplicate provider response, no Research failure, and no unsupported
-- Machine Acceptance. Coverage, queue size, lease, schedule and Trust policy
-- remain unchanged.

do $$
declare
  v_definition text;
  v_matches integer;
  v_rows integer;
  v_old_guard constant text := 'v_run.target_configuration->>''researchConcurrencyLimit''<>''2''';
  v_new_guard constant text := 'v_run.target_configuration->>''researchConcurrencyLimit''<>''3''';
begin
  select count(*) into v_matches
  from public.backyrd_city_bootstrap_runs_v1
  where mode='INTELLIGENCE' and status='RUNNING'
    and target_configuration->>'phase'='FULL_LAUNCH_CURATION'
    and target_configuration->>'researchConcurrencyLimit'='2'
    and target_configuration->>'researchQueueBatchSize'='5'
    and target_configuration->>'researchCoverageTarget'='415'
    and coalesce((target_configuration->>'discoveryEnabled')::boolean,true)=false;
  if v_matches<>1 then
    raise exception 'population_throughput_run_precondition_failed';
  end if;

  select pg_get_functiondef('public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid)'::regprocedure)
    into v_definition;
  if position(v_old_guard in v_definition)=0 or position(v_new_guard in v_definition)>0 then
    raise exception 'population_throughput_guard_precondition_failed';
  end if;
  execute replace(v_definition,v_old_guard,v_new_guard);

  update public.backyrd_city_bootstrap_runs_v1 set
    target_configuration=jsonb_set(target_configuration,'{researchConcurrencyLimit}','3'::jsonb,true)
      || jsonb_build_object('throughputTuning',jsonb_build_object(
        'policyVersion','backyrd-population-throughput-v1',
        'canary','CONCURRENCY_3_PASS',
        'canaryStartedAt','2026-08-30T08:39:26.913678Z',
        'observedConcurrentJobs',3,
        'rateLimitFailures',0,
        'duplicateProviderResponses',0,
        'researchFailures',0,
        'unsupportedAutoAcceptedFacts',0,
        'schedulerIntervalSeconds',120
      )),
    updated_at=now()
  where mode='INTELLIGENCE' and status='RUNNING'
    and target_configuration->>'phase'='FULL_LAUNCH_CURATION'
    and target_configuration->>'researchConcurrencyLimit'='2'
    and target_configuration->>'researchCoverageTarget'='415'
    and coalesce((target_configuration->>'discoveryEnabled')::boolean,true)=false;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'population_throughput_update_failed';end if;
end $$;

comment on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid) is
  'Service-only lease and fail-closed finalization for the fixed 415-Spot Basel launch-curation run, bounded to measured Research concurrency three. No Machine Acceptance authority.';
