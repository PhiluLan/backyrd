-- World Knowledge Slice 4A authoring product-readiness registry release.
-- This is a forward-only local/non-Production contract migration. Registry 1.1
-- and all historical Claims remain immutable and independently validatable.

alter table world_knowledge_private.attribute_definitions
  drop constraint attribute_definitions_value_type_check;
alter table world_knowledge_private.attribute_definitions
  add constraint attribute_definitions_value_type_check check (value_type in (
    'TEXT','EMAIL','URL','PHONE','COUNTRY_CODE','IANA_TIMEZONE','DECIMAL','BOOLEAN',
    'ENUM','ENUM_SET','MONEY_RANGE','INTEGER','INTEGER_RANGE','RESERVATION_RULE',
    'CONSUMPTION_RULE','PET_ACCESS_RULE','AGE_ACCESS_RULE','AGE_ACCESS_RULE_V2',
    'WEEKLY_SCHEDULE','SPECIAL_HOURS','CURRENT_STATE'
  ));

insert into world_knowledge_private.registry_releases(
  registry_version,registry_hash,predecessor_version,change_class,definitions,
  release_hash,approved_at,created_at
) values (
  'backyrd.world-knowledge.registry@2.0',
  'e93a7399c41535f7da2987c46343fbe82d1e3c07bca345b076d604f8d39f5a72',
  'backyrd.world-knowledge.registry@1.1','SEMANTIC_CHANGE',
  jsonb_build_array(
    jsonb_build_object('summary','Expanded objective authoring taxonomy; full definitions remain in attribute_definitions'),
    jsonb_build_object('addedKeys',jsonb_build_array('hours.kitchen_special','rule.age_access_conditions')),
    jsonb_build_object('historyPreserved',true)
  ),
  '4a69a738d55e4787df2ccae37029891385bb422139b5547018424b708064754e',
  '2026-09-12T10:00:00Z','2026-09-12T10:00:00Z'
);

insert into world_knowledge_private.attribute_definitions(
  registry_version,attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization
)
select
  'backyrd.world-knowledge.registry@2.0',attribute_key,value_type,
  case attribute_key
    when 'classification.place_types' then '["RESTAURANT","BRASSERIE","BISTRO","CAFE","BAR","PUB","SNACK_BAR","TAKEAWAY","FAST_FOOD","BAKERY","PATISSERIE","FOOD_HALL","BREWERY","TAPROOM","WINE_BAR","COCKTAIL_BAR","NIGHTCLUB","MUSIC_CLUB","LOUNGE","MUSEUM","GALLERY","THEATRE","CINEMA","CONCERT_VENUE","CULTURAL_CENTRE","LIBRARY","COMEDY_CLUB","ARCADE","ESCAPE_ROOM","BOWLING_ALLEY","MINI_GOLF","WORKSHOP_STUDIO","AMUSEMENT_PARK","GYM","SPORTS_CENTRE","CLIMBING_GYM","SWIMMING_POOL","ICE_RINK","SPORTS_COURT","STADIUM","PARK","TRAIL","VIEWPOINT","WATERFRONT","BOTANICAL_GARDEN","NATURE_RESERVE","SPA","SAUNA","THERMAL_BATH","MASSAGE_STUDIO","YOGA_STUDIO","SHOP","MARKET","SHOPPING_CENTRE","CONCEPT_STORE","HOTEL","HOSTEL","GUESTHOUSE","CAMPGROUND","HOLIDAY_APARTMENT","COMMUNITY_CENTRE","COWORKING_SPACE","CLUBHOUSE","YOUTH_CENTRE","LANDMARK","ZOO","AQUARIUM","VISITOR_CENTRE","EVENT_VENUE","POP_UP","FESTIVAL_SITE","SEASONAL_MARKET","OTHER_PLACE"]'::jsonb
    when 'offering.cuisines' then '["ITALIAN","INDIAN","SWISS","FRENCH","JAPANESE","MEDITERRANEAN","ASIAN","GERMAN","AUSTRIAN","SPANISH","PORTUGUESE","GREEK","TURKISH","LEVANTINE","MIDDLE_EASTERN","CHINESE","THAI","VIETNAMESE","KOREAN","INDONESIAN","MALAYSIAN","MEXICAN","LATIN_AMERICAN","AMERICAN","AFRICAN","ETHIOPIAN","MOROCCAN","INTERNATIONAL","FUSION","VEGETARIAN","VEGAN"]'::jsonb
    when 'offering.food_specialities' then '["PIZZA","BURGER","SUSHI","PASTA","STEAK","SEAFOOD","RAMEN","CURRY","TACOS","KEBAB","FALAFEL","SANDWICHES","SALADS","SOUPS","BREAKFAST_DISHES","BRUNCH_DISHES","BAKED_GOODS","DESSERTS","ICE_CREAM","CHEESE","FONDUE","RACLETTE","TAPAS","DUMPLINGS","FRIED_CHICKEN","VEGETARIAN_DISHES","VEGAN_DISHES"]'::jsonb
    when 'offering.groups' then '["BEER","WINE","COCKTAILS","NON_ALCOHOLIC_DRINKS","COFFEE","TEA","SPIRITS","CRAFT_BEER","NATURAL_WINE","SNACKS","FULL_MEALS","TAKEAWAY_MEALS","BAKED_GOODS","DESSERTS","TASTING_MENU","BREAKFAST","BRUNCH","LUNCH","DINNER","LATE_NIGHT_FOOD"]'::jsonb
    when 'amenity.features' then '["WIFI","POWER_OUTLETS","TOILET","HIGH_CHAIR","STROLLER_SPACE","TERRACE","GARDEN","OUTDOOR_SEATING","WATER_BOWL","WORK_TABLES","CLOAKROOM","LOCKERS","CHANGING_ROOM","SHOWER","PARKING","BICYCLE_PARKING","PUBLIC_TRANSPORT_NEARBY","CHANGING_TABLE","PLAY_AREA","COVERED_OUTDOOR","HEATED_OUTDOOR","LIVE_MUSIC_EQUIPMENT","PRIVATE_ROOM","DANCE_FLOOR"]'::jsonb
    else allowed_values
  end,
  minimum,maximum,engine_authorization
from world_knowledge_private.attribute_definitions
where registry_version='backyrd.world-knowledge.registry@1.1';

insert into world_knowledge_private.attribute_definitions(
  registry_version,attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization
) values
  ('backyrd.world-knowledge.registry@2.0','rule.age_access_conditions','AGE_ACCESS_RULE_V2',null,null,null,'AUTHORIZED'),
  ('backyrd.world-knowledge.registry@2.0','hours.kitchen_special','SPECIAL_HOURS',null,null,null,'AUTHORIZED');

insert into world_knowledge_private.governance_approval_records(
  registry_version,authority_class,authority_reference,approved_at,record_hash
) values (
  'backyrd.world-knowledge.registry@2.0','PRODUCT_CTO',
  'accepted:slice-4a-authoring-product-readiness','2026-09-12T10:00:00Z',
  '8f7db3955ed51a2d1b6e6e883f0388432ab054bd0264f2249a9757993922a01d'
);

insert into world_knowledge_private.source_policy_releases(
  policy_version,policy_hash,registry_version,registry_hash,policy,state,approved_at
) values (
  'backyrd.world-knowledge.source-policy@4a.2',
  'e5d5150620de1192ab9829832ce0de0be4583342b6620d83ad193429a3fcf271',
  'backyrd.world-knowledge.registry@2.0',
  'e93a7399c41535f7da2987c46343fbe82d1e3c07bca345b076d604f8d39f5a72',
  jsonb_build_object(
    'ownerMethod','OWNER_CONFIRMED','adminMethod','ADMIN_CONFIRMED',
    'missing','ABSENT_NOT_FALSE','currentStateValidUntilRequired',true,
    'subscriptionInfluence','AUTHORING_SCOPE_ONLY'
  ),'ACCEPTED','2026-09-12T10:00:00Z'
);

