-- Research Agent v2: two independent compact evidence-extraction passes.
-- Provider output is untrusted evidence only. Backyrd deterministically validates,
-- compares and creates proposals. This migration cannot accept facts or write N4.

alter table public.backyrd_spot_research_jobs_v1 drop constraint if exists backyrd_spot_research_jobs_v1_technical_attempts_check;
alter table public.backyrd_spot_research_jobs_v1 add constraint backyrd_spot_research_jobs_v1_technical_attempts_check check(technical_attempts between 0 and 4);
alter table public.backyrd_spot_research_jobs_v1 drop constraint if exists backyrd_spot_research_jobs_v1_proposal_count_check;
alter table public.backyrd_spot_research_jobs_v1 add constraint backyrd_spot_research_jobs_v1_proposal_count_check check(proposal_count between 0 and 16);
alter table public.backyrd_spot_research_jobs_v1 add column if not exists current_pass text check(current_pass in ('A','B'));
alter table public.backyrd_spot_research_jobs_v1 add column if not exists phase text;
alter table public.backyrd_spot_research_jobs_v1 add column if not exists input_bytes integer not null default 0 check(input_bytes>=0);

alter table public.backyrd_spot_research_runs_v1 add column if not exists pass_key text check(pass_key in ('A','B'));
alter table public.backyrd_spot_research_runs_v1 add column if not exists input_bytes integer not null default 0 check(input_bytes>=0);

alter table public.backyrd_spot_fact_proposals_v1 add column if not exists research_classification text check(research_classification in ('NEW','SAME','CONFLICT','STALE'));
alter table public.backyrd_spot_fact_proposals_v1 add column if not exists deterministic_confidence numeric check(deterministic_confidence between 0 and 1);
alter table public.backyrd_spot_fact_proposals_v1 add column if not exists research_pass_key text check(research_pass_key in ('A','B'));

create table public.backyrd_spot_research_passes_v2 (
  job_id uuid not null references public.backyrd_spot_research_jobs_v1(id) on delete cascade,
  pass_key text not null check(pass_key in ('A','B')),
  state text not null default 'PENDING' check(state in ('PENDING','QUEUED','RUNNING','COMPLETE','FAILED','CANCELLED')),
  provider_response_id text,
  provider_status text,
  attempt_token uuid,
  attempts integer not null default 0 check(attempts between 0 and 2),
  poll_count integer not null default 0 check(poll_count>=0),
  current_run_id uuid references public.backyrd_spot_research_runs_v1(id),
  extraction_count integer not null default 0 check(extraction_count between 0 and 8),
  proposal_count integer not null default 0 check(proposal_count between 0 and 8),
  input_bytes integer not null default 0 check(input_bytes>=0),
  input_tokens integer not null default 0 check(input_tokens>=0),
  output_tokens integer not null default 0 check(output_tokens>=0),
  total_tokens integer not null default 0 check(total_tokens>=0),
  web_search_calls integer not null default 0 check(web_search_calls>=0),
  provider_latency_ms numeric check(provider_latency_ms is null or provider_latency_ms>=0),
  failure_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(job_id,pass_key),
  check(provider_response_id is null or length(provider_response_id)<=200),
  check(failure_code is null or length(failure_code)<=160)
);

