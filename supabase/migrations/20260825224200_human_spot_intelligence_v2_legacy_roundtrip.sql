-- Preserve already accepted legacy values during a V2 multi-select edit without
-- allowing clients to introduce new unregistered values.
create or replace function public.backyrd_human_spot_validate_answer_v2(
  p_spot_id uuid,p_question_id text,p_value jsonb
) returns boolean language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare v_question public.backyrd_human_spot_questions_v2%rowtype;v_primary text;v_secondary text[];v_item jsonb;v_key text;v_entry text;
begin
  select * into v_question from public.backyrd_human_spot_questions_v2 where question_id=p_question_id and active;
  if not found or v_question.mapping_class<>'CANONICAL_WRITE' then return false; end if;
  v_primary:=public.backyrd_human_spot_derived_archetype_v2(p_spot_id);
  select coalesce(secondary_archetypes,'{}'::text[]) into v_secondary from public.backyrd_spot_authoring_profiles_v2 where spot_id=p_spot_id;
  v_secondary:=coalesce(v_secondary,'{}'::text[]);
  if not (v_question.common or v_primary=any(v_question.archetypes) or v_question.archetypes&&v_secondary) then return false; end if;
  if not public.backyrd_gold_validate_fact_value_v1(v_question.canonical_field_key,p_value) then return false; end if;
  if v_question.control_type in ('SINGLE_CHOICE','DURATION_RANGE') then
    return exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=p_value);
  elsif v_question.control_type='MULTI_CHOICE' then
    if jsonb_typeof(p_value)<>'array' then return false; end if;
    for v_item in select value from jsonb_array_elements(p_value) loop
      if not exists(select 1 from jsonb_array_elements(v_question.options) o where o->'value'=v_item and (not o ? 'archetypes' or exists(select 1 from jsonb_array_elements_text(o->'archetypes') a(value) where value=v_primary or value=any(v_secondary))))
        and not exists(select 1 from public.backyrd_spot_accepted_facts_v1 f where f.spot_id=p_spot_id and f.field_key=v_question.canonical_field_key and f.status in ('ACTIVE','UNKNOWN','STALE') and f.value @> jsonb_build_array(v_item))
      then return false; end if;
    end loop;
    return true;
  elsif v_question.control_type in ('TRI_STATE_MAP','ACCESSIBILITY_MAP') then
    if jsonb_typeof(p_value)<>'object' then return false; end if;
    for v_key,v_entry in select key,value from jsonb_each_text(p_value) loop
      if v_entry not in ('SUITABLE','NOT_SUITABLE','UNKNOWN') or not exists(select 1 from jsonb_array_elements(v_question.options) o where o->>'value'=v_key) then return false; end if;
    end loop;
    return true;
  elsif v_question.control_type='AGE_RANGE' then return true;
  end if;
  return false;
end $$;

revoke all on function public.backyrd_human_spot_validate_answer_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.backyrd_human_spot_validate_answer_v2(uuid,text,jsonb) to service_role;
