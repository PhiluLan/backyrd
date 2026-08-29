-- City Bootstrap / Spot Intelligence Pipeline V1
-- Operational acquisition state only. Canonical identity remains public.spots;
-- evidence/proposals/accepted truth remain the existing Gold + N4 contracts.

create table public.backyrd_city_bootstrap_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check(length(run_key) between 8 and 160),
  city_key text not null check(city_key ~ '^[a-z0-9_-]+$'),
  city_name text not null check(length(city_name) between 1 and 120),
  geography jsonb not null check(jsonb_typeof(geography)='object'),
  source_configuration jsonb not null check(jsonb_typeof(source_configuration)='object'),
  target_configuration jsonb not null check(jsonb_typeof(target_configuration)='object'),
  pipeline_version text not null,
  canonical_repository_commit text not null check(canonical_repository_commit ~ '^[0-9a-f]{40}$'),
  mode text not null check(mode in ('SHADOW','PILOT','SCALE','REFRESH')),
  status text not null default 'PLANNED' check(status in ('PLANNED','RUNNING','PAUSED','REVIEW_REQUIRED','COMPLETED','FAILED','CANCELLED')),
  requested_by uuid references auth.users(id) on delete restrict,
  failure_code text,
  stop_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(failure_code is null or length(failure_code)<=160),
  check(stop_reason is null or length(stop_reason)<=500)
);

create table public.backyrd_city_bootstrap_queries_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  query_key text not null,
  source_family text not null check(source_family in ('GOOGLE_PLACES','OPENSTREETMAP','OFFICIAL_WEBSITE','ADMIN')),
  category_batch text[] not null default '{}',
  center_lat double precision,
  center_lng double precision,
  radius_m integer check(radius_m is null or radius_m between 50 and 50000),
  state text not null default 'PENDING' check(state in ('PENDING','RUNNING','COMPLETE','FAILED','SKIPPED')),
  result_count integer not null default 0 check(result_count>=0),
  unique_result_count integer not null default 0 check(unique_result_count>=0),
  provider_calls integer not null default 0 check(provider_calls>=0),
  approximate_cost_microunits bigint not null default 0 check(approximate_cost_microunits>=0),
  failure_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(run_id,query_key),
  check(failure_code is null or length(failure_code)<=160)
);

create table public.backyrd_city_bootstrap_candidates_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  identity_key text not null check(identity_key ~ '^[0-9a-f]{64}$'),
  display_name text not null check(length(display_name) between 1 and 300),
  normalized_name text not null check(length(normalized_name) between 1 and 300),
  address text,
  normalized_address text,
  city text not null,
  country text not null,
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  website text,
  phone text,
  google_place_id text,
  external_types text[] not null default '{}',
  canonical_category_name text,
  relevance_state text not null default 'UNCLASSIFIED' check(relevance_state in ('UNCLASSIFIED','RELEVANT','IRRELEVANT','AMBIGUOUS')),
  relevance_reason text,
  relevance_confidence text check(relevance_confidence is null or relevance_confidence in ('EXACT','HIGH','MEDIUM','LOW')),
  identity_state text not null default 'UNRESOLVED' check(identity_state in ('UNRESOLVED','MATCHED_EXISTING','NEW_IDENTITY','AMBIGUOUS','REJECTED')),
  identity_confidence text check(identity_confidence is null or identity_confidence in ('EXACT','STRONG','POSSIBLE','AMBIGUOUS')),
  matched_spot_id uuid references public.spots(id) on delete restrict,
  lifecycle_state text not null default 'DISCOVERED' check(lifecycle_state in ('DISCOVERED','IDENTITY_RESOLVED','EVIDENCE_PENDING','REVIEW_REQUIRED','PRODUCT_ELIGIBLE','PUBLISHED','REJECTED','FAILED')),
  source_fingerprint text not null check(source_fingerprint ~ '^[0-9a-f]{64}$'),
  enrichment_priority integer not null default 0 check(enrichment_priority between 0 and 1000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,identity_key),
  check(website is null or (length(website)<=2000 and website~'^https://')),
  check(phone is null or length(phone)<=80),
  check(google_place_id is null or length(google_place_id)<=300),
  check(relevance_reason is null or length(relevance_reason)<=160)
);
create index backyrd_city_bootstrap_candidates_run_state_idx on public.backyrd_city_bootstrap_candidates_v1(run_id,lifecycle_state,enrichment_priority desc);
create index backyrd_city_bootstrap_candidates_google_idx on public.backyrd_city_bootstrap_candidates_v1(google_place_id) where google_place_id is not null;
create index backyrd_city_bootstrap_candidates_match_idx on public.backyrd_city_bootstrap_candidates_v1(matched_spot_id) where matched_spot_id is not null;

