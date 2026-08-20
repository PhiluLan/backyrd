-- Production Sprint 2.1: read-only canonical N4 adapter for User Intelligence.
-- No materialization, backfill, owner entitlement, or ranking mutation occurs here.

create or replace function public.backyrd_read_n4_for_user_intelligence_v1(p_spot_ids uuid[])
returns table(spot_id uuid,available boolean,concepts jsonb,place_type text,snapshot_identity text,freshness timestamptz)
language sql stable security definer set search_path=public,pg_catalog as $$
  with requested as (select distinct unnest(coalesce(p_spot_ids,'{}'::uuid[])) as spot_id),
  concepts as (
    select e.spot_id,jsonb_agg(jsonb_build_object('concept',e.dimension_key,'presence',(e.value#>>'{}')::numeric,'confidence',e.signal_confidence,'provenance',jsonb_build_object('evidenceId',e.id,'sourceFamily',e.source_family,'sourceReference',e.source_reference)) order by e.dimension_key,e.id) filter(where e.value_kind='INTERPRETATION' and (e.value#>>'{}')::numeric>0 and e.signal_confidence>=.35) as concepts
    from public.backyrd_spot_intelligence_evidence_v1 e join requested r on r.spot_id=e.spot_id
    where e.status='ACTIVE' and e.valid_from<=now() and (e.valid_until is null or e.valid_until>now()) group by e.spot_id
  ), snapshots as (
    select s.spot_id,s.fingerprint,s.evidence_watermark,
      nullif(coalesce(s.intelligence->>'placeType',s.intelligence->>'place_type'),'') as place_type
    from public.backyrd_spot_intelligence_snapshots_v1 s join requested r on r.spot_id=s.spot_id where s.context_key='global'
  ) select r.spot_id,coalesce(jsonb_array_length(c.concepts),0)>0,coalesce(c.concepts,'[]'::jsonb),s.place_type,s.fingerprint,s.evidence_watermark
  from requested r left join concepts c on c.spot_id=r.spot_id left join snapshots s on s.spot_id=r.spot_id
$$;

alter function public.backyrd_rebuild_user_intelligence_v1(uuid) rename to backyrd_rebuild_user_intelligence_base_v1;

create or replace function public.backyrd_rebuild_user_intelligence_v1(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare v_base jsonb; v_engine constant text:='backyrd-n5-8-4-production-runtime-v1'; v_card jsonb; v_hash text; v_count int; v_watermark timestamptz;
begin
  if auth.role()<>'service_role' then raise exception 'user_intelligence_service_only' using errcode='42501'; end if;
  v_base:=public.backyrd_rebuild_user_intelligence_base_v1(p_user_id);
  if coalesce((v_base->>'purged')::boolean,false) then return v_base; end if;
  -- Frozen N5.7 comparative inference. Only existing active canonical N4 evidence
  -- is eligible. Missing N4 yields no comparative node rather than an imputation.
  with observations as (
    select c.id,c.user_id,c.spot_id,c.journey_key,c.occurred_at,c.outcome,
      case c.outcome when 'POSITIVE' then 1 when 'NEGATIVE' then -1 else 0 end sign,
      case c.outcome when 'POSITIVE' then .48::numeric when 'NEGATIVE' then .38::numeric else 0::numeric end strength,
      n.concepts,n.place_type
    from public.backyrd_user_evidence_chains_v1 c join lateral public.backyrd_read_n4_for_user_intelligence_v1(array[c.spot_id]) n on n.spot_id=c.spot_id and n.available
    where c.user_id=p_user_id and c.outcome in ('POSITIVE','NEGATIVE')
  ), concepts as (
    select distinct x->>'concept' concept from observations o cross join lateral jsonb_array_elements(o.concepts) x
  ), scored as (
    select con.concept,
      sum(case when present.confidence is not null and o.sign>0 then o.strength*present.confidence else 0 end) pp,
      sum(case when present.confidence is not null and o.sign<0 then o.strength*present.confidence else 0 end) pn,
      sum(case when present.confidence is null and o.sign>0 then o.strength else 0 end) ap,
      sum(case when present.confidence is null and o.sign<0 then o.strength else 0 end) an,
      count(distinct o.journey_key) filter(where present.confidence is not null) ps,
      count(distinct o.spot_id) filter(where present.confidence is not null) spots,
      count(distinct o.journey_key) filter(where present.confidence is null) absent_sessions,
      count(distinct o.sign) filter(where o.sign<>0) signs,
      min(o.occurred_at) filter(where present.confidence is not null) first_at,max(o.occurred_at) filter(where present.confidence is not null) last_at
    from concepts con join observations o on true
    left join lateral (
      select (x->>'confidence')::numeric confidence
      from jsonb_array_elements(o.concepts) x where x->>'concept'=con.concept
    ) present on true group by con.concept
  ), inferred as (
    select *,round(((pp-pn)/(pp+pn+1))-((ap-an)/(ap+an+1)),6) discrimination,
      ps>=2 and spots>=2 and absent_sessions>=2 and signs>=2 and abs(((pp-pn)/(pp+pn+1))-((ap-an)/(ap+an+1)))>=.22 durable
    from scored
  ), eligible as (
    select *, (pn>pp) absolute_negative,
      least(1,round((.12+.7*(least(1,ps::numeric/5)*.4+least(1,spots::numeric/4)*.25+least(1,absent_sessions::numeric/5)*.2+case when signs>=2 then .15 else 0 end)*least(1,abs(discrimination)/.35)),6)) confidence
    from inferred
  ) insert into public.backyrd_user_intelligence_nodes_v2(user_id,node_key,concept_key,scope_kind,scope_key,polarity,knowledge_state,affinity,confidence,high_eligible,high_audit,evidence_composition,evidence_depth,contradictions,first_evidence_at,last_evidence_at,engine_version,node_hash)
  select p_user_id,'GLOBAL:global:'||concept,concept,'GLOBAL','global',
    case when durable and discrimination>0 then 'POSITIVE' when durable and discrimination<0 and absolute_negative then 'NEGATIVE' else 'UNKNOWN' end,
    case when durable and discrimination>0 then 'POSITIVE' when durable and discrimination<0 and absolute_negative then 'NEGATIVE' when discrimination>=0 then 'HYPOTHESIS_POSITIVE' else 'HYPOTHESIS_NEGATIVE' end,
    discrimination,confidence,
    false,jsonb_build_object('version','backyrd-n5-8-2-epistemic-high-eligibility-v1','eligible',false,'reasons',jsonb_build_array(case when confidence<.8 then 'CONFIDENCE_BELOW_HIGH_THRESHOLD' else 'GLOBAL_SCOPE_BREADTH_INSUFFICIENT' end)),
    jsonb_build_object('behavioral',0,'comparative',ps,'mood',0,'review',0,'explicit',0),jsonb_build_object('chains',ps,'independentSessions',ps,'independentSpots',spots,'outcomes',ps),
    case when pp>0 and pn>0 then jsonb_build_array(jsonb_build_object('kind','COMPARATIVE_OUTCOME_CONFLICT','positive',pp,'negative',pn)) else '[]'::jsonb end,first_at,last_at,v_engine,
    encode(digest(convert_to(jsonb_build_object('concept',concept,'affinity',discrimination,'confidence',confidence,'pp',pp,'pn',pn,'ap',ap,'an',an)::text,'UTF8'),'sha256'),'hex')
  from eligible e where not exists(select 1 from public.backyrd_user_intelligence_nodes_v2 d where d.user_id=p_user_id and d.node_key='GLOBAL:global:'||e.concept);
  -- Refresh the snapshot after comparative nodes. Stable JSONB ordering makes the hash rebuildable.
  select count(*),max(occurred_at) into v_count,v_watermark from public.backyrd_memory_events_v1 where user_id=p_user_id;
  select jsonb_build_object('version',v_engine,'userId',p_user_id,'nodes',coalesce(jsonb_agg(jsonb_build_object('nodeKey',node_key,'concept',concept_key,'scope',jsonb_build_object('kind',scope_kind,'key',scope_key),'polarity',polarity,'knowledgeState',knowledge_state,'affinity',affinity,'confidence',confidence,'highEligible',high_eligible,'evidenceComposition',evidence_composition,'evidenceDepth',evidence_depth,'contradictions',contradictions) order by node_key),'[]'::jsonb),'sourceEventCount',v_count,'sourceWatermark',v_watermark) into v_card from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id;
  v_hash:=encode(digest(convert_to(v_card::text,'UTF8'),'sha256'),'hex');
  update public.backyrd_user_card_snapshots_v1 set card=v_card,snapshot_hash=v_hash,source_event_count=v_count,source_watermark=v_watermark,calculated_at=now() where user_id=p_user_id;
  return jsonb_build_object('userId',p_user_id,'snapshotHash',v_hash,'nodeCount',(select count(*) from public.backyrd_user_intelligence_nodes_v2 where user_id=p_user_id));
end $$;

revoke all on function public.backyrd_read_n4_for_user_intelligence_v1(uuid[]),public.backyrd_rebuild_user_intelligence_base_v1(uuid),public.backyrd_rebuild_user_intelligence_v1(uuid) from public,anon,authenticated;
grant execute on function public.backyrd_read_n4_for_user_intelligence_v1(uuid[]),public.backyrd_rebuild_user_intelligence_v1(uuid) to service_role;
