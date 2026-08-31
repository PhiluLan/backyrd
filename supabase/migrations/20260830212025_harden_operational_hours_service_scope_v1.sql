-- A service or Offering schedule on an official Spot page is not evidence of
-- the Spot's regular opening hours. Keep legitimate venue schedules that also
-- mention food service only when the excerpt contains an explicit venue-hour
-- cue. UNKNOWN/review is safer than promoting a breakfast, reception, ticket,
-- training or similar schedule to canonical opening.regular truth.

create or replace function public.backyrd_research_regular_hours_spot_scope_v1(
  p_subject_name text,p_short_evidence text
) returns boolean
language plpgsql stable set search_path=public,pg_catalog as $$
declare
  v_combined text:=lower(public.unaccent(coalesce(p_subject_name,'')||' '||coalesce(p_short_evidence,'')));
  v_evidence text:=btrim(regexp_replace(lower(public.unaccent(coalesce(p_short_evidence,''))),'[^a-z0-9]+',' ','g'));
  v_service_term text;v_service_position integer;v_prefix text;
begin
  if v_combined~'(^|[^a-z0-9])(office|team availability|business hours|opening hours (for )?(the )?office|buro|buero|sekretariat|theaterkasse|ticketkauf|ticket office|box office|geschaftszeiten buro|geschaeftszeiten buero|reception|rezeption|front desk|check[ -]?in|check[ -]?out|telefonzeiten|phone hours|schalterzeiten|counter hours|training|physio(therapy)?|physiotherapie|osteopath(y|ie)?|breakfast included|included breakfast)([^a-z0-9]|$)' then
    return false;
  end if;
  select (regexp_match(v_evidence,'(?:^| )(breakfast|fruhstuck|brunch|lunch|dinner|mittagessen|abendessen|warm(?:e|en|er)? kuche|kitchen hours?|reception|rezeption|front desk|check in|check out|training|physio(?:therapy)?|physiotherapie|osteopath(?:y|ie)?|course|kurs|class|session|spa|pool|sauna|massage|wellness|ticket|kasse|telefonzeiten|phone hours|schalterzeiten|counter hours)(?: |$)'))[1]
    into v_service_term;
  if v_service_term is not null
    and v_evidence!~'(^| )(offnungszeiten|opening hours|operating hours|venue hours|geoffnet|open daily|taglich geoffnet|geschlossen|closed|rest day|ruhetag)( |$)' then
    v_service_term:=btrim(v_service_term);
    v_service_position:=strpos(v_evidence,v_service_term);
    v_prefix:=left(v_evidence,greatest(v_service_position-1,0));
    if v_prefix!~'^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday)( |$)'
      or v_prefix!~'(^| )([01]?[0-9]|2[0-3]) ([0-5][0-9]|uhr)( |$)' then
      return false;
    end if;
  end if;
  return true;
end $$;
revoke all on function public.backyrd_research_regular_hours_spot_scope_v1(text,text)
  from public,anon,authenticated,service_role;
comment on function public.backyrd_research_regular_hours_spot_scope_v1(text,text) is
  'SERVICE_INTERNAL_UNGRANTED fail-closed distinction between venue opening hours and service/Offering schedules.';

