-- Version the Research Agent's bounded proposal policy after the real Basel
-- City Bootstrap pilot. The provider contract remains v2.1; the source-scope
-- hash now includes the independently reversible v2.2 policy identity so an
-- unchanged Spot can receive one explicit second-pass pilot job without
-- mutating or erasing the first-pass evidence, proposals, runs, or usage.

create or replace function public.backyrd_enqueue_spot_research_job_v1(p_spot_id uuid,p_official_website text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_actor jsonb;v_spot record;v_url text;v_scope jsonb;v_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;v_recoverable boolean:=false;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
 if (v_actor->>'role') not in ('ADMIN','FOUNDER') then raise exception 'research_admin_required' using errcode='42501'; end if;
 select id,name,city,website into v_spot from public.spots where id=p_spot_id;
 v_url:=coalesce(nullif(trim(v_spot.website),''),nullif(trim(p_official_website),''));
 if v_url is null then raise exception 'official_website_required' using errcode='22023'; end if;
 if v_spot.website is not null and p_official_website is not null and trim(v_spot.website)<>trim(p_official_website) then raise exception 'official_website_override_forbidden' using errcode='22023'; end if;
 if v_url!~'^https://[^[:space:]]+$' then raise exception 'official_website_invalid' using errcode='22023'; end if;
 v_scope:=jsonb_build_object('officialWebsite',v_url,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),'researchPolicyVersion','backyrd-spot-research-policy-v2.2');
 v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');

 select * into v_job from public.backyrd_spot_research_jobs_v1
 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash
 order by created_at desc limit 1 for update;
 if found and v_job.state in ('QUEUED','RUNNING') then
  return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',true,'recovered',false,'canonicalWrite',false);
 end if;

 if found and v_job.state='FAILED' and v_job.proposal_count=0 then
  select count(*)=2 and bool_and(state='FAILED' and attempts=1 and proposal_count=0 and extraction_count=0 and failure_code='research_provider_http_400')
  into v_recoverable from public.backyrd_spot_research_passes_v2 where job_id=v_job.id;
 end if;
 if v_recoverable then
  update public.backyrd_spot_research_passes_v2 set
    state=case pass_key when 'A' then 'QUEUED' else 'PENDING' end,
    failure_code=null,provider_response_id=null,provider_status=null,attempt_token=null,current_run_id=null,
    completed_at=null,updated_at=now()
  where job_id=v_job.id;
  update public.backyrd_spot_research_jobs_v1 set
    state='QUEUED',current_pass='A',phase='PASS_A_QUEUED',available_at=now(),queued_at=now(),
    failure_code=null,lease_token=null,lease_expires_at=null,runner_id=null,completed_at=null,updated_at=now()
  where id=v_job.id returning * into v_job;
  return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',true,'recovered',true,'canonicalWrite',false);
 end if;

 if (select count(*) from public.backyrd_spot_research_jobs_v1 where actor_id=auth.uid() and created_at>=now()-interval '1 day')>=10 then raise exception 'research_daily_limit_reached' using errcode='P0001'; end if;
 begin
  insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase)
  values(p_spot_id,auth.uid(),'backyrd-spot-research-agent-v2.1',v_scope,v_hash,'A','PASS_A_QUEUED') returning * into v_job;
  insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');
 exception when unique_violation then
  select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2.1' and source_scope_hash=v_hash and state in ('QUEUED','RUNNING') order by created_at desc limit 1;
 end;
 return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',false,'recovered',false,'canonicalWrite',false);
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
 if v_spot.website is null or v_spot.website!~'^https://[^[:space:]]+$' then raise exception 'official_website_required' using errcode='22023';end if;
 v_scope:=jsonb_build_object('officialWebsite',v_spot.website,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'),'researchPolicyVersion','backyrd-spot-research-policy-v2.2');
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

comment on function public.backyrd_enqueue_spot_research_job_v1(uuid,text) is
  'Admin/Founder v2.1 enqueue with independently versioned v2.2 proposal policy identity, active-job idempotency, and bounded schema recovery.';
comment on function public.backyrd_city_bootstrap_enqueue_research_v1(uuid) is
  'Service-only City Bootstrap adapter for the versioned v2.2 Research proposal policy. It creates review proposals only and never Accepted Facts or N4.';
