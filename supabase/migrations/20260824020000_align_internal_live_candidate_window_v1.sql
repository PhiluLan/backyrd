-- Align the server-only internal Decision handoff with the measured bounded
-- post-eligibility window used by decision-v13. The visible response remains
-- independently limited by the Product contract.
create or replace function public.backyrd_prepare_internal_live_decision_v1(
  p_user_id uuid,p_city text,p_mood_a_text text,p_mood_b_text text,
  p_request_context jsonb,p_candidate_ids uuid[],p_why_this text[],p_learning_eligible boolean default true
) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_decision uuid;v_i integer;
begin
  if auth.role()<>'service_role' then raise exception 'internal_live_service_only' using errcode='42501'; end if;
  if not public.backyrd_internal_live_user_enabled_v1(p_user_id,'DECISION') then raise exception 'internal_live_user_not_enabled' using errcode='42501'; end if;
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

revoke all on function public.backyrd_prepare_internal_live_decision_v1(uuid,text,text,text,jsonb,uuid[],text[],boolean) from public,anon,authenticated;
grant execute on function public.backyrd_prepare_internal_live_decision_v1(uuid,text,text,text,jsonb,uuid[],text[],boolean) to service_role;

