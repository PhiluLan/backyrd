-- A Machine Acceptance may deterministically confirm an already-active fact.
-- In that case the proposal is accepted and audited, but the gateway performs
-- no canonical write and therefore does not relink the existing fact. Treat
-- that explicit no-write lineage as supported while keeping every proposal,
-- evidence, scope and audit invariant fail-closed.

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
  select count(*) into v_unsupported
  from public.backyrd_spot_fact_proposals_v1 p
  join public.backyrd_spot_research_jobs_v1 j
    on p.idempotency_key like ('research-v2.1:'||j.id::text||':%')
  where j.population_run_id=p_run_id and p.status='ACCEPTED' and p.reviewed_by is null
    and (
      p.machine_policy_version is distinct from 'backyrd-machine-acceptance-v1'
      or p.field_key not in ('contact.website','contact.phone','contact.email','opening.regular')
      or p.research_entity_scope<>'SPOT' or p.research_durability<>'PERSISTENT'
      or p.research_scope_resolution<>'PASS' or p.machine_evidence_fingerprint is null
      or p.resolution_note<>'SYSTEM_POLICY:backyrd-machine-acceptance-v1'
      or not (
        exists(
          select 1
          from public.backyrd_spot_accepted_facts_v1 f
          join public.backyrd_spot_gold_authoring_audit_v1 a
            on a.subject_id=p.id and a.action='MACHINE_ACCEPT' and a.actor_id is null
            and a.metadata->>'acceptedFactId'=f.id::text
          where f.proposal_id=p.id and f.status='ACTIVE'
            and f.acceptance_actor_type='SYSTEM_POLICY'
            and f.acceptance_policy_version='backyrd-machine-acceptance-v1'
            and f.acceptance_job_id=j.id
            and f.acceptance_evidence_fingerprint is not distinct from p.machine_evidence_fingerprint
            and a.metadata->>'actorType'='SYSTEM_POLICY'
            and a.metadata->>'policyVersion'='backyrd-machine-acceptance-v1'
            and a.metadata->>'jobId'=j.id::text
            and a.metadata->>'evidenceFingerprint'=p.machine_evidence_fingerprint
            and a.metadata->>'sameExistingTruth'='false'
        )
        or exists(
          select 1
          from public.backyrd_spot_gold_authoring_audit_v1 a
          join public.backyrd_spot_accepted_facts_v1 f
            on f.id::text=a.metadata->>'acceptedFactId'
          where a.subject_id=p.id and a.action='MACHINE_ACCEPT' and a.actor_id is null
            and a.metadata->>'actorType'='SYSTEM_POLICY'
            and a.metadata->>'policyVersion'='backyrd-machine-acceptance-v1'
            and a.metadata->>'jobId'=j.id::text
            and a.metadata->>'evidenceFingerprint'=p.machine_evidence_fingerprint
            and a.metadata->>'sameExistingTruth'='true'
            and f.status='ACTIVE' and f.spot_id=p.spot_id and f.field_key=p.field_key
            and f.value is not distinct from p.proposed_value
        )
      )
    );
  if v_ledger_count<>415 or v_pending<>0 or v_active_jobs<>0 or v_incomplete_jobs<>0 or v_unsupported<>0 then raise exception 'intelligence_population_not_ready' using errcode='55000';end if;
  select jsonb_build_object('phase','FULL_LAUNCH_CURATION','inScope',v_ledger_count,'terminal',count(*),'researched',count(*) filter(where researched_fact_count>0),'researchedUnknown',count(*) filter(where terminal_state='PROCESSED_UNKNOWN'),'reviewRequired',count(*) filter(where terminal_state='REVIEW_REQUIRED'),'notApplicable',count(*) filter(where terminal_state='NOT_APPLICABLE'),'failed',count(*) filter(where terminal_state='FAILED_WITH_EXPLICIT_REASON'),'relevantFacts',sum(relevant_fact_count),'researchedFacts',sum(researched_fact_count),'autoAcceptedFacts',sum(auto_accepted_count),'reviewRequiredFacts',sum(review_required_count),'unsupportedAutoAcceptedFacts',v_unsupported) into v_snapshot from public.backyrd_spot_intelligence_population_v1 where run_id=p_run_id;
  select coalesce(max(batch_number),-1)+1 into v_batch from public.backyrd_city_bootstrap_checkpoints_v1 where run_id=p_run_id;
  insert into public.backyrd_city_bootstrap_checkpoints_v1(run_id,batch_number,snapshot,verdict) values(p_run_id,v_batch,v_snapshot,'PASS');
  perform cron.unschedule(jobid) from cron.job where jobname='backyrd-intelligence-population-v1';
  update public.backyrd_city_bootstrap_runs_v1 set status='COMPLETED',completed_at=now(),stop_reason='COMPLETED:INTELLIGENCE_POPULATION_415_TERMINAL',target_configuration=target_configuration-'populationTickLease',updated_at=now() where id=p_run_id and status='RUNNING';
  if not found then raise exception 'intelligence_population_completion_race' using errcode='40001';end if;
  return jsonb_build_object('completed',true,'snapshot',v_snapshot);
end $$;

revoke all on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid) to service_role;

comment on function public.backyrd_intelligence_population_tick_control_v1(uuid,text,uuid) is
  'Service-only lease and fail-closed finalization for the fixed 415-Spot Basel launch-curation run. Exact same-existing-truth no-write audit lineage is supported; Machine Acceptance authority is unchanged.';
