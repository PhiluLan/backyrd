-- Founder-operable City Bootstrap / Spot Research operations on the existing
-- nine operational tables and canonical Gold review contracts. No operational
-- state, Product truth, N4 semantics or provider credentials are duplicated.

alter table public.backyrd_city_bootstrap_jobs_v1
  add column if not exists admin_retry_history jsonb not null default '[]'::jsonb
    check(jsonb_typeof(admin_retry_history)='array' and jsonb_array_length(admin_retry_history)<=4);

create or replace function public.backyrd_admin_spot_engine_operations_v1(
  p_city_key text default 'basel',
  p_run_id uuid default null,
  p_candidate_state text default 'ALL',
  p_limit integer default 200,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path=public,pg_catalog
as $$
declare
  v_actor uuid:=auth.uid();v_role text;v_run_id uuid;v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_runs jsonb;v_metrics jsonb;v_candidates jsonb;v_reviews jsonb;v_jobs jsonb;v_costs jsonb;v_checkpoints jsonb;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501';end if;
  select role into v_role from public.admin_users where user_id=v_actor and role in ('admin','super_admin');
  if v_role is null and not public.admin_is_admin_v1() then raise exception 'admin_or_founder_required' using errcode='42501';end if;
  if p_city_key!~'^[a-z0-9_-]{1,80}$' or p_candidate_state not in ('ALL','DISCOVERED','PROCESSING','REVIEW_REQUIRED','PUBLISHED','REJECTED','FAILED')
    or p_limit not between 1 and 500 or p_offset not between 0 and 10000 then raise exception 'spot_engine_filter_invalid' using errcode='22023';end if;

  if p_run_id is null then
    select id into v_run_id from public.backyrd_city_bootstrap_runs_v1 where city_key=p_city_key order by created_at desc limit 1;
  else
    select id into v_run_id from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id and city_key=p_city_key;
    if v_run_id is null then raise exception 'spot_engine_run_not_found' using errcode='22023';end if;
  end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=v_run_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'runKey',r.run_key,'cityKey',r.city_key,'cityName',r.city_name,'mode',r.mode,'status',r.status,
    'pipelineVersion',r.pipeline_version,'canonicalCommit',r.canonical_repository_commit,'failureCode',r.failure_code,
    'stopReason',r.stop_reason,'startedAt',r.started_at,'completedAt',r.completed_at,'createdAt',r.created_at,
    'candidateCount',(select count(*) from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=r.id),
    'openReviewCount',(select count(*) from public.backyrd_city_bootstrap_reviews_v1 q where q.run_id=r.id and q.state='OPEN')+
      (select count(*) from public.backyrd_spot_fact_proposals_v1 p where p.status in ('PENDING','CONFLICT','STALE') and exists(select 1 from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=r.id and c.matched_spot_id=p.spot_id)),
    'failedJobCount',(select count(*) from public.backyrd_city_bootstrap_jobs_v1 j where j.run_id=r.id and j.state='FAILED')
  ) order by r.created_at desc),'[]'::jsonb) into v_runs
  from (select * from public.backyrd_city_bootstrap_runs_v1 where city_key=p_city_key order by created_at desc limit 25) r;

  if v_run_id is null then
    return jsonb_build_object('cityKey',p_city_key,'selectedRun',null,'runs',v_runs,'metrics','{}'::jsonb,'candidates','[]'::jsonb,'reviewCases','[]'::jsonb,'jobs','[]'::jsonb,'costs','[]'::jsonb,'checkpoints','[]'::jsonb,'serverOnlyCredentials',true);
  end if;

  select jsonb_build_object(
    'discovered',count(*),
    'relevant',count(*) filter(where relevance_state='RELEVANT'),
    'matchedExisting',count(*) filter(where identity_state='MATCHED_EXISTING'),
    'selected',count(*) filter(where lifecycle_state in ('IDENTITY_RESOLVED','EVIDENCE_PENDING','REVIEW_REQUIRED','PRODUCT_ELIGIBLE','PUBLISHED')),
    'processing',count(*) filter(where lifecycle_state in ('IDENTITY_RESOLVED','EVIDENCE_PENDING','PRODUCT_ELIGIBLE')),
    'reviewRequired',count(*) filter(where lifecycle_state='REVIEW_REQUIRED' or exists(select 1 from public.backyrd_city_bootstrap_reviews_v1 r where r.candidate_id=c.id and r.state='OPEN')),
    'published',count(*) filter(where lifecycle_state='PUBLISHED'),
    'rejected',count(*) filter(where lifecycle_state='REJECTED' or relevance_state='IRRELEVANT' or identity_state='REJECTED'),
    'failed',count(*) filter(where lifecycle_state='FAILED' or exists(select 1 from public.backyrd_city_bootstrap_jobs_v1 j where j.candidate_id=c.id and j.state='FAILED')),
    'openBootstrapReviews',(select count(*) from public.backyrd_city_bootstrap_reviews_v1 r where r.run_id=v_run_id and r.state='OPEN'),
    'openFactProposals',(select count(*) from public.backyrd_spot_fact_proposals_v1 p where p.status in ('PENDING','CONFLICT','STALE') and exists(select 1 from public.backyrd_city_bootstrap_candidates_v1 rc where rc.run_id=v_run_id and rc.matched_spot_id=p.spot_id)),
    'queuedJobs',(select count(*) from public.backyrd_city_bootstrap_jobs_v1 j where j.run_id=v_run_id and j.state='QUEUED'),
    'runningJobs',(select count(*) from public.backyrd_city_bootstrap_jobs_v1 j where j.run_id=v_run_id and j.state='RUNNING')
  ) into v_metrics from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=v_run_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'displayName',c.display_name,'address',c.address,'city',c.city,'website',c.website,
    'category',c.canonical_category_name,'lifecycleState',c.lifecycle_state,'relevanceState',c.relevance_state,
    'relevanceReason',c.relevance_reason,'relevanceConfidence',c.relevance_confidence,'identityState',c.identity_state,
    'identityConfidence',c.identity_confidence,'matchedSpotId',c.matched_spot_id,'lat',c.lat,'lng',c.lng,
    'googlePlaceLinked',c.google_place_id is not null,'enrichmentPriority',c.enrichment_priority,'updatedAt',c.updated_at,
    'openReviewCount',(select count(*) from public.backyrd_city_bootstrap_reviews_v1 r where r.candidate_id=c.id and r.state='OPEN'),
    'openProposalCount',(select count(*) from public.backyrd_spot_fact_proposals_v1 p where p.spot_id=c.matched_spot_id and p.status in ('PENDING','CONFLICT','STALE')),
    'failedJobCount',(select count(*) from public.backyrd_city_bootstrap_jobs_v1 j where j.candidate_id=c.id and j.state='FAILED')
  ) order by c.enrichment_priority desc,c.created_at),'[]'::jsonb) into v_candidates
  from (select * from public.backyrd_city_bootstrap_candidates_v1 c0 where c0.run_id=v_run_id and case p_candidate_state
    when 'ALL' then true when 'DISCOVERED' then c0.lifecycle_state='DISCOVERED'
    when 'PROCESSING' then c0.lifecycle_state in ('IDENTITY_RESOLVED','EVIDENCE_PENDING','PRODUCT_ELIGIBLE')
    when 'REVIEW_REQUIRED' then c0.lifecycle_state='REVIEW_REQUIRED' or exists(select 1 from public.backyrd_city_bootstrap_reviews_v1 r where r.candidate_id=c0.id and r.state='OPEN') or exists(select 1 from public.backyrd_spot_fact_proposals_v1 p where p.spot_id=c0.matched_spot_id and p.status in ('PENDING','CONFLICT','STALE'))
    when 'PUBLISHED' then c0.lifecycle_state='PUBLISHED' when 'REJECTED' then c0.lifecycle_state='REJECTED'
    when 'FAILED' then c0.lifecycle_state='FAILED' or exists(select 1 from public.backyrd_city_bootstrap_jobs_v1 j where j.candidate_id=c0.id and j.state='FAILED') else false end
    order by c0.enrichment_priority desc,c0.created_at limit p_limit offset p_offset) c;

  select coalesce(jsonb_agg(q.item order by q.open_order,q.created_at desc),'[]'::jsonb) into v_reviews from (
    select case when r.state='OPEN' then 0 else 1 end open_order,r.created_at,jsonb_build_object(
      'id',r.id,'kind','BOOTSTRAP','status',r.state,'runId',r.run_id,'candidateId',c.id,'spotId',c.matched_spot_id,
      'spotName',coalesce(s.name,c.display_name),'candidateName',c.display_name,'proposedAction',r.proposed_action,
      'factFamily',case when r.reason in ('SOURCE_CONFLICT','LEGAL_MEDIA_DECISION') then 'CONTACT / SOURCE' when r.reason='CATEGORY_AMBIGUOUS' then 'CATEGORY' when r.reason='CLOSURE_CONFLICT' then 'OPERATING_STATUS' else 'IDENTITY' end,
      'scope','CANDIDATE_TO_SPOT','reason',r.reason,'priority',r.priority,'resolution',r.resolution,
      'createdAt',r.created_at,'reviewedAt',r.resolved_at,'reviewedBy',r.resolved_by,
      'canAccept',r.state='OPEN' and r.reason not in ('IDENTITY_AMBIGUOUS','CLOSURE_CONFLICT','MOVE_OR_RENAME_AMBIGUOUS','LEGAL_MEDIA_DECISION'),
      'canReject',r.state='OPEN','canEdit',c.matched_spot_id is not null,
      'validation',jsonb_build_object('relevanceState',c.relevance_state,'relevanceConfidence',c.relevance_confidence,'identityState',c.identity_state,'identityConfidence',c.identity_confidence,'websiteIdentityMatch',public.backyrd_city_bootstrap_website_matches_name_v1(c.display_name,c.website)),
      'evidence',(select coalesce(jsonb_agg(jsonb_build_object('sourceFamily',e.source_family,'sourceIdentity',e.source_identity,'factFamily',e.fact_family,'authorityClass',e.authority_class,'legalUseStatus',e.legal_use_status,'observedAt',e.observed_at) order by e.retrieved_at desc),'[]'::jsonb) from public.backyrd_city_bootstrap_evidence_v1 e where e.candidate_id=c.id and e.superseded_at is null)
    ) item from public.backyrd_city_bootstrap_reviews_v1 r join public.backyrd_city_bootstrap_candidates_v1 c on c.id=r.candidate_id left join public.spots s on s.id=c.matched_spot_id where r.run_id=v_run_id
    union all
    select case when p.status in ('PENDING','CONFLICT','STALE') then 0 else 1 end,p.created_at,jsonb_build_object(
      'id',p.id,'kind','FACT_PROPOSAL','status',p.status,'runId',v_run_id,'candidateId',(select c.id from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=v_run_id and c.matched_spot_id=p.spot_id order by c.created_at limit 1),'spotId',p.spot_id,'spotName',s.name,
      'proposedAction',p.field_key||' = '||p.proposed_value::text,'proposedValue',p.proposed_value,'factFamily',p.field_key,
      'scope',coalesce(p.evidence_scope,p.research_evidence_scope,'UNKNOWN_SCOPE'),'entityScope',p.research_entity_scope,'subjectName',p.research_subject_name,'durability',p.research_durability,'scopeResolution',p.research_scope_resolution,
      'reason',coalesce(p.research_classification,p.status),'priority',case when p.status='CONFLICT' then 'HIGH' else 'MEDIUM' end,
      'resolution',p.resolution_note,'createdAt',p.created_at,'reviewedAt',p.reviewed_at,'reviewedBy',p.reviewed_by,
      'canAccept',p.status in ('PENDING','CONFLICT','STALE') and coalesce(p.evidence_scope,p.research_evidence_scope)='SPOT' and coalesce(p.research_entity_scope,'SPOT')='SPOT' and coalesce(p.research_durability,'PERSISTENT')='PERSISTENT' and coalesce(p.research_scope_resolution,'PASS')='PASS',
      'canReject',p.status in ('PENDING','CONFLICT','STALE'),'canEdit',true,
      'validation',jsonb_build_object('classification',p.research_classification,'deterministicConfidence',p.deterministic_confidence,'confidenceRationale',p.confidence_rationale,'researchPass',p.research_pass_key),
      'evidence',jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('sourceFamily',src.source_type,'sourceIdentity',src.source_url,'title',src.title,'legalUseStatus',src.legal_use_status,'observedAt',src.observed_at,'excerpt',p.evidence_excerpt))),
      'auditStatus',case when p.status in ('ACCEPTED','REJECTED') and exists(select 1 from public.backyrd_spot_gold_authoring_audit_v1 a where a.subject_id=p.id and a.action in ('ACCEPT','REJECT')) then 'AUDITED' when p.status in ('ACCEPTED','REJECTED') then 'DECIDED' else 'OPEN' end
    ) from public.backyrd_spot_fact_proposals_v1 p join public.spots s on s.id=p.spot_id join public.backyrd_spot_sources_v1 src on src.id=p.source_id
    where exists(select 1 from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=v_run_id and c.matched_spot_id=p.spot_id)
  ) q;

  select coalesce(jsonb_agg(j.item order by j.created_at desc),'[]'::jsonb) into v_jobs from (
    select bj.created_at,jsonb_build_object('id',bj.id,'kind','BOOTSTRAP','candidateId',bj.candidate_id,'spotId',c.matched_spot_id,'spotName',c.display_name,'stage',bj.stage,'state',bj.state,'attempts',bj.attempts,'maxAttempts',bj.max_attempts,'failureClass',bj.failure_class,'failureCode',bj.failure_code,'canRetry',bj.state='FAILED' and bj.failure_class='TRANSIENT' and bj.attempts<bj.max_attempts,'adminRetryHistory',bj.admin_retry_history,'availableAt',bj.available_at,'startedAt',bj.started_at,'completedAt',bj.completed_at) item
    from public.backyrd_city_bootstrap_jobs_v1 bj left join public.backyrd_city_bootstrap_candidates_v1 c on c.id=bj.candidate_id where bj.run_id=v_run_id
    union all
    select rj.created_at,jsonb_build_object('id',rj.id,'kind','RESEARCH','candidateId',(select c.id from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=v_run_id and c.matched_spot_id=rj.spot_id order by c.created_at limit 1),'spotId',rj.spot_id,'spotName',s.name,'stage','RESEARCH','state',rj.state,'attempts',rj.technical_attempts,'maxAttempts',2,'failureClass',case when rj.state='FAILED' then 'RESEARCH_FAILURE' else null end,'failureCode',rj.failure_code,'canRetry',false,'availableAt',rj.available_at,'startedAt',rj.started_at,'completedAt',rj.completed_at,'inputTokens',rj.input_tokens,'outputTokens',rj.output_tokens,'totalTokens',rj.total_tokens,'webSearchCalls',rj.web_search_calls,'latencyMs',rj.provider_latency_ms) item
    from public.backyrd_spot_research_jobs_v1 rj join public.spots s on s.id=rj.spot_id where exists(select 1 from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=v_run_id and c.matched_spot_id=rj.spot_id)
  ) j;

  select coalesce(jsonb_agg(x.item order by x.provider),'[]'::jsonb) into v_costs from (
    select ce.provider,jsonb_build_object('provider',ce.provider,'requestCount',sum(ce.request_count),'inputUnits',sum(ce.input_units),'outputUnits',sum(ce.output_units),'measuredCostMicrounits',sum(ce.measured_cost_microunits),'currency',max(ce.currency),'latencyMs',sum(ce.latency_ms)) item from public.backyrd_city_bootstrap_cost_events_v1 ce where ce.run_id=v_run_id group by ce.provider
    union all
    select 'RESEARCH_AI',jsonb_build_object('provider','RESEARCH_AI','requestCount',count(*),'inputUnits',sum(rj.input_tokens),'outputUnits',sum(rj.output_tokens),'totalTokens',sum(rj.total_tokens),'webSearchCalls',sum(rj.web_search_calls),'measuredCostMicrounits',null,'currency',null,'latencyMs',sum(rj.provider_latency_ms)) from public.backyrd_spot_research_jobs_v1 rj where exists(select 1 from public.backyrd_city_bootstrap_candidates_v1 c where c.run_id=v_run_id and c.matched_spot_id=rj.spot_id) having count(*)>0
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('batchNumber',batch_number,'verdict',verdict,'snapshot',snapshot,'createdAt',created_at) order by batch_number desc),'[]'::jsonb) into v_checkpoints from public.backyrd_city_bootstrap_checkpoints_v1 where run_id=v_run_id;
  return jsonb_build_object('cityKey',p_city_key,'selectedRun',to_jsonb(v_run)-'geography'-'source_configuration'-'target_configuration','runs',v_runs,'metrics',v_metrics,'candidates',v_candidates,'reviewCases',v_reviews,'jobs',v_jobs,'costs',v_costs,'checkpoints',v_checkpoints,'serverOnlyCredentials',true);