create table public.backyrd_city_bootstrap_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.backyrd_city_bootstrap_candidates_v1(id) on delete cascade,
  source_family text not null check(source_family in ('GOOGLE_PLACE_ID','OPENSTREETMAP','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT','ADMIN')),
  source_identity text not null check(length(source_identity) between 1 and 1000),
  fact_family text not null check(fact_family in ('IDENTITY','LOCATION','CONTACT','CATEGORY','OPERATING_STATUS','SOURCE_AVAILABILITY')),
  normalized_value jsonb not null check(jsonb_typeof(normalized_value) in ('object','array','string','number','boolean')),
  evidence_fingerprint text not null check(evidence_fingerprint~'^[0-9a-f]{64}$'),
  authority_class text not null check(authority_class in ('IDENTIFIER_ONLY','STRUCTURED_OPEN_DATA','OFFICIAL_FIRST_PARTY','ADMIN_VERIFIED')),
  legal_use_status text not null check(legal_use_status in ('PERMITTED','IDENTIFIER_ONLY','REVIEW_REQUIRED','PROHIBITED')),
  observed_at timestamptz not null,
  retrieved_at timestamptz not null default now(),
  superseded_at timestamptz,
  pipeline_version text not null,
  raw_payload_retained boolean not null default false check(raw_payload_retained=false),
  unique(candidate_id,source_family,source_identity,evidence_fingerprint)
);
create index backyrd_city_bootstrap_evidence_candidate_idx on public.backyrd_city_bootstrap_evidence_v1(candidate_id,retrieved_at desc);

create table public.backyrd_spot_external_identities_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  source_family text not null check(source_family in ('GOOGLE_PLACE_ID','OPENSTREETMAP','OFFICIAL_WEBSITE','ADMIN')),
  source_identity text not null check(length(source_identity) between 1 and 1000),
  identity_confidence text not null check(identity_confidence in ('EXACT','STRONG')),
  bootstrap_run_id uuid references public.backyrd_city_bootstrap_runs_v1(id) on delete set null,
  candidate_id uuid references public.backyrd_city_bootstrap_candidates_v1(id) on delete set null,
  first_observed_at timestamptz not null,
  last_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(source_family,source_identity),
  unique(spot_id,source_family,source_identity)
);

create table public.backyrd_city_bootstrap_reviews_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  candidate_id uuid not null references public.backyrd_city_bootstrap_candidates_v1(id) on delete cascade,
  reason text not null check(reason in ('IDENTITY_AMBIGUOUS','CATEGORY_AMBIGUOUS','SOURCE_CONFLICT','CLOSURE_CONFLICT','LOW_CONFIDENCE','LEGAL_MEDIA_DECISION','RELEVANCE_AMBIGUOUS','MOVE_OR_RENAME_AMBIGUOUS')),
  priority text not null check(priority in ('HIGH','MEDIUM','LOW')),
  evidence_fingerprint text not null check(evidence_fingerprint~'^[0-9a-f]{64}$'),
  state text not null default 'OPEN' check(state in ('OPEN','RESOLVED','REJECTED','STALE')),
  proposed_action text not null check(length(proposed_action) between 1 and 300),
  resolution text,
  resolved_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check(resolution is null or length(resolution)<=1000)
);
create unique index backyrd_city_bootstrap_reviews_open_identity on public.backyrd_city_bootstrap_reviews_v1(candidate_id,reason,evidence_fingerprint) where state='OPEN';
create index backyrd_city_bootstrap_reviews_queue_idx on public.backyrd_city_bootstrap_reviews_v1(state,priority,created_at);

