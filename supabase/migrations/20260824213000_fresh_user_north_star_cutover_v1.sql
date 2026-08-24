-- Cut controlled internal Product users over to one North-Star Decision and
-- canonical N2 authority. Historical Legacy rows remain untouched.

create or replace function public.backyrd_canonical_product_user_enabled_v1(
  p_user_id uuid,
  p_capability text default 'DECISION'
) returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
  select case
    when auth.role()<>'service_role' or p_user_id is null then false
    when upper(coalesce(p_capability,'')) not in ('DECISION','N6')
      then public.backyrd_internal_live_user_enabled_v1(p_user_id,p_capability)
    else
      public.backyrd_internal_live_user_enabled_v1(p_user_id,p_capability)
      or exists(
        select 1
        from auth.users u
        join public.profiles p on p.id=u.id
        where u.id=p_user_id
          and u.email_confirmed_at is not null
          and lower(split_part(coalesce(u.email,''),'@',2))='backyrd.ch'
          and p.profile_onboarding_completed_at is not null
          and p.decision_onboarding_completed_at is not null
          and p.onboarding_version='canonical-semantics-v1'
          and public.user_has_active_consent_v1(u.id,'personalized_recommendations')
      )
  end
$$;

revoke all on function public.backyrd_canonical_product_user_enabled_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.backyrd_canonical_product_user_enabled_v1(uuid,text) to service_role;

alter table public.backyrd_internal_live_decision_executions_v1
  drop constraint if exists backyrd_internal_live_decision_executions_v1_status_check;
alter table public.backyrd_internal_live_decision_executions_v1
  add constraint backyrd_internal_live_decision_executions_v1_status_check
  check(status in ('PROCESSING','COMPLETE','FALLBACK','FAILED'));
alter table public.backyrd_internal_live_decision_executions_v1
  drop constraint if exists backyrd_internal_live_decision_executions_v1_final_source_check;
alter table public.backyrd_internal_live_decision_executions_v1
  add constraint backyrd_internal_live_decision_executions_v1_final_source_check
  check(final_source is null or final_source in ('N6_VALIDATED','DETERMINISTIC_NORTH_STAR','LEGACY_V13_FALLBACK','NORTH_STAR_FAILED'));

create or replace function public.backyrd_fail_canonical_product_decision_v1(
  p_decision_id uuid,p_user_id uuid,p_error_code text
) returns void
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
begin
  if auth.role()<>'service_role' then raise exception 'canonical_decision_service_only' using errcode='42501'; end if;
  update public.backyrd_internal_live_decision_executions_v1
  set status='FAILED',final_source='NORTH_STAR_FAILED',final_order='{}',n6_disposition='FAILED',
      error_code=left(coalesce(p_error_code,'canonical_north_star_failed'),160),completed_at=now()
  where decision_id=p_decision_id and user_id=p_user_id and status='PROCESSING';
  if not found then raise exception 'canonical_decision_failure_identity_invalid' using errcode='42501'; end if;
end
$$;
revoke all on function public.backyrd_fail_canonical_product_decision_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.backyrd_fail_canonical_product_decision_v1(uuid,uuid,text) to service_role;

