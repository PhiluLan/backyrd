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

-- A prepared option is authoring research, not a Registry fact. Keeping it in a
-- separate append-only ledger lets non-gastronomic spots complete the local UX
-- without silently widening Registry 1.1 or leaking the value into resolution.
create table world_knowledge_private.authoring_taxonomy_candidates_v1 (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete restrict,
  attribute_key text not null check (attribute_key = 'classification.place_types'),
  primary_category text not null,
  candidate_value jsonb not null,
  taxonomy_version text not null check (taxonomy_version = 'backyrd.world-knowledge.authoring-taxonomy@4a.2'),
  actor_binding_id uuid not null references world_knowledge_private.actor_bindings(id) on delete restrict,
  idempotency_key text not null,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  candidate_hash text not null unique check (candidate_hash ~ '^[0-9a-f]{64}$'),
  unique (actor_binding_id, idempotency_key)
);

alter table world_knowledge_private.authoring_taxonomy_candidates_v1 enable row level security;
revoke all on table world_knowledge_private.authoring_taxonomy_candidates_v1 from public,anon,authenticated;
grant select,insert on table world_knowledge_private.authoring_taxonomy_candidates_v1 to service_role;
create trigger world_authoring_taxonomy_candidates_immutable
before update or delete on world_knowledge_private.authoring_taxonomy_candidates_v1
for each row execute function world_knowledge_private.reject_immutable_mutation_v1();

create or replace function world_knowledge_private.authoring_place_type_candidate_allowed_v1(
  p_category text,
  p_place_types jsonb
) returns boolean language sql immutable set search_path='' as $$
  select pg_catalog.jsonb_typeof(p_place_types)='array'
    and pg_catalog.jsonb_array_length(p_place_types)>0
    and pg_catalog.jsonb_array_length(p_place_types)=(select count(distinct value) from pg_catalog.jsonb_array_elements_text(p_place_types) selected(value))
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements_text(p_place_types) selected(value)
      where selected.value <> all (
        case p_category
          when 'EAT' then array['RESTAURANT','BRASSERIE','BISTRO','BAR','PUB','SNACK_BAR','TAKEAWAY','FAST_FOOD','BAKERY','PATISSERIE','FOOD_HALL']::text[]
          when 'DRINKS' then array['BAR','PUB','BREWERY','TAPROOM','WINE_BAR','COCKTAIL_BAR','LOUNGE']::text[]
          when 'COFFEE_DAYTIME' then array['CAFE','BAKERY','PATISSERIE','BISTRO']::text[]
          when 'NIGHTLIFE' then array['NIGHTCLUB','MUSIC_CLUB','BAR','PUB','LOUNGE','CONCERT_VENUE']::text[]
          when 'CULTURE_ARTS' then array['MUSEUM','GALLERY','THEATRE','CINEMA','CONCERT_VENUE','CULTURAL_CENTRE','LIBRARY']::text[]
          when 'ENTERTAINMENT' then array['CINEMA','THEATRE','CONCERT_VENUE','COMEDY_CLUB','ARCADE','ESCAPE_ROOM','BOWLING_ALLEY']::text[]
          when 'ACTIVITIES_PLAY' then array['ARCADE','ESCAPE_ROOM','BOWLING_ALLEY','MINI_GOLF','WORKSHOP_STUDIO','AMUSEMENT_PARK']::text[]
          when 'SPORT_MOVEMENT' then array['GYM','SPORTS_CENTRE','CLIMBING_GYM','SWIMMING_POOL','ICE_RINK','SPORTS_COURT','STADIUM','YOGA_STUDIO']::text[]
          when 'OUTDOOR_NATURE' then array['PARK','TRAIL','VIEWPOINT','WATERFRONT','BOTANICAL_GARDEN','NATURE_RESERVE']::text[]
          when 'WELLNESS_RELAXATION' then array['SPA','SAUNA','THERMAL_BATH','MASSAGE_STUDIO','YOGA_STUDIO','SWIMMING_POOL']::text[]
          when 'SHOPPING_MARKETS' then array['SHOP','MARKET','SHOPPING_CENTRE','CONCEPT_STORE','SEASONAL_MARKET']::text[]
          when 'STAY' then array['HOTEL','HOSTEL','GUESTHOUSE','CAMPGROUND','HOLIDAY_APARTMENT']::text[]
          when 'COMMUNITY_SOCIAL' then array['COMMUNITY_CENTRE','COWORKING_SPACE','CLUBHOUSE','YOUTH_CENTRE','CULTURAL_CENTRE']::text[]
          when 'ATTRACTIONS_LANDMARKS' then array['LANDMARK','VIEWPOINT','ZOO','AQUARIUM','AMUSEMENT_PARK','VISITOR_CENTRE']::text[]
          when 'TEMPORARY_PLACES' then array['EVENT_VENUE','POP_UP','FESTIVAL_SITE','SEASONAL_MARKET']::text[]
          else array[]::text[]
        end
      )
    );