insert into world_knowledge_private.source_policy_attribute_rules(
  policy_version,attribute_key,allowed_source_types,allowed_actor_types,
  source_reference_requirement,self_assertion_allowed,verification_process_ids,
  freshness_policy_ref,allowed_use_cases
)
select 'backyrd.world-knowledge.source-policy@4a.2',attribute_key,
  case when attribute_key='research.subjective_fits' then array['USER_REPORT'] else array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'] end,
  case when attribute_key='research.subjective_fits' then array['PUBLIC_CONTRIBUTOR'] else array['VERIFIED_OWNER','ADMIN'] end,
  'REQUIRED',attribute_key<>'research.subjective_fits',
  case when attribute_key='research.subjective_fits' then '{}'::text[] else array['process:owner-confirmed','process:admin-confirmed'] end,
  case
    when attribute_key='state.current' then 'freshness:current-state:explicit-valid-until'
    when attribute_key in ('hours.special','hours.kitchen_special') then 'freshness:special-hours:date-bound'
    when attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed'
    else 'freshness:durable-until-contradicted'
  end,
  case
    when attribute_key like 'contact.%' then array['GENERAL_WORLD','EXPLANATION','RESEARCH']
    when attribute_key in ('description.highlight','research.subjective_fits') then array['EXPLANATION','RESEARCH']
    when attribute_key like 'hours.%' or attribute_key='state.current' then array['GENERAL_WORLD','OPENING_HOURS_ELIGIBILITY','RESEARCH']
    when attribute_key in ('operation.price_level','operation.price_range') then array['GENERAL_WORLD','PRICE','RESEARCH']
    when attribute_key like 'accessibility.%' then array['GENERAL_WORLD','ACCESSIBILITY','HARD_CONSTRAINTS','RESEARCH']
    when attribute_key in ('operation.takeaway','rule.reservation','rule.external_food','rule.external_drink','rule.age_access','rule.age_access_conditions','rule.pet_access') then array['GENERAL_WORLD','HARD_CONSTRAINTS','RESEARCH']
    else array['GENERAL_WORLD','DISCOVERY','RESEARCH']
  end
from world_knowledge_private.attribute_definitions
where registry_version='backyrd.world-knowledge.registry@2.0';

insert into world_knowledge_private.entitlement_policy_releases(
  policy_version,policy_hash,registry_version,policy,state,approved_at
) values (
  'backyrd.world-knowledge.entitlement-policy@4a.2',
  'ddf6efe0ad071cf26f5ee7526e0c29145d73cf4612a8fc0e4a7f0a5a9ef8495d',
  'backyrd.world-knowledge.registry@2.0',
  jsonb_build_object('commercialInfluence','AUTHORING_SCOPE_ONLY'),
  'ACCEPTED','2026-09-12T10:00:00Z'
);

insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@4a.2','OWNER_BASIC',attribute_key
from world_knowledge_private.attribute_definitions
where registry_version='backyrd.world-knowledge.registry@2.0' and attribute_key in (
  'identity.name','location.address_line1','location.locality','location.neighborhood',
  'location.country_code','location.latitude','location.longitude','location.timezone',
  'classification.primary_category','classification.place_types','contact.public_email',
  'contact.website','contact.phone','contact.instagram','contact.facebook','contact.linkedin',
  'contact.tiktok','description.highlight','operation.price_level','operation.payment_methods',
  'operation.takeaway','operation.service_model','operation.service_format','offering.cuisines',
  'offering.food_specialities','offering.groups','hours.regular','hours.special','hours.kitchen',
  'hours.kitchen_special','state.current'
);

insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@4a.2','OWNER_PRO',attribute_key
from world_knowledge_private.attribute_definitions
where registry_version='backyrd.world-knowledge.registry@2.0'
  and (engine_authorization='AUTHORIZED' or attribute_key='description.highlight')
  and attribute_key not in ('operation.price_range','rule.age_access');

insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@4a.2','ADMIN',attribute_key
from world_knowledge_private.entitlement_attribute_rules
where policy_version='backyrd.world-knowledge.entitlement-policy@4a.2' and actor_scope='OWNER_PRO';

