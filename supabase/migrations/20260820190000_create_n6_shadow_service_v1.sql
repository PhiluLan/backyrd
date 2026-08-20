-- Sprint 5: optional, fail-closed N6 shadow execution. The deterministic
-- Sprint-4 result remains authoritative and visible.
create table public.backyrd_n6_shadow_settings_v1 (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  internal_only boolean not null default true,
  sample_rate numeric not null default 0 check(sample_rate between 0 and 1),
  allowlisted_user_ids uuid[] not null default '{}',
  per_user_daily_call_cap integer not null default 2 check(per_user_daily_call_cap between 0 and 100),
  global_daily_call_cap integer not null default 8 check(global_daily_call_cap between 0 and 1000),
  global_daily_budget_usd numeric not null default 2 check(global_daily_budget_usd between 0 and 10000),
  max_concurrent_calls integer not null default 1 check(max_concurrent_calls between 1 and 100),
  max_attempts integer not null default 2 check(max_attempts between 1 and 5),
  updated_at timestamptz not null default now()
);
insert into public.backyrd_n6_shadow_settings_v1(singleton) values(true) on conflict(singleton) do nothing;
alter table public.backyrd_n6_shadow_settings_v1 enable row level security;
revoke all on public.backyrd_n6_shadow_settings_v1 from public,anon,authenticated;
grant all on public.backyrd_n6_shadow_settings_v1 to service_role;

