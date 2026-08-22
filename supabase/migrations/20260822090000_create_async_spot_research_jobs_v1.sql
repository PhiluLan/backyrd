-- Durable, proposal-only Spot Research queue. This path cannot accept facts,
-- rebuild N4, change Gold readiness, or influence ranking.

create table public.backyrd_spot_research_jobs_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','READY_FOR_REVIEW','FAILED','CANCELLED')),
  contract_version text not null default 'backyrd-spot-research-agent-v1',
  model text not null default 'gpt-5-mini',
  source_scope jsonb not null,
  source_scope_hash text not null check(source_scope_hash~'^[0-9a-f]{64}$'),
  provider_response_id text,
  provider_status text,
  attempt_token uuid,
  technical_attempts integer not null default 0 check(technical_attempts between 0 and 2),
  poll_count integer not null default 0 check(poll_count>=0),
  current_run_id uuid references public.backyrd_spot_research_runs_v1(id),
  proposal_count integer not null default 0 check(proposal_count between 0 and 12),
  input_tokens integer not null default 0 check(input_tokens>=0),
  output_tokens integer not null default 0 check(output_tokens>=0),
  total_tokens integer not null default 0 check(total_tokens>=0),
  web_search_calls integer not null default 0 check(web_search_calls>=0),
  provider_latency_ms numeric check(provider_latency_ms is null or provider_latency_ms>=0),
  failure_code text,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  runner_id text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(source_scope)='object'),
  check(provider_response_id is null or length(provider_response_id)<=200),
  check(failure_code is null or length(failure_code)<=160),
  check(runner_id is null or length(runner_id)<=120)
);
create unique index backyrd_spot_research_jobs_v1_active_identity
  on public.backyrd_spot_research_jobs_v1(spot_id,contract_version,source_scope_hash)
  where state in ('QUEUED','RUNNING');
create index backyrd_spot_research_jobs_v1_claim
  on public.backyrd_spot_research_jobs_v1(state,available_at,queued_at);
create index backyrd_spot_research_jobs_v1_spot
  on public.backyrd_spot_research_jobs_v1(spot_id,created_at desc);
alter table public.backyrd_spot_research_jobs_v1 enable row level security;
revoke all on public.backyrd_spot_research_jobs_v1 from public,anon,authenticated;
grant all on public.backyrd_spot_research_jobs_v1 to service_role;

alter table public.backyrd_spot_research_runs_v1
  add column job_id uuid references public.backyrd_spot_research_jobs_v1(id);
create index backyrd_spot_research_runs_v1_job_idx on public.backyrd_spot_research_runs_v1(job_id,created_at desc);