create or replace function world_knowledge_private.attribute_value_valid_v2(
  p_registry_version text,p_attribute_key text,p_state text,p_value jsonb
) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare definition world_knowledge_private.attribute_definitions%rowtype; rule jsonb; item jsonb;
begin
  select * into definition from world_knowledge_private.attribute_definitions
  where registry_version=p_registry_version and attribute_key=p_attribute_key;
  if not found then return false; end if;
  if definition.value_type<>'AGE_ACCESS_RULE_V2' then
    return world_knowledge_private.attribute_value_valid_v1(p_registry_version,p_attribute_key,p_state,p_value);
  end if;
  if p_state='UNKNOWN' then return p_value is null; end if;
  if p_state<>'KNOWN_VALUE' or jsonb_typeof(p_value)<>'object'
     or (select count(*) from jsonb_object_keys(p_value))<>2
     or not p_value ?& array['rules','notes']
     or jsonb_typeof(p_value->'rules')<>'array'
     or jsonb_array_length(p_value->'rules') not between 1 and 12
     or (p_value->'notes'<>'null'::jsonb and (jsonb_typeof(p_value->'notes')<>'string' or length(p_value->>'notes') not between 1 and 500))
  then return false; end if;
  for rule in select value from jsonb_array_elements(p_value->'rules') loop
    if jsonb_typeof(rule)<>'object'
       or (select count(*) from jsonb_object_keys(rule))<>7
       or not rule ?& array['mode','minimumAge','accompaniment','appliesFromTime','days','area','event']
       or coalesce(rule->>'mode','') not in ('NO_MINIMUM','GENERAL_MINIMUM','UNACCOMPANIED_MINIMUM')
       or coalesce(rule->>'accompaniment','') not in ('NONE','ADULT','LEGAL_GUARDIAN')
       or jsonb_typeof(rule->'days')<>'array' or jsonb_array_length(rule->'days')>7
       or (rule->'minimumAge'<>'null'::jsonb and (jsonb_typeof(rule->'minimumAge')<>'number' or (rule->>'minimumAge')::numeric<>trunc((rule->>'minimumAge')::numeric) or (rule->>'minimumAge')::numeric not between 0 and 120))
       or (rule->'appliesFromTime'<>'null'::jsonb and rule->>'appliesFromTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       or (rule->'area'<>'null'::jsonb and (jsonb_typeof(rule->'area')<>'string' or length(rule->>'area') not between 1 and 120))
       or (rule->'event'<>'null'::jsonb and (jsonb_typeof(rule->'event')<>'string' or length(rule->>'event') not between 1 and 160))
    then return false; end if;
    if rule->>'mode'='NO_MINIMUM' and (rule->'minimumAge'<>'null'::jsonb or rule->>'accompaniment'<>'NONE') then return false; end if;
    if rule->>'mode'='GENERAL_MINIMUM' and (rule->'minimumAge'='null'::jsonb or rule->>'accompaniment'<>'NONE') then return false; end if;
    if rule->>'mode'='UNACCOMPANIED_MINIMUM' and (rule->'minimumAge'='null'::jsonb or rule->>'accompaniment'='NONE') then return false; end if;
    for item in select value from jsonb_array_elements(rule->'days') loop
      if jsonb_typeof(item)<>'string' or item#>>'{}' not in ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') then return false; end if;
    end loop;
    if (select count(*)<>count(distinct value) from jsonb_array_elements(rule->'days')) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function world_knowledge_private.validate_claim_insert_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.registry_version='backyrd.world-knowledge.registry@2.0'
     and not world_knowledge_private.attribute_value_valid_v2(new.registry_version,new.attribute_key,new.knowledge_state,new.value)
  then raise exception 'invalid_attribute_value' using errcode='22023'; end if;
  return new;
end $$;
create trigger world_00_validate_claim_insert_v2
before insert on world_knowledge_private.claims
for each row execute function world_knowledge_private.validate_claim_insert_v2();

create or replace function world_knowledge_private.category_place_types_allowed_v1(
  p_category text,p_place_types jsonb
) returns boolean language sql immutable set search_path='' as $$
  select world_knowledge_private.authoring_place_type_candidate_allowed_v1(p_category,p_place_types)
    or (p_category='OTHER' and pg_catalog.jsonb_typeof(p_place_types)='array'
        and pg_catalog.jsonb_array_length(p_place_types)>0
        and not exists(select 1 from pg_catalog.jsonb_array_elements_text(p_place_types) item(value) where item.value<>'OTHER_PLACE'));
$$;

alter table world_knowledge_private.authoring_applicability_events_v1
  drop constraint authoring_applicability_events_v1_registry_version_check;
alter table world_knowledge_private.authoring_applicability_events_v1
  alter column registry_version set default 'backyrd.world-knowledge.registry@2.0';
alter table world_knowledge_private.authoring_applicability_events_v1
  add constraint authoring_applicability_events_v1_registry_version_check
  check (registry_version in ('backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.registry@2.0'));

create or replace function world_knowledge_private.authoring_actor_v1(p_spot_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); actor_role text; entitlement text; allowed_keys jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if public.is_admin_v1(actor_id) then actor_role:='ADMIN'; entitlement:='ADMIN';
  elsif p_spot_id is not null and exists(select 1 from public.spots s where s.id=p_spot_id and s.owner_id=actor_id) then
    actor_role:='VERIFIED_OWNER';
    entitlement:=case when exists(
      select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1 e
      where e.spot_id=p_spot_id and e.owner_id=actor_id and e.tier='PREMIUM'
        and e.valid_from<=pg_catalog.clock_timestamp()
        and (e.valid_until is null or e.valid_until>pg_catalog.clock_timestamp())
    ) then 'OWNER_PRO' else 'OWNER_BASIC' end;
  else raise exception 'world_authoring_scope_denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(r.attribute_key order by r.attribute_key),'[]'::jsonb) into allowed_keys
  from world_knowledge_private.entitlement_attribute_rules r
  where r.policy_version='backyrd.world-knowledge.entitlement-policy@4a.2' and r.actor_scope=entitlement;
  return jsonb_build_object('role',actor_role,'entitlement',entitlement,'allowedAttributeKeys',allowed_keys);
end $$;

revoke execute on function world_knowledge_private.attribute_value_valid_v2(text,text,text,jsonb),world_knowledge_private.validate_claim_insert_v2() from public,anon,authenticated,service_role;

comment on function world_knowledge_private.attribute_value_valid_v2(text,text,text,jsonb) is
  'Fail-closed Registry 2.0 runtime boundary. Historical Registry 1.1 validation is unchanged.';
comment on table world_knowledge_private.registry_releases is
  'Append-only registry history. Registry 2.0 expands objective authoring values and adds scoped age and special-kitchen-hours contracts; no Production activation.';

create or replace function world_knowledge_private.submit_authoritative_claim_v2(
  p_actor_type text,p_spot_id uuid,p_attribute_key text,p_knowledge_state text,
  p_value jsonb,p_observed_at timestamptz,p_valid_from timestamptz,
  p_valid_until timestamptz,p_visibility text,p_supersedes_claim_id uuid,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid(); entitlement_scope text; binding_id uuid; source_id uuid;
  v_claim_id uuid; content_hash text; method text; authority text;
  prior world_knowledge_private.claims%rowtype; shadow_hold boolean;
  checked_at_value timestamptz; freshness_ref text; reason_values text[];
  verification_hash text;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_actor_type='VERIFIED_OWNER' then
    if not exists(select 1 from public.spots where id=p_spot_id and owner_id=actor_id) then raise exception 'spot_owner_required' using errcode='42501'; end if;
    entitlement_scope:=case when exists(
      select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1
      where spot_id=p_spot_id and owner_id=actor_id and tier='PREMIUM'
        and valid_from<=pg_catalog.clock_timestamp()
        and (valid_until is null or valid_until>pg_catalog.clock_timestamp())
    ) then 'OWNER_PRO' else 'OWNER_BASIC' end;
    method:='OWNER_CONFIRMED'; authority:='SERVER_BOUND_OWNER_WRITE';
  elsif p_actor_type='ADMIN' then
    if not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
    entitlement_scope:='ADMIN'; method:='ADMIN_CONFIRMED'; authority:='SERVER_BOUND_ADMIN_WRITE';
  else raise exception 'invalid_authoritative_actor' using errcode='22023';
  end if;
  if not exists(
    select 1 from world_knowledge_private.entitlement_attribute_rules
    where policy_version='backyrd.world-knowledge.entitlement-policy@4a.2'
      and actor_scope=entitlement_scope and attribute_key=p_attribute_key
  ) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  if p_observed_at is null or p_observed_at>pg_catalog.clock_timestamp()+interval '60 seconds' then raise exception 'invalid_observed_at' using errcode='22023'; end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from then raise exception 'invalid_validity_window' using errcode='22023'; end if;
  if p_attribute_key='state.current' and p_valid_until is null then raise exception 'current_state_valid_until_required' using errcode='22023'; end if;
  if p_visibility not in ('PUBLIC','INTERNAL') or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_claim_metadata' using errcode='22023'; end if;
  if not world_knowledge_private.attribute_value_valid_v2('backyrd.world-knowledge.registry@2.0',p_attribute_key,p_knowledge_state,p_value) then raise exception 'invalid_attribute_value' using errcode='22023'; end if;
  if p_supersedes_claim_id is not null then
    select * into prior from world_knowledge_private.claims where id=p_supersedes_claim_id;
    if not found or prior.spot_id<>p_spot_id or prior.attribute_key<>p_attribute_key then raise exception 'invalid_supersedes_claim' using errcode='22023'; end if;
  end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,p_actor_type);
  content_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'spotId',p_spot_id,'key',p_attribute_key,'state',p_knowledge_state,'value',p_value,
    'actorBinding',binding_id,'observedAt',p_observed_at,'validFrom',p_valid_from,
    'validUntil',p_valid_until,'supersedes',p_supersedes_claim_id,
    'registry','backyrd.world-knowledge.registry@2.0',
    'policy','backyrd.world-knowledge.source-policy@4a.2'
  )::text,'UTF8'),'sha256'),'hex');
  select id into v_claim_id from world_knowledge_private.claims
  where actor_binding_id=binding_id and idempotency_key=p_idempotency_key;
  if found then
    if (select c.content_hash from world_knowledge_private.claims c where c.id=v_claim_id)<>content_hash then raise exception 'claim_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('claimId',v_claim_id,'created',false);
  end if;
  insert into world_knowledge_private.source_references(spot_id,source_type,visibility,source_hash)
  values(
    p_spot_id,case when p_actor_type='ADMIN' then 'ADMIN_OBSERVATION' else 'OWNER_ASSERTION' end,'INTERNAL',
    encode(extensions.digest(pg_catalog.convert_to(binding_id::text||':'||p_idempotency_key,'UTF8'),'sha256'),'hex')
  ) returning id into source_id;
  shadow_hold:=world_knowledge_private.text_requires_shadow_v1(p_attribute_key,p_value);
  insert into world_knowledge_private.claims(
    idempotency_key,spot_id,registry_version,policy_version,attribute_key,knowledge_state,value,
    actor_binding_id,actor_type,source_reference_id,source_type,observed_at,valid_from,
    valid_until,last_changed_at,stance,visibility,supersedes_claim_id,content_hash
  ) values (
    p_idempotency_key,p_spot_id,'backyrd.world-knowledge.registry@2.0',
    'backyrd.world-knowledge.source-policy@4a.2',p_attribute_key,p_knowledge_state,p_value,
    binding_id,p_actor_type,source_id,case when p_actor_type='ADMIN' then 'ADMIN_OBSERVATION' else 'OWNER_ASSERTION' end,
    p_observed_at,p_valid_from,p_valid_until,pg_catalog.clock_timestamp(),'SUPPORTS',
    case when shadow_hold then 'SHADOW_HELD' else p_visibility end,p_supersedes_claim_id,content_hash
  ) returning id into v_claim_id;
  checked_at_value:=pg_catalog.clock_timestamp();
  freshness_ref:=case
    when p_attribute_key='state.current' then 'freshness:current-state:explicit-valid-until'
    when p_attribute_key in ('hours.special','hours.kitchen_special') then 'freshness:special-hours:date-bound'
    when p_attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed'
    else 'freshness:durable-until-contradicted'
  end;
  reason_values:=array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'];
  verification_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'claimId',v_claim_id,'claimHash',content_hash,'spotId',p_spot_id,'attributeKey',p_attribute_key,
    'scope','SPOT','policyVersion','backyrd.world-knowledge.source-policy@4a.2','method',method,
    'authority',authority,'verifierBinding',binding_id,'result','VERIFIED',
    'checkedAt',checked_at_value,'reverificationPolicyRef',freshness_ref,'reasonCodes',to_jsonb(reason_values)
  )::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.verification_records(
    claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,
    execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,
    reason_codes,result_hash
  ) values (
    v_claim_id,content_hash,p_spot_id,p_attribute_key,'SPOT',
    'backyrd.world-knowledge.source-policy@4a.2',method,authority,binding_id,'VERIFIED',
    checked_at_value,freshness_ref,reason_values,verification_hash
  );
  if shadow_hold then
    insert into world_knowledge_private.review_work_items(
      spot_id,work_class,priority,attribute_key,candidate_payload,reason_codes
    ) values (p_spot_id,'CONTENT_SAFETY','HIGH',p_attribute_key,jsonb_build_object('claimId',v_claim_id),array['NEW_TEXT_SHADOW_HELD']);
  end if;
  if exists(
    select 1 from world_knowledge_private.claims c
    join world_knowledge_private.verification_records v on v.claim_id=c.id and v.result='VERIFIED'
    where c.spot_id=p_spot_id and c.attribute_key=p_attribute_key and c.id<>v_claim_id
      and c.value is distinct from p_value
      and c.observed_at between p_observed_at-interval '5 minutes' and p_observed_at+interval '5 minutes'
  ) then
    insert into world_knowledge_private.review_work_items(
      spot_id,work_class,priority,attribute_key,candidate_payload,reason_codes
    ) values (p_spot_id,'AUTHORITY_CONFLICT','HIGH',p_attribute_key,jsonb_build_object('claimId',v_claim_id),array['CONCURRENT_AUTHORITATIVE_CONFLICT']);
  end if;
  return jsonb_build_object('claimId',v_claim_id,'created',true,'verificationMethod',method,'visibility',case when shadow_hold then 'SHADOW_HELD' else p_visibility end);