$$;

create or replace function public.world_authoring_submit_taxonomy_candidate_v1(
  p_spot_id uuid,
  p_attribute_key text,
  p_primary_category text,
  p_candidate_value jsonb,
  p_taxonomy_version text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid(); access jsonb; binding_id uuid; existing world_knowledge_private.authoring_taxonomy_candidates_v1%rowtype;
  current_category text; candidate_hash text;
begin
  access:=world_knowledge_private.authoring_actor_v1(p_spot_id);
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_attribute_key<>'classification.place_types' or p_taxonomy_version<>'backyrd.world-knowledge.authoring-taxonomy@4a.2' then raise exception 'taxonomy_candidate_contract_mismatch' using errcode='22023'; end if;
  if not (access->'allowedAttributeKeys') @> to_jsonb(array[p_attribute_key]) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  select c.value#>>'{}' into current_category from world_knowledge_private.claims c where c.spot_id=p_spot_id and c.attribute_key='classification.primary_category' and c.knowledge_state='KNOWN_VALUE' order by c.last_changed_at desc,c.id desc limit 1;
  if current_category is distinct from p_primary_category then raise exception 'taxonomy_candidate_category_conflict' using errcode='22023'; end if;
  if not world_knowledge_private.authoring_place_type_candidate_allowed_v1(p_primary_category,p_candidate_value) then raise exception 'invalid_taxonomy_candidate' using errcode='22023'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_idempotency_key' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,access->>'role');
  candidate_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',p_spot_id,'attributeKey',p_attribute_key,'primaryCategory',p_primary_category,'candidateValue',p_candidate_value,'taxonomyVersion',p_taxonomy_version,'actorBinding',binding_id,'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  select * into existing from world_knowledge_private.authoring_taxonomy_candidates_v1 c where c.actor_binding_id=binding_id and c.idempotency_key=p_idempotency_key;
  if found then
    if existing.candidate_hash<>candidate_hash then raise exception 'taxonomy_candidate_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('candidateId',existing.id,'created',false,'candidateHash',existing.candidate_hash,'engineAuthorized',false);
  end if;
  insert into world_knowledge_private.authoring_taxonomy_candidates_v1(spot_id,attribute_key,primary_category,candidate_value,taxonomy_version,actor_binding_id,idempotency_key,candidate_hash)
  values(p_spot_id,p_attribute_key,p_primary_category,p_candidate_value,p_taxonomy_version,binding_id,p_idempotency_key,candidate_hash) returning * into existing;
  return jsonb_build_object('candidateId',existing.id,'created',true,'candidateHash',existing.candidate_hash,'engineAuthorized',false);
end $$;

create or replace function public.world_authoring_get_taxonomy_candidates_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform world_knowledge_private.authoring_actor_v1(p_spot_id);
  select coalesce(jsonb_object_agg(attribute_key,jsonb_build_object('candidateId',id,'primaryCategory',primary_category,'value',candidate_value,'taxonomyVersion',taxonomy_version,'occurredAt',occurred_at,'engineAuthorized',false)),'{}'::jsonb)
    into result
  from (select distinct on (attribute_key) * from world_knowledge_private.authoring_taxonomy_candidates_v1 where spot_id=p_spot_id order by attribute_key,occurred_at desc,id desc) latest;
  return result;
end $$;

revoke execute on function public.world_authoring_submit_taxonomy_candidate_v1(uuid,text,text,jsonb,text,text),public.world_authoring_get_taxonomy_candidates_v1(uuid) from public,anon;
grant execute on function public.world_authoring_submit_taxonomy_candidate_v1(uuid,text,text,jsonb,text,text),public.world_authoring_get_taxonomy_candidates_v1(uuid) to authenticated;

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

revoke execute on function world_knowledge_private.category_place_types_allowed_v1(text,jsonb), world_knowledge_private.authoring_place_type_candidate_allowed_v1(text,jsonb), world_knowledge_private.validate_category_place_type_insert_v1() from public,anon,authenticated,service_role;

comment on function world_knowledge_private.category_place_types_allowed_v1(text,jsonb) is
  'Fail-closed Registry 1.1 category/place-type compatibility. Wider authoring candidates remain NOT_CONFIGURED.';
