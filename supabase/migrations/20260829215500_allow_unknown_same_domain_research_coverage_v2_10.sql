-- Preserve strict venue-instance validation for supported facts while allowing
-- same-official-domain UNKNOWN/UNSUPPORTED coverage outcomes to terminate.

create or replace function public.backyrd_finalize_spot_research_pass_v3(
  p_job_id uuid,p_lease_token uuid,p_pass_key text,p_extractions jsonb,p_proposals jsonb,p_provider_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_result jsonb;v_official_url text;v_spot_name text;v_item jsonb;v_row record;v_candidate_url text;v_proposal public.backyrd_spot_fact_proposals_v1%rowtype;v_source public.backyrd_spot_sources_v1%rowtype;v_scope_hash text;v_fingerprint text;v_supported integer:=0;v_unknown integer:=0;v_reviews integer:=0;v_population_run uuid;v_spot_id uuid;v_incomplete integer:=0;v_failed integer:=0;v_description jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501';end if;
  select s.website,s.name,j.source_scope_hash,j.population_run_id,j.spot_id into v_official_url,v_spot_name,v_scope_hash,v_population_run,v_spot_id from public.backyrd_spot_research_jobs_v1 j join public.spots s on s.id=j.spot_id where j.id=p_job_id;
  if v_official_url is null then raise exception 'research_official_website_invalid' using errcode='22023';end if;
  for v_item in select value from jsonb_array_elements(p_extractions) loop
    if v_item->>'supportStatus'='SUPPORTED' and not public.backyrd_research_url_matches_instance_v1(v_official_url,v_item->>'sourceUrl',v_spot_name) then raise exception 'research_source_instance_scope_mismatch' using errcode='22023';end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_proposals) loop
    foreach v_candidate_url in array array[v_item->>'sourceUrl',case when v_item->>'fieldKey'='contact.website' then (v_item->'value')#>>'{}' else null end] loop
      if v_candidate_url is not null and not public.backyrd_research_url_matches_instance_v1(v_official_url,v_candidate_url,v_spot_name) then raise exception 'research_proposal_instance_scope_mismatch' using errcode='22023';end if;
    end loop;
  end loop;
  v_result:=public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(p_job_id,p_lease_token,p_pass_key,p_extractions,p_proposals,p_provider_metadata);
  for v_row in select value,ordinality-1 ordinal from jsonb_array_elements(p_proposals) with ordinality loop
    select * into v_proposal from public.backyrd_spot_fact_proposals_v1 where idempotency_key=format('research-v2.1:%s:%s:%s',p_job_id,p_pass_key,v_row.ordinal);
    select * into v_source from public.backyrd_spot_sources_v1 where id=v_proposal.source_id;
    v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
      'proposalHash',v_proposal.proposal_hash,'jobId',p_job_id,'sourceScopeHash',v_scope_hash,
      'sourceId',v_source.id,'sourceUrl',v_source.source_url,'sourceType',v_source.source_type,
      'observedAt',v_source.observed_at,'lastCheckedAt',v_source.last_checked_at,
      'evidenceExcerpt',v_proposal.evidence_excerpt,'entityScope',v_proposal.research_entity_scope,
      'durability',v_proposal.research_durability,'scopeResolution',v_proposal.research_scope_resolution)::text,'UTF8'),'sha256'),'hex');
    update public.backyrd_spot_fact_proposals_v1 set machine_evidence_fingerprint=v_fingerprint where id=v_proposal.id;
  end loop;
  if p_pass_key='B' and v_population_run is not null then
    select count(*) filter(where e.support_status='SUPPORTED'),count(*) filter(where e.support_status in ('UNKNOWN','UNSUPPORTED'))
      into v_supported,v_unknown from public.backyrd_spot_research_extractions_v2 e join public.backyrd_spot_research_jobs_v1 j on j.id=e.job_id
      where j.population_run_id=v_population_run and j.spot_id=v_spot_id;
    select count(*) into v_reviews from public.backyrd_spot_fact_proposals_v1 p where p.spot_id=v_spot_id and p.status in ('PENDING','CONFLICT','STALE') and exists(
      select 1 from public.backyrd_spot_research_jobs_v1 j where j.population_run_id=v_population_run and j.spot_id=v_spot_id and p.idempotency_key like 'research-v2.1:'||j.id::text||':%');
    select count(*) filter(where state not in ('READY_FOR_REVIEW','FAILED')),count(*) filter(where state='FAILED' or failure_code is not null) into v_incomplete,v_failed
      from public.backyrd_spot_research_jobs_v1 where population_run_id=v_population_run and spot_id=v_spot_id;
    update public.backyrd_spot_intelligence_population_v1 set
      terminal_state=case when v_incomplete>0 then 'PROCESSING' when v_failed>0 then 'FAILED_WITH_EXPLICIT_REASON' when v_reviews>0 then 'REVIEW_REQUIRED' when v_supported>0 then 'PROCESSED_WITH_SUPPORTED_FACTS' else 'PROCESSED_UNKNOWN' end,
      relevant_fact_count=v_supported+v_unknown,researched_fact_count=v_supported+v_unknown,supported_fact_count=v_supported,researched_unknown_count=v_unknown,
      review_required_count=v_reviews,failure_reason=case when v_failed>0 then 'RESEARCH_JOB_FAILED' else null end,
      completed_at=case when v_incomplete=0 then now() else null end,updated_at=now()
    where run_id=v_population_run and spot_id=v_spot_id;
    if v_incomplete=0 and v_failed=0 then v_description:=public.backyrd_rebuild_spot_launch_description_internal_v1(v_spot_id);end if;
  end if;
  return v_result||jsonb_build_object('entityInstanceScopeValidated',true,'machineEvidenceFingerprintBound',true,'researchPolicyVersion','backyrd-spot-research-policy-v2.10','launchDescription',v_description);