create table public.backyrd_n6_shadow_work_v1 (
  id uuid primary key default gen_random_uuid(),
  shadow_run_id uuid not null default gen_random_uuid(),
  decision_id uuid not null unique references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
  input_payload jsonb not null check(jsonb_typeof(input_payload)='object'),
  estimated_input_tokens integer not null check(estimated_input_tokens between 1 and 12000),
  worst_case_cost_usd numeric not null check(worst_case_cost_usd >= 0),
  state text not null check(state in ('PENDING','PROCESSING','VALIDATED','REJECTED','RETRYABLE_FAILED','FAILED','SKIPPED')),
  skip_reason text,
  attempt integer not null default 0,
  runner_id uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  output_hash text check(output_hash is null or output_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index backyrd_n6_shadow_work_processable_v1 on public.backyrd_n6_shadow_work_v1(state,created_at);
create index backyrd_n6_shadow_work_user_day_v1 on public.backyrd_n6_shadow_work_v1(user_id,created_at);
alter table public.backyrd_n6_shadow_work_v1 enable row level security;
revoke all on public.backyrd_n6_shadow_work_v1 from public,anon,authenticated;
grant all on public.backyrd_n6_shadow_work_v1 to service_role;

create table public.backyrd_n6_shadow_traces_v1 (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.backyrd_n6_shadow_work_v1(id) on delete cascade,
  shadow_run_id uuid not null,
  attempt integer not null,
  decision_id uuid not null references public.decision_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text check(output_hash is null or output_hash ~ '^[0-9a-f]{64}$'),
  disposition text not null check(disposition in ('VALIDATED','REJECTED','RETRYABLE_FAILED','FAILED')),
  latency_ms numeric,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric not null default 0,
  failure_code text,
  trace_payload jsonb not null check(jsonb_typeof(trace_payload)='object'),
  created_at timestamptz not null default now(),
  unique(work_id,shadow_run_id)
);
create index backyrd_n6_shadow_trace_decision_v1 on public.backyrd_n6_shadow_traces_v1(decision_id,created_at);
alter table public.backyrd_n6_shadow_traces_v1 enable row level security;
revoke all on public.backyrd_n6_shadow_traces_v1 from public,anon,authenticated;
grant all on public.backyrd_n6_shadow_traces_v1 to service_role;

create or replace function public.backyrd_enqueue_n6_shadow_v1(
  p_decision_id uuid,p_user_id uuid,p_input_hash text,p_input jsonb,
  p_estimated_input_tokens integer,p_worst_case_cost_usd numeric
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_settings public.backyrd_n6_shadow_settings_v1%rowtype;v_work public.backyrd_n6_shadow_work_v1%rowtype;v_reason text;v_sample numeric;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  if p_input_hash!~'^[0-9a-f]{64}$' or p_estimated_input_tokens not between 1 and 12000 or p_worst_case_cost_usd<0 then raise exception 'n6_shadow_invalid_budget_identity' using errcode='22023'; end if;
  if p_input->>'decisionId'<>p_decision_id::text or p_input->>'userId'<>p_user_id::text or p_input->>'inputHash'<>p_input_hash then raise exception 'n6_shadow_input_identity_mismatch' using errcode='42501'; end if;
  if not exists(select 1 from public.backyrd_deterministic_decision_traces_v1 d where d.decision_id=p_decision_id and d.user_id=p_user_id and d.package_hash=p_input->>'packageHash' and d.candidate_set_hash=p_input->>'candidateSetHash' and d.validation_disposition='COMPLETE_VALID') then raise exception 'n6_shadow_deterministic_trace_required' using errcode='42501'; end if;
  select * into v_settings from public.backyrd_n6_shadow_settings_v1 where singleton for update;
  v_sample := ('x'||substr(md5(p_decision_id::text),1,8))::bit(32)::bigint / 4294967295.0;
  if not v_settings.enabled then v_reason:='KILL_SWITCH_OFF';
  elsif v_settings.internal_only and not p_user_id=any(v_settings.allowlisted_user_ids) then v_reason:='NOT_INTERNAL_ALLOWLISTED';
  elsif v_sample>=v_settings.sample_rate and not p_user_id=any(v_settings.allowlisted_user_ids) then v_reason:='NOT_SAMPLED';
  elsif coalesce((select sum(case when state in ('PENDING','PROCESSING','RETRYABLE_FAILED') then v_settings.max_attempts else greatest(attempt,1) end) from public.backyrd_n6_shadow_work_v1 where user_id=p_user_id and created_at>=date_trunc('day',now()) and state not in ('SKIPPED')),0)+v_settings.max_attempts>v_settings.per_user_daily_call_cap then v_reason:='USER_DAILY_CAP';
  elsif coalesce((select sum(case when state in ('PENDING','PROCESSING','RETRYABLE_FAILED') then v_settings.max_attempts else greatest(attempt,1) end) from public.backyrd_n6_shadow_work_v1 where created_at>=date_trunc('day',now()) and state not in ('SKIPPED')),0)+v_settings.max_attempts>v_settings.global_daily_call_cap then v_reason:='GLOBAL_DAILY_CAP';
  elsif coalesce((select sum(worst_case_cost_usd * case when state in ('PENDING','PROCESSING','RETRYABLE_FAILED') then v_settings.max_attempts else greatest(attempt,1) end) from public.backyrd_n6_shadow_work_v1 where created_at>=date_trunc('day',now()) and state not in ('SKIPPED')),0)+(p_worst_case_cost_usd*v_settings.max_attempts)>v_settings.global_daily_budget_usd then v_reason:='GLOBAL_DAILY_BUDGET';
  end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where decision_id=p_decision_id;
  if v_work.id is not null then
    if v_work.input_hash<>p_input_hash then raise exception 'n6_shadow_conflicting_replay' using errcode='23505'; end if;
    return jsonb_build_object('work_id',v_work.id,'status',v_work.state,'skip_reason',v_work.skip_reason,'replay',true);
  end if;
  insert into public.backyrd_n6_shadow_work_v1(decision_id,user_id,input_hash,input_payload,estimated_input_tokens,worst_case_cost_usd,state,skip_reason,completed_at)
  values(p_decision_id,p_user_id,p_input_hash,p_input,p_estimated_input_tokens,p_worst_case_cost_usd,case when v_reason is null then 'PENDING' else 'SKIPPED' end,v_reason,case when v_reason is null then null else now() end)
  returning * into v_work;
  return jsonb_build_object('work_id',v_work.id,'status',v_work.state,'skip_reason',v_work.skip_reason,'replay',false);
end $$;

create or replace function public.backyrd_claim_n6_shadow_v1(p_runner_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_settings public.backyrd_n6_shadow_settings_v1%rowtype;v_work public.backyrd_n6_shadow_work_v1%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  select * into v_settings from public.backyrd_n6_shadow_settings_v1 where singleton;
  if not v_settings.enabled then return null; end if;
  update public.backyrd_n6_shadow_work_v1 set state='PENDING',runner_id=null,claimed_at=null,lease_expires_at=null,updated_at=now()
    where state='PROCESSING' and lease_expires_at<now() and attempt<v_settings.max_attempts;
  if (select count(*) from public.backyrd_n6_shadow_work_v1 where state='PROCESSING' and lease_expires_at>=now())>=v_settings.max_concurrent_calls then return null; end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where state in ('PENDING','RETRYABLE_FAILED') and attempt<v_settings.max_attempts order by created_at for update skip locked limit 1;
  if v_work.id is null then return null; end if;
  update public.backyrd_n6_shadow_work_v1 set state='PROCESSING',attempt=attempt+1,shadow_run_id=gen_random_uuid(),runner_id=p_runner_id,claimed_at=now(),lease_expires_at=now()+interval '3 minutes',updated_at=now()
  where id=v_work.id returning * into v_work;
  return jsonb_build_object('work_id',v_work.id,'shadow_run_id',v_work.shadow_run_id,'decision_id',v_work.decision_id,'user_id',v_work.user_id,'attempt',v_work.attempt);
end $$;

create or replace function public.backyrd_load_n6_shadow_input_v1(p_work_id uuid,p_shadow_run_id uuid,p_runner_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_work public.backyrd_n6_shadow_work_v1%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where id=p_work_id and shadow_run_id=p_shadow_run_id and runner_id=p_runner_id and state='PROCESSING';
  if v_work.id is null then raise exception 'n6_shadow_claim_invalid' using errcode='42501'; end if;
  if not public.user_has_active_consent_v1(v_work.user_id,'personalized_recommendations') then raise exception 'n6_shadow_personalization_consent_required' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_work.user_id) then raise exception 'n6_shadow_user_deleted' using errcode='42501'; end if;
  return v_work.input_payload;
end $$;

create or replace function public.backyrd_finalize_n6_shadow_v1(p_work_id uuid,p_shadow_run_id uuid,p_runner_id uuid,p_status text,p_trace jsonb,p_output_hash text)
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_work public.backyrd_n6_shadow_work_v1%rowtype;v_trace_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  if p_status not in ('VALIDATED','REJECTED') or p_output_hash!~'^[0-9a-f]{64}$' then raise exception 'n6_shadow_finalize_invalid' using errcode='22023'; end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where id=p_work_id for update;
  if v_work.state in ('VALIDATED','REJECTED') then
    if v_work.output_hash<>p_output_hash then raise exception 'n6_shadow_conflicting_finalize' using errcode='23505'; end if;
    return (select id from public.backyrd_n6_shadow_traces_v1 where work_id=p_work_id and output_hash=p_output_hash order by created_at desc limit 1);
  end if;
  if v_work.shadow_run_id<>p_shadow_run_id or v_work.runner_id<>p_runner_id or v_work.state<>'PROCESSING' then raise exception 'n6_shadow_claim_invalid' using errcode='42501'; end if;
  if not coalesce((select enabled from public.backyrd_n6_shadow_settings_v1 where singleton),false) then raise exception 'n6_shadow_kill_switch_off' using errcode='42501'; end if;
  if not public.user_has_active_consent_v1(v_work.user_id,'personalized_recommendations') or not exists(select 1 from auth.users where id=v_work.user_id) then raise exception 'n6_shadow_commit_consent_or_user_invalid' using errcode='42501'; end if;
  insert into public.backyrd_n6_shadow_traces_v1(work_id,shadow_run_id,attempt,decision_id,user_id,input_hash,output_hash,disposition,latency_ms,input_tokens,output_tokens,estimated_cost_usd,failure_code,trace_payload)
  values(v_work.id,p_shadow_run_id,v_work.attempt,v_work.decision_id,v_work.user_id,v_work.input_hash,p_output_hash,p_status,nullif(p_trace->>'latencyMs','')::numeric,coalesce((p_trace#>>'{usage,inputTokens}')::integer,0),coalesce((p_trace#>>'{usage,outputTokens}')::integer,0),coalesce((p_trace->>'costUsd')::numeric,0),p_trace->>'failureCode',p_trace)
  returning id into v_trace_id;
  update public.backyrd_n6_shadow_work_v1 set state=p_status,output_hash=p_output_hash,completed_at=now(),lease_expires_at=null,updated_at=now() where id=v_work.id;
  return v_trace_id;
end $$;

create or replace function public.backyrd_fail_n6_shadow_v1(p_work_id uuid,p_shadow_run_id uuid,p_runner_id uuid,p_retryable boolean,p_failure_code text,p_failure_trace jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_work public.backyrd_n6_shadow_work_v1%rowtype;v_max integer;v_state text;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where id=p_work_id for update;
  if v_work.state in ('VALIDATED','REJECTED') then return jsonb_build_object('status',v_work.state,'reconciled',true); end if;
  if v_work.shadow_run_id<>p_shadow_run_id or v_work.runner_id<>p_runner_id or v_work.state<>'PROCESSING' then raise exception 'n6_shadow_claim_invalid' using errcode='42501'; end if;
  select max_attempts into v_max from public.backyrd_n6_shadow_settings_v1 where singleton;
  v_state:=case when p_retryable and v_work.attempt<v_max then 'RETRYABLE_FAILED' else 'FAILED' end;
  insert into public.backyrd_n6_shadow_traces_v1(work_id,shadow_run_id,attempt,decision_id,user_id,input_hash,disposition,failure_code,trace_payload)
  values(v_work.id,p_shadow_run_id,v_work.attempt,v_work.decision_id,v_work.user_id,v_work.input_hash,v_state,p_failure_code,p_failure_trace);
  update public.backyrd_n6_shadow_work_v1 set state=v_state,failure_code=p_failure_code,runner_id=null,lease_expires_at=null,completed_at=case when v_state='FAILED' then now() else null end,updated_at=now() where id=v_work.id;
  return jsonb_build_object('status',v_state,'reconciled',false);
end $$;

create or replace function public.backyrd_purge_n6_shadow_for_user_v1(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin delete from public.backyrd_n6_shadow_work_v1 where user_id=p_user_id; end $$;

create or replace function public.backyrd_n6_shadow_consent_withdrawal_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if new.purpose_key='personalized_recommendations' and new.status='withdrawn' and (tg_op='INSERT' or old.status is distinct from new.status) then perform public.backyrd_purge_n6_shadow_for_user_v1(new.user_id); end if;
  return new;
end $$;
create trigger trg_backyrd_n6_shadow_consent_withdrawal_v1 after insert or update of status on public.user_consents for each row execute function public.backyrd_n6_shadow_consent_withdrawal_v1();

create or replace function public.backyrd_n6_shadow_profile_erasure_v1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  perform public.backyrd_purge_n6_shadow_for_user_v1(old.id);
  return old;
end $$;

create trigger trg_backyrd_n6_shadow_profile_erasure_v1
before delete on public.profiles
for each row execute function public.backyrd_n6_shadow_profile_erasure_v1();

revoke all on function public.backyrd_enqueue_n6_shadow_v1(uuid,uuid,text,jsonb,integer,numeric),public.backyrd_claim_n6_shadow_v1(uuid),public.backyrd_load_n6_shadow_input_v1(uuid,uuid,uuid),public.backyrd_finalize_n6_shadow_v1(uuid,uuid,uuid,text,jsonb,text),public.backyrd_fail_n6_shadow_v1(uuid,uuid,uuid,boolean,text,jsonb),public.backyrd_purge_n6_shadow_for_user_v1(uuid),public.backyrd_n6_shadow_consent_withdrawal_v1(),public.backyrd_n6_shadow_profile_erasure_v1() from public,anon,authenticated;
grant execute on function public.backyrd_enqueue_n6_shadow_v1(uuid,uuid,text,jsonb,integer,numeric),public.backyrd_claim_n6_shadow_v1(uuid),public.backyrd_load_n6_shadow_input_v1(uuid,uuid,uuid),public.backyrd_finalize_n6_shadow_v1(uuid,uuid,uuid,text,jsonb,text),public.backyrd_fail_n6_shadow_v1(uuid,uuid,uuid,boolean,text,jsonb),public.backyrd_purge_n6_shadow_for_user_v1(uuid) to service_role;
