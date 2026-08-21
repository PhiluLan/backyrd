-- Sprint 3: deterministic shadow-only Decision Input package persistence.
create table public.backyrd_decision_input_runtime_settings_v1 (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.backyrd_decision_input_runtime_settings_v1(singleton,enabled) values(true,false) on conflict(singleton) do nothing;
alter table public.backyrd_decision_input_runtime_settings_v1 enable row level security;
revoke all on public.backyrd_decision_input_runtime_settings_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_input_runtime_settings_v1 to service_role;

create table public.backyrd_decision_input_traces_v1 (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null unique references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_card_hash text not null check(user_card_hash ~ '^[0-9a-f]{64}$'),
  moment_hash text not null check(moment_hash ~ '^[0-9a-f]{64}$'),
  projection_hash text not null check(projection_hash ~ '^[0-9a-f]{64}$'),
  candidate_set_hash text not null check(candidate_set_hash ~ '^[0-9a-f]{64}$'),
  n4_hashes jsonb not null check(jsonb_typeof(n4_hashes)='object'),
  knowledge_mode text not null check(knowledge_mode in ('SUFFICIENT','PARTIAL','LOW_OR_UNKNOWN')),
  contract_versions jsonb not null check(jsonb_typeof(contract_versions)='object'),
  package_hash text not null check(package_hash ~ '^[0-9a-f]{64}$'),
  validation_disposition text not null check(validation_disposition='VALID'),
  created_at timestamptz not null default now()
);
create index backyrd_decision_input_traces_user_created_v1 on public.backyrd_decision_input_traces_v1(user_id,created_at desc);
alter table public.backyrd_decision_input_traces_v1 enable row level security;
revoke all on public.backyrd_decision_input_traces_v1 from public,anon,authenticated;
grant all on public.backyrd_decision_input_traces_v1 to service_role;

create or replace function public.backyrd_read_decision_candidate_facts_v1(p_spot_ids uuid[])
returns table(spot_id uuid,status text,city text,country text,category_name text,open_now boolean)
language plpgsql stable security definer set search_path=public,pg_catalog as $$
begin
  if cardinality(coalesce(p_spot_ids,'{}'::uuid[]))>50 then
    raise exception 'decision_candidate_batch_too_large' using errcode='22023';
  end if;
  return query
  select s.id,s.status::text,s.city,s.country,c.name,public.spot_is_open_now_safe_v1(s.id)
  from public.spots s left join public.categories c on c.id=s.category_id
  where s.id=any(coalesce(p_spot_ids,'{}'::uuid[]))
  order by s.id;
end
$$;

create or replace function public.backyrd_persist_decision_input_trace_v1(
  p_decision_id uuid,p_user_id uuid,p_user_card_hash text,p_moment_hash text,
  p_projection_hash text,p_candidate_set_hash text,p_n4_hashes jsonb,
  p_knowledge_mode text,p_contract_versions jsonb,p_package_hash text,
  p_validation_disposition text
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_id uuid;v_existing_hash text;
begin
  if auth.role()<>'service_role' then raise exception 'decision_input_service_only' using errcode='42501'; end if;
  if not coalesce((select enabled from public.backyrd_decision_input_runtime_settings_v1 where singleton),false) then raise exception 'decision_input_runtime_disabled' using errcode='55000'; end if;
  if not exists(select 1 from public.decision_sessions where id=p_decision_id and user_id=p_user_id) then raise exception 'decision_input_cross_user' using errcode='42501'; end if;
  if p_validation_disposition<>'VALID' or p_knowledge_mode not in ('SUFFICIENT','PARTIAL','LOW_OR_UNKNOWN') then raise exception 'decision_input_invalid_disposition' using errcode='22023'; end if;
  select id,package_hash into v_id,v_existing_hash from public.backyrd_decision_input_traces_v1 where decision_id=p_decision_id;
  if v_id is not null then
    if v_existing_hash<>p_package_hash then raise exception 'decision_input_already_frozen' using errcode='23505'; end if;
    return v_id;
  end if;
  insert into public.backyrd_decision_input_traces_v1(decision_id,user_id,user_card_hash,moment_hash,projection_hash,candidate_set_hash,n4_hashes,knowledge_mode,contract_versions,package_hash,validation_disposition)
  values(p_decision_id,p_user_id,p_user_card_hash,p_moment_hash,p_projection_hash,p_candidate_set_hash,p_n4_hashes,p_knowledge_mode,p_contract_versions,p_package_hash,p_validation_disposition)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.backyrd_read_decision_candidate_facts_v1(uuid[]),public.backyrd_persist_decision_input_trace_v1(uuid,uuid,text,text,text,text,jsonb,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.backyrd_read_decision_candidate_facts_v1(uuid[]),public.backyrd_persist_decision_input_trace_v1(uuid,uuid,text,text,text,text,jsonb,text,jsonb,text,text) to service_role;
