-- World Knowledge Slice 4A product-readiness closure.
-- This migration does not broaden the canonical Registry. It enforces the
-- category/place-type combinations that are already representable in 1.1 and
-- makes imported review counters actionable rather than merely historical.

create or replace function world_knowledge_private.category_place_types_allowed_v1(
  p_category text,
  p_place_types jsonb
) returns boolean
language sql immutable
set search_path=''
as $$
  select
    pg_catalog.jsonb_typeof(p_place_types) = 'array'
    and pg_catalog.jsonb_array_length(p_place_types) > 0
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(p_place_types) as selected(value)
      where selected.value <> all (
        case p_category
          when 'EAT' then array['RESTAURANT','BRASSERIE','BISTRO','BAR','PUB','SNACK_BAR','TAKEAWAY','FAST_FOOD']::text[]
          when 'DRINKS' then array['BAR','PUB']::text[]
          when 'COFFEE_DAYTIME' then array['CAFE','BISTRO']::text[]
          when 'NIGHTLIFE' then array['BAR','PUB']::text[]
          else array[]::text[]
        end
      )
    );
$$;

create or replace function world_knowledge_private.validate_category_place_type_insert_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  current_category text;
begin
  if new.attribute_key <> 'classification.place_types' or new.knowledge_state = 'UNKNOWN' then
    return new;
  end if;

  select c.value #>> '{}'
    into current_category
  from world_knowledge_private.claims c
  where c.spot_id = new.spot_id
    and c.attribute_key = 'classification.primary_category'
    and c.knowledge_state = 'KNOWN_VALUE'
  order by c.last_changed_at desc, c.id desc
  limit 1;

  if current_category is null then
    raise exception 'category_required_before_place_types' using errcode='22023';
  end if;

  if not world_knowledge_private.category_place_types_allowed_v1(current_category, new.value) then
    raise exception 'category_place_type_conflict' using errcode='22023';
  end if;

  return new;
end;
$$;

drop trigger if exists world_validate_category_place_type_insert on world_knowledge_private.claims;
create trigger world_validate_category_place_type_insert
before insert on world_knowledge_private.claims
for each row execute function world_knowledge_private.validate_category_place_type_insert_v1();

create or replace function public.world_founder_list_spots_v1(
  p_search text default null,
  p_primary_category text default null,
  p_include_archived boolean default false
) returns jsonb
language plpgsql stable security definer
set search_path=''
as $$
declare
  actor_id uuid := auth.uid();
  result jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then
    raise exception 'founder_authoring_environment_disabled' using errcode='42501';
  end if;
  if actor_id is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(row_value order by row_value->>'name', row_value->>'spotId'), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'spotId', s.id,
      'name', coalesce(name_claim.value #>> '{}', s.name),
      'primaryCategory', category_claim.value #>> '{}',
      'lifecycleStatus', f.lifecycle_status,
      'scope', f.evaluation_scope,
      'ownerAssigned', s.owner_id is not null,
      'answerCount', (select count(distinct c.attribute_key) from world_knowledge_private.claims c where c.spot_id=s.id),
      'conflictCount', (select count(*) from world_knowledge_private.review_work_items w where w.spot_id=s.id and w.status in ('OPEN','IN_REVIEW') and w.work_class='AUTHORITY_CONFLICT'),
      'manifestHash', pointer.manifest_hash,
      'catalogOrigin', f.catalog_origin,
      'cohortSelected', f.cohort_selected,
      'unconfirmedLegacyCount', (
        select count(*)
        from world_knowledge_private.legacy_import_values_v1 v
        where v.spot_id=s.id
          and v.disposition='PREFILL_REQUIRES_CONFIRMATION'
          and v.confirmed_claim_id is null
          and v.target_attribute_key is not null
          and not exists (
            select 1 from world_knowledge_private.claims c
            where c.spot_id=s.id and c.attribute_key=v.target_attribute_key
          )
      ),
      'ambiguousLegacyCount', (
        select count(*)
        from world_knowledge_private.legacy_import_values_v1 v
        where v.spot_id=s.id
          and v.disposition='REVIEW_REQUIRED'
          and v.target_attribute_key is not null
          and not exists (
            select 1 from world_knowledge_private.claims c
            where c.spot_id=s.id and c.attribute_key=v.target_attribute_key
          )
      )
    ) row_value
    from world_knowledge_private.founder_evaluation_spots_v1 f
    join public.spots s on s.id=f.spot_id
    left join lateral (
      select c.value from world_knowledge_private.claims c
      where c.spot_id=s.id and c.attribute_key='identity.name'
      order by c.last_changed_at desc,c.id desc limit 1
    ) name_claim on true
    left join lateral (
      select c.value from world_knowledge_private.claims c
      where c.spot_id=s.id and c.attribute_key='classification.primary_category'
      order by c.last_changed_at desc,c.id desc limit 1
    ) category_claim on true
    left join world_knowledge_private.current_projection_pointers pointer on pointer.spot_id=s.id
    where (public.is_admin_v1(actor_id) or s.owner_id=actor_id)
      and (p_include_archived or f.lifecycle_status='ACTIVE')
      and (p_search is null or coalesce(name_claim.value #>> '{}',s.name) ilike '%'||p_search||'%')
      and (p_primary_category is null or category_claim.value #>> '{}'=p_primary_category)
  ) rows;

  return jsonb_build_object('scope','FOUNDER_EVALUATION_ONLY','spots',result);
end;
$$;

revoke execute on function world_knowledge_private.category_place_types_allowed_v1(text,jsonb), world_knowledge_private.validate_category_place_type_insert_v1() from public,anon,authenticated,service_role;

comment on function world_knowledge_private.category_place_types_allowed_v1(text,jsonb) is
  'Fail-closed Registry 1.1 category/place-type compatibility. Wider authoring candidates remain NOT_CONFIGURED.';
