-- Forward-only hardening: proposal batch and bounded provider audit metadata
-- commit together. The prior v1 batch remains service-only for compatibility.

create or replace function public.backyrd_gold_submit_research_batch_v2(
  p_run_id uuid,
  p_spot_id uuid,
  p_proposals jsonb,
  p_provider_metadata jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row jsonb; v_result jsonb; v_results jsonb='[]'::jsonb; v_count integer=0; v_run record;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
  select * into v_run from public.backyrd_spot_research_runs_v1 where id=p_run_id for update;
  if not found or v_run.spot_id<>p_spot_id then raise exception 'research_run_identity_invalid' using errcode='22023'; end if;
  if v_run.status<>'STARTED' then
    return jsonb_build_object('runId',p_run_id,'status',v_run.status,'proposalCount',v_run.proposal_count,'canonicalWrite',false,'replayed',true);
  end if;
  if jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals)>12 then raise exception 'research_proposal_batch_invalid' using errcode='22023'; end if;
  for v_row in select value from jsonb_array_elements(p_proposals) loop
    v_result:=public.backyrd_gold_submit_research_proposal_v1(
      p_spot_id,v_row->>'fieldKey',v_row->'value',v_row->>'sourceUrl',v_row->>'sourceTitle',
      nullif(v_row->>'observedAt','')::timestamptz,v_row->>'evidenceExcerpt',v_row->>'confidenceRationale',
      format('research-v1:%s:%s',p_run_id,v_count)
    );
    v_results:=v_results||jsonb_build_array(v_result);
    v_count:=v_count+1;
  end loop;
  update public.backyrd_spot_research_runs_v1
  set status=case when v_count=0 then 'NO_SUPPORTED_FACTS' else 'PROPOSALS_CREATED' end,
      proposal_count=v_count,
      provider_response_id=nullif(left(p_provider_metadata->>'providerResponseId',200),''),
      provider_status=nullif(left(p_provider_metadata->>'providerStatus',80),''),
      input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),
      output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),
      total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),
      latency_ms=greatest(0,coalesce((p_provider_metadata->>'latencyMs')::numeric,0)),
      finished_at=now()
  where id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'status',case when v_count=0 then 'NO_SUPPORTED_FACTS' else 'PROPOSALS_CREATED' end,'proposalCount',v_count,'canonicalWrite',false,'proposals',v_results,'replayed',false);
end $$;

revoke all on function public.backyrd_gold_submit_research_batch_v2(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_gold_submit_research_batch_v2(uuid,uuid,jsonb,jsonb) to service_role;
comment on function public.backyrd_gold_submit_research_batch_v2(uuid,uuid,jsonb,jsonb) is 'Atomically persists a validated research proposal batch and bounded run metadata; never accepts facts or writes N4.';
