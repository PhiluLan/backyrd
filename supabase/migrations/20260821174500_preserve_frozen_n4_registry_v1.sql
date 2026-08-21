-- Keep the frozen 60-dimension N4 registry unchanged. Gold suitability facts
-- remain an additive Product data layer and only map into already-canonical N4
-- concepts. This migration intentionally removes the transient registry entries
-- introduced by the Basel Gold foundation migration.

delete from public.backyrd_spot_intelligence_evidence_v1
where dimension_key in (
  'family_kids',
  'age_suitability',
  'rain_suitability',
  'activity_type',
  'social_context_suitability',
  'conversation_suitability',
  'weather.rain_suitable'
);

delete from public.backyrd_spot_intelligence_dimensions_v1
where dimension_key in (
  'family_kids',
  'age_suitability',
  'rain_suitability',
  'activity_type',
  'social_context_suitability',
  'conversation_suitability',
  'weather.rain_suitable'
);

create or replace function public.backyrd_rebuild_gold_n4_snapshot_v1(p_spot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog,extensions as $$
declare
  v_intelligence jsonb;
  v_confidence numeric;
  v_completeness numeric;
  v_watermark timestamptz;
  v_fingerprint text;
begin
  if auth.role() <> 'service_role' and current_user not in ('postgres','service_role') then
    raise exception 'gold_n4_service_only' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.backyrd_basel_gold_spots_v1
    where spot_id=p_spot_id and selection_status='SELECTED'
  ) then
    raise exception 'spot_not_in_gold_set' using errcode='22023';
  end if;

  with active as (
    select *
    from public.backyrd_spot_intelligence_evidence_v1
    where spot_id=p_spot_id
      and status='ACTIVE'
      and data_origin not in ('FIXTURE','TEST')
      and valid_from<=now()
      and (valid_until is null or valid_until>now())
  ), evidence_facts as (
    select coalesce(
      jsonb_object_agg(dimension_key,value order by dimension_key),
      '{}'::jsonb
    ) value
    from active
    where value_kind='FACT'
  ), suitability as (
    select coalesce(
      jsonb_object_agg(dimension_key,value order by dimension_key),
      '{}'::jsonb
    ) value
    from public.backyrd_spot_suitability_facts_v1
    where spot_id=p_spot_id
  ), concepts as (
    select coalesce(
      jsonb_object_agg(
        dimension_key,
        jsonb_build_object(
          'presence',(value#>>'{}')::numeric,
          'confidence',signal_confidence,
          'evidenceId',id,
          'sourceReference',source_reference
        ) order by dimension_key
      ),
      '{}'::jsonb
    ) value
    from active
    where value_kind='INTERPRETATION'
  ), stats as (
    select
      coalesce(avg(signal_confidence),0) avg_confidence,
      count(distinct dimension_key) dimension_count,
      max(observed_at) watermark
    from active
  )
  select
    jsonb_build_object(
      'placeType',(select value#>>'{}' from active where dimension_key='place_type' limit 1),
      'facts',(select value from evidence_facts) ||
        jsonb_build_object('suitability',(select value from suitability)),
      'concepts',(select value from concepts),
      'provenanceMode','EVIDENCE_BOUND'
    ),
    least(1,(select avg_confidence from stats)),
    least(1,(select dimension_count::numeric/10 from stats)),
    (select watermark from stats)
  into v_intelligence,v_confidence,v_completeness,v_watermark;

  v_fingerprint:=encode(digest(convert_to(v_intelligence::text,'UTF8'),'sha256'),'hex');
  insert into public.backyrd_spot_intelligence_snapshots_v1(
    spot_id,context_key,intelligence,confidence,completeness,
    evidence_watermark,fingerprint,calculated_at,schema_version,
    confidence_contract_version
  ) values (
    p_spot_id,'global',v_intelligence,v_confidence,v_completeness,
    v_watermark,v_fingerprint,now(),'backyrd-spot-intelligence-schema-v1',
    'backyrd-spot-confidence-contract-v1'
  )
  on conflict(spot_id,context_key) do update set
    intelligence=excluded.intelligence,
    confidence=excluded.confidence,
    completeness=excluded.completeness,
    evidence_watermark=excluded.evidence_watermark,
    fingerprint=excluded.fingerprint,
    calculated_at=excluded.calculated_at,
    schema_version=excluded.schema_version,
    confidence_contract_version=excluded.confidence_contract_version;

  return jsonb_build_object(
    'spotId',p_spot_id,
    'fingerprint',v_fingerprint,
    'confidence',v_confidence,
    'completeness',v_completeness
  );
end
$$;

create or replace view public.backyrd_basel_gold_readiness_v1 as
with evidence as (
  select
    spot_id,
    count(*) filter(
      where value_kind='INTERPRETATION'
        and status='ACTIVE'
        and data_origin not in ('FIXTURE','TEST')
    ) interpretations
  from public.backyrd_spot_intelligence_evidence_v1
  group by spot_id
), suitability as (
  select spot_id,count(distinct dimension_key) suitability_dimensions
  from public.backyrd_spot_suitability_facts_v1
  group by spot_id
), content as (
  select
    sd.spot_id,
    coalesce(
      nullif(btrim(sd.owner_description),''),
      nullif(btrim(sd.admin_description),''),
      nullif(btrim(sd.enriched_description),'')
    ) description
  from public.spot_descriptions sd
)
select
  g.spot_id,
  s.name,
  c.name category,
  s.city,
  g.coverage_bucket,
  case when
    s.status='approved'
    and s.city='Basel'
    and s.address is not null
    and s.google_place_id is not null
    and length(coalesce(content.description,''))>=80
    and (s.header_photo_path is not null or s.google_photo_enabled)
    and (s.website is not null or s.phone is not null)
    and exists(select 1 from public.spot_hours h where h.spot_id=s.id)
    and coalesce(sf.suitability_dimensions,0)>=2
    and coalesce(e.interpretations,0)>0
  then 'GOLD_READY' else 'PARTIAL' end readiness,
  array_remove(array[
    case when s.status<>'approved' then 'NOT_APPROVED' end,
    case when s.city is distinct from 'Basel' or s.address is null or s.google_place_id is null then 'IDENTITY_OR_LOCATION_UNVERIFIED' end,
    case when length(coalesce(content.description,''))<80 then 'USABLE_DESCRIPTION_MISSING' end,
    case when s.header_photo_path is null and not s.google_photo_enabled then 'VISUAL_SOURCE_MISSING' end,
    case when s.website is null and s.phone is null then 'BASIC_FACTS_MISSING' end,
    case when not exists(select 1 from public.spot_hours h where h.spot_id=s.id) then 'OPENING_HOURS_MISSING' end,
    case when coalesce(sf.suitability_dimensions,0)<2 then 'STRUCTURED_SUITABILITY_THIN' end,
    case when coalesce(e.interpretations,0)=0 then 'CANONICAL_N4_INTERPRETATION_MISSING' end,
    case when not exists(
      select 1 from public.backyrd_spot_suitability_facts_v1 f
      where f.spot_id=s.id and f.dimension_key='age_suitability'
    ) then 'AGE_SUITABILITY_UNKNOWN' end
  ],null) data_gaps,
  coalesce(sf.suitability_dimensions,0) suitability_dimensions,
  coalesce(e.interpretations,0) n4_interpretations
from public.backyrd_basel_gold_spots_v1 g
join public.spots s on s.id=g.spot_id
join public.categories c on c.id=s.category_id
left join content on content.spot_id=s.id
left join evidence e on e.spot_id=s.id
left join suitability sf on sf.spot_id=s.id
where g.selection_status='SELECTED';

do $$
declare r record;
begin
  for r in
    select g.spot_id
    from public.backyrd_basel_gold_spots_v1 g
    join public.spots s on s.id=g.spot_id
    where g.selection_status='SELECTED'
  loop
    perform public.backyrd_rebuild_gold_n4_snapshot_v1(r.spot_id);
  end loop;
end
$$;

revoke all on function public.backyrd_rebuild_gold_n4_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function public.backyrd_rebuild_gold_n4_snapshot_v1(uuid) to service_role;
revoke all on table public.backyrd_basel_gold_readiness_v1 from public,anon,authenticated;
grant select on public.backyrd_basel_gold_readiness_v1 to service_role;

comment on table public.backyrd_spot_suitability_facts_v1 is
  'Additive Product suitability facts; not an extension of the frozen N4 dimension registry.';
