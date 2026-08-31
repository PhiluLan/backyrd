-- Revalidate objective operational evidence from the completed 415-Spot
-- Intelligence Population without repeating provider work or rewriting the
-- original extraction. The new proposal and audit rows are additive. Only an
-- exact completed, discovery-disabled launch-curation run may use this path.

create or replace function public.backyrd_research_operational_subject_matches_spot_v1(
  p_subject_name text,p_spot_name text
) returns boolean
language plpgsql stable set search_path=public,pg_catalog as $$
declare
  v_subject text:=btrim(regexp_replace(lower(public.unaccent(coalesce(p_subject_name,''))),'[^a-z0-9]+',' ','g'));
  v_spot text:=btrim(regexp_replace(lower(public.unaccent(coalesce(p_spot_name,''))),'[^a-z0-9]+',' ','g'));
  v_subject_tokens text[];v_spot_tokens text[];v_shared integer:=0;
begin
  if v_subject='' or v_spot='' then return false;end if;
  if v_subject=v_spot then return true;end if;
  select coalesce(array_agg(distinct token order by token),'{}') into v_subject_tokens
  from regexp_split_to_table(v_subject,' +') token
  where length(token)>=2 and token not in (
    'basel','zuerich','zurich','the','der','die','das','und','and',
    'museum','cafe','bar','restaurant','hotel','kino','cinema','venue',
    'zentrum','center','centre','ag','gmbh'
  );
  select coalesce(array_agg(distinct token order by token),'{}') into v_spot_tokens
  from regexp_split_to_table(v_spot,' +') token
  where length(token)>=2 and token not in (
    'basel','zuerich','zurich','the','der','die','das','und','and',
    'museum','cafe','bar','restaurant','hotel','kino','cinema','venue',
    'zentrum','center','centre','ag','gmbh'
  );
  if cardinality(v_subject_tokens)=0 or cardinality(v_spot_tokens)=0 then return false;end if;
  select count(*) into v_shared from unnest(v_subject_tokens) token where token=any(v_spot_tokens);
  return v_shared::numeric/greatest(cardinality(v_subject_tokens),cardinality(v_spot_tokens))>=.75;
end $$;
revoke all on function public.backyrd_research_operational_subject_matches_spot_v1(text,text)
  from public,anon,authenticated,service_role;
comment on function public.backyrd_research_operational_subject_matches_spot_v1(text,text) is
  'SERVICE_INTERNAL_UNGRANTED deterministic subject-instance comparison for objective operational Research evidence.';