end $$;

create or replace function public.world_owner_submit_claim_v1(
  p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_observed_at timestamptz,p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',
  p_supersedes_claim_id uuid default null,p_idempotency_key text default null
) returns jsonb language sql security definer set search_path='' as $$
  select world_knowledge_private.submit_authoritative_claim_v2(
    'VERIFIED_OWNER',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key
  );
$$;

create or replace function public.world_admin_submit_claim_v1(
  p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_observed_at timestamptz,p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',
  p_supersedes_claim_id uuid default null,p_idempotency_key text default null
) returns jsonb language sql security definer set search_path='' as $$
  select world_knowledge_private.submit_authoritative_claim_v2(
    'ADMIN',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key
  );
$$;

revoke execute on function world_knowledge_private.submit_authoritative_claim_v2(text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) to authenticated;

create or replace function world_knowledge_private.validate_verification_insert_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  claim world_knowledge_private.claims%rowtype;
  binding world_knowledge_private.actor_bindings%rowtype;
  expected_freshness_ref text;
  expected_hash text;
begin
  select * into claim from world_knowledge_private.claims where id=new.claim_id;
  select * into binding from world_knowledge_private.actor_bindings where id=new.verifier_binding_id;
  if claim.id is null or binding.id is null or new.claim_hash<>claim.content_hash
     or new.spot_id<>claim.spot_id or new.attribute_key<>claim.attribute_key
     or new.scope<>claim.scope or new.policy_version<>claim.policy_version
     or new.checked_at<claim.observed_at
     or new.checked_at>pg_catalog.clock_timestamp()+interval '60 seconds'
  then raise exception 'verification_binding_invalid' using errcode='22023'; end if;
  expected_freshness_ref:=case
    when claim.attribute_key='state.current' then 'freshness:current-state:explicit-valid-until'
    when claim.attribute_key in ('hours.special','hours.kitchen_special') then 'freshness:special-hours:date-bound'
    when claim.attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed'
    else 'freshness:durable-until-contradicted'
  end;
  if new.reverification_policy_ref<>expected_freshness_ref
     or new.reason_codes<>array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[]
     or new.result<>'VERIFIED'
  then raise exception 'verification_policy_binding_invalid' using errcode='22023'; end if;
  if new.verification_method='OWNER_CONFIRMED' then
    if new.execution_authority<>'SERVER_BOUND_OWNER_WRITE' or binding.actor_type<>'VERIFIED_OWNER'
       or binding.actor_id is null or claim.actor_type<>'VERIFIED_OWNER'
       or claim.actor_binding_id<>binding.id
       or not exists(select 1 from public.spots s where s.id=claim.spot_id and s.owner_id=binding.actor_id)
    then raise exception 'verification_authority_invalid' using errcode='42501'; end if;
  elsif new.verification_method='ADMIN_CONFIRMED' then
    if new.execution_authority<>'SERVER_BOUND_ADMIN_WRITE' or binding.actor_type<>'ADMIN'
       or binding.actor_id is null or claim.actor_type<>'ADMIN' or claim.actor_binding_id<>binding.id
       or not public.is_admin_v1(binding.actor_id)
    then raise exception 'verification_authority_invalid' using errcode='42501'; end if;
  else raise exception 'independent_process_authority_not_configured' using errcode='42501';
  end if;
  if claim.source_type='AI_INFERENCE' and new.result='VERIFIED' then raise exception 'ai_cannot_self_verify' using errcode='42501'; end if;
  expected_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'claimId',new.claim_id,'claimHash',new.claim_hash,'spotId',new.spot_id,
    'attributeKey',new.attribute_key,'scope',new.scope,'policyVersion',new.policy_version,
    'method',new.verification_method,'authority',new.execution_authority,
    'verifierBinding',new.verifier_binding_id,'result',new.result,'checkedAt',new.checked_at,
    'reverificationPolicyRef',new.reverification_policy_ref,'reasonCodes',to_jsonb(new.reason_codes)
  )::text,'UTF8'),'sha256'),'hex');
  if new.result_hash<>expected_hash then raise exception 'verification_result_hash_mismatch' using errcode='22023'; end if;
  return new;
end $$;