create table public.backyrd_city_bootstrap_jobs_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  candidate_id uuid references public.backyrd_city_bootstrap_candidates_v1(id) on delete cascade,
  stage text not null check(stage in ('DISCOVERY','IDENTITY','RELEVANCE','EVIDENCE','RESEARCH','PUBLICATION','REFRESH')),
  idempotency_key text not null check(length(idempotency_key) between 1 and 240),
  state text not null default 'QUEUED' check(state in ('QUEUED','RUNNING','COMPLETE','FAILED','CANCELLED')),
  attempts integer not null default 0 check(attempts between 0 and 4),
  max_attempts integer not null default 2 check(max_attempts between 1 and 4),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  runner_id text,
  failure_class text check(failure_class is null or failure_class in ('TRANSIENT','PERMANENT','REVIEW_REQUIRED','CIRCUIT_BREAKER')),
  failure_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(run_id,idempotency_key),
  check(runner_id is null or length(runner_id)<=120),
  check(failure_code is null or length(failure_code)<=160)
);
create index backyrd_city_bootstrap_jobs_claim_idx on public.backyrd_city_bootstrap_jobs_v1(run_id,state,available_at,created_at);

create table public.backyrd_city_bootstrap_cost_events_v1 (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  candidate_id uuid references public.backyrd_city_bootstrap_candidates_v1(id) on delete set null,
  stage text not null,
  provider text not null,
  operation text not null,
  request_count integer not null default 1 check(request_count>=0),
  input_units bigint not null default 0 check(input_units>=0),
  output_units bigint not null default 0 check(output_units>=0),
  measured_cost_microunits bigint check(measured_cost_microunits is null or measured_cost_microunits>=0),
  currency text,
  latency_ms numeric check(latency_ms is null or latency_ms>=0),
  occurred_at timestamptz not null default now(),
  check((measured_cost_microunits is null and currency is null) or (measured_cost_microunits is not null and currency~'^[A-Z]{3}$'))
);

create table public.backyrd_city_bootstrap_checkpoints_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.backyrd_city_bootstrap_runs_v1(id) on delete cascade,
  batch_number integer not null check(batch_number>=0),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  verdict text not null check(verdict in ('PASS','FAIL','PAUSED')),
  created_at timestamptz not null default now(),
  unique(run_id,batch_number)
);

alter table public.backyrd_city_bootstrap_runs_v1 enable row level security;
alter table public.backyrd_city_bootstrap_queries_v1 enable row level security;
alter table public.backyrd_city_bootstrap_candidates_v1 enable row level security;
alter table public.backyrd_city_bootstrap_evidence_v1 enable row level security;
alter table public.backyrd_spot_external_identities_v1 enable row level security;
alter table public.backyrd_city_bootstrap_reviews_v1 enable row level security;
alter table public.backyrd_city_bootstrap_jobs_v1 enable row level security;
alter table public.backyrd_city_bootstrap_cost_events_v1 enable row level security;
alter table public.backyrd_city_bootstrap_checkpoints_v1 enable row level security;

