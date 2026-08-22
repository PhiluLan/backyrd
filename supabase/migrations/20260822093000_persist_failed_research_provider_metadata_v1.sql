-- Preserve bounded provider usage/disposition for failed or incomplete runs.
-- This remains operational metadata only and has no canonical truth authority.
create or replace function public.backyrd_record_spot_research_disposition_v1(p_job_id uuid,p_lease_token uuid,p_provider_metadata jsonb)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and lease_expires_at>now() for update;
 if not found then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
 update public.backyrd_spot_research_jobs_v1 set
  provider_response_id=nullif(left(p_provider_metadata->>'providerResponseId',200),''),
  provider_status=nullif(left(p_provider_metadata->>'providerStatus',80),''),
  input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),
  output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),
  total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),
  web_search_calls=greatest(0,coalesce((p_provider_metadata->>'webSearchCalls')::integer,0)),
  updated_at=now() where id=v_job.id;
 update public.backyrd_spot_research_runs_v1 set
  provider_response_id=nullif(left(p_provider_metadata->>'providerResponseId',200),''),
  provider_status=nullif(left(p_provider_metadata->>'providerStatus',80),''),
  input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),
  output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),
  total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),
  latency_ms=greatest(0,extract(epoch from(now()-created_at))*1000)
  where id=v_job.current_run_id;
end $$;
revoke all on function public.backyrd_record_spot_research_disposition_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_record_spot_research_disposition_v1(uuid,uuid,jsonb) to service_role;
comment on function public.backyrd_record_spot_research_disposition_v1(uuid,uuid,jsonb) is 'Persists allowlisted provider disposition/usage for audit, including failed runs; no truth writes.';