revoke execute on function world_knowledge_private.validate_verification_insert_v1() from public,anon,authenticated,service_role;
create or replace function world_knowledge_private.resolution_input_components_v2(p_spot_id uuid,p_as_of timestamptz,p_ledger_cutoff_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare registry_record world_knowledge_private.registry_releases%rowtype; policy_record world_knowledge_private.source_policy_releases%rowtype; attribute_policy jsonb; attribute_policy_hash text;
begin
  select * into strict registry_record from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@2.0';
  select * into strict policy_record from world_knowledge_private.source_policy_releases where policy_version='backyrd.world-knowledge.source-policy@4a.2' and state='ACCEPTED' and registry_version=registry_record.registry_version and registry_hash=registry_record.registry_hash;
  select coalesce(jsonb_agg(jsonb_build_object(
    'attributeKey',r.attribute_key,'allowedSourceTypes',to_jsonb(r.allowed_source_types),'allowedActorTypes',to_jsonb(r.allowed_actor_types),
    'sourceReferenceRequirement',r.source_reference_requirement,'selfAssertionAllowed',r.self_assertion_allowed,
    'verificationProcessIds',to_jsonb(r.verification_process_ids),'freshnessPolicyRef',r.freshness_policy_ref,
    'allowedUseCases',to_jsonb(r.allowed_use_cases)
  ) order by r.attribute_key),'[]'::jsonb) into attribute_policy
  from world_knowledge_private.source_policy_attribute_rules r where r.policy_version=policy_record.policy_version;
  attribute_policy_hash:=encode(extensions.digest(pg_catalog.convert_to(attribute_policy::text,'UTF8'),'sha256'),'hex');
  return jsonb_build_object(
    'spotId',p_spot_id,'asOf',p_as_of,
    'claims',(select coalesce(jsonb_agg(jsonb_build_object('claimId',c.id,'claimHash',c.content_hash) order by c.id),'[]'::jsonb) from world_knowledge_private.claims c where c.spot_id=p_spot_id and c.observed_at<=p_as_of and c.created_at<=p_ledger_cutoff_at),
    'verifications',(select coalesce(jsonb_agg(jsonb_build_object('verificationId',v.id,'verificationHash',v.result_hash) order by v.id),'[]'::jsonb) from world_knowledge_private.verification_records v join world_knowledge_private.claims c on c.id=v.claim_id where c.spot_id=p_spot_id and c.created_at<=p_ledger_cutoff_at and v.created_at<=p_ledger_cutoff_at and v.checked_at<=p_as_of),
    'registry',jsonb_build_object('version',registry_record.registry_version,'registryHash',registry_record.registry_hash,'releaseHash',registry_record.release_hash),
    'sourcePolicy',jsonb_build_object('version',policy_record.policy_version,'releaseHash',policy_record.policy_hash,'attributePolicyHash',attribute_policy_hash),
    'resolver',jsonb_build_object('contract','backyrd.world-knowledge.shadow-resolver@1.0','version','2.0.0'),
    'conflictPolicyRef','conflict:latest-authoritative-change-review@3b.1',
    'freshnessPolicyRef','freshness:attribute-policy-bound@3b.1',
    'shadowPolicyRef','shadow:excluded-inputs-bind-manifest@3b.1'
  );
exception when no_data_found then raise exception 'resolver_release_not_accepted' using errcode='22023';
end $$;

create or replace function public.world_shadow_rebuild_spot_v1(p_spot_id uuid,p_as_of timestamptz,p_mode text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_registry_version constant text:='backyrd.world-knowledge.registry@2.0'; v_policy_version constant text:='backyrd.world-knowledge.source-policy@4a.2';
  v_resolver_contract constant text:='backyrd.world-knowledge.shadow-resolver@1.0'; v_resolver_version constant text:='2.0.0';
  v_cutoff timestamptz; v_components jsonb; v_input_hash text; v_request_hash text; v_resolution_hash text; v_manifest_hash text;
  v_manifest_id uuid; job world_knowledge_private.rebuild_jobs%rowtype; current_pointer world_knowledge_private.current_projection_pointers%rowtype;
  snapshot jsonb; decision jsonb; stored jsonb; pointer_updated boolean:=false; manifest_reused boolean:=false;
begin
  if p_mode not in ('FULL','INCREMENTAL') or p_as_of is null or p_as_of>pg_catalog.clock_timestamp()+interval '60 seconds' or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_rebuild_request' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-rebuild-request:'||p_idempotency_key,0));
  -- Request identity deliberately excludes ledger state and wall-clock values. A retry
  -- binds to the original request/result even when the append-only ledger has advanced.
  v_request_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',p_spot_id,'mode',p_mode,'asOf',p_as_of,'registryVersion',v_registry_version,'policyVersion',v_policy_version,'resolverContract',v_resolver_contract,'resolverVersion',v_resolver_version,'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  select * into job from world_knowledge_private.rebuild_jobs j where j.idempotency_key=p_idempotency_key for update;
  if found then
    if job.spot_id<>p_spot_id or job.mode<>p_mode or job.as_of<>p_as_of or job.request_hash<>v_request_hash or job.registry_version<>v_registry_version or job.policy_version<>v_policy_version or job.resolver_contract<>v_resolver_contract or job.resolver_version<>v_resolver_version then raise exception 'rebuild_idempotency_conflict' using errcode='23505'; end if;
    if job.status='PENDING' then raise exception 'rebuild_request_pending' using errcode='55000'; end if;
    if job.status='RUNNING' then raise exception 'rebuild_request_in_progress' using errcode='55000'; end if;
    if job.status='FAILED' then raise exception 'rebuild_request_failed' using errcode='55000'; end if;
    if job.status<>'SUCCEEDED' or job.manifest_id is null then raise exception 'rebuild_request_invalid_state' using errcode='55000'; end if;
    if not exists(select 1 from world_knowledge_private.resolution_manifests m where m.id=job.manifest_id and m.spot_id=job.spot_id and m.registry_version=job.registry_version and m.policy_version=job.policy_version and m.resolver_contract=job.resolver_contract and m.resolver_version=job.resolver_version and m.input_hash=job.input_hash) then raise exception 'rebuild_job_manifest_binding_mismatch' using errcode='22023'; end if;
    return world_knowledge_private.validate_resolution_manifest_v1(job.manifest_id)||jsonb_build_object('mode',p_mode,'reused',true,'manifestReused',true,'pointerUpdated',false);
  end if;
  if not exists(select 1 from public.spots s where s.id=p_spot_id and s.data_origin in ('TEST','FIXTURE')) and not exists(select 1 from world_knowledge_private.shadow_spot_allowlist a where a.spot_id=p_spot_id and a.valid_until>pg_catalog.clock_timestamp()) then raise exception 'shadow_spot_not_allowlisted' using errcode='42501'; end if;
  v_cutoff:=pg_catalog.clock_timestamp();
  v_components:=world_knowledge_private.resolution_input_components_v2(p_spot_id,p_as_of,v_cutoff);
  v_input_hash:=encode(extensions.digest(pg_catalog.convert_to(v_components::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.rebuild_jobs(spot_id,idempotency_key,mode,as_of,request_hash,input_hash,registry_version,policy_version,resolver_contract,resolver_version,status)
  values(p_spot_id,p_idempotency_key,p_mode,p_as_of,v_request_hash,v_input_hash,v_registry_version,v_policy_version,v_resolver_contract,v_resolver_version,'RUNNING') returning * into job;
  with eligible as (
    select c.*,row_number() over(partition by c.attribute_key,c.scope order by c.last_changed_at desc,c.id desc) rn,
      count(*) over(partition by c.attribute_key,c.scope,c.last_changed_at) same_time
    from world_knowledge_private.claims c
    join world_knowledge_private.source_policy_attribute_rules policy on policy.policy_version=c.policy_version and policy.attribute_key=c.attribute_key
      and c.source_type=any(policy.allowed_source_types) and c.actor_type=any(policy.allowed_actor_types)
      and c.source_reference_id is not null and 'GENERAL_WORLD'=any(policy.allowed_use_cases)
    where c.spot_id=p_spot_id and c.created_at<=v_cutoff and c.observed_at<=p_as_of and c.visibility<>'SHADOW_HELD' and (c.valid_from is null or c.valid_from<=p_as_of) and (c.valid_until is null or c.valid_until>p_as_of)
      and exists(select 1 from world_knowledge_private.verification_records v where v.claim_id=c.id and v.claim_hash=c.content_hash and v.result='VERIFIED' and v.created_at<=v_cutoff and v.checked_at<=p_as_of and ((v.verification_method='OWNER_CONFIRMED' and 'process:owner-confirmed'=any(policy.verification_process_ids)) or (v.verification_method='ADMIN_CONFIRMED' and 'process:admin-confirmed'=any(policy.verification_process_ids))))
  ), resolved as (
    select e.attribute_key,e.scope,case when e.same_time>1 then 'DISPUTED' else e.knowledge_state end resolution,case when e.same_time>1 then null else e.value end value,case when e.same_time>1 then 'CONFLICTING' else 'VERIFIED' end trust,'CURRENT' freshness,
      array(select e2.content_hash from eligible e2 where e2.attribute_key=e.attribute_key and e2.scope=e.scope and e2.last_changed_at=e.last_changed_at order by e2.content_hash) basis_hashes,e.same_time
    from eligible e where e.rn=1
  )
  select jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.shadow-snapshot@1.0','registryVersion',v_registry_version,'registryHash',v_components#>>'{registry,registryHash}','policyVersion',v_policy_version,'spotId',p_spot_id,'resolvedAt',p_as_of,
    'facts',coalesce(jsonb_agg(jsonb_build_object('key',attribute_key,'scope',scope,'resolution',resolution,'value',value,'trust',trust,'freshness',freshness,'basisClaimHashes',basis_hashes) order by attribute_key,scope),'[]'::jsonb),
    'explicitUnknowns',coalesce(jsonb_agg(jsonb_build_object('key',attribute_key,'scope',scope) order by attribute_key,scope) filter(where resolution='UNKNOWN'),'[]'::jsonb),
    'conflicts',coalesce(jsonb_agg(jsonb_build_object('key',attribute_key,'scope',scope,'claimHashes',basis_hashes) order by attribute_key,scope) filter(where resolution='DISPUTED'),'[]'::jsonb)
  ) into snapshot from resolved;
  decision:=world_knowledge_private.decision_projection_v1(snapshot);
  v_resolution_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('worldSnapshot',snapshot,'decisionProjection',decision)::text,'UTF8'),'sha256'),'hex');
  -- A second, semantic lock is scoped to Spot + accepted versions + complete input.
  -- Different idempotency keys for the same resolver input therefore converge on one
  -- canonical manifest without serializing unrelated Spots or inputs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-rebuild-manifest:'||p_spot_id::text||':'||v_registry_version||':'||v_policy_version||':'||v_resolver_contract||':'||v_resolver_version||':'||v_input_hash,0));
  select m.id into v_manifest_id from world_knowledge_private.resolution_manifests m where m.spot_id=p_spot_id and m.registry_version=v_registry_version and m.policy_version=v_policy_version and m.resolver_contract=v_resolver_contract and m.resolver_version=v_resolver_version and m.input_hash=v_input_hash;
  if found then
    manifest_reused:=true;
    stored:=world_knowledge_private.validate_resolution_manifest_v1(v_manifest_id);
    if stored->'worldSnapshot'<>snapshot or stored->'decisionProjection'<>decision or stored->>'resolutionHash'<>v_resolution_hash then raise exception 'resolution_manifest_reuse_mismatch' using errcode='22023'; end if;
  else
    v_manifest_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
      'spotId',p_spot_id,'registryVersion',v_registry_version,'registryReleaseHash',v_components#>>'{registry,releaseHash}',
      'policyVersion',v_policy_version,'policyReleaseHash',v_components#>>'{sourcePolicy,releaseHash}','attributePolicyHash',v_components#>>'{sourcePolicy,attributePolicyHash}',
      'resolverContract',v_resolver_contract,'resolverVersion',v_resolver_version,'conflictPolicyRef',v_components->>'conflictPolicyRef',
      'freshnessPolicyRef',v_components->>'freshnessPolicyRef','shadowPolicyRef',v_components->>'shadowPolicyRef','asOf',p_as_of,
      'ledgerCutoffAt',v_cutoff,'inputHash',v_input_hash,'resolutionHash',v_resolution_hash
    )::text,'UTF8'),'sha256'),'hex');
    insert into world_knowledge_private.resolution_manifests(spot_id,registry_version,policy_version,registry_release_hash,policy_release_hash,attribute_policy_hash,resolver_contract,resolver_version,conflict_policy_ref,freshness_policy_ref,shadow_policy_ref,as_of,ledger_cutoff_at,input_components,input_hash,resolution_hash,manifest_hash,world_snapshot,decision_projection)
    values(p_spot_id,v_registry_version,v_policy_version,v_components#>>'{registry,releaseHash}',v_components#>>'{sourcePolicy,releaseHash}',v_components#>>'{sourcePolicy,attributePolicyHash}',v_resolver_contract,v_resolver_version,v_components->>'conflictPolicyRef',v_components->>'freshnessPolicyRef',v_components->>'shadowPolicyRef',p_as_of,v_cutoff,v_components,v_input_hash,v_resolution_hash,v_manifest_hash,snapshot,decision) returning id into v_manifest_id;
    insert into world_knowledge_private.resolution_entries(manifest_id,attribute_key,scope,resolution,value,trust,freshness,basis_claim_hashes,conflict_claim_hashes,entry_hash)
    select v_manifest_id,item->>'key',item->>'scope',item->>'resolution',item->'value',item->>'trust',item->>'freshness',array(select jsonb_array_elements_text(item->'basisClaimHashes')),case when item->>'resolution'='DISPUTED' then array(select jsonb_array_elements_text(item->'basisClaimHashes')) else '{}' end,encode(extensions.digest(pg_catalog.convert_to(item::text,'UTF8'),'sha256'),'hex') from jsonb_array_elements(snapshot->'facts') item;
    stored:=world_knowledge_private.validate_resolution_manifest_v1(v_manifest_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-current-pointer:'||p_spot_id::text,0));
  select * into current_pointer from world_knowledge_private.current_projection_pointers p where p.spot_id=p_spot_id for update;
  if not found then
    insert into world_knowledge_private.current_projection_pointers(spot_id,manifest_id,manifest_hash,as_of,ledger_cutoff_at,registry_version,policy_version,resolver_version) select m.spot_id,m.id,m.manifest_hash,m.as_of,m.ledger_cutoff_at,m.registry_version,m.policy_version,m.resolver_version from world_knowledge_private.resolution_manifests m where m.id=v_manifest_id;
    pointer_updated:=true;
  elsif current_pointer.manifest_id<>v_manifest_id then
    if (current_pointer.registry_version<>v_registry_version or current_pointer.policy_version<>v_policy_version or current_pointer.resolver_version<>v_resolver_version)
       and not (current_pointer.registry_version='backyrd.world-knowledge.registry@1.1' and v_registry_version='backyrd.world-knowledge.registry@2.0' and v_policy_version='backyrd.world-knowledge.source-policy@4a.2' and v_resolver_version='2.0.0')
    then raise exception 'current_projection_version_order_not_configured' using errcode='22023'; end if;
    if (current_pointer.registry_version='backyrd.world-knowledge.registry@1.1' and v_registry_version='backyrd.world-knowledge.registry@2.0')
       or p_as_of>current_pointer.as_of
       or (p_as_of=current_pointer.as_of and (select m.ledger_cutoff_at from world_knowledge_private.resolution_manifests m where m.id=v_manifest_id)>current_pointer.ledger_cutoff_at) then
      update world_knowledge_private.current_projection_pointers p set manifest_id=m.id,manifest_hash=m.manifest_hash,as_of=m.as_of,ledger_cutoff_at=m.ledger_cutoff_at,registry_version=m.registry_version,policy_version=m.policy_version,resolver_version=m.resolver_version,updated_at=pg_catalog.clock_timestamp() from world_knowledge_private.resolution_manifests m where p.spot_id=p_spot_id and m.id=v_manifest_id;
      pointer_updated:=true;
    end if;
  end if;
  update world_knowledge_private.rebuild_jobs set status='SUCCEEDED',completed_at=pg_catalog.clock_timestamp(),manifest_id=v_manifest_id where id=job.id;
  return stored||jsonb_build_object('mode',p_mode,'reused',false,'manifestReused',manifest_reused,'pointerUpdated',pointer_updated);
end $$;



revoke execute on function world_knowledge_private.resolution_input_components_v2(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
revoke execute on function public.world_shadow_rebuild_spot_v1(uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.world_shadow_rebuild_spot_v1(uuid,timestamptz,text,text) to service_role;

create or replace function world_knowledge_private.decision_projection_v1(p_snapshot jsonb)
returns jsonb language sql immutable security definer set search_path='' as $$
  select jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.shadow-decision-projection@1.0','spotId',p_snapshot->>'spotId',
    'registryVersion',p_snapshot->>'registryVersion','policyVersion',p_snapshot->>'policyVersion',
    'facts',coalesce(jsonb_agg(item order by item->>'key',item->>'scope') filter(where item->>'key' not like 'contact.%' and item->>'key'<>'description.highlight'),'[]'::jsonb),
    'explicitUnknowns',p_snapshot->'explicitUnknowns','conflicts',p_snapshot->'conflicts'
  ) from jsonb_array_elements(p_snapshot->'facts') item;
$$;

create or replace function world_knowledge_private.validate_resolution_manifest_v1(p_manifest_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m world_knowledge_private.resolution_manifests%rowtype; expected_components jsonb; expected_input_hash text; expected_resolution_hash text; expected_manifest_hash text; expected_decision jsonb; entry_facts jsonb; entry_unknowns jsonb; entry_conflicts jsonb; entries_valid boolean;
begin
  select * into strict m from world_knowledge_private.resolution_manifests where id=p_manifest_id;
  expected_components:=case when m.registry_version='backyrd.world-knowledge.registry@2.0' then world_knowledge_private.resolution_input_components_v2(m.spot_id,m.as_of,m.ledger_cutoff_at) else world_knowledge_private.resolution_input_components_v1(m.spot_id,m.as_of,m.ledger_cutoff_at) end;
  expected_input_hash:=encode(extensions.digest(pg_catalog.convert_to(m.input_components::text,'UTF8'),'sha256'),'hex');
  if m.input_components<>expected_components or m.input_hash<>expected_input_hash then raise exception 'resolution_manifest_input_integrity_mismatch' using errcode='22023'; end if;
  expected_decision:=world_knowledge_private.decision_projection_v1(m.world_snapshot);
  if m.decision_projection<>expected_decision then raise exception 'resolution_manifest_decision_integrity_mismatch' using errcode='22023'; end if;
  expected_resolution_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('worldSnapshot',m.world_snapshot,'decisionProjection',m.decision_projection)::text,'UTF8'),'sha256'),'hex');
  if m.resolution_hash<>expected_resolution_hash then raise exception 'resolution_manifest_output_integrity_mismatch' using errcode='22023'; end if;
  expected_manifest_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'spotId',m.spot_id,'registryVersion',m.registry_version,'registryReleaseHash',m.registry_release_hash,
    'policyVersion',m.policy_version,'policyReleaseHash',m.policy_release_hash,'attributePolicyHash',m.attribute_policy_hash,
    'resolverContract',m.resolver_contract,'resolverVersion',m.resolver_version,'conflictPolicyRef',m.conflict_policy_ref,
    'freshnessPolicyRef',m.freshness_policy_ref,'shadowPolicyRef',m.shadow_policy_ref,'asOf',m.as_of,
    'ledgerCutoffAt',m.ledger_cutoff_at,'inputHash',m.input_hash,'resolutionHash',m.resolution_hash
  )::text,'UTF8'),'sha256'),'hex');
  if m.manifest_hash<>expected_manifest_hash then raise exception 'resolution_manifest_identity_mismatch' using errcode='22023'; end if;
  select coalesce(jsonb_agg(f.fact order by f.fact->>'key',f.fact->>'scope'),'[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('key',e.attribute_key,'scope',e.scope) order by e.attribute_key,e.scope) filter(where e.resolution='UNKNOWN'),'[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('key',e.attribute_key,'scope',e.scope,'claimHashes',to_jsonb(e.conflict_claim_hashes)) order by e.attribute_key,e.scope) filter(where e.resolution='DISPUTED'),'[]'::jsonb),
         coalesce(bool_and(e.entry_hash=encode(extensions.digest(pg_catalog.convert_to(f.fact::text,'UTF8'),'sha256'),'hex')),true)
    into entry_facts,entry_unknowns,entry_conflicts,entries_valid
  from world_knowledge_private.resolution_entries e
  cross join lateral (select jsonb_build_object('key',e.attribute_key,'scope',e.scope,'resolution',e.resolution,'value',e.value,'trust',e.trust,'freshness',e.freshness,'basisClaimHashes',to_jsonb(e.basis_claim_hashes)) as fact) f
  where e.manifest_id=m.id;
  if not entries_valid or m.world_snapshot->'facts'<>entry_facts or m.world_snapshot->'explicitUnknowns'<>entry_unknowns or m.world_snapshot->'conflicts'<>entry_conflicts then raise exception 'resolution_manifest_entries_integrity_mismatch' using errcode='22023'; end if;
  if m.world_snapshot->>'spotId'<>m.spot_id::text or m.world_snapshot->>'resolvedAt'<>to_jsonb(m.as_of)#>>'{}' or m.world_snapshot->>'registryVersion'<>m.registry_version or m.world_snapshot->>'policyVersion'<>m.policy_version then raise exception 'resolution_manifest_snapshot_binding_mismatch' using errcode='22023'; end if;
  return jsonb_build_object('manifestId',m.id,'manifestHash',m.manifest_hash,'resolutionHash',m.resolution_hash,'inputHash',m.input_hash,'worldSnapshot',m.world_snapshot,'decisionProjection',m.decision_projection);