revoke all on public.backyrd_city_bootstrap_runs_v1,public.backyrd_city_bootstrap_queries_v1,public.backyrd_city_bootstrap_candidates_v1,public.backyrd_city_bootstrap_evidence_v1,public.backyrd_spot_external_identities_v1,public.backyrd_city_bootstrap_reviews_v1,public.backyrd_city_bootstrap_jobs_v1,public.backyrd_city_bootstrap_cost_events_v1,public.backyrd_city_bootstrap_checkpoints_v1 from public,anon,authenticated;
grant all on public.backyrd_city_bootstrap_runs_v1,public.backyrd_city_bootstrap_queries_v1,public.backyrd_city_bootstrap_candidates_v1,public.backyrd_city_bootstrap_evidence_v1,public.backyrd_spot_external_identities_v1,public.backyrd_city_bootstrap_reviews_v1,public.backyrd_city_bootstrap_jobs_v1,public.backyrd_city_bootstrap_cost_events_v1,public.backyrd_city_bootstrap_checkpoints_v1 to service_role;
grant usage,select on sequence public.backyrd_city_bootstrap_cost_events_v1_id_seq to service_role;

-- Definite Google identity races must fail structurally. Gate 2 proved the
-- existing active corpus has zero duplicate Place IDs.
create unique index spots_google_place_id_unique_v1 on public.spots(google_place_id) where google_place_id is not null and btrim(google_place_id)<>'';

