-- Existing real Product spots predate the data-origin registry and therefore
-- retain LEGACY identity provenance. This must not make newly qualified REAL
-- N4 evidence unavailable. Legacy/fixture evidence remains excluded.

create or replace function public.backyrd_read_n4_for_user_intelligence_v1(p_spot_ids uuid[])
returns table(spot_id uuid,available boolean,concepts jsonb,place_type text,snapshot_identity text,freshness timestamptz)
language sql stable security definer set search_path=public,pg_catalog as $$
 with requested as(
  select distinct x spot_id from unnest(coalesce(p_spot_ids,'{}'::uuid[]))x
  join public.spots s on s.id=x
  where s.data_origin not in ('FIXTURE','TEST')
 ), concepts as(
  select e.spot_id,jsonb_agg(jsonb_build_object('concept',e.dimension_key,'presence',(e.value#>>'{}')::numeric,'confidence',e.signal_confidence,'provenance',jsonb_build_object('evidenceId',e.id,'sourceFamily',e.source_family,'sourceReference',e.source_reference,'dataOrigin',e.data_origin)) order by e.dimension_key,e.id) concepts
  from public.backyrd_spot_intelligence_evidence_v1 e join requested r on r.spot_id=e.spot_id
  where e.status='ACTIVE' and e.data_origin in ('REAL','IMPORT') and e.source_family not in ('legacy','spot_intelligence_v1','spot_mood_concepts','spot_moods','mood_concepts') and e.value_kind='INTERPRETATION' and (e.value#>>'{}')::numeric>0 and e.signal_confidence>=.35 and e.valid_from<=now() and(e.valid_until is null or e.valid_until>now()) group by e.spot_id
 ),snapshots as(
  select s.spot_id,s.fingerprint,s.evidence_watermark,nullif(coalesce(s.intelligence->>'placeType',s.intelligence->>'place_type'),'')place_type from public.backyrd_spot_intelligence_snapshots_v1 s join requested r on r.spot_id=s.spot_id where s.context_key='global'
 )select r.spot_id,coalesce(jsonb_array_length(c.concepts),0)>0,coalesce(c.concepts,'[]'::jsonb),s.place_type,s.fingerprint,s.evidence_watermark from requested r left join concepts c on c.spot_id=r.spot_id left join snapshots s on s.spot_id=r.spot_id
$$;

comment on function public.backyrd_read_n4_for_user_intelligence_v1(uuid[]) is
  'Canonical N4 read for non-fixture Product spot identities. Only REAL/IMPORT, non-legacy evidence can qualify concepts.';