exception when no_data_found then raise exception 'resolution_manifest_not_found' using errcode='22023';
end $$;

revoke execute on function world_knowledge_private.validate_resolution_manifest_v1(uuid) from public,anon,authenticated,service_role;

-- The authoring entry points keep their stable public names but bind all new
-- writes and exports to the accepted 4A releases.
create or replace function public.world_founder_create_spot_v1(
  p_name text,p_owner_id uuid default null,p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); binding_id uuid; spot_id uuid; existing_id uuid; receipt jsonb;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 160 or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_founder_spot_request' using errcode='22023'; end if;
  if p_owner_id is not null and not exists(select 1 from public.profiles p where p.id=p_owner_id) then raise exception 'owner_profile_not_found' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'ADMIN');
  select f.spot_id into existing_id from world_knowledge_private.founder_evaluation_spots_v1 f
  join public.spots s on s.id=f.spot_id
  where f.created_by_binding_id=binding_id and f.creation_idempotency_key=p_idempotency_key and s.data_origin='TEST';
  if found then return jsonb_build_object('spotId',existing_id,'created',false,'scope','FOUNDER_EVALUATION_ONLY'); end if;
  insert into public.spots(name,lat,lng,status,owner_id,created_by,data_origin)
  values(trim(p_name),0,0,'archived',p_owner_id,actor_id,'TEST') returning id into spot_id;
  insert into world_knowledge_private.founder_evaluation_spots_v1(spot_id,created_by_binding_id,creation_idempotency_key) values(spot_id,binding_id,p_idempotency_key);
  insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
  values(spot_id,'FOUNDER_EVALUATION_ONLY',pg_catalog.clock_timestamp()+interval '180 days');
  receipt:=world_knowledge_private.submit_authoritative_claim_v2('ADMIN',spot_id,'identity.name','KNOWN_VALUE',to_jsonb(trim(p_name)),pg_catalog.clock_timestamp(),null,null,'PUBLIC',null,p_idempotency_key||':identity.name');
  return jsonb_build_object('spotId',spot_id,'created',true,'scope','FOUNDER_EVALUATION_ONLY','identityClaim',receipt);