create or replace function public.backyrd_city_bootstrap_claim_job_v1(p_run_id uuid,p_runner_id text,p_lease_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_city_bootstrap_jobs_v1%rowtype;v_token uuid:=gen_random_uuid();
begin
 update public.backyrd_city_bootstrap_jobs_v1 set state='QUEUED',lease_token=null,lease_expires_at=null,runner_id=null,available_at=now(),updated_at=now()
 where run_id=p_run_id and state='RUNNING' and lease_expires_at<=now();
 select * into v_job from public.backyrd_city_bootstrap_jobs_v1 where run_id=p_run_id and state='QUEUED' and available_at<=now() order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.backyrd_city_bootstrap_jobs_v1 set state='RUNNING',attempts=attempts+1,lease_token=v_token,lease_expires_at=now()+make_interval(secs=>greatest(20,least(p_lease_seconds,300))),runner_id=left(p_runner_id,120),started_at=coalesce(started_at,now()),updated_at=now() where id=v_job.id;
 return jsonb_build_object('jobId',v_job.id,'runId',v_job.run_id,'candidateId',v_job.candidate_id,'stage',v_job.stage,'attempt',v_job.attempts+1,'leaseToken',v_token);
end $$;

create or replace function public.backyrd_city_bootstrap_finish_job_v1(p_job_id uuid,p_lease_token uuid,p_success boolean,p_failure_class text default null,p_failure_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_job public.backyrd_city_bootstrap_jobs_v1%rowtype;v_retry boolean;
begin
 select * into v_job from public.backyrd_city_bootstrap_jobs_v1 where id=p_job_id and state='RUNNING' and lease_token=p_lease_token and lease_expires_at>now() for update;
 if not found then raise exception 'city_bootstrap_job_lease_invalid' using errcode='40001';end if;
 if p_success then
  update public.backyrd_city_bootstrap_jobs_v1 set state='COMPLETE',lease_token=null,lease_expires_at=null,runner_id=null,completed_at=now(),updated_at=now() where id=p_job_id;
  return jsonb_build_object('state','COMPLETE','retry',false);
 end if;
 if p_failure_class not in ('TRANSIENT','PERMANENT','REVIEW_REQUIRED','CIRCUIT_BREAKER') then raise exception 'city_bootstrap_failure_class_invalid' using errcode='22023';end if;
 v_retry:=p_failure_class='TRANSIENT' and v_job.attempts<v_job.max_attempts;
 update public.backyrd_city_bootstrap_jobs_v1 set state=case when v_retry then 'QUEUED' else 'FAILED' end,available_at=case when v_retry then now()+make_interval(secs=>least(300,5*(2^greatest(0,v_job.attempts-1))::integer)) else available_at end,failure_class=p_failure_class,failure_code=left(p_failure_code,160),lease_token=null,lease_expires_at=null,runner_id=null,completed_at=case when v_retry then null else now() end,updated_at=now() where id=p_job_id;
 if p_failure_class='CIRCUIT_BREAKER' then update public.backyrd_city_bootstrap_runs_v1 set status='PAUSED',stop_reason=left(coalesce(p_failure_code,'CIRCUIT_BREAKER'),500),updated_at=now() where id=v_job.run_id;end if;
 return jsonb_build_object('state',case when v_retry then 'QUEUED' else 'FAILED' end,'retry',v_retry);
end $$;

create or replace function public.backyrd_city_bootstrap_open_review_v1(p_candidate_id uuid,p_reason text,p_priority text,p_evidence_fingerprint text,p_proposed_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_candidate public.backyrd_city_bootstrap_candidates_v1%rowtype;v_review public.backyrd_city_bootstrap_reviews_v1%rowtype;
begin
 select * into v_candidate from public.backyrd_city_bootstrap_candidates_v1 where id=p_candidate_id for update;
 if not found then raise exception 'city_bootstrap_candidate_not_found' using errcode='22023';end if;
 select * into v_review from public.backyrd_city_bootstrap_reviews_v1 where candidate_id=p_candidate_id and reason=p_reason and evidence_fingerprint=p_evidence_fingerprint and state='OPEN';
 if found then return jsonb_build_object('reviewId',v_review.id,'deduplicated',true);end if;
 insert into public.backyrd_city_bootstrap_reviews_v1(run_id,candidate_id,reason,priority,evidence_fingerprint,proposed_action) values(v_candidate.run_id,p_candidate_id,p_reason,p_priority,p_evidence_fingerprint,p_proposed_action) returning * into v_review;
 update public.backyrd_city_bootstrap_candidates_v1 set lifecycle_state='REVIEW_REQUIRED',updated_at=now() where id=p_candidate_id;
 return jsonb_build_object('reviewId',v_review.id,'deduplicated',false);
end $$;

create or replace function public.backyrd_city_bootstrap_publish_candidate_v1(p_candidate_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_c public.backyrd_city_bootstrap_candidates_v1%rowtype;v_run public.backyrd_city_bootstrap_runs_v1%rowtype;v_category uuid;v_spot uuid;v_source uuid;v_created boolean:=false;
begin
 select * into v_c from public.backyrd_city_bootstrap_candidates_v1 where id=p_candidate_id for update;
 if not found then raise exception 'city_bootstrap_candidate_not_found' using errcode='22023';end if;
 select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=v_c.run_id for update;
 if v_run.mode not in ('PILOT','SCALE') or v_run.status<>'RUNNING' then raise exception 'city_bootstrap_publication_mode_invalid' using errcode='22023';end if;
 if v_c.lifecycle_state='PUBLISHED' then return jsonb_build_object('spotId',v_c.matched_spot_id,'published',false,'replayed',true);end if;
 if v_c.lifecycle_state<>'PRODUCT_ELIGIBLE' or v_c.relevance_state<>'RELEVANT' or v_c.identity_state not in ('MATCHED_EXISTING','NEW_IDENTITY') or v_c.identity_confidence not in ('EXACT','STRONG') then raise exception 'city_bootstrap_candidate_not_eligible' using errcode='22023';end if;
 if exists(select 1 from public.backyrd_city_bootstrap_reviews_v1 where candidate_id=v_c.id and state='OPEN') then raise exception 'city_bootstrap_review_open' using errcode='22023';end if;
 if v_c.matched_spot_id is not null then
  update public.backyrd_city_bootstrap_candidates_v1 set lifecycle_state='PUBLISHED',published_at=coalesce(published_at,now()),updated_at=now() where id=v_c.id;
  return jsonb_build_object('spotId',v_c.matched_spot_id,'published',false,'matchedExisting',true);
 end if;
 if v_c.address is null or v_c.canonical_category_name is null then raise exception 'city_bootstrap_required_identity_missing' using errcode='22023';end if;
 select id into v_category from public.categories where name=v_c.canonical_category_name;
 if v_category is null then raise exception 'city_bootstrap_category_not_found' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(v_c.google_place_id,v_c.identity_key),0));
 if v_c.google_place_id is not null then select id into v_spot from public.spots where google_place_id=v_c.google_place_id;end if;
 if v_spot is null then
  select id into v_spot from public.spots where lower(regexp_replace(name,'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(v_c.display_name,'[^a-zA-Z0-9]+','','g')) and lower(regexp_replace(address,'[^a-zA-Z0-9]+','','g'))=lower(regexp_replace(v_c.address,'[^a-zA-Z0-9]+','','g')) and status<>'archived' limit 1;
 end if;
 if v_spot is null then
 insert into public.spots(name,address,lat,lng,status,website,phone,category_id,city,country,google_place_id,google_photo_enabled,data_origin)
  values(v_c.display_name,v_c.address,v_c.lat,v_c.lng,'approved',v_c.website,v_c.phone,v_category,v_c.city,v_c.country,v_c.google_place_id,false,'IMPORT') returning id into v_spot;
  v_created:=true;
 end if;
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_reference,title,provider_identity,retrieved_at,observed_at,last_checked_at,legal_use_status,created_by_type)
 values(v_spot,'IMPORT','city-bootstrap:'||v_run.id||':'||v_c.id,'City bootstrap identity evidence',v_run.pipeline_version,now(),v_c.last_seen_at,now(),'PERMITTED','SYSTEM') returning id into v_source;
 if v_c.google_place_id is not null then insert into public.backyrd_spot_external_identities_v1(spot_id,source_family,source_identity,identity_confidence,bootstrap_run_id,candidate_id,first_observed_at,last_verified_at) values(v_spot,'GOOGLE_PLACE_ID',v_c.google_place_id,v_c.identity_confidence,v_run.id,v_c.id,v_c.first_seen_at,v_c.last_seen_at) on conflict(source_family,source_identity) do update set last_verified_at=excluded.last_verified_at;end if;
 update public.backyrd_city_bootstrap_candidates_v1 set matched_spot_id=v_spot,identity_state='MATCHED_EXISTING',lifecycle_state='PUBLISHED',published_at=now(),updated_at=now() where id=v_c.id;
 return jsonb_build_object('spotId',v_spot,'sourceId',v_source,'published',true,'matchedExisting',not v_created);
end $$;

revoke all on function public.backyrd_city_bootstrap_claim_job_v1(uuid,text,integer),public.backyrd_city_bootstrap_finish_job_v1(uuid,uuid,boolean,text,text),public.backyrd_city_bootstrap_open_review_v1(uuid,text,text,text,text),public.backyrd_city_bootstrap_publish_candidate_v1(uuid) from public,anon,authenticated;
grant execute on function public.backyrd_city_bootstrap_claim_job_v1(uuid,text,integer),public.backyrd_city_bootstrap_finish_job_v1(uuid,uuid,boolean,text,text),public.backyrd_city_bootstrap_open_review_v1(uuid,text,text,text,text),public.backyrd_city_bootstrap_publish_candidate_v1(uuid) to service_role;

comment on table public.backyrd_city_bootstrap_candidates_v1 is 'Operational city candidate staging. Never canonical Spot truth or Decision ranking input.';
comment on table public.backyrd_city_bootstrap_evidence_v1 is 'Normalized permitted bootstrap evidence only; raw provider payload retention is structurally forbidden.';
comment on table public.backyrd_city_bootstrap_reviews_v1 is 'Focused candidate/identity review queue; accepted canonical fact review remains the existing Gold authoring queue.';
comment on function public.backyrd_city_bootstrap_publish_candidate_v1(uuid) is 'Service-only, fail-closed identity publication adapter. It writes core Spot identity and provenance, never N4 or Accepted Facts.';
