-- Research Agent v2.1 operational recovery.
-- Reuses the same logical job only when both first attempts failed before any
-- extraction/proposal was persisted because the provider rejected the schema.
-- It never writes accepted facts, N4, Gold readiness, reviews, memory or ranking.

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
 v_scope:=jsonb_build_object('officialWebsite',v_url,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'),'evidenceScopes',jsonb_build_array('SPOT','EVENT','PROGRAM','TEMPORARY','UNKNOWN_SCOPE'));
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

comment on function public.backyrd_enqueue_spot_research_job_v1(uuid,text) is
  'Admin/Founder enqueue with active-job idempotency and one bounded same-job recovery for a v2.1 provider-schema HTTP 400 before any proposal/extraction.';