end $$;

create or replace function public.backyrd_admin_spot_engine_review_v1(p_review_id uuid,p_action text,p_resolution_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_role text;v_review public.backyrd_city_bootstrap_reviews_v1%rowtype;v_candidate public.backyrd_city_bootstrap_candidates_v1%rowtype;v_run public.backyrd_city_bootstrap_runs_v1%rowtype;v_open integer;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501';end if;
  select role into v_role from public.admin_users where user_id=v_actor and role in ('admin','super_admin');
  if v_role is null and not public.admin_is_admin_v1() then raise exception 'admin_or_founder_required' using errcode='42501';end if;
  if p_action not in ('ACCEPT','REJECT') or length(btrim(coalesce(p_resolution_note,''))) not between 4 and 1000 then raise exception 'spot_engine_review_action_invalid' using errcode='22023';end if;
  select * into v_review from public.backyrd_city_bootstrap_reviews_v1 where id=p_review_id for update;
  if not found then raise exception 'spot_engine_review_not_found' using errcode='22023';end if;
  if v_review.state<>'OPEN' then return jsonb_build_object('reviewId',v_review.id,'state',v_review.state,'replayed',true,'canonicalWrite',false);end if;
  select * into v_candidate from public.backyrd_city_bootstrap_candidates_v1 where id=v_review.candidate_id for update;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=v_review.run_id;
  if p_action='REJECT' then
    update public.backyrd_city_bootstrap_reviews_v1 set state=case when id=v_review.id then 'REJECTED' else 'STALE' end,resolution=case when id=v_review.id then btrim(p_resolution_note) else 'Candidate rejected by another reviewed case' end,resolved_by=v_actor,resolved_at=now() where candidate_id=v_candidate.id and state='OPEN';
    update public.backyrd_city_bootstrap_candidates_v1 set lifecycle_state='REJECTED',updated_at=now() where id=v_candidate.id;
    update public.backyrd_city_bootstrap_jobs_v1 set state='CANCELLED',completed_at=now(),updated_at=now() where candidate_id=v_candidate.id and state='QUEUED';
    return jsonb_build_object('reviewId',v_review.id,'candidateId',v_candidate.id,'state','REJECTED','candidateState','REJECTED','replayed',false,'canonicalWrite',false);
  end if;
  if v_review.reason in ('IDENTITY_AMBIGUOUS','CLOSURE_CONFLICT','MOVE_OR_RENAME_AMBIGUOUS','LEGAL_MEDIA_DECISION') then raise exception 'spot_engine_review_accept_requires_correction_or_reject' using errcode='22023';end if;
  update public.backyrd_city_bootstrap_reviews_v1 set state='RESOLVED',resolution=btrim(p_resolution_note),resolved_by=v_actor,resolved_at=now() where id=v_review.id;
  select count(*) into v_open from public.backyrd_city_bootstrap_reviews_v1 where candidate_id=v_candidate.id and state='OPEN';
  if v_open>0 then return jsonb_build_object('reviewId',v_review.id,'candidateId',v_candidate.id,'state','RESOLVED','candidateState','REVIEW_REQUIRED','remainingOpenReviews',v_open,'canonicalWrite',false);end if;
  if v_run.mode not in ('PILOT','SCALE') or v_run.status not in ('RUNNING','PAUSED','REVIEW_REQUIRED')
    or v_candidate.relevance_state<>'RELEVANT' or v_candidate.relevance_confidence not in ('EXACT','HIGH')
    or v_candidate.identity_state not in ('MATCHED_EXISTING','NEW_IDENTITY') or v_candidate.identity_confidence not in ('EXACT','STRONG')
    or v_candidate.address is null or v_candidate.canonical_category_name is null or v_candidate.website is null or v_candidate.website!~'^https://[^[:space:]]+$'
    or not public.backyrd_city_bootstrap_website_matches_name_v1(v_candidate.display_name,v_candidate.website)
    or (v_candidate.matched_spot_id is not null and not exists(select 1 from public.spots where id=v_candidate.matched_spot_id and status='approved'))
    or not exists(select 1 from public.backyrd_city_bootstrap_evidence_v1 e where e.candidate_id=v_candidate.id and e.source_family='OPENSTREETMAP' and e.legal_use_status='PERMITTED' and e.superseded_at is null and e.raw_payload_retained=false)
    or (v_candidate.google_place_id is not null and not exists(select 1 from public.backyrd_city_bootstrap_evidence_v1 e where e.candidate_id=v_candidate.id and e.source_family='GOOGLE_PLACE_ID' and e.legal_use_status='IDENTIFIER_ONLY' and e.source_identity=v_candidate.google_place_id and e.superseded_at is null and e.raw_payload_retained=false))
  then raise exception 'spot_engine_candidate_validation_failed' using errcode='22023';end if;
  update public.backyrd_city_bootstrap_candidates_v1 set lifecycle_state='PRODUCT_ELIGIBLE',updated_at=now() where id=v_candidate.id;
  update public.backyrd_city_bootstrap_jobs_v1 set state='COMPLETE',completed_at=coalesce(completed_at,now()),updated_at=now() where candidate_id=v_candidate.id and stage='EVIDENCE' and state in ('QUEUED','RUNNING');
  return jsonb_build_object('reviewId',v_review.id,'candidateId',v_candidate.id,'state','RESOLVED','candidateState','PRODUCT_ELIGIBLE','canonicalWrite',false);
end $$;

create or replace function public.backyrd_admin_spot_engine_retry_job_v1(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_actor uuid:=auth.uid();v_role text;v_job public.backyrd_city_bootstrap_jobs_v1%rowtype;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501';end if;
  select role into v_role from public.admin_users where user_id=v_actor and role in ('admin','super_admin');
  if v_role is null and not public.admin_is_admin_v1() then raise exception 'admin_or_founder_required' using errcode='42501';end if;
  select * into v_job from public.backyrd_city_bootstrap_jobs_v1 where id=p_job_id for update;
  if not found then raise exception 'spot_engine_job_not_found' using errcode='22023';end if;
  if v_job.state<>'FAILED' or v_job.failure_class<>'TRANSIENT' or v_job.attempts>=v_job.max_attempts then raise exception 'spot_engine_job_not_retryable' using errcode='22023';end if;
  update public.backyrd_city_bootstrap_jobs_v1 set state='QUEUED',available_at=now(),lease_token=null,lease_expires_at=null,runner_id=null,completed_at=null,
    admin_retry_history=admin_retry_history||jsonb_build_array(jsonb_build_object('actorId',v_actor,'retriedAt',now(),'priorState',v_job.state,'failureClass',v_job.failure_class,'failureCode',v_job.failure_code,'attempts',v_job.attempts)),updated_at=now() where id=v_job.id;
  return jsonb_build_object('jobId',v_job.id,'state','QUEUED','attempts',v_job.attempts,'maxAttempts',v_job.max_attempts,'canonicalWrite',false);
end $$;

revoke all on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer),public.backyrd_admin_spot_engine_review_v1(uuid,text,text),public.backyrd_admin_spot_engine_retry_job_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer),public.backyrd_admin_spot_engine_review_v1(uuid,text,text),public.backyrd_admin_spot_engine_retry_job_v1(uuid) to authenticated;

comment on function public.backyrd_admin_spot_engine_operations_v1(text,uuid,text,integer,integer) is 'Founder/Admin-only, secret-free read adapter over existing City Bootstrap, Research and Gold review state.';
comment on function public.backyrd_admin_spot_engine_review_v1(uuid,text,text) is 'Founder/Admin bootstrap review boundary. ACCEPT re-runs deterministic eligibility; REJECT isolates the candidate. Never writes canonical facts.';
comment on function public.backyrd_admin_spot_engine_retry_job_v1(uuid) is 'Founder/Admin retry boundary for failed TRANSIENT bootstrap jobs below their existing attempt cap.';