create or replace function public.backyrd_prepare_internal_live_decision_v1(
  p_user_id uuid,p_city text,p_mood_a_text text,p_mood_b_text text,
  p_request_context jsonb,p_candidate_ids uuid[],p_why_this text[],p_learning_eligible boolean default true
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_decision uuid;v_i integer;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  if not public.backyrd_canonical_product_user_enabled_v1(p_user_id,'DECISION') then raise exception 'canonical_product_user_not_enabled' using errcode='42501'; end if;
  if jsonb_typeof(p_request_context)<>'object' or p_candidate_ids is null or cardinality(p_candidate_ids) not between 1 and 20
     or cardinality(p_candidate_ids)<>(select count(distinct x) from unnest(p_candidate_ids)x)
     or exists(select 1 from unnest(p_candidate_ids)x where not exists(select 1 from public.spots s where s.id=x)) then
    raise exception 'internal_live_invalid_decision_input' using errcode='22023';
  end if;
  perform set_config('backyrd.internal_live_learning_eligible',case when p_learning_eligible then 'true' else 'false' end,true);
  insert into public.decision_sessions(user_id,city,mood_a_text,mood_b_text)
  values(p_user_id,nullif(trim(p_city),''),nullif(trim(p_mood_a_text),''),nullif(trim(p_mood_b_text),'')) returning id into v_decision;
  insert into public.backyrd_internal_decision_handoffs_v1(decision_id,user_id,city,mood_a_text,mood_b_text,request_context,candidate_ids,learning_eligible)
  values(v_decision,p_user_id,nullif(trim(p_city),''),nullif(trim(p_mood_a_text),''),nullif(trim(p_mood_b_text),''),p_request_context,p_candidate_ids,p_learning_eligible);
  for v_i in 1..cardinality(p_candidate_ids) loop
    insert into public.decision_impressions(decision_id,spot_id,rank,why_this)
    values(v_decision,p_candidate_ids[v_i],v_i,case when p_why_this is null then null else p_why_this[v_i] end)
    on conflict(decision_id,spot_id) do update set rank=excluded.rank,why_this=excluded.why_this;
  end loop;
  insert into public.backyrd_internal_live_decision_executions_v1(decision_id,user_id,status)
  values(v_decision,p_user_id,'PROCESSING');
  return v_decision;
end $$;

create or replace function public.backyrd_claim_n6_shadow_for_decision_v1(p_runner_id uuid,p_decision_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_settings public.backyrd_n6_shadow_settings_v1%rowtype;v_work public.backyrd_n6_shadow_work_v1%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'n6_shadow_service_only' using errcode='42501'; end if;
  select * into v_settings from public.backyrd_n6_shadow_settings_v1 where singleton;
  if not v_settings.enabled then return null; end if;
  update public.backyrd_n6_shadow_work_v1 set state='PENDING',runner_id=null,claimed_at=null,lease_expires_at=null,updated_at=now()
  where state='PROCESSING' and lease_expires_at<now() and attempt<v_settings.max_attempts;
  if (select count(*) from public.backyrd_n6_shadow_work_v1 where state='PROCESSING' and lease_expires_at>=now())>=v_settings.max_concurrent_calls then return null; end if;
  select * into v_work from public.backyrd_n6_shadow_work_v1 where decision_id=p_decision_id and state in ('PENDING','RETRYABLE_FAILED') and attempt<v_settings.max_attempts for update skip locked;
  if v_work.id is null or not public.backyrd_canonical_product_user_enabled_v1(v_work.user_id,'N6') then return null; end if;
  update public.backyrd_n6_shadow_work_v1 set state='PROCESSING',attempt=attempt+1,shadow_run_id=gen_random_uuid(),runner_id=p_runner_id,claimed_at=now(),lease_expires_at=now()+interval '3 minutes',updated_at=now()
  where id=v_work.id returning * into v_work;
  return jsonb_build_object('work_id',v_work.id,'shadow_run_id',v_work.shadow_run_id,'decision_id',v_work.decision_id,'user_id',v_work.user_id,'attempt',v_work.attempt);
end $$;

-- A returned candidate is not an exposure. Only the authenticated Product
-- client can confirm the currently visible card, and only within its frozen
-- Decision page and position.
create or replace function public.backyrd_record_visible_decision_impression_v1(
  p_decision_id uuid,p_spot_id uuid,p_page_number integer,p_position_in_page integer
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare v_user uuid:=auth.uid();v_expected uuid;v_created timestamptz;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_decision_id is null or p_spot_id is null or p_page_number<1 or p_position_in_page not between 1 and 3 then
    raise exception 'visible_impression_invalid' using errcode='22023';
  end if;
  if not exists(select 1 from public.backyrd_decision_continuations_v1 c where c.decision_id=p_decision_id and c.user_id=v_user) then
    raise exception 'visible_impression_cross_user' using errcode='42501';
  end if;
  select returned_spot_ids[p_position_in_page] into v_expected
  from public.backyrd_decision_continuation_pages_v1
  where decision_id=p_decision_id and page_number=p_page_number;
  if v_expected is distinct from p_spot_id then raise exception 'visible_impression_candidate_mismatch' using errcode='42501'; end if;
  insert into public.backyrd_decision_visible_impressions_v1(decision_id,spot_id,page_number,position_in_page)
  values(p_decision_id,p_spot_id,p_page_number,p_position_in_page)
  on conflict(decision_id,spot_id) do nothing;
  select created_at into v_created from public.backyrd_decision_visible_impressions_v1
  where decision_id=p_decision_id and spot_id=p_spot_id;
  return jsonb_build_object('ok',true,'decisionId',p_decision_id,'spotId',p_spot_id,'page',p_page_number,'position',p_position_in_page,'visibleAt',v_created);
end
$$;
revoke all on function public.backyrd_record_visible_decision_impression_v1(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.backyrd_record_visible_decision_impression_v1(uuid,uuid,integer,integer) to authenticated,service_role;

-- Replacing these two functions removes the old server-returned = visible
-- assumption. Delivery/continuation state remains durable and idempotent.
create or replace function public.backyrd_initialize_decision_continuation_v1(
  p_decision_id uuid,p_user_id uuid,p_candidate_order uuid[],p_candidate_payload jsonb,
  p_initial_spot_ids uuid[],p_final_source text,p_n6_disposition text
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_existing public.backyrd_decision_continuations_v1%rowtype;v_response jsonb;v_exhausted boolean;
begin
  if auth.role()<>'service_role' then raise exception 'decision_continuation_service_only' using errcode='42501'; end if;
  if not exists(select 1 from public.decision_sessions where id=p_decision_id and user_id=p_user_id) then raise exception 'decision_continuation_cross_user' using errcode='42501'; end if;
  if p_candidate_order is null or cardinality(p_candidate_order) not between 1 and 20
     or cardinality(p_candidate_order)<>(select count(distinct value) from unnest(p_candidate_order)value)
     or p_initial_spot_ids is null or cardinality(p_initial_spot_ids) not between 1 and 3
     or p_initial_spot_ids<>p_candidate_order[1:cardinality(p_initial_spot_ids)]
     or jsonb_typeof(p_candidate_payload)<>'object'
     or (select count(*) from jsonb_object_keys(p_candidate_payload))<>cardinality(p_candidate_order)
     or octet_length(p_candidate_payload::text)>524288
     or exists(select 1 from unnest(p_candidate_order) spot_id where not(p_candidate_payload?spot_id::text) or (p_candidate_payload -> (spot_id::text) ->> 'spot_id') is distinct from spot_id::text)
  then raise exception 'decision_continuation_input_invalid' using errcode='22023'; end if;
  select * into v_existing from public.backyrd_decision_continuations_v1 where decision_id=p_decision_id for update;
  if found then
    if v_existing.user_id<>p_user_id or v_existing.candidate_order<>p_candidate_order or v_existing.candidate_payload<>p_candidate_payload then raise exception 'decision_continuation_reinitialize_mismatch' using errcode='22023'; end if;
    select response_payload into v_response from public.backyrd_decision_continuation_pages_v1 where decision_id=p_decision_id and page_number=1;
    return v_response;
  end if;
  v_exhausted:=cardinality(p_initial_spot_ids)=cardinality(p_candidate_order);
  v_response:=jsonb_build_object('decisionId',p_decision_id,'page',1,'requestId',null,'candidates',(select coalesce(jsonb_agg(p_candidate_payload->spot_id::text order by ord),'[]'::jsonb) from unnest(p_initial_spot_ids) with ordinality ids(spot_id,ord)),'previouslyShownSpotIds','[]'::jsonb,'returnedSpotIds',to_jsonb(p_initial_spot_ids),'exhausted',v_exhausted,'remainingCount',cardinality(p_candidate_order)-cardinality(p_initial_spot_ids),'finalSource',p_final_source,'n6Disposition',p_n6_disposition);
  insert into public.backyrd_decision_continuations_v1(decision_id,user_id,candidate_order,candidate_payload,shown_spot_ids,consumed_spot_ids,status,final_source,n6_disposition,exhausted_at)
  values(p_decision_id,p_user_id,p_candidate_order,p_candidate_payload,p_initial_spot_ids,p_initial_spot_ids,case when v_exhausted then 'EXHAUSTED' else 'ACTIVE' end,p_final_source,p_n6_disposition,case when v_exhausted then now() else null end);
  insert into public.backyrd_decision_continuation_pages_v1(decision_id,page_number,previously_shown_spot_ids,returned_spot_ids,exhausted,response_payload)
  values(p_decision_id,1,'{}',p_initial_spot_ids,v_exhausted,v_response);
  return v_response;
end $$;

create or replace function public.backyrd_next_decision_continuation_v1(
  p_decision_id uuid,p_user_id uuid,p_request_id uuid,p_page_size integer default 3
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_row public.backyrd_decision_continuations_v1%rowtype;v_existing jsonb;v_previous uuid[];v_unavailable uuid[];v_next uuid[];v_consumed uuid[];v_remaining integer;v_page integer;v_exhausted boolean;v_response jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'decision_continuation_service_only' using errcode='42501'; end if;
  if p_request_id is null or p_page_size not between 1 and 3 then raise exception 'decision_continuation_request_invalid' using errcode='22023'; end if;
  select response_payload into v_existing from public.backyrd_decision_continuation_pages_v1 where decision_id=p_decision_id and request_id=p_request_id;
  if found then return v_existing; end if;
  select * into v_row from public.backyrd_decision_continuations_v1 where decision_id=p_decision_id and user_id=p_user_id for update;
  if not found then raise exception 'decision_continuation_not_found_or_cross_user' using errcode='42501'; end if;
  select response_payload into v_existing from public.backyrd_decision_continuation_pages_v1 where decision_id=p_decision_id and request_id=p_request_id;
  if found then return v_existing; end if;
  v_previous:=v_row.shown_spot_ids;
  select coalesce(array_agg(candidate_id order by ord),'{}'::uuid[]) into v_unavailable
  from unnest(v_row.candidate_order) with ordinality candidates(candidate_id,ord)
  left join public.spots spot on spot.id=candidate_id
  where not(candidate_id=any(v_row.consumed_spot_ids)) and (spot.id is null or lower(coalesce(spot.status::text,'')) not in ('approved','active'));
  v_consumed:=v_row.consumed_spot_ids||v_unavailable;
  select coalesce(array_agg(candidate_id order by ord),'{}'::uuid[]) into v_next from(select candidate_id,ord from unnest(v_row.candidate_order) with ordinality candidates(candidate_id,ord) where not(candidate_id=any(v_consumed)) order by ord limit p_page_size) next_page;
  v_consumed:=v_consumed||v_next;
  select count(*) into v_remaining from unnest(v_row.candidate_order) candidate_id where not(candidate_id=any(v_consumed));
  v_exhausted:=v_remaining=0;v_page:=v_row.page_count+1;
  v_response:=jsonb_build_object('decisionId',p_decision_id,'page',v_page,'requestId',p_request_id,'candidates',(select coalesce(jsonb_agg(v_row.candidate_payload->spot_id::text order by ord),'[]'::jsonb) from unnest(v_next) with ordinality ids(spot_id,ord)),'previouslyShownSpotIds',to_jsonb(v_previous),'returnedSpotIds',to_jsonb(v_next),'exhausted',v_exhausted,'remainingCount',v_remaining,'skippedUnavailableSpotIds',to_jsonb(v_unavailable),'finalSource',v_row.final_source,'n6Disposition',v_row.n6_disposition);
  insert into public.backyrd_decision_continuation_pages_v1(decision_id,page_number,request_id,previously_shown_spot_ids,returned_spot_ids,skipped_unavailable_spot_ids,exhausted,response_payload)
  values(p_decision_id,v_page,p_request_id,v_previous,v_next,v_unavailable,v_exhausted,v_response);
  update public.backyrd_decision_continuations_v1 set shown_spot_ids=shown_spot_ids||v_next,consumed_spot_ids=v_consumed,page_count=v_page,status=case when v_exhausted then 'EXHAUSTED' else 'ACTIVE' end,exhausted_at=case when v_exhausted then now() else null end,updated_at=now() where decision_id=p_decision_id;
  return v_response;
end $$;

revoke all on function public.backyrd_initialize_decision_continuation_v1(uuid,uuid,uuid[],jsonb,uuid[],text,text),public.backyrd_next_decision_continuation_v1(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.backyrd_initialize_decision_continuation_v1(uuid,uuid,uuid[],jsonb,uuid[],text,text),public.backyrd_next_decision_continuation_v1(uuid,uuid,uuid,integer) to service_role;
revoke all on function public.backyrd_claim_n6_shadow_for_decision_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.backyrd_claim_n6_shadow_for_decision_v1(uuid,uuid) to service_role;

comment on function public.backyrd_canonical_product_user_enabled_v1(uuid,text) is
  'Controlled Product cutover: explicit existing allowlist or verified @backyrd.ch canonical-onboarding cohort. Public rollout remains unchanged.';
comment on function public.backyrd_record_visible_decision_impression_v1(uuid,uuid,integer,integer) is
  'Authenticated, idempotent visibility confirmation. Returned/unseen candidates are not exposures.';