end $$;
revoke all on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

create or replace function public.backyrd_enqueue_spot_intelligence_population_job_v1(p_run_id uuid,p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_run public.backyrd_city_bootstrap_runs_v1%rowtype;v_spot public.spots%rowtype;v_scope jsonb;v_hash text;v_deep_scope jsonb;v_deep_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;v_deep_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'intelligence_population_service_only' using errcode='42501';end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id for update;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'RUNNING' or v_run.requested_by is null
    or not exists(select 1 from public.admin_users a where a.user_id=v_run.requested_by and a.role in ('admin','super_admin')) then
    raise exception 'intelligence_population_run_invalid' using errcode='42501';end if;
  select * into v_spot from public.spots where id=p_spot_id and status='approved' and lower(btrim(city))='basel' and coalesce(data_origin,'') not in ('TEST','FIXTURE');
  if not found then raise exception 'intelligence_population_spot_invalid' using errcode='22023';end if;
  insert into public.backyrd_spot_intelligence_population_v1(run_id,spot_id) values(p_run_id,p_spot_id) on conflict do nothing;
  if public.backyrd_research_public_host_v1(v_spot.website) is null then
    update public.backyrd_spot_intelligence_population_v1 set terminal_state='FAILED_WITH_EXPLICIT_REASON',failure_reason='OFFICIAL_WEBSITE_MISSING_OR_INVALID',completed_at=now(),updated_at=now() where run_id=p_run_id and spot_id=p_spot_id;
    return jsonb_build_object('spotId',p_spot_id,'terminalState','FAILED_WITH_EXPLICIT_REASON','failureReason','OFFICIAL_WEBSITE_MISSING_OR_INVALID');
  end if;
  v_scope:=jsonb_build_object('officialWebsite',v_spot.website,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'researchCohort','CORE','evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),'entityScopes',jsonb_build_array('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS'),'durability',jsonb_build_array('PERSISTENT','TEMPORARY','UNKNOWN'),'researchPolicyVersion','backyrd-spot-research-policy-v2.10','populationRunId',p_run_id);
  v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');
  select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and population_run_id=p_run_id and source_scope->>'researchCohort'='CORE' order by created_at desc limit 1;
  if not found then
    insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase,population_run_id)
    values(p_spot_id,v_run.requested_by,'backyrd-spot-research-agent-v2.1',v_scope,v_hash,'A','PASS_A_QUEUED',p_run_id) returning * into v_job;
    insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');
  end if;
  v_deep_scope:=v_scope||jsonb_build_object('passes',jsonb_build_array('B'),'researchCohort','DEEP_CONTINUED');
  v_deep_hash:=encode(extensions.digest(convert_to(v_deep_scope::text,'UTF8'),'sha256'),'hex');
  select * into v_deep_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and population_run_id=p_run_id and source_scope->>'researchCohort'='DEEP_CONTINUED' order by created_at desc limit 1;
  if not found then
    insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase,population_run_id)
    values(p_spot_id,v_run.requested_by,'backyrd-spot-research-agent-v2.1',v_deep_scope,v_deep_hash,'B','PASS_B_QUEUED',p_run_id) returning * into v_deep_job;
    insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_deep_job.id,'B','QUEUED');
  end if;
  update public.backyrd_spot_intelligence_population_v1 set research_job_id=v_job.id,terminal_state=case when v_job.state='RUNNING' then 'PROCESSING' else 'QUEUED' end,source_fingerprint=v_hash,queued_at=coalesce(queued_at,now()),failure_reason=null,updated_at=now() where run_id=p_run_id and spot_id=p_spot_id;
  return jsonb_build_object('spotId',p_spot_id,'jobId',v_job.id,'continuedJobId',v_deep_job.id,'state',v_job.state,'deduplicated',v_job.created_at<now()-interval '1 millisecond');
end $$;
revoke all on function public.backyrd_enqueue_spot_intelligence_population_job_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.backyrd_enqueue_spot_intelligence_population_job_v1(uuid,uuid) to service_role;