create or replace function public.backyrd_revalidate_intelligence_operational_batch_v1(
  p_run_id uuid,p_policy_version text,p_limit integer default 5
) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  v_run public.backyrd_city_bootstrap_runs_v1%rowtype;
  v_row record;v_result jsonb;v_results jsonb:='[]';v_processed integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'operational_revalidation_service_only' using errcode='42501';
  end if;
  if p_policy_version<>'backyrd-machine-acceptance-v1' then
    raise exception 'operational_revalidation_policy_invalid' using errcode='22023';
  end if;
  if p_limit is null or p_limit<1 or p_limit>5 then
    raise exception 'operational_revalidation_batch_invalid' using errcode='22023';
  end if;
  select * into v_run from public.backyrd_city_bootstrap_runs_v1 where id=p_run_id;
  if not found or v_run.mode<>'INTELLIGENCE' or v_run.status<>'COMPLETED'
    or v_run.stop_reason<>'COMPLETED:INTELLIGENCE_POPULATION_415_TERMINAL'
    or v_run.target_configuration->>'phase'<>'FULL_LAUNCH_CURATION'
    or v_run.target_configuration->>'discoveryEnabled'<>'false'
    or v_run.target_configuration->>'researchCoverageTarget'<>'415' then
    raise exception 'operational_revalidation_run_invalid' using errcode='42501';
  end if;
  -- Row locks plus SKIP LOCKED give concurrent service invocations disjoint
  -- work without duplicate dispositions or holding a provider/HTTP lease.
  for v_row in
    select e.id,e.spot_id,e.job_id,e.fact_key,e.subject_name,e.short_evidence
    from public.backyrd_spot_research_extractions_v2 e
    join public.backyrd_spot_research_jobs_v1 j on j.id=e.job_id
    where j.population_run_id=p_run_id and j.state='READY_FOR_REVIEW'
      and e.fact_key in ('contact.phone','contact.email','opening.regular')
      and e.support_status='SUPPORTED' and e.evidence_scope='SPOT' and e.entity_scope='SPOT'
      and e.durability='PERSISTENT' and e.scope_resolution='SUBJECT_NOT_SPOT_ANCHORED'
      and not exists(
        select 1 from public.backyrd_spot_gold_authoring_audit_v1 a
        where a.subject_type='RESEARCH_EXTRACTION' and a.subject_id=e.id
          and a.action='OPERATIONAL_REVALIDATION_V1'
      )
    order by e.created_at,e.id
    for update of e skip locked
    limit p_limit
  loop
    if v_row.fact_key='opening.regular'
      and not public.backyrd_research_regular_hours_spot_scope_v1(v_row.subject_name,v_row.short_evidence) then
      insert into public.backyrd_spot_gold_authoring_audit_v1(spot_id,actor_id,action,subject_type,subject_id,metadata)
      values(v_row.spot_id,null,'OPERATIONAL_REVALIDATION_V1','RESEARCH_EXTRACTION',v_row.id,jsonb_build_object(
        'actorType','SYSTEM_POLICY','resolverPolicyVersion','backyrd-spot-research-policy-v2.11',
        'machinePolicyVersion',p_policy_version,'populationRunId',p_run_id,'jobId',v_row.job_id,
        'fieldKey',v_row.fact_key,'disposition','SKIPPED','reason','SERVICE_SCHEDULE_NOT_VENUE_HOURS',
        'canonicalWrite',false));
      v_result:=jsonb_build_object(
        'extractionId',v_row.id,'fieldKey',v_row.fact_key,'disposition','SKIPPED',
        'reason','SERVICE_SCHEDULE_NOT_VENUE_HOURS','canonicalWrite',false);
    else
      v_result:=public.backyrd_revalidate_operational_extraction_internal_v1(
        p_run_id,v_row.id,p_policy_version);
    end if;
    v_results:=v_results||jsonb_build_array(v_result);v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object(
    'runId',p_run_id,'processed',v_processed,'results',v_results,
    'complete',not exists(
      select 1 from public.backyrd_spot_research_extractions_v2 e
      join public.backyrd_spot_research_jobs_v1 j on j.id=e.job_id
      where j.population_run_id=p_run_id and j.state='READY_FOR_REVIEW'
        and e.fact_key in ('contact.phone','contact.email','opening.regular')
        and e.support_status='SUPPORTED' and e.evidence_scope='SPOT' and e.entity_scope='SPOT'
        and e.durability='PERSISTENT' and e.scope_resolution='SUBJECT_NOT_SPOT_ANCHORED'
        and not exists(
          select 1 from public.backyrd_spot_gold_authoring_audit_v1 a
          where a.subject_type='RESEARCH_EXTRACTION' and a.subject_id=e.id
            and a.action='OPERATIONAL_REVALIDATION_V1'
        )
    ),'providerCalls',0,'newResearchJobs',0,'historicalExtractionsRewritten',0
  );
end $$;
revoke all on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer)
  to service_role;
comment on function public.backyrd_revalidate_intelligence_operational_batch_v1(uuid,text,integer) is
  'WORKER service-only bounded operational-evidence revalidation. Service/Offering schedules fail closed before opening.regular acceptance.';
