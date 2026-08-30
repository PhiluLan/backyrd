-- Exact, explicit replacement of the existing lease function. Concurrency
-- four is valid only for the already-authorized Production run; all other
-- compatible Population runs remain restricted to the original value two.
create or replace function public.backyrd_intelligence_population_tick_control_v1(
  p_run_id uuid,p_action text,p_lease_token uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_claimed boolean:=false;
  v_ledger_count integer;v_pending integer;v_active_jobs integer;v_incomplete_jobs integer;v_unsupported integer;v_snapshot jsonb;v_batch integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'intelligence_population_service_only' using errcode='42501';end if;
  if p_run_id is null or p_lease_token is null or p_action not in ('CLAIM','RELEASE','STOP','FINALIZE') then raise exception 'intelligence_population_tick_invalid' using errcode='22023';end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id for update;
  if not found or v_run.mode<>'INTELLIGENCE'
    or v_run.target_configuration->>'phase'<>'FULL_LAUNCH_CURATION'
    or (v_run.target_configuration->>'researchConcurrencyLimit'<>'2' and not (
      v_run.id='d6b5bfb0-4236-44f9-aa80-68be421bc289'::uuid and v_run.target_configuration->>'researchConcurrencyLimit'='4'))
    or v_run.target_configuration->>'researchCoverageTarget'<>'415'
    or coalesce((v_run.target_configuration->>'discoveryEnabled')::boolean,true) then raise exception 'intelligence_population_run_invalid' using errcode='42501';end if;
  if v_run.requested_by is null or not exists(select 1 from public.admin_users a where a.user_id=v_run.requested_by and a.role in ('admin','super_admin')) then raise exception 'intelligence_population_actor_lineage_invalid' using errcode='42501';end if;
  if p_action='CLAIM' then
    if v_run.status<>'RUNNING' then return jsonb_build_object('claimed',false,'reason','RUN_NOT_RUNNING');end if;
    if nullif(v_run.target_configuration#>>'{populationTickLease,expiresAt}','') is null or (v_run.target_configuration#>>'{populationTickLease,expiresAt}')::timestamptz<=now() then
      update public.backyrd_city_bootstrap_runs_v1 set target_configuration=jsonb_set(target_configuration,'{populationTickLease}',jsonb_build_object('token',p_lease_token::text,'expiresAt',(now()+interval '110 seconds')::text),true),updated_at=now() where id=p_run_id;v_claimed:=true;
    end if;
    return jsonb_build_object('claimed',v_claimed,'leaseSeconds',110);
  end if;
  if v_run.target_configuration#>>'{populationTickLease,token}' is distinct from p_lease_token::text then raise exception 'intelligence_population_lease_invalid' using errcode='40001';end if;
  if p_action='RELEASE' then update public.backyrd_city_bootstrap_runs_v1 set target_configuration=target_configuration-'populationTickLease',updated_at=now() where id=p_run_id;return jsonb_build_object('released',true);end if;
  if p_action='STOP' then perform cron.unschedule(jobid) from cron.job where jobname='backyrd-intelligence-population-v1';update public.backyrd_city_bootstrap_runs_v1 set target_configuration=target_configuration-'populationTickLease',updated_at=now() where id=p_run_id;return jsonb_build_object('stopped',true);end if;
  select count(*),count(*) filter(where terminal_state in ('PENDING','QUEUED','PROCESSING')) into v_ledger_count,v_pending from public.backyrd_spot_intelligence_population_v1 where run_id=p_run_id;
  select count(*) filter(where state in ('QUEUED','RUNNING')),count(*) filter(where state not in ('READY_FOR_REVIEW','FAILED')) into v_active_jobs,v_incomplete_jobs from public.backyrd_spot_research_jobs_v1 where population_run_id=p_run_id;
  select count(*) into v_unsupported from public.backyrd_spot_fact_proposals_v1 p join public.backyrd_spot_research_jobs_v1 j on p.idempotency_key like ('research-v2.1:'||j.id::text||':%') left join public.backyrd_spot_accepted_facts_v1 f on f.proposal_id=p.id and f.status='ACTIVE'
  where j.population_run_id=p_run_id and p.status='ACCEPTED' and p.reviewed_by is null and (p.machine_policy_version is distinct from 'backyrd-machine-acceptance-v1' or p.field_key not in ('contact.website','contact.phone','contact.email','opening.regular') or p.research_entity_scope<>'SPOT' or p.research_durability<>'PERSISTENT' or p.research_scope_resolution<>'PASS' or p.machine_evidence_fingerprint is null or p.resolution_note<>'SYSTEM_POLICY:backyrd-machine-acceptance-v1' or f.id is null or f.acceptance_actor_type<>'SYSTEM_POLICY' or f.acceptance_policy_version<>'backyrd-machine-acceptance-v1' or f.acceptance_job_id<>j.id or f.acceptance_evidence_fingerprint is distinct from p.machine_evidence_fingerprint or not exists(select 1 from public.backyrd_spot_gold_authoring_audit_v1 a where a.subject_id=p.id and a.action='MACHINE_ACCEPT' and a.actor_id is null));
  if v_ledger_count<>415 or v_pending<>0 or v_active_jobs<>0 or v_incomplete_jobs<>0 or v_unsupported<>0 then raise exception 'intelligence_population_not_ready' using errcode='55000';end if;
  select jsonb_build_object('phase','FULL_LAUNCH_CURATION','inScope',v_ledger_count,'terminal',count(*),'researched',count(*) filter(where researched_fact_count>0),'researchedUnknown',count(*) filter(where terminal_state='PROCESSED_UNKNOWN'),'reviewRequired',count(*) filter(where terminal_state='REVIEW_REQUIRED'),'notApplicable',count(*) filter(where terminal_state='NOT_APPLICABLE'),'failed',count(*) filter(where terminal_state='FAILED_WITH_EXPLICIT_REASON'),'relevantFacts',sum(relevant_fact_count),'researchedFacts',sum(researched_fact_count),'autoAcceptedFacts',sum(auto_accepted_count),'reviewRequiredFacts',sum(review_required_count),'unsupportedAutoAcceptedFacts',v_unsupported) into v_snapshot from public.backyrd_spot_intelligence_population_v1 where run_id=p_run_id;
  select coalesce(max(batch_number),-1)+1 into v_batch from public.backyrd_city_bootstrap_checkpoints_v1 where run_id=p_run_id;
  insert into public.backyrd_city_bootstrap_checkpoints_v1(run_id,batch_number,snapshot,verdict) values(p_run_id,v_batch,v_snapshot,'PASS');
  perform cron.unschedule(jobid) from cron.job where jobname='backyrd-intelligence-population-v1';
  update public.backyrd_city_bootstrap_runs_v1 set status='COMPLETED',completed_at=now(),stop_reason='COMPLETED:INTELLIGENCE_POPULATION_415_TERMINAL',target_configuration=target_configuration-'populationTickLease',updated_at=now() where id=p_run_id and status='RUNNING';
  if not found then raise exception 'intelligence_population_completion_race' using errcode='40001';end if;
  return jsonb_build_object('completed',true,'snapshot',v_snapshot);
end $$;

create or replace function public.backyrd_activate_intelligence_population_concurrency_four_v1()
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_run_id constant uuid := 'd6b5bfb0-4236-44f9-aa80-68be421bc289';
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_active integer;
  v_rows integer;
begin
  if auth.uid() is not null or coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=v_run_id for update;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'RUNNING'
    or v_run.target_configuration->>'phase'<>'FULL_LAUNCH_CURATION'
    or v_run.target_configuration->>'researchConcurrencyLimit'<>'2'
    or v_run.target_configuration->>'researchQueueBatchSize'<>'5'
    or v_run.target_configuration->>'researchCoverageTarget'<>'415'
    or coalesce((v_run.target_configuration->>'discoveryEnabled')::boolean,true) then
    raise exception 'population_throughput_run_precondition_failed' using errcode='40001';
  end if;
  select count(*) into v_active from public.backyrd_spot_research_jobs_v1
  where population_run_id=v_run_id and state in ('QUEUED','RUNNING');
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
  where id=v_run_id and status='RUNNING';
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'population_throughput_update_failed' using errcode='40001';end if;
  return jsonb_build_object('runId',v_run_id,'researchConcurrencyLimit',4,'schedulerIntervalSeconds',120);
end $$;

revoke all on function public.backyrd_activate_intelligence_population_concurrency_four_v1() from public,anon,authenticated;
grant execute on function public.backyrd_activate_intelligence_population_concurrency_four_v1() to service_role;

comment on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid) is
  'Service-only lease and fail-closed finalization for the fixed 415-Spot Basel launch-curation run, bounded to Founder-approved measured Research concurrency four. No Machine Acceptance authority.';
comment on function public.backyrd_activate_intelligence_population_concurrency_four_v1() is
  'Service-only no-argument transition of the exact running Basel Population run from Research concurrency two to Founder-approved four at an idle checkpoint. No caller actor and no Machine Acceptance authority.';