create or replace function public.backyrd_enqueue_spot_research_job_v1(p_spot_id uuid,p_official_website text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_actor jsonb;v_spot record;v_url text;v_scope jsonb;v_hash text;v_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
 if (v_actor->>'role') not in ('ADMIN','FOUNDER') then raise exception 'research_admin_required' using errcode='42501'; end if;
 select id,name,city,website into v_spot from public.spots where id=p_spot_id;
 v_url:=coalesce(nullif(trim(v_spot.website),''),nullif(trim(p_official_website),''));
 if v_url is null then raise exception 'official_website_required' using errcode='22023'; end if;
 if v_spot.website is not null and p_official_website is not null and trim(v_spot.website)<>trim(p_official_website) then raise exception 'official_website_override_forbidden' using errcode='22023'; end if;
 if v_url!~'^https://[^[:space:]]+$' then raise exception 'official_website_invalid' using errcode='22023'; end if;
 if (select count(*) from public.backyrd_spot_research_jobs_v1 where actor_id=auth.uid() and created_at>=now()-interval '1 day')>=10 then raise exception 'research_daily_limit_reached' using errcode='P0001'; end if;
 v_scope:=jsonb_build_object('officialWebsite',v_url,'spotName',v_spot.name,'city',v_spot.city);
 v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');
 select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v1' and source_scope_hash=v_hash and state in ('QUEUED','RUNNING') order by created_at desc limit 1;
 if found then return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'deduplicated',true,'canonicalWrite',false); end if;
 begin
  insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,source_scope,source_scope_hash)
  values(p_spot_id,auth.uid(),v_scope,v_hash) returning * into v_job;
 exception when unique_violation then
  select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v1' and source_scope_hash=v_hash and state in ('QUEUED','RUNNING') order by created_at desc limit 1;
 end;
 return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'deduplicated',false,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_spot_research_job_status_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
 if (v_actor->>'role') not in ('ADMIN','FOUNDER') then raise exception 'research_admin_required' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id order by created_at desc limit 1;
 if not found then return null; end if;
 return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'attempts',v_job.technical_attempts,'proposalCount',v_job.proposal_count,'startedAt',v_job.started_at,'completedAt',v_job.completed_at,'failureCode',v_job.failure_code,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_claim_spot_research_job_v1(p_runner_id text,p_lease_seconds integer default 45)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_token uuid:=gen_random_uuid();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 update public.backyrd_spot_research_jobs_v1 set state='QUEUED',lease_token=null,lease_expires_at=null,runner_id=null,available_at=now(),updated_at=now() where state='RUNNING' and lease_expires_at<=now();
 select * into v_job from public.backyrd_spot_research_jobs_v1 where state='QUEUED' and available_at<=now() order by queued_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.backyrd_spot_research_jobs_v1 set state='RUNNING',lease_token=v_token,lease_expires_at=now()+make_interval(secs=>greatest(20,least(p_lease_seconds,300))),runner_id=left(p_runner_id,120),started_at=coalesce(started_at,now()),updated_at=now() where id=v_job.id;
 return jsonb_build_object('jobId',v_job.id,'spotId',v_job.spot_id,'actorId',v_job.actor_id,'leaseToken',v_token,'sourceScope',v_job.source_scope,'providerResponseId',v_job.provider_response_id,'attemptToken',v_job.attempt_token,'attempts',v_job.technical_attempts,'model',v_job.model,'contractVersion',v_job.contract_version);
end $$;

