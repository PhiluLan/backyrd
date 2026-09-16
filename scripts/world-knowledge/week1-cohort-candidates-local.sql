-- LOCAL FOUNDER DATABASE ONLY. This query is read-only and must never be used
-- as Production authority. It creates candidate suggestions, not Claims.
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '1s';

with relevant_keys(attribute_key) as (values
  ('purpose.primary_visit'), ('classification.place_types'), ('hours.regular'),
  ('hours.kitchen_service'), ('context.typical_dayparts'), ('context.visit_situations'),
  ('context.atmosphere'), ('operation.price_level'), ('accessibility.step_free_entrance'),
  ('rule.age_access'), ('offering.onsite')
), legacy as (
  select v.spot_id,
    max(v.transformed_value #>> '{}') filter (where v.target_attribute_key='classification.primary_category' and v.mapping_status in ('DIRECT','NORMALIZED')) as primary_category,
    count(distinct v.target_attribute_key) filter (where v.target_attribute_key in (select attribute_key from relevant_keys) and v.mapping_status in ('DIRECT','NORMALIZED','MISSING_PROVENANCE')) as mapped_fields,
    count(*) filter (where v.mapping_status='AMBIGUOUS') as ambiguous_values,
    coalesce(array_agg(distinct v.target_attribute_key) filter (where v.target_attribute_key in (select attribute_key from relevant_keys) and v.mapping_status in ('DIRECT','NORMALIZED','MISSING_PROVENANCE')),'{}') as mapped_keys,
    coalesce(array_agg(distinct v.target_attribute_key) filter (where v.target_attribute_key in (select attribute_key from relevant_keys) and v.mapping_status='AMBIGUOUS'),'{}') as review_keys
  from world_knowledge_private.legacy_import_values_v1 v
  group by v.spot_id
), claims as (
  select c.spot_id,
    count(distinct c.attribute_key) filter (where c.attribute_key in (select attribute_key from relevant_keys)) as claimed_fields,
    coalesce(array_agg(distinct c.attribute_key) filter (where c.attribute_key in (select attribute_key from relevant_keys)),'{}') as claimed_keys
  from world_knowledge_private.claims c
  group by c.spot_id
)
select jsonb_build_object(
  'schemaVersion','backyrd.world-knowledge.week1-cohort-source@1',
  'environment','LOCAL_FOUNDER_EVALUATION',
  'claimAuthority','NONE',
  'spots',coalesce(jsonb_agg(jsonb_build_object(
    'spotId',f.spot_id,
    'name',s.name,
    'primaryCategory',coalesce(l.primary_category,'NOT_CONFIGURED'),
    'mappedFields',coalesce(l.mapped_fields,0),
    'claimedFields',coalesce(c.claimed_fields,0),
    'ambiguousValues',coalesce(l.ambiguous_values,0),
    'mappedKeys',coalesce(to_jsonb(l.mapped_keys),'[]'::jsonb),
    'reviewKeys',coalesce(to_jsonb(l.review_keys),'[]'::jsonb),
    'claimedKeys',coalesce(to_jsonb(c.claimed_keys),'[]'::jsonb),
    'alreadyFounderSelected',f.cohort_selected
  ) order by s.name,f.spot_id),'[]'::jsonb)
)
from world_knowledge_private.founder_evaluation_spots_v1 f
join public.spots s on s.id=f.spot_id
left join legacy l on l.spot_id=f.spot_id
left join claims c on c.spot_id=f.spot_id
where f.lifecycle_status='ACTIVE';

rollback;
