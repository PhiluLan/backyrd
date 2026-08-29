-- Spot Intelligence Machine Acceptance V1.
-- This migration does not grant AI general canonical authority. It adds a
-- service-only, field-specific acceptance boundary for deterministic
-- operational facts and an integrated Intelligence Population run ledger.

alter table public.backyrd_city_bootstrap_runs_v1
  drop constraint backyrd_city_bootstrap_runs_v1_mode_check,
  add constraint backyrd_city_bootstrap_runs_v1_mode_check
    check(mode in ('SHADOW','PILOT','SCALE','REFRESH','INTELLIGENCE'));

create table public.backyrd_spot_machine_acceptance_policy_v1 (
  policy_version text not null,
  field_key text not null references public.backyrd_spot_fact_catalog_v1(field_key),
  validator_key text not null check(validator_key in ('OFFICIAL_URL_EXACT','PHONE_EXACT','EMAIL_EXACT','REGULAR_HOURS_EXACT')),
  allowed_source_types text[] not null,
  minimum_confidence numeric not null check(minimum_confidence between 0 and 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(policy_version,field_key),
  check(cardinality(allowed_source_types)>0 and allowed_source_types<@array['OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT']::text[])
);

insert into public.backyrd_spot_machine_acceptance_policy_v1
  (policy_version,field_key,validator_key,allowed_source_types,minimum_confidence) values
  ('backyrd-machine-acceptance-v1','contact.website','OFFICIAL_URL_EXACT',array['OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT'],.90),
  ('backyrd-machine-acceptance-v1','contact.phone','PHONE_EXACT',array['OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT'],.90),
  ('backyrd-machine-acceptance-v1','contact.email','EMAIL_EXACT',array['OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT'],.90),
  ('backyrd-machine-acceptance-v1','opening.regular','REGULAR_HOURS_EXACT',array['OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT'],.90);

alter table public.backyrd_spot_machine_acceptance_policy_v1 enable row level security;
revoke all on public.backyrd_spot_machine_acceptance_policy_v1 from public,anon,authenticated;
grant select on public.backyrd_spot_machine_acceptance_policy_v1 to service_role;

alter table public.backyrd_spot_fact_proposals_v1
  add column if not exists machine_evidence_fingerprint text
    check(machine_evidence_fingerprint is null or machine_evidence_fingerprint~'^[0-9a-f]{64}$'),
  add column if not exists machine_policy_version text,
  add column if not exists machine_accepted_at timestamptz;

alter table public.backyrd_spot_accepted_facts_v1
  add column if not exists acceptance_actor_type text
    check(acceptance_actor_type is null or acceptance_actor_type in ('HUMAN','SYSTEM_POLICY','LEGACY_IMPORT')),
  add column if not exists acceptance_policy_version text,
  add column if not exists acceptance_job_id uuid references public.backyrd_spot_research_jobs_v1(id),
  add column if not exists acceptance_evidence_fingerprint text
    check(acceptance_evidence_fingerprint is null or acceptance_evidence_fingerprint~'^[0-9a-f]{64}$');

update public.backyrd_spot_accepted_facts_v1 f set acceptance_actor_type=case
  when f.accepted_by is not null then 'HUMAN'
  else 'LEGACY_IMPORT' end where acceptance_actor_type is null;

alter table public.backyrd_spot_research_jobs_v1
  add column if not exists population_run_id uuid references public.backyrd_city_bootstrap_runs_v1(id);
create index if not exists backyrd_spot_research_jobs_population_idx
  on public.backyrd_spot_research_jobs_v1(population_run_id,state,created_at);

create table public.backyrd_spot_intelligence_population_v1 (
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  research_job_id uuid references public.backyrd_spot_research_jobs_v1(id),
  terminal_state text not null default 'PENDING' check(terminal_state in (
    'PENDING','QUEUED','PROCESSING','PROCESSED_WITH_SUPPORTED_FACTS','PROCESSED_UNKNOWN',
    'REVIEW_REQUIRED','NOT_APPLICABLE','FAILED_WITH_EXPLICIT_REASON')),
  source_fingerprint text check(source_fingerprint is null or source_fingerprint~'^[0-9a-f]{64}$'),
  relevant_fact_count integer not null default 0 check(relevant_fact_count>=0),
  researched_fact_count integer not null default 0 check(researched_fact_count>=0),
  supported_fact_count integer not null default 0 check(supported_fact_count>=0),
  researched_unknown_count integer not null default 0 check(researched_unknown_count>=0),
  review_required_count integer not null default 0 check(review_required_count>=0),
  auto_accepted_count integer not null default 0 check(auto_accepted_count>=0),
  failure_reason text check(failure_reason is null or length(failure_reason)<=160),
  queued_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(run_id,spot_id)
);
create index backyrd_spot_intelligence_population_state_idx
  on public.backyrd_spot_intelligence_population_v1(run_id,terminal_state,updated_at);
alter table public.backyrd_spot_intelligence_population_v1 enable row level security;
revoke all on public.backyrd_spot_intelligence_population_v1 from public,anon,authenticated,service_role;
grant select,insert,update on public.backyrd_spot_intelligence_population_v1 to service_role;

create or replace function public.backyrd_rebuild_spot_launch_description_internal_v1(p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_summary jsonb;v_text text;v_existing public.spot_descriptions%rowtype;
begin
  select * into v_existing from public.spot_descriptions where spot_id=p_spot_id for update;
  if found and (
    (v_existing.is_verified and nullif(btrim(v_existing.owner_description),'') is not null)
    or nullif(btrim(v_existing.admin_description),'') is not null
    or nullif(btrim(v_existing.enriched_description),'') is not null
  ) then return jsonb_build_object('spotId',p_spot_id,'generated',false,'reason','STRONGER_DESCRIPTION_EXISTS');end if;
  v_summary:=public.backyrd_human_spot_summary_v2(p_spot_id);v_text:=nullif(btrim(v_summary->>'text'),'');
  if v_text is null or length(v_text)<80 or jsonb_typeof(v_summary->'lineage')<>'array' or jsonb_array_length(v_summary->'lineage')=0 then
    return jsonb_build_object('spotId',p_spot_id,'generated',false,'reason','INSUFFICIENT_ACCEPTED_FACTS');
  end if;
  insert into public.spot_descriptions(spot_id,enriched_description,enriched_source,enriched_updated_at,quality_score,updated_at)
  values(p_spot_id,v_text,'import',now(),1,now())
  on conflict(spot_id) do update set enriched_description=excluded.enriched_description,enriched_source='import',enriched_updated_at=now(),quality_score=greatest(coalesce(public.spot_descriptions.quality_score,0),1),updated_at=now()
  where nullif(btrim(public.spot_descriptions.owner_description),'') is null and nullif(btrim(public.spot_descriptions.admin_description),'') is null and nullif(btrim(public.spot_descriptions.enriched_description),'') is null;
  if not found then return jsonb_build_object('spotId',p_spot_id,'generated',false,'reason','CONCURRENT_STRONGER_DESCRIPTION');end if;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(p_spot_id,null,'REBUILD_LAUNCH_DESCRIPTION','SPOT',p_spot_id,jsonb_build_object('actorType','SYSTEM_POLICY','contractVersion',v_summary->>'contractVersion','lineage',v_summary->'lineage'));
  return jsonb_build_object('spotId',p_spot_id,'generated',true,'description',v_text,'lineage',v_summary->'lineage');
end $$;
revoke all on function public.backyrd_rebuild_spot_launch_description_internal_v1(uuid) from public,anon,authenticated,service_role;
comment on function public.backyrd_rebuild_spot_launch_description_internal_v1(uuid) is
  'Internal deterministic projection from already accepted Spot truth. Never accepts Research or AI output and never overwrites stronger owner/admin/enriched content.';

-- Extend the existing deterministic research boundary with operational facts.
-- This internal function remains ungranted. The public v3 signature below is
-- still the only service entry point for pass finalization.
create or replace function public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(
  p_job_id uuid,p_lease_token uuid,p_pass_key text,p_extractions jsonb,p_proposals jsonb,p_provider_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;v_official_host text;v_row record;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
  if jsonb_typeof(p_extractions)<>'array' or jsonb_array_length(p_extractions)>12
    or jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals)>12 then
    raise exception 'research_pass_batch_invalid' using errcode='22023';
  end if;
  select public.backyrd_research_public_host_v1(s.website) into v_official_host
  from public.backyrd_spot_research_jobs_v1 j join public.spots s on s.id=j.spot_id where j.id=p_job_id;
  if v_official_host is null then raise exception 'research_official_website_invalid' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_extractions) x where
      coalesce(x->>'entityScope','') not in ('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS')
      or coalesce(x->>'durability','') not in ('PERSISTENT','TEMPORARY','UNKNOWN')
      or nullif(btrim(coalesce(x->>'scopeResolution','')),'') is null
      or public.backyrd_research_public_host_v1(x->>'sourceUrl') is distinct from v_official_host) then
    raise exception 'research_entity_scope_payload_invalid' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_proposals) x where
      x->>'evidenceScope'<>'SPOT' or x->>'entityScope'<>'SPOT'
      or x->>'durability'<>'PERSISTENT' or x->>'scopeResolution'<>'PASS'
      or nullif(btrim(coalesce(x->>'subjectName','')),'') is null
      or x->>'fieldKey' not in ('identity.name','contact.website','contact.phone','contact.email','opening.regular','category.primary','activity.types','accessibility.capabilities','place_type')
      or public.backyrd_research_public_host_v1(x->>'sourceUrl') is distinct from v_official_host
      or (x->>'fieldKey'='contact.website' and public.backyrd_research_public_host_v1((x->'value')#>>'{}') is distinct from v_official_host)) then
    raise exception 'research_spot_entity_scope_required' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_proposals) p
    where not exists(
      select 1 from jsonb_array_elements(p_extractions) e
      where e->>'factKey'=coalesce(nullif(p->>'derivedFromFactKey',''),p->>'fieldKey')
        and e->>'evidenceScope'='SPOT' and e->>'entityScope'='SPOT'
        and e->>'durability'='PERSISTENT' and e->>'scopeResolution'='PASS'
        and e->>'subjectName'=p->>'subjectName' and e->>'sourceUrl'=p->>'sourceUrl'
        and e->>'shortEvidence'=p->>'evidenceExcerpt'
        and (nullif(p->>'derivedFromFactKey','') is not null or e->'value'=p->'value'
          or (p->>'fieldKey'='identity.name' and btrim((e->'value')#>>'{}')=btrim((p->'value')#>>'{}'))
          or (p->>'fieldKey'='contact.website' and public.backyrd_research_public_host_v1((e->'value')#>>'{}')=public.backyrd_research_public_host_v1((p->'value')#>>'{}')))
    )
  ) then raise exception 'research_proposal_extraction_mismatch' using errcode='22023'; end if;
  v_result:=public.backyrd_finalize_spot_research_pass_v3_legacy(p_job_id,p_lease_token,p_pass_key,p_extractions,p_proposals,p_provider_metadata);
  for v_row in select value,ordinality-1 ordinal from jsonb_array_elements(p_extractions) with ordinality loop
    update public.backyrd_spot_research_extractions_v2 set
      entity_scope=v_row.value->>'entityScope',subject_name=nullif(btrim(v_row.value->>'subjectName'),''),
      durability=v_row.value->>'durability',scope_resolution=left(v_row.value->>'scopeResolution',80)
    where job_id=p_job_id and pass_key=p_pass_key and ordinal=v_row.ordinal;
  end loop;
  for v_row in select value,ordinality-1 ordinal from jsonb_array_elements(p_proposals) with ordinality loop
    update public.backyrd_spot_fact_proposals_v1 set
      research_entity_scope=v_row.value->>'entityScope',research_subject_name=nullif(btrim(v_row.value->>'subjectName'),''),
      research_durability=v_row.value->>'durability',research_scope_resolution=left(v_row.value->>'scopeResolution',80)
    where idempotency_key=format('research-v2.1:%s:%s:%s',p_job_id,p_pass_key,v_row.ordinal);
  end loop;
  return v_result||jsonb_build_object('entityScopeValidated',true,'researchPolicyVersion','backyrd-spot-research-policy-v2.9');
end $$;
revoke all on function public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.backyrd_finalize_spot_research_pass_v3(
  p_job_id uuid,p_lease_token uuid,p_pass_key text,p_extractions jsonb,p_proposals jsonb,p_provider_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_result jsonb;v_official_url text;v_spot_name text;v_item jsonb;v_row record;v_candidate_url text;v_proposal public.backyrd_spot_fact_proposals_v1%rowtype;v_source public.backyrd_spot_sources_v1%rowtype;v_scope_hash text;v_fingerprint text;v_supported integer:=0;v_unknown integer:=0;v_reviews integer:=0;v_population_run uuid;v_spot_id uuid;v_incomplete integer:=0;v_failed integer:=0;v_description jsonb;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501';end if;
  select s.website,s.name,j.source_scope_hash,j.population_run_id,j.spot_id into v_official_url,v_spot_name,v_scope_hash,v_population_run,v_spot_id from public.backyrd_spot_research_jobs_v1 j join public.spots s on s.id=j.spot_id where j.id=p_job_id;
  if v_official_url is null then raise exception 'research_official_website_invalid' using errcode='22023';end if;
  for v_item in select value from jsonb_array_elements(p_extractions) loop
    if not public.backyrd_research_url_matches_instance_v1(v_official_url,v_item->>'sourceUrl',v_spot_name) then raise exception 'research_source_instance_scope_mismatch' using errcode='22023';end if;
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
  return v_result||jsonb_build_object('entityInstanceScopeValidated',true,'machineEvidenceFingerprintBound',true,'researchPolicyVersion','backyrd-spot-research-policy-v2.9','launchDescription',v_description);
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
  v_scope:=jsonb_build_object('officialWebsite',v_spot.website,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'researchCohort','CORE','evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),'entityScopes',jsonb_build_array('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS'),'durability',jsonb_build_array('PERSISTENT','TEMPORARY','UNKNOWN'),'researchPolicyVersion','backyrd-spot-research-policy-v2.9','populationRunId',p_run_id);
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

create or replace function public.backyrd_machine_accept_research_proposal_internal_v1(
  p_proposal_id uuid,p_policy_version text,p_expected_evidence_fingerprint text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_p record;v_s record;v_j record;v_policy record;v_existing record;v_fingerprint text;v_text text;v_value text;v_norm text;v_digits text;v_day jsonb;v_interval jsonb;v_idx integer:=0;v_fact uuid;v_rebuild jsonb;v_same boolean:=false;v_authorize_source boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'machine_acceptance_service_only' using errcode='42501';end if;
  if p_policy_version<>'backyrd-machine-acceptance-v1' then raise exception 'machine_acceptance_policy_invalid' using errcode='22023';end if;
  select * into v_p from public.backyrd_spot_fact_proposals_v1 where id=p_proposal_id for update;
  if not found or v_p.proposed_by_type<>'RESEARCH_AGENT' or v_p.status<>'PENDING' then raise exception 'machine_acceptance_proposal_invalid' using errcode='22023';end if;
  select * into v_policy from public.backyrd_spot_machine_acceptance_policy_v1 where policy_version=p_policy_version and field_key=v_p.field_key and active;
  if not found then raise exception 'machine_acceptance_fact_not_allowlisted' using errcode='22023';end if;
  if v_p.research_classification not in ('NEW','SAME') then raise exception 'machine_acceptance_conflict_forbidden' using errcode='22023';end if;
  if v_p.research_entity_scope<>'SPOT' or coalesce(v_p.research_evidence_scope,v_p.evidence_scope)<>'SPOT'
    or v_p.research_durability<>'PERSISTENT' or v_p.research_scope_resolution<>'PASS' then raise exception 'machine_acceptance_scope_invalid' using errcode='22023';end if;
  if v_p.deterministic_confidence<v_policy.minimum_confidence or not public.backyrd_gold_validate_fact_value_v1(v_p.field_key,v_p.proposed_value) then raise exception 'machine_acceptance_schema_invalid' using errcode='22023';end if;
  select * into v_s from public.backyrd_spot_sources_v1 where id=v_p.source_id;
  if not found or not(v_s.source_type=any(v_policy.allowed_source_types)) or v_s.created_by_type<>'RESEARCH_AGENT'
    or v_s.source_url is null or v_s.legal_use_status not in ('PERMITTED','REVIEW_REQUIRED') then raise exception 'machine_acceptance_source_invalid' using errcode='22023';end if;
  select * into v_j from public.backyrd_spot_research_jobs_v1 where id=split_part(v_p.idempotency_key,':',2)::uuid;
  if not found or v_j.state not in ('QUEUED','READY_FOR_REVIEW') then raise exception 'machine_acceptance_job_invalid' using errcode='22023';end if;
  if v_s.legal_use_status='REVIEW_REQUIRED' then
    if v_j.population_run_id is null or not exists(
      select 1 from public.backyrd_city_bootstrap_runs_v1 r
      where r.id=v_j.population_run_id and r.mode='INTELLIGENCE' and r.status='RUNNING'
        and r.target_configuration->>'discoveryEnabled'='false'
    ) then raise exception 'machine_acceptance_source_not_authorized' using errcode='42501';end if;
    v_authorize_source:=true;
  end if;
  if not public.backyrd_research_url_matches_instance_v1(v_j.source_scope->>'officialWebsite',v_s.source_url,(select name from public.spots where id=v_p.spot_id)) then raise exception 'machine_acceptance_source_identity_invalid' using errcode='22023';end if;
  v_fingerprint:=encode(extensions.digest(convert_to(jsonb_build_object(
    'proposalHash',v_p.proposal_hash,'jobId',v_j.id,'sourceScopeHash',v_j.source_scope_hash,
    'sourceId',v_s.id,'sourceUrl',v_s.source_url,'sourceType',v_s.source_type,
    'observedAt',v_s.observed_at,'lastCheckedAt',v_s.last_checked_at,
    'evidenceExcerpt',v_p.evidence_excerpt,'entityScope',v_p.research_entity_scope,
    'durability',v_p.research_durability,'scopeResolution',v_p.research_scope_resolution)::text,'UTF8'),'sha256'),'hex');
  if p_expected_evidence_fingerprint is null or p_expected_evidence_fingerprint!~'^[0-9a-f]{64}$'
    or v_p.machine_evidence_fingerprint is null or v_fingerprint<>v_p.machine_evidence_fingerprint
    or p_expected_evidence_fingerprint<>v_fingerprint then raise exception 'machine_acceptance_fingerprint_stale' using errcode='40001';end if;
  v_text:=lower(coalesce(v_p.evidence_excerpt,''));
  if length(btrim(v_text))=0 or v_text~'(ignore (all |previous |the )?instructions?|system prompt|developer message|assistant message|return json|output (the )?(value|enum|fact)|call (a )?tool)' then raise exception 'machine_acceptance_evidence_malformed' using errcode='22023';end if;
  if v_policy.validator_key='OFFICIAL_URL_EXACT' then
    v_value:=v_p.proposed_value#>>'{}';
    if public.backyrd_research_public_host_v1(v_value) is null or not public.backyrd_research_url_matches_instance_v1(v_j.source_scope->>'officialWebsite',v_value,(select name from public.spots where id=v_p.spot_id)) then raise exception 'machine_acceptance_url_invalid' using errcode='22023';end if;
  elsif v_policy.validator_key='PHONE_EXACT' then
    v_value:=public.backyrd_normalize_owner_phone_v1(v_p.proposed_value#>>'{}','Switzerland');v_digits:=regexp_replace(v_value,'[^0-9]','','g');
    if v_value is null or v_value!~'^\+[1-9][0-9]{8,14}$' or v_p.proposed_value is distinct from to_jsonb(v_value)
      or regexp_replace(v_p.evidence_excerpt,'[^0-9]','','g') not like '%'||right(v_digits,9)||'%' then raise exception 'machine_acceptance_phone_invalid' using errcode='22023';end if;
  elsif v_policy.validator_key='EMAIL_EXACT' then
    v_value:=lower(btrim(v_p.proposed_value#>>'{}'));
    if v_value!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_p.proposed_value is distinct from to_jsonb(v_value)
      or position(v_value in v_text)=0 then raise exception 'machine_acceptance_email_invalid' using errcode='22023';end if;
  elsif v_policy.validator_key='REGULAR_HOURS_EXACT' then
    if jsonb_typeof(v_p.proposed_value->'days')<>'array' or jsonb_array_length(v_p.proposed_value->'days')=0 then raise exception 'machine_acceptance_hours_invalid' using errcode='22023';end if;
    for v_day in select value from jsonb_array_elements(v_p.proposed_value->'days') loop
      if v_day->>'day' not in ('Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag') or jsonb_typeof(v_day->'intervals')<>'array' then raise exception 'machine_acceptance_hours_invalid' using errcode='22023';end if;
      if not exists(
        select 1 from regexp_split_to_table(v_text,E'[\n\r]+') evidence_line
        where evidence_line~case v_day->>'day' when 'Montag' then '(montag|monday|lun)' when 'Dienstag' then '(dienstag|tuesday|mar)' when 'Mittwoch' then '(mittwoch|wednesday|mer)' when 'Donnerstag' then '(donnerstag|thursday|jeu)' when 'Freitag' then '(freitag|friday|ven)' when 'Samstag' then '(samstag|saturday|sam)' else '(sonntag|sunday|dim)' end
      ) and not (jsonb_array_length(v_p.proposed_value->'days')=7 and v_text~'(täglich|taglich|daily|every day|7 tage|7 days|montag bis sonntag|monday to sunday)') then raise exception 'machine_acceptance_hours_day_not_explicit' using errcode='22023';end if;
      for v_interval in select value from jsonb_array_elements(v_day->'intervals') loop
        if not exists(
          select 1 from regexp_split_to_table(v_text,E'[\n\r]+') evidence_line
          where (evidence_line~case v_day->>'day' when 'Montag' then '(montag|monday|lun)' when 'Dienstag' then '(dienstag|tuesday|mar)' when 'Mittwoch' then '(mittwoch|wednesday|mer)' when 'Donnerstag' then '(donnerstag|thursday|jeu)' when 'Freitag' then '(freitag|friday|ven)' when 'Samstag' then '(samstag|saturday|sam)' else '(sonntag|sunday|dim)' end
              or (jsonb_array_length(v_p.proposed_value->'days')=7 and evidence_line~'(täglich|taglich|daily|every day|7 tage|7 days|montag bis sonntag|monday to sunday)'))
            and regexp_replace(evidence_line,'[^0-9]','','g') like '%'||regexp_replace(v_interval->>'open','[^0-9]','','g')||'%'
            and regexp_replace(evidence_line,'[^0-9]','','g') like '%'||regexp_replace(v_interval->>'close','[^0-9]','','g')||'%'
        ) then raise exception 'machine_acceptance_hours_time_not_explicit' using errcode='22023';end if;
      end loop;
    end loop;
  else raise exception 'machine_acceptance_validator_invalid' using errcode='22023';end if;
  if exists(
    select 1 from public.backyrd_spot_fact_proposals_v1 c
    where c.spot_id=v_p.spot_id and c.field_key=v_p.field_key and c.id<>v_p.id
      and c.status='PENDING' and c.proposed_value is distinct from v_p.proposed_value
  ) then raise exception 'machine_acceptance_source_conflict' using errcode='22023';end if;
  select * into v_existing from public.backyrd_spot_accepted_facts_v1 where spot_id=v_p.spot_id and field_key=v_p.field_key and status in ('ACTIVE','UNKNOWN','STALE') order by accepted_at desc limit 1 for update;
  if found then
    if v_existing.value is distinct from v_p.proposed_value then raise exception 'machine_acceptance_existing_truth_conflict' using errcode='22023';end if;
    v_same:=true;v_fact:=v_existing.id;
  end if;
  if v_authorize_source then
    update public.backyrd_spot_sources_v1 set legal_use_status='PERMITTED' where id=v_s.id and legal_use_status='REVIEW_REQUIRED';
    if not found then raise exception 'machine_acceptance_source_authorization_race' using errcode='40001';end if;
    insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
    values(v_p.spot_id,null,'SOURCE_AUTHORIZED','SOURCE',v_s.id,jsonb_build_object(
      'actorType','SYSTEM_POLICY','policyVersion','backyrd-intelligence-source-authorization-v1',
      'populationRunId',v_j.population_run_id,'jobId',v_j.id,'proposalId',v_p.id,'sourceType',v_s.source_type,
      'preconditions',jsonb_build_array('OFFICIAL_SOURCE','INTELLIGENCE_RUN','DISCOVERY_DISABLED','ENTITY_SCOPE_SPOT','SCOPE_RESOLUTION_PASS','PERSISTENT','INSTANCE_URL_VALID','EVIDENCE_VALIDATED')));
  end if;
  if not v_same then
    insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,proposal_id,status,confidence_policy_result,accepted_by,observed_at,last_checked_at,contract_version,semantic_contract_version,evidence_scope,interpretation_basis,acceptance_actor_type,acceptance_policy_version,acceptance_job_id,acceptance_evidence_fingerprint)
    values(v_p.spot_id,v_p.field_key,v_p.proposed_value,v_p.source_id,v_p.id,'ACTIVE',v_p.deterministic_confidence,null,v_s.observed_at,v_s.last_checked_at,'backyrd-spot-accepted-fact-v1','backyrd-canonical-semantics-v1','SPOT','SOURCE_EXPLICIT','SYSTEM_POLICY',p_policy_version,v_j.id,v_fingerprint) returning id into v_fact;
    if v_p.field_key='opening.regular' then
      delete from public.spot_hours where spot_id=v_p.spot_id;
      for v_day in select value from jsonb_array_elements(v_p.proposed_value->'days') loop for v_interval in select value from jsonb_array_elements(v_day->'intervals') loop
        insert into public.spot_hours(spot_id,idx,day_of_week,open_time,close_time) values(v_p.spot_id,v_idx,v_day->>'day',(v_interval->>'open')::time,(v_interval->>'close')::time);v_idx:=v_idx+1;
      end loop;end loop;
    end if;
    v_rebuild:=public.backyrd_gold_rebuild_spot_v1(v_p.spot_id);
  end if;
  update public.backyrd_spot_fact_proposals_v1 set status='ACCEPTED',reviewed_at=now(),reviewed_by=null,resolution_note='SYSTEM_POLICY:'||p_policy_version,machine_policy_version=p_policy_version,machine_accepted_at=now() where id=v_p.id;
  update public.backyrd_spot_intelligence_population_v1 set
    auto_accepted_count=auto_accepted_count+case when v_same then 0 else 1 end,
    review_required_count=greatest(review_required_count-1,0),
    terminal_state=case
      when exists(select 1 from public.backyrd_spot_research_jobs_v1 pending
        where pending.population_run_id=v_j.population_run_id and pending.spot_id=v_j.spot_id
          and pending.state not in ('READY_FOR_REVIEW','FAILED')) then 'PROCESSING'
      when greatest(review_required_count-1,0)>0 then 'REVIEW_REQUIRED'
      when supported_fact_count>0 then 'PROCESSED_WITH_SUPPORTED_FACTS'
      else 'PROCESSED_UNKNOWN' end,
    completed_at=case when exists(select 1 from public.backyrd_spot_research_jobs_v1 pending
      where pending.population_run_id=v_j.population_run_id and pending.spot_id=v_j.spot_id
        and pending.state not in ('READY_FOR_REVIEW','FAILED')) then null else coalesce(completed_at,now()) end,
    updated_at=now()
  where run_id=v_j.population_run_id and spot_id=v_j.spot_id;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(v_p.spot_id,null,'MACHINE_ACCEPT','PROPOSAL',v_p.id,jsonb_build_object('actorType','SYSTEM_POLICY','policyVersion',p_policy_version,'sourceAuthorizationPolicyVersion',case when v_authorize_source then 'backyrd-intelligence-source-authorization-v1' else null end,'jobId',v_j.id,'proposalId',v_p.id,'acceptedFactId',v_fact,'sourceId',v_s.id,'evidenceFingerprint',v_fingerprint,'sameExistingTruth',v_same,'rebuild',v_rebuild));
  return jsonb_build_object('proposalId',v_p.id,'acceptedFactId',v_fact,'accepted',true,'sameExistingTruth',v_same,'actorType','SYSTEM_POLICY','policyVersion',p_policy_version,'evidenceFingerprint',v_fingerprint,'canonicalWrite',not v_same);
end $$;
revoke all on function public.backyrd_machine_accept_research_proposal_internal_v1(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function public.backyrd_machine_accept_v1(
  p_proposal_id uuid,p_policy_version text,p_expected_evidence_fingerprint text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'machine_acceptance_service_only' using errcode='42501';end if;
  return public.backyrd_machine_accept_research_proposal_internal_v1(p_proposal_id,p_policy_version,p_expected_evidence_fingerprint);
end $$;
revoke all on function public.backyrd_machine_accept_v1(uuid,text,text) from public,anon,authenticated;
grant execute on function public.backyrd_machine_accept_v1(uuid,text,text) to service_role;

comment on function public.backyrd_machine_accept_v1(uuid,text,text) is
  'SERVICE_INTERNAL Machine Acceptance V1 public service-only gateway. No caller actor is accepted.';
comment on function public.backyrd_machine_accept_research_proposal_internal_v1(uuid,text,text) is
  'SERVICE_INTERNAL_UNGRANTED Machine Acceptance V1 implementation. Field allowlist, source, SPOT scope, persistence, schema, fingerprint, conflict and evidence validators are enforced server-side; N4 remains rebuild-derived.';
comment on table public.backyrd_spot_intelligence_population_v1 is
  'Integrated per-Spot terminal-state ledger for bounded Intelligence Population runs. Distinguishes not processed, researched unknown, review, supported and explicit failure.';

-- Keep the existing failure/retry policy and synchronize only the integrated
-- population ledger after that canonical service-only contract has decided.
alter function public.backyrd_fail_spot_research_pass_v2(uuid,uuid,text,boolean,text)
  rename to backyrd_fail_spot_research_pass_pre_population_v2;
revoke all on function public.backyrd_fail_spot_research_pass_pre_population_v2(uuid,uuid,text,boolean,text)
  from public,anon,authenticated,service_role;
create or replace function public.backyrd_fail_spot_research_pass_v2(p_job_id uuid,p_lease_token uuid,p_pass_key text,p_retryable boolean,p_failure_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;v_run uuid;v_spot uuid;v_incomplete integer;v_failed integer;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501';end if;
  v_result:=public.backyrd_fail_spot_research_pass_pre_population_v2(p_job_id,p_lease_token,p_pass_key,p_retryable,p_failure_code);
  select population_run_id,spot_id into v_run,v_spot from public.backyrd_spot_research_jobs_v1 where id=p_job_id;
  if v_run is not null and v_result->>'state' not in ('QUEUED','RECONCILED') then
    select count(*) filter(where state not in ('READY_FOR_REVIEW','FAILED')),count(*) filter(where state='FAILED' or failure_code is not null)
      into v_incomplete,v_failed from public.backyrd_spot_research_jobs_v1 where population_run_id=v_run and spot_id=v_spot;
    if v_incomplete=0 and v_failed>0 then
      update public.backyrd_spot_intelligence_population_v1 set terminal_state='FAILED_WITH_EXPLICIT_REASON',failure_reason=left(coalesce(p_failure_code,'RESEARCH_JOB_FAILED'),160),completed_at=now(),updated_at=now() where run_id=v_run and spot_id=v_spot;
    else
      update public.backyrd_spot_intelligence_population_v1 set terminal_state='PROCESSING',failure_reason=null,completed_at=null,updated_at=now() where run_id=v_run and spot_id=v_spot;
    end if;
  end if;
  return v_result;
end $$;
revoke all on function public.backyrd_fail_spot_research_pass_v2(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.backyrd_fail_spot_research_pass_v2(uuid,uuid,text,boolean,text) to service_role;

-- Extend the existing Spot Engine Operations contract in place. The renamed
-- implementation stays private and supplies the existing Bootstrap view; the
-- public signature remains the sole browser contract and adds Intelligence
-- Population state when an INTELLIGENCE run is selected.
alter function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer)
  rename to backyrd_admin_spot_engine_operations_pre_intelligence_v1;
revoke all on function public.backyrd_admin_spot_engine_operations_pre_intelligence_v1(text,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;

create or replace function public.backyrd_admin_spot_engine_operations_v1(
  p_city_key text default 'basel',p_run_id uuid default null,p_candidate_state text default 'ALL',
  p_limit integer default 200,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_role text;v_run_id uuid;v_mode text;v_result jsonb;v_population jsonb;v_reviews jsonb;v_jobs jsonb;v_metrics jsonb;v_costs jsonb;v_runs jsonb;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501';end if;
  select role into v_role from public.admin_users where user_id=v_actor and role in ('admin','super_admin');
  if v_role is null and not public.admin_is_admin_v1() then raise exception 'admin_or_founder_required' using errcode='42501';end if;
  if p_city_key!~'^[a-z0-9_-]{1,80}$' or p_candidate_state not in ('ALL','DISCOVERED','PROCESSING','REVIEW_REQUIRED','PUBLISHED','REJECTED','FAILED','NOT_RESEARCHED','RESEARCHED_UNKNOWN','PROCESSED')
    or p_limit not between 1 and 500 or p_offset not between 0 and 10000 then raise exception 'spot_engine_filter_invalid' using errcode='22023';end if;
  if p_run_id is null then select id,mode into v_run_id,v_mode from public.backyrd_city_bootstrap_runs_v1 where city_key=p_city_key order by created_at desc limit 1;
  else select id,mode into v_run_id,v_mode from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id and city_key=p_city_key;end if;
  if p_run_id is not null and v_run_id is null then raise exception 'spot_engine_run_not_found' using errcode='22023';end if;
  v_result:=public.backyrd_admin_spot_engine_operations_pre_intelligence_v1(p_city_key,v_run_id,case when p_candidate_state in ('NOT_RESEARCHED','RESEARCHED_UNKNOWN','PROCESSED') then 'ALL' else p_candidate_state end,p_limit,p_offset);
  if v_mode is distinct from 'INTELLIGENCE' then return v_result;end if;

  select jsonb_build_object(
    'inScope',count(*),'notResearched',count(*) filter(where terminal_state='PENDING'),
    'pending',count(*) filter(where terminal_state in ('QUEUED','PROCESSING')),
    'processed',count(*) filter(where terminal_state in ('PROCESSED_WITH_SUPPORTED_FACTS','PROCESSED_UNKNOWN','REVIEW_REQUIRED','NOT_APPLICABLE')),
    'researchedUnknown',count(*) filter(where terminal_state='PROCESSED_UNKNOWN'),
    'reviewRequired',count(*) filter(where terminal_state='REVIEW_REQUIRED'),
    'notApplicable',count(*) filter(where terminal_state='NOT_APPLICABLE'),
    'failed',count(*) filter(where terminal_state='FAILED_WITH_EXPLICIT_REASON'),
    'supportedFacts',coalesce(sum(supported_fact_count),0),'researchedFacts',coalesce(sum(researched_fact_count),0),
    'autoAcceptedFacts',coalesce(sum(auto_accepted_count),0),'reviewRequiredFacts',coalesce(sum(review_required_count),0)
  ) into v_metrics from public.backyrd_spot_intelligence_population_v1 where run_id=v_run_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',page.spot_id,'displayName',page.name,'address',page.address,'city',page.city,'category',page.category_name,
    'lifecycleState',page.terminal_state,'relevanceState','RELEVANT','relevanceConfidence','EXACT',
    'identityState','MATCHED_EXISTING','identityConfidence','EXACT','matchedSpotId',page.spot_id,
    'openReviewCount',page.review_required_count,'openProposalCount',page.review_required_count,
    'failedJobCount',case when page.terminal_state='FAILED_WITH_EXPLICIT_REASON' then 1 else 0 end,
    'relevantFactCount',page.relevant_fact_count,'researchedFactCount',page.researched_fact_count,
    'supportedFactCount',page.supported_fact_count,'researchedUnknownCount',page.researched_unknown_count,
    'autoAcceptedCount',page.auto_accepted_count,'failureReason',page.failure_reason,'updatedAt',page.updated_at
  ) order by page.updated_at desc,page.name),'[]'::jsonb) into v_population
  from (
    select p.*,s.name,s.address,s.city,c.name category_name
    from public.backyrd_spot_intelligence_population_v1 p
    join public.spots s on s.id=p.spot_id left join public.categories c on c.id=s.category_id
    where p.run_id=v_run_id and case p_candidate_state
      when 'ALL' then true when 'DISCOVERED' then p.terminal_state='PENDING' when 'NOT_RESEARCHED' then p.terminal_state='PENDING'
      when 'PROCESSING' then p.terminal_state in ('QUEUED','PROCESSING') when 'RESEARCHED_UNKNOWN' then p.terminal_state='PROCESSED_UNKNOWN'
      when 'REVIEW_REQUIRED' then p.terminal_state='REVIEW_REQUIRED' when 'PROCESSED' then p.terminal_state in ('PROCESSED_WITH_SUPPORTED_FACTS','PROCESSED_UNKNOWN','NOT_APPLICABLE')
      when 'PUBLISHED' then p.terminal_state='PROCESSED_WITH_SUPPORTED_FACTS' when 'FAILED' then p.terminal_state='FAILED_WITH_EXPLICIT_REASON'
      when 'REJECTED' then false else false end
    order by p.updated_at desc,s.name limit p_limit offset p_offset
  ) page;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'kind','FACT_PROPOSAL','status',p.status,'runId',v_run_id,'candidateId',null,'spotId',p.spot_id,'spotName',s.name,
    'proposedAction',p.field_key||' = '||p.proposed_value::text,'proposedValue',p.proposed_value,'factFamily',p.field_key,
    'scope',coalesce(p.evidence_scope,p.research_evidence_scope,'UNKNOWN_SCOPE'),'entityScope',p.research_entity_scope,
    'subjectName',p.research_subject_name,'durability',p.research_durability,'scopeResolution',p.research_scope_resolution,
    'reason',coalesce(p.research_classification,p.status),'priority',case when p.status='CONFLICT' then 'HIGH' else 'MEDIUM' end,
    'resolution',p.resolution_note,'createdAt',p.created_at,'reviewedAt',p.reviewed_at,'reviewedBy',p.reviewed_by,
    'canAccept',p.status in ('PENDING','CONFLICT','STALE') and coalesce(p.evidence_scope,p.research_evidence_scope)='SPOT' and p.research_entity_scope='SPOT' and p.research_durability='PERSISTENT' and p.research_scope_resolution='PASS',
    'canReject',p.status in ('PENDING','CONFLICT','STALE'),'canEdit',true,
    'validation',jsonb_build_object('classification',p.research_classification,'deterministicConfidence',p.deterministic_confidence,'confidenceRationale',p.confidence_rationale,'researchPass',p.research_pass_key),
    'evidence',jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('sourceFamily',src.source_type,'sourceIdentity',src.source_url,'title',src.title,'legalUseStatus',src.legal_use_status,'observedAt',src.observed_at,'excerpt',p.evidence_excerpt))),
    'auditStatus',case when p.status in ('ACCEPTED','REJECTED') and exists(select 1 from public.backyrd_spot_gold_authoring_audit_v1 a where a.subject_id=p.id and a.action in ('ACCEPT','REJECT','MACHINE_ACCEPT')) then 'AUDITED' when p.status in ('ACCEPTED','REJECTED') then 'DECIDED' else 'OPEN' end
  ) order by case when p.status in ('PENDING','CONFLICT','STALE') then 0 else 1 end,p.created_at desc),'[]'::jsonb) into v_reviews
  from public.backyrd_spot_fact_proposals_v1 p join public.spots s on s.id=p.spot_id join public.backyrd_spot_sources_v1 src on src.id=p.source_id
  where exists(select 1 from public.backyrd_spot_research_jobs_v1 j where j.population_run_id=v_run_id and j.spot_id=p.spot_id and p.idempotency_key like 'research-v2.1:'||j.id::text||':%');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'kind','RESEARCH','candidateId',null,'spotId',j.spot_id,'spotName',s.name,'stage','RESEARCH','state',j.state,
    'attempts',j.technical_attempts,'maxAttempts',2,'failureClass',case when j.state='FAILED' then 'RESEARCH_FAILURE' end,
    'failureCode',j.failure_code,'canRetry',false,'availableAt',j.available_at,'startedAt',j.started_at,'completedAt',j.completed_at,
    'inputTokens',j.input_tokens,'outputTokens',j.output_tokens,'totalTokens',j.total_tokens,'webSearchCalls',j.web_search_calls,'latencyMs',j.provider_latency_ms
  ) order by j.created_at desc),'[]'::jsonb) into v_jobs from public.backyrd_spot_research_jobs_v1 j join public.spots s on s.id=j.spot_id where j.population_run_id=v_run_id;

  select jsonb_build_array(jsonb_build_object('provider','RESEARCH_AI',
    'requestCount',(select count(*) from public.backyrd_spot_research_passes_v2 p join public.backyrd_spot_research_jobs_v1 j on j.id=p.job_id where j.population_run_id=v_run_id and p.provider_response_id is not null),
    'inputUnits',coalesce(sum(j.input_tokens),0),'outputUnits',coalesce(sum(j.output_tokens),0),'totalTokens',coalesce(sum(j.total_tokens),0),
    'webSearchCalls',coalesce(sum(j.web_search_calls),0),'measuredCostMicrounits',null,'currency',null,'latencyMs',coalesce(sum(j.provider_latency_ms),0)))
    into v_costs from public.backyrd_spot_research_jobs_v1 j where j.population_run_id=v_run_id;
  select coalesce(jsonb_agg(case when item->>'id'=v_run_id::text then item||jsonb_build_object(
    'candidateCount',(v_metrics->>'inScope')::integer,'openReviewCount',(v_metrics->>'reviewRequiredFacts')::integer,
    'failedJobCount',(v_metrics->>'failed')::integer) else item end order by item->>'createdAt' desc),'[]'::jsonb)
    into v_runs from jsonb_array_elements(v_result->'runs') item;

  return v_result||jsonb_build_object('runs',v_runs,'metrics',v_metrics,'candidates',v_population,'reviewCases',v_reviews,'jobs',v_jobs,'costs',v_costs,
    'intelligencePopulation',v_metrics,'researchCoverageTarget',(select count(*) from public.backyrd_spot_intelligence_population_v1 where run_id=v_run_id));
end $$;
revoke all on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer) to authenticated;
comment on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer) is
  'Founder/Admin-only Spot Engine Operations V1 including integrated Intelligence Population coverage. No provider secret or service credential is exposed.';