create or replace function public.backyrd_begin_spot_research_attempt_v1(p_job_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_attempt uuid;v_run uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and lease_expires_at>now() for update;
 if not found then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
 if v_job.attempt_token is not null then return jsonb_build_object('attemptToken',v_job.attempt_token,'runId',v_job.current_run_id,'attempts',v_job.technical_attempts,'replayed',true); end if;
 if v_job.technical_attempts>=2 then raise exception 'research_attempt_limit_reached' using errcode='22023'; end if;
 v_attempt:=gen_random_uuid();
 insert into public.backyrd_spot_research_runs_v1(spot_id,actor_id,status,contract_version,model,input_hash,job_id)
 values(v_job.spot_id,v_job.actor_id,'STARTED',v_job.contract_version,v_job.model,v_job.source_scope_hash,v_job.id) returning id into v_run;
 update public.backyrd_spot_research_jobs_v1 set attempt_token=v_attempt,current_run_id=v_run,technical_attempts=technical_attempts+1,updated_at=now() where id=v_job.id;
 return jsonb_build_object('attemptToken',v_attempt,'runId',v_run,'attempts',v_job.technical_attempts+1,'replayed',false);
end $$;

create or replace function public.backyrd_record_spot_research_provider_v1(p_job_id uuid,p_lease_token uuid,p_response_id text,p_status text)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 update public.backyrd_spot_research_jobs_v1 set provider_response_id=left(p_response_id,200),provider_status=left(p_status,80),updated_at=now() where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and lease_expires_at>now();
 if not found then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
end $$;

create or replace function public.backyrd_release_spot_research_job_v1(p_job_id uuid,p_lease_token uuid,p_provider_status text,p_delay_seconds integer default 4)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 update public.backyrd_spot_research_jobs_v1 set state='QUEUED',provider_status=left(p_provider_status,80),poll_count=poll_count+1,available_at=now()+make_interval(secs=>greatest(1,least(p_delay_seconds,30))),lease_token=null,lease_expires_at=null,runner_id=null,updated_at=now() where id=p_job_id and state='RUNNING' and lease_token=p_lease_token;
end $$;

create or replace function public.backyrd_fail_spot_research_job_v1(p_job_id uuid,p_lease_token uuid,p_retryable boolean,p_failure_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_retry boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token for update;
 if not found then return jsonb_build_object('state','RECONCILED'); end if;
 v_retry:=p_retryable and v_job.technical_attempts<2;
 update public.backyrd_spot_research_runs_v1 set status='FAILED',failure_code=left(p_failure_code,160),finished_at=now() where id=v_job.current_run_id and status='STARTED';
 update public.backyrd_spot_research_jobs_v1 set state=case when v_retry then 'QUEUED' else 'FAILED' end,available_at=case when v_retry then now()+interval '5 seconds' else available_at end,failure_code=left(p_failure_code,160),provider_response_id=case when v_retry then null else provider_response_id end,provider_status=case when v_retry then null else provider_status end,attempt_token=case when v_retry then null else attempt_token end,current_run_id=case when v_retry then null else current_run_id end,lease_token=null,lease_expires_at=null,runner_id=null,completed_at=case when v_retry then null else now() end,updated_at=now() where id=v_job.id;
 return jsonb_build_object('state',case when v_retry then 'QUEUED' else 'FAILED' end,'retry',v_retry,'attempts',v_job.technical_attempts);
end $$;

create or replace function public.backyrd_finalize_spot_research_job_v1(p_job_id uuid,p_lease_token uuid,p_proposals jsonb,p_provider_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id for update;
 if not found then raise exception 'research_job_not_found' using errcode='22023'; end if;
 if v_job.state='READY_FOR_REVIEW' then return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'proposalCount',v_job.proposal_count,'replayed',true,'canonicalWrite',false); end if;
 if v_job.state<>'RUNNING' or v_job.lease_token<>p_lease_token or v_job.lease_expires_at<=now() then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
 v_result:=public.backyrd_gold_submit_research_batch_v2(v_job.current_run_id,v_job.spot_id,p_proposals,p_provider_metadata);
 update public.backyrd_spot_research_jobs_v1 set state='READY_FOR_REVIEW',proposal_count=coalesce((v_result->>'proposalCount')::integer,0),provider_response_id=left(p_provider_metadata->>'providerResponseId',200),provider_status=left(p_provider_metadata->>'providerStatus',80),input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),web_search_calls=greatest(0,coalesce((p_provider_metadata->>'webSearchCalls')::integer,0)),provider_latency_ms=greatest(0,extract(epoch from(now()-coalesce(v_job.started_at,v_job.created_at)))*1000),failure_code=null,lease_token=null,lease_expires_at=null,runner_id=null,completed_at=now(),updated_at=now() where id=v_job.id;
 return jsonb_build_object('jobId',v_job.id,'state','READY_FOR_REVIEW','proposalCount',coalesce((v_result->>'proposalCount')::integer,0),'replayed',false,'canonicalWrite',false);
end $$;

revoke all on function public.backyrd_enqueue_spot_research_job_v1(uuid,text),public.backyrd_spot_research_job_status_v1(uuid) from public,anon;
grant execute on function public.backyrd_enqueue_spot_research_job_v1(uuid,text),public.backyrd_spot_research_job_status_v1(uuid) to authenticated,service_role;
revoke all on function public.backyrd_claim_spot_research_job_v1(text,integer),public.backyrd_begin_spot_research_attempt_v1(uuid,uuid),public.backyrd_record_spot_research_provider_v1(uuid,uuid,text,text),public.backyrd_release_spot_research_job_v1(uuid,uuid,text,integer),public.backyrd_fail_spot_research_job_v1(uuid,uuid,boolean,text),public.backyrd_finalize_spot_research_job_v1(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.backyrd_claim_spot_research_job_v1(text,integer),public.backyrd_begin_spot_research_attempt_v1(uuid,uuid),public.backyrd_record_spot_research_provider_v1(uuid,uuid,text,text),public.backyrd_release_spot_research_job_v1(uuid,uuid,text,integer),public.backyrd_fail_spot_research_job_v1(uuid,uuid,boolean,text),public.backyrd_finalize_spot_research_job_v1(uuid,uuid,jsonb,jsonb) to service_role;

comment on table public.backyrd_spot_research_jobs_v1 is 'Durable proposal-only Research Agent jobs. No accepted-fact, N4, Gold-readiness, or ranking authority.';
