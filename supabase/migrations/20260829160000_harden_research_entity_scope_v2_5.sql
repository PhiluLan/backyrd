-- Research policy v2.5 adds a research-only Entity/Subentity attribution
-- boundary. Product scope semantics remain SPOT/EVENT/PROGRAM/TEMPORARY;
-- Decision, N4, Offering, Purpose, Gold acceptance thresholds and history are
-- unchanged. Existing proposals and runs remain immutable audit history.

alter table public.backyrd_spot_research_extractions_v2
  add column if not exists entity_scope text
    check(entity_scope in ('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS')),
  add column if not exists subject_name text check(subject_name is null or length(subject_name)<=160),
  add column if not exists durability text check(durability in ('PERSISTENT','TEMPORARY','UNKNOWN')),
  add column if not exists scope_resolution text check(scope_resolution is null or length(scope_resolution)<=80);

alter table public.backyrd_spot_fact_proposals_v1
  add column if not exists research_entity_scope text
    check(research_entity_scope is null or research_entity_scope in ('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS')),
  add column if not exists research_subject_name text check(research_subject_name is null or length(research_subject_name)<=160),
  add column if not exists research_durability text check(research_durability is null or research_durability in ('PERSISTENT','TEMPORARY','UNKNOWN')),
  add column if not exists research_scope_resolution text check(research_scope_resolution is null or length(research_scope_resolution)<=80);

create or replace function public.backyrd_research_public_host_v1(p_url text)
returns text language sql immutable set search_path=public,pg_catalog as $$
  select case
    when btrim(coalesce(p_url,'')) ~ '^https://([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}([/?][^[:space:]#]*)?$'
      and lower(btrim(p_url)) !~ '^https://(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    then regexp_replace(lower(substring(btrim(p_url) from '^https://([^/?:#]+)')), '^www\.', '')
    else null
  end
$$;

revoke all on function public.backyrd_research_public_host_v1(text) from public,anon,authenticated,service_role;

do $$ begin
  if to_regprocedure('public.backyrd_finalize_spot_research_pass_v3_legacy(uuid,uuid,text,jsonb,jsonb,jsonb)') is null then
    alter function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) rename to backyrd_finalize_spot_research_pass_v3_legacy;
  end if;
end $$;

