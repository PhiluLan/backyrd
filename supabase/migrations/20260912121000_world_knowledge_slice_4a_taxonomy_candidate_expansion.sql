-- Slice 4A authoring readiness: preserve audited, non-canonical selections as
-- private review candidates. These rows never become claims or engine facts.

alter table world_knowledge_private.authoring_taxonomy_candidates_v1
  drop constraint authoring_taxonomy_candidates_v1_attribute_key_check;

alter table world_knowledge_private.authoring_taxonomy_candidates_v1
  add constraint authoring_taxonomy_candidates_v1_attribute_key_check check (
    attribute_key in (
      'classification.place_types',
      'offering.cuisines',
      'offering.food_specialities',
      'offering.groups',
      'amenity.features'
    )
  );

create or replace function world_knowledge_private.authoring_taxonomy_candidate_allowed_v1(
  p_attribute_key text,
  p_category text,
  p_values jsonb
) returns boolean language sql immutable set search_path='' as $$
  select pg_catalog.jsonb_typeof(p_values)='array'
    and pg_catalog.jsonb_array_length(p_values)>0
    and pg_catalog.jsonb_array_length(p_values)=(select count(distinct value) from pg_catalog.jsonb_array_elements_text(p_values) selected(value))
    and case p_attribute_key
      when 'classification.place_types' then world_knowledge_private.authoring_place_type_candidate_allowed_v1(p_category,p_values)
      when 'offering.cuisines' then p_category in ('EAT','DRINKS','COFFEE_DAYTIME','NIGHTLIFE','STAY','TEMPORARY_PLACES') and not exists (
        select 1 from pg_catalog.jsonb_array_elements_text(p_values) selected(value)
        where selected.value <> all (array['ITALIAN','INDIAN','SWISS','FRENCH','JAPANESE','MEDITERRANEAN','ASIAN','GERMAN','AUSTRIAN','SPANISH','PORTUGUESE','GREEK','TURKISH','LEVANTINE','MIDDLE_EASTERN','CHINESE','THAI','VIETNAMESE','KOREAN','INDONESIAN','MALAYSIAN','MEXICAN','LATIN_AMERICAN','AMERICAN','AFRICAN','ETHIOPIAN','MOROCCAN','INTERNATIONAL','FUSION','VEGETARIAN','VEGAN']::text[])
      )
      when 'offering.food_specialities' then p_category in ('EAT','DRINKS','COFFEE_DAYTIME','NIGHTLIFE','STAY','TEMPORARY_PLACES') and not exists (
        select 1 from pg_catalog.jsonb_array_elements_text(p_values) selected(value)
        where selected.value <> all (array['PIZZA','BURGER','SUSHI','PASTA','STEAK','SEAFOOD','RAMEN','CURRY','TACOS','KEBAB','FALAFEL','SANDWICHES','SALADS','SOUPS','BREAKFAST_DISHES','BRUNCH_DISHES','BAKED_GOODS','DESSERTS','ICE_CREAM','CHEESE','FONDUE','RACLETTE','TAPAS','DUMPLINGS','FRIED_CHICKEN','VEGETARIAN_DISHES','VEGAN_DISHES']::text[])
      )
      when 'offering.groups' then p_category in ('EAT','DRINKS','COFFEE_DAYTIME','NIGHTLIFE','STAY','TEMPORARY_PLACES') and not exists (
        select 1 from pg_catalog.jsonb_array_elements_text(p_values) selected(value)
        where selected.value <> all (array['BEER','WINE','COCKTAILS','NON_ALCOHOLIC_DRINKS','COFFEE','TEA','SPIRITS','CRAFT_BEER','NATURAL_WINE','SNACKS','FULL_MEALS','TAKEAWAY_MEALS','BAKED_GOODS','DESSERTS','TASTING_MENU','BREAKFAST','BRUNCH','LUNCH','DINNER','LATE_NIGHT_FOOD']::text[])
      )
      when 'amenity.features' then not exists (
        select 1 from pg_catalog.jsonb_array_elements_text(p_values) selected(value)
        where selected.value <> all (array['WIFI','POWER_OUTLETS','WORK_TABLES','TOILET','CLOAKROOM','LOCKERS','CHANGING_ROOM','SHOWER','PARKING','BICYCLE_PARKING','PUBLIC_TRANSPORT_NEARBY','HIGH_CHAIR','STROLLER_SPACE','CHANGING_TABLE','PLAY_AREA','TERRACE','GARDEN','OUTDOOR_SEATING','COVERED_OUTDOOR','HEATED_OUTDOOR','WATER_BOWL','LIVE_MUSIC_EQUIPMENT','PRIVATE_ROOM','DANCE_FLOOR']::text[])
      )
      else false
    end;
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
  if p_attribute_key not in ('classification.place_types','offering.cuisines','offering.food_specialities','offering.groups','amenity.features')
     or p_taxonomy_version<>'backyrd.world-knowledge.authoring-taxonomy@4a.2'
  then raise exception 'taxonomy_candidate_contract_mismatch' using errcode='22023'; end if;
  if not (access->'allowedAttributeKeys') @> to_jsonb(array[p_attribute_key]) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  select c.value#>>'{}' into current_category from world_knowledge_private.claims c where c.spot_id=p_spot_id and c.attribute_key='classification.primary_category' and c.knowledge_state='KNOWN_VALUE' order by c.last_changed_at desc,c.id desc limit 1;
  if current_category is distinct from p_primary_category then raise exception 'taxonomy_candidate_category_conflict' using errcode='22023'; end if;
  if not world_knowledge_private.authoring_taxonomy_candidate_allowed_v1(p_attribute_key,p_primary_category,p_candidate_value) then raise exception 'invalid_taxonomy_candidate' using errcode='22023'; end if;
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

revoke execute on function world_knowledge_private.authoring_taxonomy_candidate_allowed_v1(text,text,jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.world_authoring_submit_taxonomy_candidate_v1(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.world_authoring_submit_taxonomy_candidate_v1(uuid,text,text,jsonb,text,text) to authenticated;

comment on function world_knowledge_private.authoring_taxonomy_candidate_allowed_v1(text,text,jsonb) is
  'Fail-closed allowlist for private Slice 4A taxonomy review candidates. It does not authorize World facts.';
