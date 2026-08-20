-- Sprint 4: shadow-only deterministic decision orchestration.
create table public.backyrd_decision_orchestrator_settings_v1 (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.backyrd_decision_orchestrator_settings_v1(singleton,enabled)
values(true,false) on conflict(singleton) do nothing;
alter table public.backyrd_decision_orchestrator_settings_v1 enable row level security;
revoke all on public.backyrd_decision_orchestrator_settings_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_orchestrator_settings_v1 to service_role;

create table public.backyrd_deterministic_decision_traces_v1 (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_trace_id uuid not null references public.backyrd_decision_input_traces_v1(id) on delete cascade,
  package_hash text not null check(package_hash ~ '^[0-9a-f]{64}$'),
  moment_hash text not null check(moment_hash ~ '^[0-9a-f]{64}$'),
  user_card_hash text not null check(user_card_hash ~ '^[0-9a-f]{64}$'),
  projection_hash text not null check(projection_hash ~ '^[0-9a-f]{64}$'),
  candidate_set_hash text not null check(candidate_set_hash ~ '^[0-9a-f]{64}$'),
  n4_hashes jsonb not null check(jsonb_typeof(n4_hashes)='object'),
  reason_set_hashes jsonb not null check(jsonb_typeof(reason_set_hashes)='object'),
  ranking_version text not null,
  ranking_hash text not null check(ranking_hash ~ '^[0-9a-f]{64}$'),
  ranking_inputs jsonb not null check(jsonb_typeof(ranking_inputs)='object'),
  final_order uuid[] not null check(cardinality(final_order) between 0 and 3),
  knowledge_mode text not null check(knowledge_mode in ('SUFFICIENT','PARTIAL','LOW_OR_UNKNOWN')),
  result_source text not null check(result_source='DETERMINISTIC_NORTH_STAR'),
  response_hash text not null check(response_hash ~ '^[0-9a-f]{64}$'),
  validation_disposition text not null check(validation_disposition='COMPLETE_VALID'),
  latency_ms jsonb not null check(jsonb_typeof(latency_ms)='object'),
  created_at timestamptz not null default now(),
  unique(input_trace_id,response_hash)
);
create index backyrd_deterministic_decision_trace_user_created_v1
  on public.backyrd_deterministic_decision_traces_v1(user_id,created_at desc);
alter table public.backyrd_deterministic_decision_traces_v1 enable row level security;
revoke all on public.backyrd_deterministic_decision_traces_v1 from public,anon,authenticated;
grant all on public.backyrd_deterministic_decision_traces_v1 to service_role;

create or replace function public.backyrd_read_decision_result_cards_v1(p_spot_ids uuid[])
returns table(spot_id uuid,name text,city text,category_name text,header_photo_path text)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if auth.role()<>'service_role' then raise exception 'decision_orchestrator_service_only' using errcode='42501'; end if;
  if cardinality(coalesce(p_spot_ids,'{}'::uuid[]))>50 then raise exception 'decision_result_batch_too_large' using errcode='22023'; end if;
  return query select s.id,s.name,s.city,c.name,s.header_photo_path
  from public.spots s left join public.categories c on c.id=s.category_id
  where s.id=any(coalesce(p_spot_ids,'{}'::uuid[])) order by s.id;
end $$;

create or replace function public.backyrd_persist_deterministic_decision_trace_v1(
  p_decision_id uuid,p_user_id uuid,p_package_hash text,p_moment_hash text,p_user_card_hash text,
  p_projection_hash text,p_candidate_set_hash text,p_n4_hashes jsonb,p_reason_set_hashes jsonb,
  p_ranking_version text,p_ranking_hash text,p_ranking_inputs jsonb,p_final_order uuid[],
  p_knowledge_mode text,p_result_source text,p_response_hash text,p_validation_disposition text,
  p_latency_ms jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;v_existing_response text;v_existing_package text;v_existing_ranking text;v_existing_reasons jsonb;v_input_trace uuid;
begin
  if auth.role()<>'service_role' then raise exception 'decision_orchestrator_service_only' using errcode='42501'; end if;
  if not coalesce((select enabled from public.backyrd_decision_orchestrator_settings_v1 where singleton),false) then raise exception 'decision_orchestrator_disabled' using errcode='55000'; end if;
  if p_validation_disposition<>'COMPLETE_VALID' or p_result_source<>'DETERMINISTIC_NORTH_STAR' or p_knowledge_mode not in ('SUFFICIENT','PARTIAL','LOW_OR_UNKNOWN') then raise exception 'decision_orchestrator_invalid_disposition' using errcode='22023'; end if;
  if cardinality(coalesce(p_final_order,'{}'::uuid[]))>3 or cardinality(coalesce(p_final_order,'{}'::uuid[]))<>(select count(distinct x) from unnest(coalesce(p_final_order,'{}'::uuid[])) x) then raise exception 'decision_orchestrator_invalid_order' using errcode='22023'; end if;
  select id into v_input_trace from public.backyrd_decision_input_traces_v1
  where decision_id=p_decision_id and user_id=p_user_id and package_hash=p_package_hash
    and moment_hash=p_moment_hash and user_card_hash=p_user_card_hash and projection_hash=p_projection_hash
    and candidate_set_hash=p_candidate_set_hash and validation_disposition='VALID';
  if v_input_trace is null then raise exception 'decision_orchestrator_input_trace_mismatch' using errcode='42501'; end if;
  if exists(select 1 from unnest(coalesce(p_final_order,'{}'::uuid[])) x where not exists(select 1 from public.decision_impressions di where di.decision_id=p_decision_id and di.spot_id=x)) then raise exception 'decision_orchestrator_candidate_not_frozen' using errcode='42501'; end if;
  select id,response_hash,package_hash,ranking_hash,reason_set_hashes into v_id,v_existing_response,v_existing_package,v_existing_ranking,v_existing_reasons from public.backyrd_deterministic_decision_traces_v1 where decision_id=p_decision_id;
  if v_id is not null then
    if v_existing_response<>p_response_hash or v_existing_package<>p_package_hash or v_existing_ranking<>p_ranking_hash or v_existing_reasons<>p_reason_set_hashes then raise exception 'decision_orchestrator_already_completed' using errcode='23505'; end if;
    return v_id;
  end if;
  insert into public.backyrd_deterministic_decision_traces_v1(
    decision_id,user_id,input_trace_id,package_hash,moment_hash,user_card_hash,projection_hash,candidate_set_hash,
    n4_hashes,reason_set_hashes,ranking_version,ranking_hash,ranking_inputs,final_order,knowledge_mode,
    result_source,response_hash,validation_disposition,latency_ms)
  values(p_decision_id,p_user_id,v_input_trace,p_package_hash,p_moment_hash,p_user_card_hash,p_projection_hash,p_candidate_set_hash,
    p_n4_hashes,p_reason_set_hashes,p_ranking_version,p_ranking_hash,p_ranking_inputs,coalesce(p_final_order,'{}'::uuid[]),
    p_knowledge_mode,p_result_source,p_response_hash,p_validation_disposition,p_latency_ms)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.backyrd_read_decision_result_cards_v1(uuid[]),
  public.backyrd_persist_deterministic_decision_trace_v1(uuid,uuid,text,text,text,text,text,jsonb,jsonb,text,text,jsonb,uuid[],text,text,text,text,jsonb)
  from public,anon,authenticated;
grant execute on function public.backyrd_read_decision_result_cards_v1(uuid[]),
  public.backyrd_persist_deterministic_decision_trace_v1(uuid,uuid,text,text,text,text,text,jsonb,jsonb,text,text,jsonb,uuid[],text,text,text,text,jsonb)
  to service_role;
