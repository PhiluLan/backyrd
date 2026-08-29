-- Research policy v2.8 binds redirect validation to the canonical Spot name
-- in both the deterministic runtime and SQL boundary. v2.7 failed jobs remain
-- immutable and receive a new source-scope hash on explicit retry.

do $$ begin
  if to_regprocedure('public.backyrd_finalize_spot_research_pass_v3_entity_redirect_v27(uuid,uuid,text,jsonb,jsonb,jsonb)') is null then
    alter function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) rename to backyrd_finalize_spot_research_pass_v3_entity_redirect_v27;
  end if;
end $$;
revoke all on function public.backyrd_finalize_spot_research_pass_v3_entity_redirect_v27(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.backyrd_finalize_spot_research_pass_v3(p_job_id uuid,p_lease_token uuid,p_pass_key text,p_extractions jsonb,p_proposals jsonb,p_provider_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_result jsonb;v_official_url text;v_spot_name text;v_row jsonb;v_candidate_url text;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501';end if;
  select s.website,s.name into v_official_url,v_spot_name from public.backyrd_spot_research_jobs_v1 j join public.spots s on s.id=j.spot_id where j.id=p_job_id;
  if v_official_url is null then raise exception 'research_official_website_invalid' using errcode='22023';end if;
  for v_row in select value from jsonb_array_elements(p_extractions) loop if not public.backyrd_research_url_matches_instance_v1(v_official_url,v_row->>'sourceUrl',v_spot_name) then raise exception 'research_source_instance_scope_mismatch' using errcode='22023';end if;end loop;
  for v_row in select value from jsonb_array_elements(p_proposals) loop foreach v_candidate_url in array array[v_row->>'sourceUrl',case when v_row->>'fieldKey'='contact.website' then (v_row->'value')#>>'{}' else null end] loop if v_candidate_url is not null and not public.backyrd_research_url_matches_instance_v1(v_official_url,v_candidate_url,v_spot_name) then raise exception 'research_proposal_instance_scope_mismatch' using errcode='22023';end if;end loop;end loop;
  v_result:=public.backyrd_finalize_spot_research_pass_v3_entity_scope_v25(p_job_id,p_lease_token,p_pass_key,p_extractions,p_proposals,p_provider_metadata);
  return v_result||jsonb_build_object('entityInstanceScopeValidated',true,'researchPolicyVersion','backyrd-spot-research-policy-v2.8');
end $$;
revoke all on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_finalize_spot_research_pass_v3(uuid,uuid,text,jsonb,jsonb,jsonb) to service_role;

create or replace function public.backyrd_enqueue_spot_research_job_v1(p_spot_id uuid,p_official_website text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_actor jsonb;v_spot record;v_url text;v_scope jsonb;v_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);if (v_actor->>'role') not in ('ADMIN','FOUNDER') then raise exception 'research_admin_required' using errcode='42501';end if;select id,name,city,website into v_spot from public.spots where id=p_spot_id;v_url:=coalesce(nullif(trim(v_spot.website),''),nullif(trim(p_official_website),''));if public.backyrd_research_public_host_v1(v_url) is null then raise exception 'official_website_invalid' using errcode='22023';end if;if v_spot.website is not null and p_official_website is not null and trim(v_spot.website)<>trim(p_official_website) then raise exception 'official_website_override_forbidden' using errcode='22023';end if;
  v_scope:=jsonb_build_object('officialWebsite',v_url,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),'entityScopes',jsonb_build_array('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS'),'durability',jsonb_build_array('PERSISTENT','TEMPORARY','UNKNOWN'),'researchPolicyVersion','backyrd-spot-research-policy-v2.8');v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');
  select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash order by created_at desc limit 1 for update;if found and v_job.state in ('QUEUED','RUNNING','READY_FOR_REVIEW') then return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',true,'canonicalWrite',false);end if;if (select count(*) from public.backyrd_spot_research_jobs_v1 where actor_id=auth.uid() and created_at>=now()-interval '1 day')>=10 then raise exception 'research_daily_limit_reached' using errcode='P0001';end if;
  insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase) values(p_spot_id,auth.uid(),'backyrd-spot-research-agent-v2.1',v_scope,v_hash,'A','PASS_A_QUEUED') returning * into v_job;insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',false,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_city_bootstrap_enqueue_research_v1(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_c public.backyrd_city_bootstrap_candidates_v1%rowtype;v_run public.backyrd_city_bootstrap_runs_v1%rowtype;v_spot record;v_scope jsonb;v_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;v_deduplicated boolean:=false;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'city_bootstrap_service_only' using errcode='42501';end if;select * into v_c from public.backyrd_city_bootstrap_candidates_v1 where id=p_candidate_id for update;if not found then raise exception 'city_bootstrap_candidate_not_found' using errcode='22023';end if;select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=v_c.run_id;if v_run.mode not in ('PILOT','SCALE') or v_run.status<>'RUNNING' or v_run.requested_by is null or not exists(select 1 from public.admin_users a where a.user_id=v_run.requested_by and a.role in ('admin','super_admin')) then raise exception 'city_bootstrap_research_actor_invalid' using errcode='42501';end if;if v_c.lifecycle_state<>'PUBLISHED' or v_c.matched_spot_id is null then raise exception 'city_bootstrap_candidate_not_published' using errcode='22023';end if;select id,name,city,website into v_spot from public.spots where id=v_c.matched_spot_id;if public.backyrd_research_public_host_v1(v_spot.website) is null then raise exception 'official_website_required' using errcode='22023';end if;
  v_scope:=jsonb_build_object('officialWebsite',v_spot.website,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),'entityScopes',jsonb_build_array('SPOT','SUBVENUE','EVENT','PROGRAM','TEMPORARY','SERVICE','OFFERING','TENANT','PERSON','OTHER','AMBIGUOUS'),'durability',jsonb_build_array('PERSISTENT','TEMPORARY','UNKNOWN'),'researchPolicyVersion','backyrd-spot-research-policy-v2.8');v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=v_spot.id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash order by created_at desc limit 1;if found then v_deduplicated:=true;else insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase) values(v_spot.id,v_run.requested_by,'backyrd-spot-research-agent-v2.1',v_scope,v_hash,'A','PASS_A_QUEUED') returning * into v_job;insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');end if;insert into public.backyrd_city_bootstrap_jobs_v1(run_id,candidate_id,stage,idempotency_key,state,completed_at) values(v_run.id,v_c.id,'RESEARCH','research:'||v_hash,'COMPLETE',now()) on conflict(run_id,idempotency_key) do nothing;return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',v_deduplicated,'canonicalWrite',false);
end $$;
revoke all on function public.backyrd_enqueue_spot_research_job_v1(uuid,text),public.backyrd_city_bootstrap_enqueue_research_v1(uuid) from public,anon,authenticated;
grant execute on function public.backyrd_enqueue_spot_research_job_v1(uuid,text) to authenticated,service_role;
grant execute on function public.backyrd_city_bootstrap_enqueue_research_v1(uuid) to service_role;
