-- Proposal-only Spot Research Agent foundation. This migration cannot accept
-- facts, rebuild N4, or alter Gold readiness.

create table public.backyrd_spot_research_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  status text not null check(status in ('STARTED','PROPOSALS_CREATED','NO_SUPPORTED_FACTS','FAILED')),
  contract_version text not null default 'backyrd-spot-research-agent-v1',
  model text not null,
  input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
  provider_response_id text,
  provider_status text,
  input_tokens integer not null default 0 check(input_tokens>=0),
  output_tokens integer not null default 0 check(output_tokens>=0),
  total_tokens integer not null default 0 check(total_tokens>=0),
  proposal_count integer not null default 0 check(proposal_count between 0 and 12),
  latency_ms numeric check(latency_ms is null or latency_ms>=0),
  failure_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check(failure_code is null or length(failure_code)<=160),
  check(provider_response_id is null or length(provider_response_id)<=200)
);
create index backyrd_spot_research_runs_v1_spot_idx on public.backyrd_spot_research_runs_v1(spot_id,created_at desc);
create index backyrd_spot_research_runs_v1_actor_idx on public.backyrd_spot_research_runs_v1(actor_id,created_at desc);
alter table public.backyrd_spot_research_runs_v1 enable row level security;
revoke all on table public.backyrd_spot_research_runs_v1 from public,anon,authenticated;
grant all on table public.backyrd_spot_research_runs_v1 to service_role;

create or replace function public.backyrd_gold_submit_research_batch_v1(
  p_run_id uuid,
  p_spot_id uuid,
  p_proposals jsonb
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
      p_spot_id,
      v_row->>'fieldKey',
      v_row->'value',
      v_row->>'sourceUrl',
      v_row->>'sourceTitle',
      nullif(v_row->>'observedAt','')::timestamptz,
      v_row->>'evidenceExcerpt',
      v_row->>'confidenceRationale',
      format('research-v1:%s:%s',p_run_id,v_count)
    );
    v_results:=v_results||jsonb_build_array(v_result);
    v_count:=v_count+1;
  end loop;
  update public.backyrd_spot_research_runs_v1
  set status=case when v_count=0 then 'NO_SUPPORTED_FACTS' else 'PROPOSALS_CREATED' end,
      proposal_count=v_count,finished_at=now()
  where id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'status',case when v_count=0 then 'NO_SUPPORTED_FACTS' else 'PROPOSALS_CREATED' end,'proposalCount',v_count,'canonicalWrite',false,'proposals',v_results,'replayed',false);
end $$;

revoke all on function public.backyrd_gold_submit_research_batch_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_gold_submit_research_batch_v1(uuid,uuid,jsonb) to service_role;

comment on table public.backyrd_spot_research_runs_v1 is 'Secret-free, raw-content-free audit metadata for proposal-only Spot research runs.';
comment on function public.backyrd_gold_submit_research_batch_v1(uuid,uuid,jsonb) is 'Atomically persists a validated research proposal batch; never accepts facts or writes N4.';