end $$;

create or replace function public.world_admin_confirm_legacy_values_v1(p_spot_id uuid,p_batch_id uuid,p_value_ids uuid[],p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=auth.uid(); binding_id uuid; row_value world_knowledge_private.legacy_import_values_v1%rowtype; receipt jsonb; claim_ids uuid[]:='{}'; existing world_knowledge_private.legacy_import_confirmations_v1%rowtype; confirmed_at timestamptz:=pg_catalog.clock_timestamp(); confirmation_hash text;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if actor_id is null or not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
  if coalesce(array_length(p_value_ids,1),0)<1 or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_legacy_confirmation_request' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,'ADMIN');
  select * into existing from world_knowledge_private.legacy_import_confirmations_v1 c where c.actor_binding_id=binding_id and c.idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('confirmationId',existing.id,'created',false,'claimIds',to_jsonb(existing.result_claim_ids)); end if;
  for row_value in select * from world_knowledge_private.legacy_import_values_v1 v where v.id=any(p_value_ids) order by v.target_attribute_key,v.id loop
    if row_value.batch_id<>p_batch_id or row_value.spot_id<>p_spot_id or row_value.disposition<>'PREFILL_REQUIRES_CONFIRMATION' or row_value.target_attribute_key is null or row_value.confirmed_claim_id is not null then raise exception 'legacy_value_not_confirmable' using errcode='42501'; end if;
    receipt:=world_knowledge_private.submit_authoritative_claim_v2('ADMIN',p_spot_id,row_value.target_attribute_key,'KNOWN_VALUE',row_value.transformed_value,confirmed_at,null,null,'PUBLIC',null,'legacy-confirm:'||p_batch_id||':'||row_value.id);
    claim_ids:=array_append(claim_ids,(receipt->>'claimId')::uuid);
    update world_knowledge_private.legacy_import_values_v1 set confirmed_claim_id=(receipt->>'claimId')::uuid where id=row_value.id and confirmed_claim_id is null;
  end loop;
  if array_length(claim_ids,1)<>array_length(p_value_ids,1) then raise exception 'legacy_confirmation_selection_mismatch' using errcode='22023'; end if;
  confirmation_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('batchId',p_batch_id,'spotId',p_spot_id,'actorBinding',binding_id,'selectedValueIds',to_jsonb(p_value_ids),'resultClaimIds',to_jsonb(claim_ids),'confirmedAt',confirmed_at,'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.legacy_import_confirmations_v1(batch_id,spot_id,actor_binding_id,idempotency_key,selected_value_ids,result_claim_ids,confirmation_hash,confirmed_at)
  values(p_batch_id,p_spot_id,binding_id,p_idempotency_key,p_value_ids,claim_ids,confirmation_hash,confirmed_at) returning * into existing;
  return jsonb_build_object('confirmationId',existing.id,'created',true,'claimIds',to_jsonb(claim_ids),'verificationMethod','ADMIN_CONFIRMED');
end $$;

create or replace function public.world_founder_export_cohort_v1(p_cohort_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; body jsonb; body_hash text; cohort_count integer; current_count integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if length(trim(coalesce(p_cohort_id,''))) not between 1 and 128 then raise exception 'invalid_cohort_id' using errcode='22023'; end if;
  select count(*) into cohort_count from world_knowledge_private.founder_evaluation_spots_v1 f where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  if cohort_count not between 1 and 40 then raise exception 'founder_cohort_size_invalid' using errcode='22023'; end if;
  select count(*) into current_count from world_knowledge_private.founder_evaluation_spots_v1 f join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id where f.lifecycle_status='ACTIVE' and f.cohort_selected and p.registry_version='backyrd.world-knowledge.registry@2.0' and p.policy_version='backyrd.world-knowledge.source-policy@4a.2';
  if current_count<>cohort_count then raise exception 'founder_cohort_rebuild_required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('spotId',m.spot_id,'manifestHash',m.manifest_hash,'resolutionHash',m.resolution_hash,'inputHash',m.input_hash,'snapshotHash',encode(extensions.digest(pg_catalog.convert_to(m.world_snapshot::text,'UTF8'),'sha256'),'hex')) order by m.spot_id),'[]'::jsonb) into rows
  from world_knowledge_private.founder_evaluation_spots_v1 f join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  body:=jsonb_build_object('contractVersion','backyrd.world-knowledge.founder-cohort-shadow@2.0','scope','FOUNDER_EVALUATION_ONLY','cohortId',p_cohort_id,'registryVersion','backyrd.world-knowledge.registry@2.0','policyVersion','backyrd.world-knowledge.source-policy@4a.2','spots',rows,'exclusions',jsonb_build_array('ADMIN_NOTES','OWNER_TIER','PAYMENT','PRIVATE_ACTOR_IDS','PRIVATE_SOURCE_REFERENCES','RAW_AI_OUTPUTS','SUBSCRIPTION'));
  body_hash:=encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex'); return body||jsonb_build_object('cohortHash',body_hash);
end $$;

revoke execute on function public.world_founder_create_spot_v1(text,uuid,text),public.world_admin_confirm_legacy_values_v1(uuid,uuid,uuid[],text),public.world_founder_export_cohort_v1(text) from public,anon;
grant execute on function public.world_founder_create_spot_v1(text,uuid,text),public.world_admin_confirm_legacy_values_v1(uuid,uuid,uuid[],text) to authenticated;
grant execute on function public.world_founder_export_cohort_v1(text) to service_role;

-- Section review is authoring workflow metadata, not World truth. It is still
-- append-only so a later browser or session can reproduce the review state.
create table world_knowledge_private.authoring_section_review_events_v1(
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id),
  section_id text not null check(section_id in ('basics','classification','offering','price','hours','objective','amenities')),
  review_status text not null check(review_status in ('REVIEWED','REOPENED')),
  actor_binding_id uuid not null references world_knowledge_private.actor_bindings(id),
  idempotency_key text not null check(length(idempotency_key) between 1 and 180),
  event_hash text not null check(event_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique(actor_binding_id,idempotency_key)
);
alter table world_knowledge_private.authoring_section_review_events_v1 enable row level security;
alter table world_knowledge_private.authoring_section_review_events_v1 force row level security;
revoke all on table world_knowledge_private.authoring_section_review_events_v1 from public,anon,authenticated;
grant select,insert on table world_knowledge_private.authoring_section_review_events_v1 to service_role;
create trigger world_forbid_section_review_mutation_v1 before update or delete on world_knowledge_private.authoring_section_review_events_v1 for each row execute function world_knowledge_private.reject_immutable_mutation_v1();

create or replace function public.world_authoring_set_section_review_v1(p_spot_id uuid,p_section_id text,p_review_status text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare access jsonb; binding_id uuid; existing world_knowledge_private.authoring_section_review_events_v1%rowtype; event_hash text;
begin
  access:=world_knowledge_private.authoring_actor_v1(p_spot_id);
  if p_section_id not in ('basics','classification','offering','price','hours','objective','amenities') or p_review_status not in ('REVIEWED','REOPENED') or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_section_review_event' using errcode='22023'; end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(auth.uid(),access->>'role');
  event_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('spotId',p_spot_id,'sectionId',p_section_id,'reviewStatus',p_review_status,'actorBinding',binding_id,'idempotencyIdentity',p_idempotency_key)::text,'UTF8'),'sha256'),'hex');
  select * into existing from world_knowledge_private.authoring_section_review_events_v1 e where e.actor_binding_id=binding_id and e.idempotency_key=p_idempotency_key;
  if found then
    if existing.event_hash<>event_hash then raise exception 'section_review_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('eventId',existing.id,'created',false,'sectionId',existing.section_id,'reviewStatus',existing.review_status);
  end if;
  insert into world_knowledge_private.authoring_section_review_events_v1(spot_id,section_id,review_status,actor_binding_id,idempotency_key,event_hash)
  values(p_spot_id,p_section_id,p_review_status,binding_id,p_idempotency_key,event_hash) returning * into existing;
  return jsonb_build_object('eventId',existing.id,'created',true,'sectionId',existing.section_id,'reviewStatus',existing.review_status);
end $$;

create or replace function public.world_authoring_get_section_reviews_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare access jsonb; result jsonb;
begin
  access:=world_knowledge_private.authoring_actor_v1(p_spot_id);
  select coalesce(jsonb_agg(section_id order by section_id) filter(where review_status='REVIEWED'),'[]'::jsonb) into result
  from (
    select distinct on (e.section_id) e.section_id,e.review_status
    from world_knowledge_private.authoring_section_review_events_v1 e
    where e.spot_id=p_spot_id order by e.section_id,e.occurred_at desc,e.id desc
  ) latest;
  return jsonb_build_object('spotId',p_spot_id,'reviewedSections',result);
end $$;

revoke execute on function public.world_authoring_set_section_review_v1(uuid,text,text,text),public.world_authoring_get_section_reviews_v1(uuid) from public,anon;
grant execute on function public.world_authoring_set_section_review_v1(uuid,text,text,text),public.world_authoring_get_section_reviews_v1(uuid) to authenticated;