revoke all on function public.backyrd_finalize_spot_research_pass_v3_legacy(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.backyrd_finalize_spot_research_pass_v3(
  p_job_id uuid,p_lease_token uuid,p_pass_key text,p_extractions jsonb,p_proposals jsonb,p_provider_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;v_official_host text;v_row record;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
  if jsonb_typeof(p_extractions)<>'array' or jsonb_array_length(p_extractions)>8
    or jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals)>9 then
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
      or x->>'fieldKey' not in ('identity.name','contact.website','category.primary','activity.types','accessibility.capabilities','place_type')
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
        and e->>'subjectName'=p->>'subjectName'
        and e->>'sourceUrl'=p->>'sourceUrl'
        and e->>'shortEvidence'=p->>'evidenceExcerpt'
        and (
          nullif(p->>'derivedFromFactKey','') is not null
          or e->'value'=p->'value'
          or (p->>'fieldKey'='identity.name' and btrim((e->'value')#>>'{}')=btrim((p->'value')#>>'{}'))
          or (p->>'fieldKey'='contact.website' and public.backyrd_research_public_host_v1((e->'value')#>>'{}')=public.backyrd_research_public_host_v1((p->'value')#>>'{}'))
        )
    )
  ) then
    raise exception 'research_proposal_extraction_mismatch' using errcode='22023';
  end if;

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
  return v_result||jsonb_build_object('entityScopeValidated',true,'researchPolicyVersion','backyrd-spot-research-policy-v2.5');
end $$;

revoke all on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

comment on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) is
  'Service-only v2.5 finalizer. Model scope is untrusted: only deterministically resolved, persistent SPOT evidence on the exact official public host may create a proposal.';

create or replace function public.backyrd_enqueue_spot_research_job_v1(p_spot_id uuid,p_official_website text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_actor jsonb;v_spot record;v_url text;v_scope jsonb;v_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if (v_actor->>'role') not in ('ADMIN','FOUNDER') then raise exception 'research_admin_required' using errcode='42501'; end if;
  select id,name,city,website into v_spot from public.spots where id=p_spot_id;
  v_url:=coalesce(nullif(trim(v_spot.website),''),nullif(trim(p_official_website),''));
  if public.backyrd_research_public_host_v1(v_url) is null then raise exception 'official_website_invalid' using errcode='22023'; end if;
  if v_spot.website is not null and p_official_website is not null and trim(v_spot.website)<>trim(p_official_website) then raise exception 'official_website_override_forbidden' using errcode='22023'; end if;
  v_scope:=jsonb_build_object(
    'officialWebsite',v_url,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),
    'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),
    'entityScopes',jsonb_build_array('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS'),
    'durability',jsonb_build_array('PERSISTENT','TEMPORARY','UNKNOWN'),'researchPolicyVersion','backyrd-spot-research-policy-v2.5');
  v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');
  select * into v_job from public.backyrd_spot_research_jobs_v1
    where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash
    order by created_at desc limit 1 for update;
  if found and v_job.state in ('QUEUED','RUNNING','READY_FOR_REVIEW') then
    return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',true,'canonicalWrite',false);
  end if;
  if (select count(*) from public.backyrd_spot_research_jobs_v1 where actor_id=auth.uid() and created_at>=now()-interval '1 day')>=10 then raise exception 'research_daily_limit_reached' using errcode='P0001'; end if;
  begin
    insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase)
    values(p_spot_id,auth.uid(),'backyrd-spot-research-agent-v2.1',v_scope,v_hash,'A','PASS_A_QUEUED') returning * into v_job;
    insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');
  exception when unique_violation then
    select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash and state in ('QUEUED','RUNNING') order by created_at desc limit 1;
  end;
  return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',false,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_city_bootstrap_enqueue_research_v1(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_c public.backyrd_city_bootstrap_candidates_v1%rowtype;v_run public.backyrd_city_bootstrap_runs_v1%rowtype;v_spot record;v_scope jsonb;v_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;v_deduplicated boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'city_bootstrap_service_only' using errcode='42501';end if;
  select * into v_c from public.backyrd_city_bootstrap_candidates_v1 where id=p_candidate_id for update;
  if not found then raise exception 'city_bootstrap_candidate_not_found' using errcode='22023';end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=v_c.run_id;
  if v_run.mode not in ('PILOT','SCALE') or v_run.status<>'RUNNING' or v_run.requested_by is null or not exists(select 1 from public.admin_users a where a.user_id=v_run.requested_by and a.role in ('admin','super_admin')) then raise exception 'city_bootstrap_research_actor_invalid' using errcode='42501';end if;
  if v_c.lifecycle_state<>'PUBLISHED' or v_c.matched_spot_id is null then raise exception 'city_bootstrap_candidate_not_published' using errcode='22023';end if;
  if v_run.mode='PILOT' and (select count(*) from public.backyrd_city_bootstrap_candidates_v1 where run_id=v_run.id and lifecycle_state='PUBLISHED')>30 then raise exception 'city_bootstrap_pilot_limit_exceeded' using errcode='22023';end if;
  select id,name,city,website into v_spot from public.spots where id=v_c.matched_spot_id;
  if public.backyrd_research_public_host_v1(v_spot.website) is null then raise exception 'official_website_required' using errcode='22023';end if;
  v_scope:=jsonb_build_object(
    'officialWebsite',v_spot.website,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),
    'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),
    'entityScopes',jsonb_build_array('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS'),
    'durability',jsonb_build_array('PERSISTENT','TEMPORARY','UNKNOWN'),'researchPolicyVersion','backyrd-spot-research-policy-v2.5');
  v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');
  select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=v_spot.id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash order by created_at desc limit 1;
  if found then v_deduplicated:=true; else
    insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase)
    values(v_spot.id,v_run.requested_by,'backyrd-spot-research-agent-v2.1',v_scope,v_hash,'A','PASS_A_QUEUED') returning * into v_job;
    insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');
  end if;
  insert into public.backyrd_city_bootstrap_jobs_v1(run_id,candidate_id,stage,idempotency_key,state,completed_at)
  values(v_run.id,v_c.id,'RESEARCH','research:'||v_hash,'COMPLETE',now()) on conflict(run_id,idempotency_key) do nothing;
  return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',v_deduplicated,'canonicalWrite',false);
end $$;

revoke all on function public.backyrd_enqueue_spot_research_job_v1(uuid,text),public.backyrd_city_bootstrap_enqueue_research_v1(uuid) from public,anon,authenticated;
grant execute on function public.backyrd_enqueue_spot_research_job_v1(uuid,text) to authenticated,service_role;
grant execute on function public.backyrd_city_bootstrap_enqueue_research_v1(uuid) to service_role;

comment on function public.backyrd_enqueue_spot_research_job_v1(uuid,text) is 'Admin/Founder enqueue for the v2.5 Entity/Subentity-scope Research policy. History remains append-only.';
comment on function public.backyrd_city_bootstrap_enqueue_research_v1(uuid) is 'Service-only City Bootstrap adapter for Research policy v2.5; review proposals only, never Accepted Facts or N4.';
