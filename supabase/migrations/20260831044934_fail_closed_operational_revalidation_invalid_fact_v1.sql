-- A historical extraction can pass the generic catalog shape check while
-- still failing the stricter field-specific Machine Acceptance validator.
-- Keep a known deterministic validator denial terminal and auditable for the
-- extraction instead of rolling back unrelated safe rows in the bounded batch.

create or replace function public.backyrd_revalidate_intelligence_operational_batch_v1(
  p_run_id uuid,p_policy_version text,p_limit integer default 5
) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_row record;v_result jsonb;v_results jsonb:='[]';v_processed integer:=0;
  v_validation_error text;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'operational_revalidation_service_only' using errcode='42501';
  end if;
  if p_policy_version<>'backyrd-machine-acceptance-v1' then
    raise exception 'operational_revalidation_policy_invalid' using errcode='22023';
  end if;
  if p_limit is null or p_limit<1 or p_limit>5 then
    raise exception 'operational_revalidation_batch_invalid' using errcode='22023';
  end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'COMPLETED'
    or v_run.stop_reason<>'COMPLETED:INTELLIGENCE_POPULATION_415_TERMINAL'
    or v_run.target_configuration->>'phase'<>'FULL_LAUNCH_CURATION'
    or v_run.target_configuration->>'discoveryEnabled'<>'false'
    or v_run.target_configuration->>'researchCoverageTarget'<>'415' then
    raise exception 'operational_revalidation_run_invalid' using errcode='42501';
  end if;
  for v_row in
    select e.id,e.spot_id,e.job_id,e.fact_key,e.subject_name,e.short_evidence
    from public.backyrd_spot_research_extractions_v2 e
    join public.backyrd_spot_research_jobs_v1 j on j.id=e.job_id
    where j.population_run_id=p_run_id and j.state='READY_FOR_REVIEW'
      and e.fact_key in ('contact.phone','contact.email','opening.regular')
      and e.support_status='SUPPORTED' and e.evidence_scope='SPOT' and e.entity_scope='SPOT'
      and e.durability='PERSISTENT' and e.scope_resolution='SUBJECT_NOT_SPOT_ANCHORED'
      and not exists(
        select 1 from public.backyrd_spot_gold_authoring_audit_v1 a
        where a.subject_type='RESEARCH_EXTRACTION' and a.subject_id=e.id
          and a.action='OPERATIONAL_REVALIDATION_V1'
      )
    order by e.created_at,e.id
    for update of e skip locked
    limit p_limit
  loop
    if v_row.fact_key='opening.regular'
      and not public.backyrd_research_regular_hours_spot_scope_v1(v_row.subject_name,v_row.short_evidence) then
      insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
      values(v_row.spot_id,null,'OPERATIONAL_REVALIDATION_V1','RESEARCH_EXTRACTION',v_row.id,jsonb_build_object(
        'actorType','SYSTEM_POLICY','resolverPolicyVersion','backyrd-spot-research-policy-v2.11',
        'machinePolicyVersion',p_policy_version,'populationRunId',p_run_id,'jobId',v_row.job_id,
        'fieldKey',v_row.fact_key,'disposition','SKIPPED','reason','SERVICE_SCHEDULE_NOT_VENUE_HOURS',
        'canonicalWrite',false));
      v_result:=jsonb_build_object(
        'extractionId',v_row.id,'fieldKey',v_row.fact_key,'disposition','SKIPPED',
        'reason','SERVICE_SCHEDULE_NOT_VENUE_HOURS','canonicalWrite',false);
    else
      begin
        v_result:=public.backyrd_revalidate_operational_extraction_internal_v1(
          p_run_id,v_row.id,p_policy_version);
      exception
        when invalid_parameter_value then
          get stacked diagnostics v_validation_error=message_text;
          -- Only deterministic field/evidence validator denials are terminal
          -- row-level outcomes. Policy, authorization, lineage, conflicts,
          -- fingerprints and unexpected failures continue to abort fail closed.
          if v_validation_error not in (
            'machine_acceptance_schema_invalid',
            'machine_acceptance_evidence_malformed',
            'machine_acceptance_url_invalid',
            'machine_acceptance_phone_invalid',
            'machine_acceptance_email_invalid',
            'machine_acceptance_hours_invalid',
            'machine_acceptance_hours_day_not_explicit',
            'machine_acceptance_hours_time_not_explicit'
          ) then
            raise;
          end if;
          insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
          values(v_row.spot_id,null,'OPERATIONAL_REVALIDATION_V1','RESEARCH_EXTRACTION',v_row.id,jsonb_build_object(
            'actorType','SYSTEM_POLICY','resolverPolicyVersion','backyrd-spot-research-policy-v2.11',
            'machinePolicyVersion',p_policy_version,'populationRunId',p_run_id,'jobId',v_row.job_id,
            'fieldKey',v_row.fact_key,'disposition','SKIPPED',
            'reason','MACHINE_ACCEPTANCE_VALIDATION_DENIED','validatorCode',v_validation_error,
            'canonicalWrite',false));
          v_result:=jsonb_build_object(
            'extractionId',v_row.id,'fieldKey',v_row.fact_key,'disposition','SKIPPED',
            'reason','MACHINE_ACCEPTANCE_VALIDATION_DENIED','validatorCode',v_validation_error,
            'canonicalWrite',false);
      end;
    end if;
    v_results:=v_results||jsonb_build_array(v_result);v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object(
    'runId',p_run_id,'processed',v_processed,'results',v_results,
    'complete',not exists(
      select 1 from public.backyrd_spot_research_extractions_v2 e
      join public.backyrd_spot_research_jobs_v1 j on j.id=e.job_id
      where j.population_run_id=p_run_id and j.state='READY_FOR_REVIEW'
        and e.fact_key in ('contact.phone','contact.email','opening.regular')
        and e.support_status='SUPPORTED' and e.evidence_scope='SPOT' and e.entity_scope='SPOT'
        and e.durability='PERSISTENT' and e.scope_resolution='SUBJECT_NOT_SPOT_ANCHORED'
        and not exists(
          select 1 from public.backyrd_spot_gold_authoring_audit_v1 a
          where a.subject_type='RESEARCH_EXTRACTION' and a.subject_id=e.id
            and a.action='OPERATIONAL_REVALIDATION_V1'
        )
    ),'providerCalls',0,'newResearchJobs',0,'historicalExtractionsRewritten',0
  );
end $$;
revoke all on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)
  to service_role;
comment on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer) is
  'WORKER service-only bounded operational-evidence revalidation. Deterministic field validator denials are terminal SYSTEM skips; authorization and unexpected failures remain fail-closed.';