create or replace function public.backyrd_revalidate_operational_extraction_internal_v1(
  p_run_id uuid,p_extraction_id uuid,p_policy_version text
) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_e public.backyrd_spot_research_extractions_v2%rowtype;
  v_j public.backyrd_spot_research_jobs_v1%rowtype;
  v_spot public.spots%rowtype;
  v_existing_proposal public.backyrd_spot_fact_proposals_v1%rowtype;
  v_source public.backyrd_spot_sources_v1%rowtype;
  v_proposal public.backyrd_spot_fact_proposals_v1%rowtype;
  v_research_run public.backyrd_spot_research_runs_v1%rowtype;
  v_disposition jsonb;v_machine jsonb;v_description jsonb;
  v_reason text;v_path text;v_text text;v_idempotency text;v_hash text;v_fingerprint text;
  v_classification text:='NEW';v_status text:='PENDING';v_confidence numeric;
  v_has_active_same boolean:=false;v_has_active_other boolean:=false;v_has_stale boolean:=false;
  v_product_same boolean:=false;v_product_conflict boolean:=false;
  v_job_found boolean:=false;v_spot_found boolean:=false;v_research_run_found boolean:=false;
  v_observed_at timestamptz;v_normalized text;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'operational_revalidation_service_only' using errcode='42501';
  end if;
  if p_policy_version<>'backyrd-machine-acceptance-v1' then
    raise exception 'operational_revalidation_policy_invalid' using errcode='22023';
  end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'COMPLETED'
    or v_run.stop_reason<>'COMPLETED:INTELLIGENCE_POPULATION_415_TERMINAL'
    or v_run.target_configuration->>'phase'<>'FULL_LAUNCH_CURATION'
    or v_run.target_configuration->>'discoveryEnabled'<>'false'
    or v_run.target_configuration->>'researchCoverageTarget'<>'415' then
    raise exception 'operational_revalidation_run_invalid' using errcode='42501';
  end if;
  if exists(
    select 1 from public.backyrd_spot_gold_authoring_audit_v1 a
    where a.subject_type='RESEARCH_EXTRACTION' and a.subject_id=p_extraction_id
      and a.action='OPERATIONAL_REVALIDATION_V1'
  ) then
    return jsonb_build_object('extractionId',p_extraction_id,'replayed',true,'canonicalWrite',false);
  end if;

  select * into v_e from public.backyrd_spot_research_extractions_v2 where id=p_extraction_id for update;
  if not found then raise exception 'operational_revalidation_extraction_missing' using errcode='22023';end if;
  -- Recheck after the row lock so concurrent service calls cannot produce two
  -- additive dispositions for the same immutable extraction.
  if exists(
    select 1 from public.backyrd_spot_gold_authoring_audit_v1 a
    where a.subject_type='RESEARCH_EXTRACTION' and a.subject_id=p_extraction_id
      and a.action='OPERATIONAL_REVALIDATION_V1'
  ) then
    return jsonb_build_object('extractionId',p_extraction_id,'replayed',true,'canonicalWrite',false);
  end if;
  select * into v_j from public.backyrd_spot_research_jobs_v1 where id=v_e.job_id;
  v_job_found:=found;
  select * into v_spot from public.spots where id=v_e.spot_id;
  v_spot_found:=found;
  select * into v_research_run from public.backyrd_spot_research_runs_v1 where id=v_e.run_id;
  v_research_run_found:=found;
  if not v_job_found or not v_spot_found or not v_research_run_found
    or v_j.population_run_id is distinct from p_run_id or v_j.state<>'READY_FOR_REVIEW'
    or v_spot.status<>'approved' or lower(btrim(v_spot.city))<>'basel'
    or coalesce(v_spot.data_origin,'') in ('FIXTURE','TEST') then
    raise exception 'operational_revalidation_lineage_invalid' using errcode='42501';
  end if;

  if v_e.fact_key not in ('contact.phone','contact.email','opening.regular') then v_reason:='FACT_NOT_ALLOWLISTED';
  elsif v_e.support_status<>'SUPPORTED' then v_reason:='EVIDENCE_NOT_SUPPORTED';
  elsif v_e.evidence_scope<>'SPOT' or v_e.entity_scope<>'SPOT' or v_e.durability<>'PERSISTENT' then v_reason:='SCOPE_NOT_SPOT_PERSISTENT';
  elsif v_e.scope_resolution<>'SUBJECT_NOT_SPOT_ANCHORED' then v_reason:='NOT_SUBJECT_ANCHOR_FAILURE';
  elsif v_e.source_type not in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') then v_reason:='SOURCE_NOT_OFFICIAL';
  elsif not public.backyrd_research_operational_subject_matches_spot_v1(v_e.subject_name,v_spot.name) then v_reason:='SUBJECT_INSTANCE_MISMATCH';
  elsif not public.backyrd_research_url_matches_instance_v1(v_j.source_scope->>'officialWebsite',v_e.source_url,v_spot.name) then v_reason:='SOURCE_INSTANCE_MISMATCH';
  else
    v_path:=split_part(regexp_replace(lower(public.unaccent(v_e.source_url)),'^https://[^/]+/?','','i'),'?',1);
    v_text:=lower(public.unaccent(coalesce(v_e.short_evidence,'')));
    if v_path~'(^|/)(event|events|veranstaltung|veranstaltungen|program|programme|programm|news|job|jobs|team|staff)([-_/]|$)' then v_reason:='NON_INSTANCE_SOURCE_ROUTE';
    elsif v_text~'(ignore (all |previous |the )?instructions?|system prompt|developer message|assistant message|return json|output (the )?(value|enum|fact)|call (a )?tool)' then v_reason:='PROMPT_INJECTION_SIGNAL';
    elsif v_text~'(for this (event|performance|concert)|this (event|performance|concert) only|bei dieser veranstaltung|nur bei dieser veranstaltung|temporary|temporar(y|ily)?|vorubergehend|pop[ -]?up|bis zum|until)' then v_reason:='TEMPORAL_SCOPE_CONFLICT';
    elsif v_text~'(tenant|mieter(in)?|third[ -]?party|operated by|betrieben von|veranstaltet von|gastveranstaltung|guest operator)' then v_reason:='ENTITY_ATTRIBUTION_CONFLICT';
    elsif v_e.fact_key='opening.regular' and lower(public.unaccent(coalesce(v_e.subject_name,'')||' '||coalesce(v_e.short_evidence,'')))~'(office|team availability|business hours|opening hours (for )?(the )?office|buro|buero|sekretariat|theaterkasse|ticketkauf|ticket office|box office|geschaftszeiten buro|geschaeftszeiten buero)' then v_reason:='NON_VENUE_HOURS';
    elsif not public.backyrd_gold_validate_fact_value_v1(v_e.fact_key,v_e.typed_value) then v_reason:='FACT_SCHEMA_INVALID';
    end if;
  end if;

  if v_reason is not null then
    insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
    values(v_e.spot_id,null,'OPERATIONAL_REVALIDATION_V1','RESEARCH_EXTRACTION',v_e.id,jsonb_build_object(
      'actorType','SYSTEM_POLICY','resolverPolicyVersion','backyrd-spot-research-policy-v2.11',
      'machinePolicyVersion',p_policy_version,'populationRunId',p_run_id,'jobId',v_j.id,
      'fieldKey',v_e.fact_key,'disposition','SKIPPED','reason',v_reason,'canonicalWrite',false));
    return jsonb_build_object('extractionId',v_e.id,'fieldKey',v_e.fact_key,'disposition','SKIPPED','reason',v_reason,'canonicalWrite',false);
  end if;

  select
    coalesce(bool_or(f.status='ACTIVE' and f.value=v_e.typed_value),false),
    coalesce(bool_or(f.status in ('ACTIVE','UNKNOWN') and f.value is distinct from v_e.typed_value),false),
    coalesce(bool_or(f.status='STALE'),false)
  into v_has_active_same,v_has_active_other,v_has_stale
  from public.backyrd_spot_accepted_facts_v1 f
  where f.spot_id=v_e.spot_id and f.field_key=v_e.fact_key and f.status in ('ACTIVE','UNKNOWN','STALE');

  if v_e.fact_key='contact.phone' and nullif(btrim(v_spot.phone),'') is not null then
    v_normalized:=public.backyrd_normalize_owner_phone_v1(v_spot.phone,'Switzerland');
    v_product_same:=v_normalized is not null and to_jsonb(v_normalized)=v_e.typed_value;
    v_product_conflict:=not v_product_same;
  elsif v_e.fact_key='contact.email' and nullif(btrim(v_spot.email),'') is not null then
    v_product_same:=to_jsonb(lower(btrim(v_spot.email)))=v_e.typed_value;
    v_product_conflict:=not v_product_same;
  elsif v_e.fact_key='opening.regular' and exists(select 1 from public.spot_hours h where h.spot_id=v_e.spot_id) then
    -- Existing hours are stronger Product truth unless an accepted fact proves
    -- the exact same structured schedule. Never infer equality from rows.
    v_product_same:=v_has_active_same;
    v_product_conflict:=not v_product_same;
  end if;
  if v_has_active_other or v_product_conflict or exists(
    select 1 from public.backyrd_spot_fact_proposals_v1 p
    where p.spot_id=v_e.spot_id and p.field_key=v_e.fact_key and p.status='PENDING'
      and p.proposed_value is distinct from v_e.typed_value
  ) then v_classification:='CONFLICT';v_status:='CONFLICT';
  elsif v_has_active_same or v_product_same then v_classification:='SAME';
  elsif v_has_stale then v_classification:='STALE';v_status:='STALE';
  end if;

  v_idempotency:=format('research-v2.11:%s:%s:%s',v_j.id,v_e.pass_key,v_e.ordinal);
  select * into v_existing_proposal from public.backyrd_spot_fact_proposals_v1
  where spot_id=v_e.spot_id and idempotency_key=v_idempotency;
  if found then
    return jsonb_build_object('extractionId',v_e.id,'proposalId',v_existing_proposal.id,'disposition',v_existing_proposal.status,'replayed',true,'canonicalWrite',false);
  end if;
  v_observed_at:=least(coalesce(v_e.observed_at,v_research_run.finished_at,v_e.created_at),now());
  v_confidence:=case when v_e.source_type='OFFICIAL_DOCUMENT' then .95 else .90 end;
  insert into public.backyrd_spot_sources_v1(
    spot_id,source_type,source_url,title,provider_identity,retrieved_at,observed_at,last_checked_at,
    legal_use_status,created_by_type
  ) values(
    v_e.spot_id,v_e.source_type,btrim(v_e.source_url),public.backyrd_research_public_host_v1(v_e.source_url),
    'Backyrd Research Agent v2.11 operational revalidation',v_observed_at,v_observed_at,v_observed_at,
    'PERMITTED','RESEARCH_AGENT'
  ) returning * into v_source;
  v_hash:=encode(extensions.digest(convert_to(concat_ws('|',v_e.spot_id,v_e.fact_key,v_e.typed_value::text,btrim(v_e.source_url),v_e.source_type,v_e.pass_key,'SPOT',''),'UTF8'),'sha256'),'hex');
  insert into public.backyrd_spot_fact_proposals_v1(
    spot_id,field_key,proposed_value,source_id,status,proposed_by_type,confidence_rationale,evidence_excerpt,
    idempotency_key,proposal_hash,contract_version,research_classification,deterministic_confidence,
    research_pass_key,research_evidence_scope,evidence_scope,research_entity_scope,research_subject_name,
    research_durability,research_scope_resolution
  ) values(
    v_e.spot_id,v_e.fact_key,v_e.typed_value,v_source.id,v_status,'RESEARCH_AGENT',
    'Deterministic official-source operational entity anchor policy v2.11; Machine Acceptance remains independently validated.',
    left(v_e.short_evidence,320),v_idempotency,v_hash,'backyrd-spot-fact-proposal-v1',v_classification,v_confidence,
    v_e.pass_key,'SPOT','SPOT','SPOT',v_e.subject_name,'PERSISTENT','PASS'
  ) returning * into v_proposal;
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'proposalHash',v_proposal.proposal_hash,'jobId',v_j.id,'sourceScopeHash',v_j.source_scope_hash,
    'sourceId',v_source.id,'sourceUrl',v_source.source_url,'sourceType',v_source.source_type,
    'observedAt',v_source.observed_at,'lastCheckedAt',v_source.last_checked_at,
    'evidenceExcerpt',v_proposal.evidence_excerpt,'entityScope',v_proposal.research_entity_scope,
    'durability',v_proposal.research_durability,'scopeResolution',v_proposal.research_scope_resolution)::text,'UTF8'),'sha256'),'hex');
  update public.backyrd_spot_fact_proposals_v1 set machine_evidence_fingerprint=v_fingerprint where id=v_proposal.id;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(v_e.spot_id,null,'SOURCE_AUTHORIZED','SOURCE',v_source.id,jsonb_build_object(
    'actorType','SYSTEM_POLICY','policyVersion','backyrd-intelligence-source-authorization-v1',
    'resolverPolicyVersion','backyrd-spot-research-policy-v2.11','populationRunId',p_run_id,
    'jobId',v_j.id,'proposalId',v_proposal.id,'extractionId',v_e.id,'sourceType',v_source.source_type,
    'historicalExtractionRewritten',false,'preconditions',jsonb_build_array(
      'OFFICIAL_SOURCE','COMPLETED_INTELLIGENCE_RUN','DISCOVERY_DISABLED','ENTITY_SCOPE_SPOT',
      'PERSISTENT','SUBJECT_INSTANCE_MATCH','INSTANCE_URL_VALID','FIELD_EVIDENCE_VALIDATED')));

  if v_classification in ('NEW','SAME') then
    -- The canonical Machine Acceptance implementation removes one pending
    -- review on acceptance. Account for this new proposal first so unrelated
    -- existing review counts are preserved exactly.
    update public.backyrd_spot_intelligence_population_v1 set
      review_required_count=review_required_count+1,updated_at=now()
    where run_id=p_run_id and spot_id=v_e.spot_id;
    if not found then raise exception 'operational_revalidation_population_missing' using errcode='40001';end if;
    v_machine:=public.backyrd_machine_accept_research_proposal_internal_v1(v_proposal.id,p_policy_version,v_fingerprint);
    v_description:=public.backyrd_rebuild_spot_launch_description_internal_v1(v_e.spot_id);
    v_disposition:=jsonb_build_object('disposition','ACCEPTED','proposalId',v_proposal.id,'machine',v_machine,'description',v_description,'canonicalWrite',v_machine->'canonicalWrite');
  else
    update public.backyrd_spot_intelligence_population_v1 set
      review_required_count=review_required_count+1,terminal_state='REVIEW_REQUIRED',updated_at=now()
    where run_id=p_run_id and spot_id=v_e.spot_id;
    v_disposition:=jsonb_build_object('disposition','REVIEW_REQUIRED','proposalId',v_proposal.id,'classification',v_classification,'canonicalWrite',false);
  end if;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(v_e.spot_id,null,'OPERATIONAL_REVALIDATION_V1','RESEARCH_EXTRACTION',v_e.id,jsonb_build_object(
    'actorType','SYSTEM_POLICY','resolverPolicyVersion','backyrd-spot-research-policy-v2.11',
    'machinePolicyVersion',p_policy_version,'populationRunId',p_run_id,'jobId',v_j.id,
    'fieldKey',v_e.fact_key,'sourceId',v_source.id,'proposalId',v_proposal.id,
    'historicalExtractionRewritten',false,'result',v_disposition));
  return jsonb_build_object('extractionId',v_e.id,'fieldKey',v_e.fact_key)||v_disposition;
