-- Allow the real Human Spot Intelligence Offering/Purpose boundary to be
-- exercised on Product-isolated TEST/FIXTURE Spots without weakening the
-- existing rule that fixtures never become Gold/N4 or Product candidates.

create or replace function public.backyrd_trigger_enqueue_embedding_from_offering_v2_1()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_spot_id uuid:=coalesce(new.spot_id,old.spot_id);
begin
 if coalesce(new.field_key,old.field_key) in ('offering.availability','purpose.occasions')
    and exists(select 1 from public.spots where id=v_spot_id and data_origin not in ('FIXTURE','TEST')) then
   perform public.backyrd_enqueue_spot_embedding_v13(v_spot_id,'canonical_offering_changed');
 end if;
 return coalesce(new,old);
end $$;

create or replace function public.backyrd_human_spot_save_section_v2(
  p_spot_id uuid,p_section_id text,p_answers jsonb,p_source_type text default 'ADMIN_VERIFIED',
  p_source_url text default null,p_source_reference text default null,p_evidence_scope text default 'SPOT',
  p_idempotency_key text default null,p_expected_snapshot_hash text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare
 v_actor jsonb;v_payload_hash text;v_request public.backyrd_human_spot_save_requests_v2%rowtype;
 v_source uuid;v_answer jsonb;v_question public.backyrd_human_spot_questions_v2%rowtype;
 v_value jsonb;v_status text;v_rebuild jsonb;v_result jsonb;v_current_hash text;
 v_count integer:=0;v_proposal jsonb;v_data_origin text;
begin
  v_actor:=public.backyrd_gold_actor_v1(p_spot_id);
  if v_actor->>'role' not in ('FOUNDER','ADMIN') then raise exception 'admin_or_founder_required' using errcode='42501'; end if;
  select data_origin into v_data_origin from public.spots where id=p_spot_id;
  if v_data_origin in ('FIXTURE','TEST') and (
    p_section_id<>'PURPOSE' or p_evidence_scope<>'SPOT' or exists(
      select 1 from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) answer
      left join public.backyrd_human_spot_questions_v2 question on question.question_id=answer->>'questionId' and question.active
      where question.canonical_field_key is null or question.canonical_field_key not in ('offering.availability','purpose.occasions')
    )
  ) then raise exception 'fixture_authoring_limited_to_offering_acceptance' using errcode='42501'; end if;
  if p_section_id not in ('IDENTITY','PURPOSE','FIT','EXPERIENCE','PRACTICAL') then raise exception 'unknown_authoring_section' using errcode='22023'; end if;
  if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)=0 then raise exception 'authoring_answers_required' using errcode='22023'; end if;
  if p_source_type not in ('ADMIN_VERIFIED','OFFICIAL_WEBSITE','OFFICIAL_DOCUMENT') then raise exception 'authoring_source_not_allowed' using errcode='22023'; end if;
  if p_evidence_scope not in ('SPOT','EVENT','PROGRAM','TEMPORARY') then raise exception 'authoring_scope_not_allowed' using errcode='22023'; end if;
  v_payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object('section',p_section_id,'answers',p_answers,'source',p_source_type,'url',p_source_url,'reference',p_source_reference,'scope',p_evidence_scope)::text,'UTF8'),'sha256'),'hex');
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'idempotency_key_required' using errcode='22023'; end if;
  select * into v_request from public.backyrd_human_spot_save_requests_v2 where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
  if found then
    if v_request.payload_hash<>v_payload_hash then raise exception 'authoring_idempotency_conflict' using errcode='23505'; end if;
    return v_request.result||jsonb_build_object('replayed',true);
  end if;
  select fingerprint into v_current_hash from public.backyrd_spot_intelligence_snapshots_v1 where spot_id=p_spot_id and context_key='global';
  if p_expected_snapshot_hash is not null and v_current_hash is distinct from p_expected_snapshot_hash then raise exception 'authoring_state_changed_reload_required' using errcode='40001'; end if;
  insert into public.backyrd_human_spot_save_requests_v2(spot_id,idempotency_key,payload_hash) values(p_spot_id,p_idempotency_key,v_payload_hash);
  insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_url,source_reference,title,observed_at,last_checked_at,legal_use_status,created_by_type,created_by_id)
  values(p_spot_id,p_source_type,nullif(btrim(p_source_url),''),coalesce(nullif(btrim(p_source_reference),''),'human-spot-v2:'||p_section_id||':'||p_idempotency_key),'Human Spot Intelligence V2 · '||p_section_id,now(),now(),'NOT_REQUIRED',v_actor->>'role',(v_actor->>'actorId')::uuid) returning id into v_source;
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=v_answer->>'questionId' and active for share;
    if not found or v_question.section_id<>p_section_id then raise exception 'unknown_or_wrong_section_question' using errcode='22023'; end if;
    if v_question.mapping_class<>'CANONICAL_WRITE' then raise exception 'question_not_canonical_write' using errcode='22023'; end if;
    v_value:=v_answer->'value';
    if v_value is null or not public.backyrd_human_spot_validate_answer_v2(p_spot_id,v_question.question_id,v_value) then raise exception 'invalid_human_answer' using errcode='22023'; end if;
    if p_evidence_scope='SPOT' then
      update public.backyrd_spot_accepted_facts_v1 set status='SUPERSEDED' where spot_id=p_spot_id and field_key=v_question.canonical_field_key and status in ('ACTIVE','UNKNOWN','STALE');
      v_status:=case when v_value='"UNKNOWN"'::jsonb then 'UNKNOWN' else 'ACTIVE' end;
      insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,status,confidence_policy_result,accepted_by,observed_at,last_checked_at,evidence_scope,interpretation_basis,semantic_contract_version,contract_version)
      values(p_spot_id,v_question.canonical_field_key,v_value,v_source,v_status,.95,(v_actor->>'actorId')::uuid,now(),now(),'SPOT',case when v_question.canonical_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end,'backyrd-canonical-semantics-v1','backyrd-spot-accepted-fact-v1');
    else
      v_proposal:=public.backyrd_gold_submit_proposal_v1(p_spot_id,v_question.canonical_field_key,v_value,v_source,p_idempotency_key||':'||v_question.question_id,'Human Spot Intelligence V2',null);
      update public.backyrd_spot_fact_proposals_v1 set evidence_scope=p_evidence_scope,interpretation_basis=case when v_question.canonical_field_key='time.dayparts' then 'HUMAN_QUALITATIVE' else 'SOURCE_EXPLICIT' end where id=(v_proposal->>'proposalId')::uuid;
    end if;
    v_count:=v_count+1;
  end loop;
  if p_evidence_scope='SPOT' then
    if v_data_origin in ('FIXTURE','TEST') then
      v_rebuild:=jsonb_build_object('skipped',true,'reason','TEST_FIXTURE_OFFERING_OUTSIDE_N4');
    else
      v_rebuild:=public.backyrd_gold_rebuild_spot_v1(p_spot_id);
    end if;
  end if;
  insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
  values(p_spot_id,(v_actor->>'actorId')::uuid,case when p_evidence_scope='SPOT' then 'SAVE_SECTION_V2' else 'PROPOSE_SECTION_V2' end,'AUTHORING_SECTION',p_spot_id,jsonb_build_object('sectionId',p_section_id,'answerCount',v_count,'scope',p_evidence_scope,'sourceId',v_source,'rebuild',v_rebuild,'ui','human-spot-intelligence-v2'));
  v_result:=jsonb_build_object('ok',true,'persisted',v_count,'accepted',p_evidence_scope='SPOT','reviewRequired',p_evidence_scope<>'SPOT','rebuild',v_rebuild,'profile',public.backyrd_human_spot_profile_v2(p_spot_id));
  update public.backyrd_human_spot_save_requests_v2 set result=v_result where spot_id=p_spot_id and idempotency_key=p_idempotency_key;
  return v_result;
end $$;

revoke all on function public.backyrd_human_spot_save_section_v2(uuid,text,jsonb,text,text,text,text,text,text) from public,anon;
grant execute on function public.backyrd_human_spot_save_section_v2(uuid,text,jsonb,text,text,text,text,text,text) to authenticated,service_role;

comment on function public.backyrd_human_spot_save_section_v2(uuid,text,jsonb,text,text,text,text,text,text) is
 'Founder/Admin Human V2 save. Product-isolated TEST/FIXTURE Spots accept only Offering/Purpose acceptance data and never become Gold/N4.';
