-- Production Decision Engine final correctness closure.
-- Additive observability only: no Product, Spot, Review, Memory or User truth
-- is rewritten. Candidate identities remain minimized and decision-scoped.

create table public.backyrd_decision_funnel_traces_v1 (
  decision_id uuid primary key references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trace_version text not null default 'backyrd-decision-funnel-trace-v1',
  current_intent jsonb not null default '{}'::jsonb check(jsonb_typeof(current_intent)='object'),
  retrieval_funnel jsonb not null default '{}'::jsonb check(jsonb_typeof(retrieval_funnel)='object'),
  decision_funnel jsonb not null default '{}'::jsonb check(jsonb_typeof(decision_funnel)='object'),
  final_disposition jsonb not null default '{}'::jsonb check(jsonb_typeof(final_disposition)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index backyrd_decision_funnel_user_created_v1 on public.backyrd_decision_funnel_traces_v1(user_id,created_at desc);
alter table public.backyrd_decision_funnel_traces_v1 enable row level security;
revoke all on public.backyrd_decision_funnel_traces_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_funnel_traces_v1 to service_role;

create or replace function public.backyrd_persist_decision_funnel_trace_v1(
  p_decision_id uuid,p_user_id uuid,p_stage text,p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'decision_funnel_service_only' using errcode='42501'; end if;
  if p_stage not in ('RETRIEVAL','DECISION','COMPLETE') or jsonb_typeof(p_payload)<>'object' then
    raise exception 'decision_funnel_payload_invalid' using errcode='22023';
  end if;
  if not exists(select 1 from public.decision_sessions d where d.id=p_decision_id and d.user_id=p_user_id) then
    raise exception 'decision_funnel_identity_invalid' using errcode='42501';
  end if;
  insert into public.backyrd_decision_funnel_traces_v1(decision_id,user_id,current_intent,retrieval_funnel,decision_funnel,final_disposition,completed_at)
  values(
    p_decision_id,p_user_id,
    case when p_stage='RETRIEVAL' then coalesce(p_payload->'currentIntent','{}'::jsonb) else '{}'::jsonb end,
    case when p_stage='RETRIEVAL' then coalesce(p_payload->'funnel','{}'::jsonb) else '{}'::jsonb end,
    case when p_stage='DECISION' then p_payload else '{}'::jsonb end,
    case when p_stage='COMPLETE' then p_payload else '{}'::jsonb end,
    case when p_stage='COMPLETE' then now() else null end
  )
  on conflict(decision_id) do update set
    current_intent=case when p_stage='RETRIEVAL' then coalesce(p_payload->'currentIntent','{}'::jsonb) else backyrd_decision_funnel_traces_v1.current_intent end,
    retrieval_funnel=case when p_stage='RETRIEVAL' then coalesce(p_payload->'funnel','{}'::jsonb) else backyrd_decision_funnel_traces_v1.retrieval_funnel end,
    decision_funnel=case when p_stage='DECISION' then p_payload else backyrd_decision_funnel_traces_v1.decision_funnel end,
    final_disposition=case when p_stage='COMPLETE' then p_payload else backyrd_decision_funnel_traces_v1.final_disposition end,
    completed_at=case when p_stage='COMPLETE' then now() else backyrd_decision_funnel_traces_v1.completed_at end,
    updated_at=now()
  returning decision_id into v_id;
  return v_id;
end $$;

revoke all on function public.backyrd_persist_decision_funnel_trace_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_persist_decision_funnel_trace_v1(uuid,uuid,text,jsonb) to service_role;

comment on table public.backyrd_decision_funnel_traces_v1 is
  'Stage-monotonic, decision-scoped reconstruction of canonical intent, full fused candidate identities, exclusions, N4/factual ranking and final disposition. No raw user history.';