create table public.backyrd_spot_research_extractions_v2 (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.backyrd_spot_research_jobs_v1(id) on delete cascade,
  run_id uuid not null references public.backyrd_spot_research_runs_v1(id) on delete cascade,
  spot_id uuid not null references public.spots(id) on delete cascade,
  pass_key text not null check(pass_key in ('A','B')),
  ordinal integer not null check(ordinal between 0 and 7),
  fact_key text not null references public.backyrd_spot_fact_catalog_v1(field_key),
  typed_value jsonb,
  support_status text not null check(support_status in ('SUPPORTED','UNKNOWN','UNSUPPORTED')),
  source_url text not null check(source_url~'^https://'),
  source_type text not null check(source_type in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT')),
  short_evidence text not null check(length(short_evidence)<=320),
  observed_at timestamptz,
  classification text not null check(classification in ('NEW','SAME','CONFLICT','STALE','UNSUPPORTED')),
  deterministic_confidence numeric not null check(deterministic_confidence between 0 and 1),
  contract_version text not null default 'backyrd-spot-research-agent-v2',
  created_at timestamptz not null default now(),
  unique(run_id,ordinal)
);

alter table public.backyrd_spot_research_passes_v2 enable row level security;
alter table public.backyrd_spot_research_extractions_v2 enable row level security;
revoke all on public.backyrd_spot_research_passes_v2,public.backyrd_spot_research_extractions_v2 from public,anon,authenticated;
grant all on public.backyrd_spot_research_passes_v2,public.backyrd_spot_research_extractions_v2 to service_role;

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
 v_scope:=jsonb_build_object('officialWebsite',v_url,'spotName',v_spot.name,'city',v_spot.city,'passes',jsonb_build_array('A','B'));
 v_hash:=encode(extensions.digest(convert_to(v_scope::text,'UTF8'),'sha256'),'hex');
 select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2' and source_scope_hash=v_hash and state in ('QUEUED','RUNNING') order by created_at desc limit 1;
 if found then return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',true,'canonicalWrite',false); end if;
 begin
  insert into public.backyrd_spot_research_jobs_v1(spot_id,actor_id,contract_version,source_scope,source_scope_hash,current_pass,phase)
  values(p_spot_id,auth.uid(),'backyrd-spot-research-agent-v2',v_scope,v_hash,'A','PASS_A_QUEUED') returning * into v_job;
  insert into public.backyrd_spot_research_passes_v2(job_id,pass_key,state) values(v_job.id,'A','QUEUED'),(v_job.id,'B','PENDING');
 exception when unique_violation then
  select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id and contract_version='backyrd-spot-research-agent-v2' and source_scope_hash=v_hash and state in ('QUEUED','RUNNING') order by created_at desc limit 1;
 end;
 return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',v_job.phase,'deduplicated',false,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_spot_research_job_status_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_actor jsonb;v_job public.backyrd_spot_research_jobs_v1%rowtype;v_passes jsonb;
begin
 v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
 if (v_actor->>'role') not in ('ADMIN','FOUNDER') then raise exception 'research_admin_required' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where spot_id=p_spot_id order by created_at desc limit 1;
 if not found then return null; end if;
 select coalesce(jsonb_object_agg(pass_key,jsonb_build_object('state',state,'attempts',attempts,'proposalCount',proposal_count,'extractionCount',extraction_count,'inputTokens',input_tokens,'outputTokens',output_tokens,'webSearchCalls',web_search_calls,'latencyMs',provider_latency_ms,'failureCode',failure_code,'startedAt',started_at,'completedAt',completed_at) order by pass_key),'{}') into v_passes from public.backyrd_spot_research_passes_v2 where job_id=v_job.id;
 return jsonb_build_object('jobId',v_job.id,'state',v_job.state,'phase',coalesce(v_job.phase,v_job.state),'attempts',v_job.technical_attempts,'proposalCount',v_job.proposal_count,'passes',v_passes,'startedAt',v_job.started_at,'completedAt',v_job.completed_at,'failureCode',v_job.failure_code,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_claim_spot_research_job_v1(p_runner_id text,p_lease_seconds integer default 45)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_pass public.backyrd_spot_research_passes_v2%rowtype;v_token uuid:=gen_random_uuid();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 update public.backyrd_spot_research_passes_v2 p set state='QUEUED',updated_at=now() from public.backyrd_spot_research_jobs_v1 j where p.job_id=j.id and p.pass_key=j.current_pass and j.state='RUNNING' and j.lease_expires_at<=now();
 update public.backyrd_spot_research_jobs_v1 set state='QUEUED',lease_token=null,lease_expires_at=null,runner_id=null,available_at=now(),updated_at=now() where state='RUNNING' and lease_expires_at<=now();
 select * into v_job from public.backyrd_spot_research_jobs_v1 where state='QUEUED' and contract_version='backyrd-spot-research-agent-v2' and available_at<=now() order by queued_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into v_pass from public.backyrd_spot_research_passes_v2 where job_id=v_job.id and pass_key=v_job.current_pass for update;
 if not found or v_pass.state not in ('PENDING','QUEUED','RUNNING') then raise exception 'research_pass_state_invalid' using errcode='22023'; end if;
 update public.backyrd_spot_research_passes_v2 set state='RUNNING',started_at=coalesce(started_at,now()),updated_at=now() where job_id=v_job.id and pass_key=v_job.current_pass;
 update public.backyrd_spot_research_jobs_v1 set state='RUNNING',phase='PASS_'||v_job.current_pass||'_RUNNING',lease_token=v_token,lease_expires_at=now()+make_interval(secs=>greatest(20,least(p_lease_seconds,300))),runner_id=left(p_runner_id,120),started_at=coalesce(started_at,now()),updated_at=now() where id=v_job.id;
 return jsonb_build_object('jobId',v_job.id,'spotId',v_job.spot_id,'actorId',v_job.actor_id,'leaseToken',v_token,'sourceScope',v_job.source_scope,'providerResponseId',v_pass.provider_response_id,'attemptToken',v_pass.attempt_token,'attempts',v_pass.attempts,'passKey',v_job.current_pass,'model',v_job.model,'contractVersion',v_job.contract_version);
end $$;

create or replace function public.backyrd_begin_spot_research_pass_attempt_v2(p_job_id uuid,p_lease_token uuid,p_pass_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_pass public.backyrd_spot_research_passes_v2%rowtype;v_attempt uuid;v_run uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and lease_expires_at>now() and current_pass=p_pass_key for update;
 if not found then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
 select * into v_pass from public.backyrd_spot_research_passes_v2 where job_id=p_job_id and pass_key=p_pass_key for update;
 if v_pass.attempt_token is not null then return jsonb_build_object('attemptToken',v_pass.attempt_token,'runId',v_pass.current_run_id,'attempts',v_pass.attempts,'replayed',true); end if;
 if v_pass.attempts>=2 then raise exception 'research_pass_attempt_limit_reached' using errcode='22023'; end if;
 v_attempt:=gen_random_uuid();
 insert into public.backyrd_spot_research_runs_v1(spot_id,actor_id,status,contract_version,model,input_hash,job_id,pass_key)
 values(v_job.spot_id,v_job.actor_id,'STARTED',v_job.contract_version,v_job.model,v_job.source_scope_hash,v_job.id,p_pass_key) returning id into v_run;
 update public.backyrd_spot_research_passes_v2 set attempt_token=v_attempt,current_run_id=v_run,attempts=attempts+1,updated_at=now() where job_id=p_job_id and pass_key=p_pass_key;
 update public.backyrd_spot_research_jobs_v1 set technical_attempts=technical_attempts+1,updated_at=now() where id=p_job_id;
 return jsonb_build_object('attemptToken',v_attempt,'runId',v_run,'attempts',v_pass.attempts+1,'replayed',false);
end $$;

create or replace function public.backyrd_record_spot_research_pass_disposition_v2(p_job_id uuid,p_lease_token uuid,p_pass_key text,p_provider_metadata jsonb)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and lease_expires_at>now() and current_pass=p_pass_key for update;
 if not found then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
 update public.backyrd_spot_research_passes_v2 set provider_response_id=nullif(left(p_provider_metadata->>'providerResponseId',200),''),provider_status=nullif(left(p_provider_metadata->>'providerStatus',80),''),input_bytes=greatest(input_bytes,coalesce((p_provider_metadata->>'inputBytes')::integer,0)),input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),web_search_calls=greatest(0,coalesce((p_provider_metadata->>'webSearchCalls')::integer,0)),updated_at=now() where job_id=p_job_id and pass_key=p_pass_key;
 update public.backyrd_spot_research_runs_v1 set provider_response_id=nullif(left(p_provider_metadata->>'providerResponseId',200),''),provider_status=nullif(left(p_provider_metadata->>'providerStatus',80),''),input_bytes=greatest(input_bytes,coalesce((p_provider_metadata->>'inputBytes')::integer,0)),input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),latency_ms=greatest(0,extract(epoch from(now()-created_at))*1000) where id=(select current_run_id from public.backyrd_spot_research_passes_v2 where job_id=p_job_id and pass_key=p_pass_key);
 update public.backyrd_spot_research_jobs_v1 set input_bytes=(select coalesce(sum(input_bytes),0) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),input_tokens=(select coalesce(sum(input_tokens),0) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),output_tokens=(select coalesce(sum(output_tokens),0) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),total_tokens=(select coalesce(sum(total_tokens),0) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),web_search_calls=(select coalesce(sum(web_search_calls),0) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),updated_at=now() where id=p_job_id;
end $$;

create or replace function public.backyrd_release_spot_research_pass_v2(p_job_id uuid,p_lease_token uuid,p_pass_key text,p_provider_status text,p_delay_seconds integer default 4)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 update public.backyrd_spot_research_passes_v2 set state='QUEUED',provider_status=left(p_provider_status,80),poll_count=poll_count+1,updated_at=now() where job_id=p_job_id and pass_key=p_pass_key;
 update public.backyrd_spot_research_jobs_v1 set state='QUEUED',phase='PASS_'||p_pass_key||'_RUNNING',poll_count=poll_count+1,available_at=now()+make_interval(secs=>greatest(1,least(p_delay_seconds,30))),lease_token=null,lease_expires_at=null,runner_id=null,updated_at=now() where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and current_pass=p_pass_key;
 if not found then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
end $$;

create or replace function public.backyrd_gold_submit_research_proposal_v2(p_run_id uuid,p_spot_id uuid,p_pass_key text,p_field_key text,p_value jsonb,p_source_url text,p_source_type text,p_title text,p_observed_at timestamptz,p_evidence_excerpt text,p_confidence_rationale text,p_classification text,p_deterministic_confidence numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_source uuid;v_hash text;v_id uuid;v_existing record;v_status text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 if p_source_type not in ('OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') or p_classification not in ('NEW','SAME','CONFLICT','STALE') then raise exception 'research_deterministic_policy_invalid' using errcode='22023'; end if;
 if p_deterministic_confidence<>(case when p_source_type='OFFICIAL_DOCUMENT' then .95 else .90 end) then raise exception 'research_confidence_policy_invalid' using errcode='22023'; end if;
 if not public.backyrd_gold_validate_fact_value_v1(p_field_key,p_value) then raise exception 'invalid_typed_fact_value' using errcode='22023'; end if;
 v_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_spot_id,p_field_key,p_value::text,btrim(p_source_url),p_source_type,p_pass_key),'UTF8'),'sha256'),'hex');
 select p.id,p.proposal_hash into v_existing from public.backyrd_spot_fact_proposals_v1 p where p.spot_id=p_spot_id and p.idempotency_key=p_idempotency_key;
 if found then
  if v_existing.proposal_hash<>v_hash then raise exception 'proposal_idempotency_conflict' using errcode='23505'; end if;
  return jsonb_build_object('proposalId',v_existing.id,'inserted',false,'canonicalWrite',false);
 end if;
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,title,provider_identity,retrieved_at,observed_at,last_checked_at,legal_use_status,created_by_type)
 values(p_spot_id,p_source_type,btrim(p_source_url),nullif(btrim(p_title),''),'Backyrd Research Agent v2',now(),least(coalesce(p_observed_at,now()),now()),now(),'REVIEW_REQUIRED','RESEARCH_AGENT') returning id into v_source;
 v_status:=case p_classification when 'CONFLICT' then 'CONFLICT' when 'STALE' then 'STALE' else 'PENDING' end;
 insert into public.backyrd_spot_fact_proposals_v1(spot_id,field_key,proposed_value,source_id,status,proposed_by_type,confidence_rationale,evidence_excerpt,idempotency_key,proposal_hash,contract_version,research_classification,deterministic_confidence,research_pass_key)
 values(p_spot_id,p_field_key,p_value,v_source,v_status,'RESEARCH_AGENT',left(p_confidence_rationale,500),left(p_evidence_excerpt,320),p_idempotency_key,v_hash,'backyrd-spot-fact-proposal-v1',p_classification,p_deterministic_confidence,p_pass_key) returning id into v_id;
 return jsonb_build_object('proposalId',v_id,'status',v_status,'classification',p_classification,'inserted',true,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_finalize_spot_research_pass_v2(p_job_id uuid,p_lease_token uuid,p_pass_key text,p_extractions jsonb,p_proposals jsonb,p_provider_metadata jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_pass public.backyrd_spot_research_passes_v2%rowtype;v_row jsonb;v_count integer:=0;v_ecount integer:=0;v_result jsonb;v_final_state text;v_next_phase text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id for update;
 select * into v_pass from public.backyrd_spot_research_passes_v2 where job_id=p_job_id and pass_key=p_pass_key for update;
 if v_pass.state='COMPLETE' then return jsonb_build_object('jobId',p_job_id,'state',v_job.state,'phase',v_job.phase,'proposalCount',v_job.proposal_count,'replayed',true,'canonicalWrite',false); end if;
 if v_job.state<>'RUNNING' or v_job.lease_token<>p_lease_token or v_job.lease_expires_at<=now() or v_job.current_pass<>p_pass_key or v_pass.state<>'RUNNING' then raise exception 'research_job_lease_invalid' using errcode='40001'; end if;
 if jsonb_typeof(p_extractions)<>'array' or jsonb_array_length(p_extractions)>8 or jsonb_typeof(p_proposals)<>'array' or jsonb_array_length(p_proposals)>8 then raise exception 'research_pass_batch_invalid' using errcode='22023'; end if;
 for v_row in select value from jsonb_array_elements(p_extractions) loop
  insert into public.backyrd_spot_research_extractions_v2(job_id,run_id,spot_id,pass_key,ordinal,fact_key,typed_value,support_status,source_url,source_type,short_evidence,observed_at,classification,deterministic_confidence)
  values(p_job_id,v_pass.current_run_id,v_job.spot_id,p_pass_key,v_ecount,v_row->>'factKey',v_row->'value',v_row->>'supportStatus',v_row->>'sourceUrl',v_row->>'sourceType',left(coalesce(v_row->>'shortEvidence',''),320),nullif(v_row->>'observedAt','')::timestamptz,v_row->>'classification',(v_row->>'deterministicConfidence')::numeric);
  v_ecount:=v_ecount+1;
 end loop;
 for v_row in select value from jsonb_array_elements(p_proposals) loop
  v_result:=public.backyrd_gold_submit_research_proposal_v2(v_pass.current_run_id,v_job.spot_id,p_pass_key,v_row->>'fieldKey',v_row->'value',v_row->>'sourceUrl',v_row->>'sourceType',v_row->>'sourceTitle',nullif(v_row->>'observedAt','')::timestamptz,v_row->>'evidenceExcerpt',v_row->>'confidenceRationale',v_row->>'classification',(v_row->>'deterministicConfidence')::numeric,format('research-v2:%s:%s:%s',p_job_id,p_pass_key,v_count));
  v_count:=v_count+1;
 end loop;
 update public.backyrd_spot_research_runs_v1 set status=case when v_count=0 then 'NO_SUPPORTED_FACTS' else 'PROPOSALS_CREATED' end,proposal_count=v_count,provider_response_id=nullif(left(p_provider_metadata->>'providerResponseId',200),''),provider_status='completed',input_bytes=greatest(0,coalesce((p_provider_metadata->>'inputBytes')::integer,0)),input_tokens=greatest(0,coalesce((p_provider_metadata->>'inputTokens')::integer,0)),output_tokens=greatest(0,coalesce((p_provider_metadata->>'outputTokens')::integer,0)),total_tokens=greatest(0,coalesce((p_provider_metadata->>'totalTokens')::integer,0)),latency_ms=greatest(0,coalesce((p_provider_metadata->>'latencyMs')::numeric,0)),finished_at=now() where id=v_pass.current_run_id;
 update public.backyrd_spot_research_passes_v2 set state='COMPLETE',extraction_count=v_ecount,proposal_count=v_count,provider_status='completed',provider_latency_ms=greatest(0,extract(epoch from(now()-coalesce(started_at,created_at)))*1000),completed_at=now(),updated_at=now() where job_id=p_job_id and pass_key=p_pass_key;
 if p_pass_key='A' then
  update public.backyrd_spot_research_passes_v2 set state='QUEUED',updated_at=now() where job_id=p_job_id and pass_key='B' and state='PENDING';
  update public.backyrd_spot_research_jobs_v1 set state='QUEUED',current_pass='B',phase='PASS_A_COMPLETE',available_at=now(),lease_token=null,lease_expires_at=null,runner_id=null,proposal_count=(select sum(proposal_count) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),updated_at=now() where id=p_job_id;
  v_final_state:='QUEUED';v_next_phase:='PASS_A_COMPLETE';
 else
  update public.backyrd_spot_research_jobs_v1 set state='READY_FOR_REVIEW',phase='READY_FOR_REVIEW',proposal_count=(select sum(proposal_count) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),failure_code=null,lease_token=null,lease_expires_at=null,runner_id=null,completed_at=now(),updated_at=now() where id=p_job_id;
  v_final_state:='READY_FOR_REVIEW';v_next_phase:='READY_FOR_REVIEW';
 end if;
 return jsonb_build_object('jobId',p_job_id,'state',v_final_state,'phase',v_next_phase,'passState','COMPLETE','proposalCount',v_count,'extractionCount',v_ecount,'replayed',false,'canonicalWrite',false);
end $$;

create or replace function public.backyrd_fail_spot_research_pass_v2(p_job_id uuid,p_lease_token uuid,p_pass_key text,p_retryable boolean,p_failure_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_spot_research_jobs_v1%rowtype;v_pass public.backyrd_spot_research_passes_v2%rowtype;v_retry boolean;v_a_state text;v_final text;v_phase text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'research_service_only' using errcode='42501'; end if;
 select * into v_job from public.backyrd_spot_research_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and current_pass=p_pass_key for update;
 if not found then return jsonb_build_object('state','RECONCILED'); end if;
 select * into v_pass from public.backyrd_spot_research_passes_v2 where job_id=p_job_id and pass_key=p_pass_key for update;
 v_retry:=p_retryable and v_pass.attempts<2;
 update public.backyrd_spot_research_runs_v1 set status='FAILED',failure_code=left(p_failure_code,160),finished_at=now() where id=v_pass.current_run_id and status='STARTED';
 if v_retry then
  update public.backyrd_spot_research_passes_v2 set state='QUEUED',failure_code=left(p_failure_code,160),provider_response_id=null,provider_status=null,attempt_token=null,current_run_id=null,updated_at=now() where job_id=p_job_id and pass_key=p_pass_key;
  update public.backyrd_spot_research_jobs_v1 set state='QUEUED',phase='PASS_'||p_pass_key||'_RUNNING',available_at=now()+interval '5 seconds',failure_code=left(p_failure_code,160),lease_token=null,lease_expires_at=null,runner_id=null,updated_at=now() where id=p_job_id;
  return jsonb_build_object('state','QUEUED','phase','PASS_'||p_pass_key||'_RUNNING','retry',true,'attempts',v_pass.attempts);
 end if;
 update public.backyrd_spot_research_passes_v2 set state='FAILED',failure_code=left(p_failure_code,160),completed_at=now(),updated_at=now() where job_id=p_job_id and pass_key=p_pass_key;
 if p_pass_key='A' then
  update public.backyrd_spot_research_passes_v2 set state='QUEUED',updated_at=now() where job_id=p_job_id and pass_key='B' and state='PENDING';
  update public.backyrd_spot_research_jobs_v1 set state='QUEUED',current_pass='B',phase='PASS_A_FAILED',available_at=now(),failure_code=left(p_failure_code,160),lease_token=null,lease_expires_at=null,runner_id=null,updated_at=now() where id=p_job_id;
  return jsonb_build_object('state','QUEUED','phase','PASS_A_FAILED','retry',false,'attempts',v_pass.attempts);
 end if;
 select state into v_a_state from public.backyrd_spot_research_passes_v2 where job_id=p_job_id and pass_key='A';
 v_final:=case when v_a_state='COMPLETE' then 'READY_FOR_REVIEW' else 'FAILED' end;
 v_phase:=case when v_final='READY_FOR_REVIEW' then 'READY_FOR_REVIEW' else 'FAILED' end;
 update public.backyrd_spot_research_jobs_v1 set state=v_final,phase=v_phase,proposal_count=(select coalesce(sum(proposal_count),0) from public.backyrd_spot_research_passes_v2 where job_id=p_job_id),failure_code=left(p_failure_code,160),lease_token=null,lease_expires_at=null,runner_id=null,completed_at=now(),updated_at=now() where id=p_job_id;
 return jsonb_build_object('state',v_final,'phase',v_phase,'retry',false,'attempts',v_pass.attempts);
end $$;

revoke all on function public.backyrd_begin_spot_research_pass_attempt_v2(uuid,uuid,text),public.backyrd_record_spot_research_pass_disposition_v2(uuid,uuid,text,jsonb),public.backyrd_release_spot_research_pass_v2(uuid,uuid,text,text,integer),public.backyrd_gold_submit_research_proposal_v2(uuid,uuid,text,text,jsonb,text,text,text,timestamptz,text,text,text,numeric,text),public.backyrd_finalize_spot_research_pass_v2(uuid,uuid,text,jsonb,jsonb,jsonb),public.backyrd_fail_spot_research_pass_v2(uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.backyrd_begin_spot_research_pass_attempt_v2(uuid,uuid,text),public.backyrd_record_spot_research_pass_disposition_v2(uuid,uuid,text,jsonb),public.backyrd_release_spot_research_pass_v2(uuid,uuid,text,text,integer),public.backyrd_gold_submit_research_proposal_v2(uuid,uuid,text,text,jsonb,text,text,text,timestamptz,text,text,text,numeric,text),public.backyrd_finalize_spot_research_pass_v2(uuid,uuid,text,jsonb,jsonb,jsonb),public.backyrd_fail_spot_research_pass_v2(uuid,uuid,text,boolean,text) to service_role;

comment on table public.backyrd_spot_research_extractions_v2 is 'Validated source-bound extraction candidates only; never canonical truth or N4 evidence.';
comment on function public.backyrd_finalize_spot_research_pass_v2(uuid,uuid,text,jsonb,jsonb,jsonb) is 'Atomically stores one complete validated pass and deterministic proposals; no accepted facts, N4, Gold or ranking writes.';