end $$;
revoke all on function public.backyrd_revalidate_operational_extraction_internal_v1(uuid,uuid,text)
  from public,anon,authenticated,service_role;
comment on function public.backyrd_revalidate_operational_extraction_internal_v1(uuid,uuid,text) is
  'SERVICE_INTERNAL_UNGRANTED additive revalidation. Original Research extraction/history is immutable; conflicts remain Human Review.';

create or replace function public.backyrd_revalidate_intelligence_operational_batch_v1(
  p_run_id uuid,p_policy_version text,p_limit integer default 5
) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row record;v_result jsonb;v_results jsonb:='[]';v_processed integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'operational_revalidation_service_only' using errcode='42501';
  end if;
  if p_limit is null or p_limit<1 or p_limit>5 then
    raise exception 'operational_revalidation_batch_invalid' using errcode='22023';
  end if;
  -- No provider calls and no new Research jobs: this only consumes immutable
  -- supported rows from the exact existing Population run in small batches.
  for v_row in
    select e.id
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
    limit p_limit
  loop
    v_result:=public.backyrd_revalidate_operational_extraction_internal_v1(p_run_id,v_row.id,p_policy_version);
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
  'WORKER service-only bounded operational-evidence revalidation for the completed 415-Spot launch-curation run. No actor parameter, provider call, new job, history rewrite or client grant.';
