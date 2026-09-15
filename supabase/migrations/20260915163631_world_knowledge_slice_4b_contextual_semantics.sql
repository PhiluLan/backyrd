-- World Knowledge Slice 4B: additive contextual semantics. This migration is
-- intentionally dormant until separately released. It does not connect Decision.

alter table world_knowledge_private.attribute_definitions drop constraint attribute_definitions_value_type_check;
alter table world_knowledge_private.attribute_definitions add constraint attribute_definitions_value_type_check check (value_type in (
  'TEXT','EMAIL','URL','PHONE','COUNTRY_CODE','IANA_TIMEZONE','DECIMAL','BOOLEAN','ENUM','ENUM_SET','MONEY_RANGE','INTEGER','INTEGER_RANGE',
  'RESERVATION_RULE','CONSUMPTION_RULE','PET_ACCESS_RULE','AGE_ACCESS_RULE','AGE_ACCESS_RULE_V2','WEEKLY_SCHEDULE','SPECIAL_HOURS','CURRENT_STATE',
  'ONSITE_OFFERINGS','VISIT_SITUATIONS','ATMOSPHERE_CONTEXTS','DAYPART_CONTEXTS'
));

insert into world_knowledge_private.registry_releases(registry_version,registry_hash,predecessor_version,change_class,definitions,release_hash,approved_at,created_at)
values('backyrd.world-knowledge.registry@2.1','cc9c5d1ac55d0080dc8a4a2e9b240b28d30dabc35ec5f35e5a4603b203e169f3','backyrd.world-knowledge.registry@2.0','ADDITIVE_DEFINITION',
  jsonb_build_array(jsonb_build_object('addedKeys',jsonb_build_array('purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts')),jsonb_build_object('historyPreserved',true)),
  '07d0fcc6cd46e2f0189558a7d7728d50fe0b440a0effd9579ab9463a7b371c2d','2026-09-15T08:00:00Z','2026-09-15T08:00:00Z');

insert into world_knowledge_private.attribute_definitions(registry_version,attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization)
select 'backyrd.world-knowledge.registry@2.1',attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization
from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@2.0';
insert into world_knowledge_private.attribute_definitions(registry_version,attribute_key,value_type,allowed_values,minimum,maximum,engine_authorization) values
('backyrd.world-knowledge.registry@2.1','purpose.primary_visit','ENUM','["EAT_DRINK","CULTURE_ARTS","ENTERTAINMENT","ACTIVITY_PLAY","SPORT_MOVEMENT","NATURE_ANIMAL_EXPERIENCE","WELLNESS_RELAXATION","SHOPPING_MARKET","OVERNIGHT_STAY","COMMUNITY_SOCIAL","ATTRACTION_VISIT","TEMPORARY_EVENT","OTHER"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@2.1','offering.onsite','ONSITE_OFFERINGS','["RESTAURANT","CAFE","BAR","KIOSK","TAKEAWAY","FULL_MEALS","SNACKS","DRINKS","PICNIC","HOTEL","SHOP","KIDS_PLAY_AREA"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@2.1','context.visit_situations','VISIT_SITUATIONS','["ALONE","DATE_PAIR","FAMILY","FRIENDS_GROUP","BUSINESS"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@2.1','context.atmosphere','ATMOSPHERE_CONTEXTS','["QUIET","LIVELY","ROMANTIC","COZY","CREATIVE","RELAXED","SOCIABLE","ELEGANT","CASUAL","FAMILY_FRIENDLY","BUSINESS_SUITABLE"]',null,null,'AUTHORIZED'),
('backyrd.world-knowledge.registry@2.1','context.typical_dayparts','DAYPART_CONTEXTS','["MORNING","MIDDAY","AFTERNOON","EVENING","NIGHT"]',null,null,'AUTHORIZED');

insert into world_knowledge_private.governance_approval_records(registry_version,authority_class,authority_reference,approved_at,record_hash)
values('backyrd.world-knowledge.registry@2.1','PRODUCT_CTO','approval:slice-4b-contextual-semantics','2026-09-15T08:00:00Z','e160b9f4b5f9438dcc9519a6f3711cbafec71d369253c6273cb9ab6025b8543c');

insert into world_knowledge_private.source_policy_releases(policy_version,policy_hash,registry_version,registry_hash,policy,state,approved_at)
values('backyrd.world-knowledge.source-policy@4b.1','a5f36fdb17fd9c4cfe8800f0d43db8109e0744fe0d126cc4b0f7c627a8a04699','backyrd.world-knowledge.registry@2.1','cc9c5d1ac55d0080dc8a4a2e9b240b28d30dabc35ec5f35e5a4603b203e169f3',
jsonb_build_object('contextSemantics','SEPARATE_FROM_USER_INTENT','decisionAuthorization','NOT_CONFIGURED','missing','ABSENT_NOT_FALSE','subscriptionInfluence','AUTHORING_SCOPE_ONLY'),'ACCEPTED','2026-09-15T08:00:00Z');
insert into world_knowledge_private.source_policy_attribute_rules(policy_version,attribute_key,allowed_source_types,allowed_actor_types,source_reference_requirement,self_assertion_allowed,verification_process_ids,freshness_policy_ref,allowed_use_cases)
select 'backyrd.world-knowledge.source-policy@4b.1',attribute_key,allowed_source_types,allowed_actor_types,source_reference_requirement,self_assertion_allowed,verification_process_ids,freshness_policy_ref,allowed_use_cases
from world_knowledge_private.source_policy_attribute_rules where policy_version='backyrd.world-knowledge.source-policy@4a.2';
insert into world_knowledge_private.source_policy_attribute_rules(policy_version,attribute_key,allowed_source_types,allowed_actor_types,source_reference_requirement,self_assertion_allowed,verification_process_ids,freshness_policy_ref,allowed_use_cases) values
('backyrd.world-knowledge.source-policy@4b.1','purpose.primary_visit',array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'],array['VERIFIED_OWNER','ADMIN'],'REQUIRED',true,array['process:owner-confirmed','process:admin-confirmed'],'freshness:durable-until-contradicted',array['GENERAL_WORLD','DISCOVERY','RESEARCH']),
('backyrd.world-knowledge.source-policy@4b.1','offering.onsite',array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'],array['VERIFIED_OWNER','ADMIN'],'REQUIRED',true,array['process:owner-confirmed','process:admin-confirmed'],'freshness:durable-until-contradicted',array['GENERAL_WORLD','DISCOVERY','RESEARCH']),
('backyrd.world-knowledge.source-policy@4b.1','context.visit_situations',array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'],array['VERIFIED_OWNER','ADMIN'],'REQUIRED',true,array['process:owner-confirmed','process:admin-confirmed'],'freshness:durable-until-contradicted',array['GENERAL_WORLD','EXPLANATION','RESEARCH']),
('backyrd.world-knowledge.source-policy@4b.1','context.atmosphere',array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'],array['VERIFIED_OWNER','ADMIN'],'REQUIRED',true,array['process:owner-confirmed','process:admin-confirmed'],'freshness:durable-until-contradicted',array['GENERAL_WORLD','EXPLANATION','RESEARCH']),
('backyrd.world-knowledge.source-policy@4b.1','context.typical_dayparts',array['OWNER_ASSERTION','ADMIN_OBSERVATION','OFFICIAL_SOURCE'],array['VERIFIED_OWNER','ADMIN'],'REQUIRED',true,array['process:owner-confirmed','process:admin-confirmed'],'freshness:durable-until-contradicted',array['GENERAL_WORLD','EXPLANATION','RESEARCH']);

insert into world_knowledge_private.entitlement_policy_releases(policy_version,policy_hash,registry_version,policy,state,approved_at)
values('backyrd.world-knowledge.entitlement-policy@4b.1','e1158bf4a5c9c25728a9afce77df8f9e02c863c05785918be82b72a12dd5b455','backyrd.world-knowledge.registry@2.1',jsonb_build_object('commercialInfluence','AUTHORING_SCOPE_ONLY'),'ACCEPTED','2026-09-15T08:00:00Z');
insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key)
select 'backyrd.world-knowledge.entitlement-policy@4b.1',actor_scope,attribute_key from world_knowledge_private.entitlement_attribute_rules where policy_version='backyrd.world-knowledge.entitlement-policy@4a.2';
insert into world_knowledge_private.entitlement_attribute_rules(policy_version,actor_scope,attribute_key) values
('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_BASIC','purpose.primary_visit'),('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_BASIC','offering.onsite'),
('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_PRO','purpose.primary_visit'),('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_PRO','offering.onsite'),
('backyrd.world-knowledge.entitlement-policy@4b.1','ADMIN','purpose.primary_visit'),('backyrd.world-knowledge.entitlement-policy@4b.1','ADMIN','offering.onsite'),
('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_PRO','context.visit_situations'),('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_PRO','context.atmosphere'),('backyrd.world-knowledge.entitlement-policy@4b.1','OWNER_PRO','context.typical_dayparts'),
('backyrd.world-knowledge.entitlement-policy@4b.1','ADMIN','context.visit_situations'),('backyrd.world-knowledge.entitlement-policy@4b.1','ADMIN','context.atmosphere'),('backyrd.world-knowledge.entitlement-policy@4b.1','ADMIN','context.typical_dayparts');

create or replace function world_knowledge_private.context_conditions_valid_v1(p_value jsonb,p_include_dayparts boolean)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare allowed_keys text[]:=case when p_include_dayparts then array['dayparts','days','area','occasion','groupSize','ageContext','accompaniment','eventMode'] else array['days','area','occasion','groupSize','ageContext','accompaniment','eventMode'] end; k text;
begin
  if jsonb_typeof(p_value)<>'object' or (select count(*) from jsonb_object_keys(p_value))<>cardinality(allowed_keys) then return false; end if;
  foreach k in array allowed_keys loop if not p_value ? k then return false; end if; end loop;
  if p_include_dayparts and (jsonb_typeof(p_value->'dayparts')<>'array' or exists(select 1 from jsonb_array_elements_text(p_value->'dayparts') x where x not in ('MORNING','MIDDAY','AFTERNOON','EVENING','NIGHT'))) then return false; end if;
  if jsonb_typeof(p_value->'days')<>'array' or exists(select 1 from jsonb_array_elements_text(p_value->'days') x where x not in ('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY')) then return false; end if;
  if p_value->'area'<>'null' and (jsonb_typeof(p_value->'area')<>'string' or length(p_value->>'area') not between 1 and 120) then return false; end if;
  if p_value->'occasion'<>'null' and (jsonb_typeof(p_value->'occasion')<>'string' or length(p_value->>'occasion') not between 1 and 160) then return false; end if;
  if p_value->'ageContext'<>'null' and p_value->>'ageContext' not in ('ADULTS','CHILDREN','MIXED_AGES') then return false; end if;
  if p_value->'accompaniment'<>'null' and p_value->>'accompaniment' not in ('ALONE','ADULT','LEGAL_GUARDIAN','GROUP') then return false; end if;
  if p_value->'eventMode'<>'null' and p_value->>'eventMode' not in ('NORMAL_OPERATION','EVENT') then return false; end if;
  if p_value->'groupSize'<>'null' and (jsonb_typeof(p_value->'groupSize')<>'object' or (p_value#>>'{groupSize,min}')::integer<1 or (p_value#>>'{groupSize,max}')::integer<(p_value#>>'{groupSize,min}')::integer) then return false; end if;
  return true;
exception when others then return false;
end $$;

create or replace function world_knowledge_private.attribute_value_valid_v3(p_registry_version text,p_attribute_key text,p_state text,p_value jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare definition world_knowledge_private.attribute_definitions%rowtype; item jsonb; conditions jsonb; discriminator text;
begin
  if p_registry_version<>'backyrd.world-knowledge.registry@2.1' then return false; end if;
  select * into definition from world_knowledge_private.attribute_definitions where registry_version=p_registry_version and attribute_key=p_attribute_key;
  if not found then return false; end if;
  if p_state='UNKNOWN' then return p_value is null; end if;
  if p_attribute_key='purpose.primary_visit' then return world_knowledge_private.attribute_value_valid_v1(p_registry_version,p_attribute_key,p_state,p_value); end if;
  if definition.value_type not in ('ONSITE_OFFERINGS','VISIT_SITUATIONS','ATMOSPHERE_CONTEXTS','DAYPART_CONTEXTS') then return world_knowledge_private.attribute_value_valid_v2('backyrd.world-knowledge.registry@2.0',p_attribute_key,p_state,p_value); end if;
  if p_state<>'KNOWN_VALUE' or jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)>50 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if definition.value_type='ONSITE_OFFERINGS' then
      if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>3 or not item ?& array['kind','relationship','area']
        or item->>'kind' not in ('RESTAURANT','CAFE','BAR','KIOSK','TAKEAWAY','FULL_MEALS','SNACKS','DRINKS','PICNIC','HOTEL','SHOP','KIDS_PLAY_AREA') or item->>'relationship' not in ('PART_OF_SPOT','EMBEDDED_FACILITY','UNKNOWN')
        or (item->'area'<>'null' and (jsonb_typeof(item->'area')<>'string' or length(item->>'area') not between 1 and 120)) then return false; end if;
    else
      discriminator:=case definition.value_type when 'VISIT_SITUATIONS' then 'situation' when 'ATMOSPHERE_CONTEXTS' then 'atmosphere' else 'daypart' end;
      if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>2 or not item ?& array[discriminator,'conditions'] then return false; end if;
      if discriminator='situation' and item->>discriminator not in ('ALONE','DATE_PAIR','FAMILY','FRIENDS_GROUP','BUSINESS') then return false; end if;
      if discriminator='atmosphere' and item->>discriminator not in ('QUIET','LIVELY','ROMANTIC','COZY','CREATIVE','RELAXED','SOCIABLE','ELEGANT','CASUAL','FAMILY_FRIENDLY','BUSINESS_SUITABLE') then return false; end if;
      if discriminator='daypart' and item->>discriminator not in ('MORNING','MIDDAY','AFTERNOON','EVENING','NIGHT') then return false; end if;
      conditions:=item->'conditions'; if not world_knowledge_private.context_conditions_valid_v1(conditions,discriminator<>'daypart') then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function world_knowledge_private.validate_claim_insert_v3() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.registry_version='backyrd.world-knowledge.registry@2.1' and not world_knowledge_private.attribute_value_valid_v3(new.registry_version,new.attribute_key,new.knowledge_state,new.value) then raise exception 'invalid_attribute_value' using errcode='22023'; end if; return new; end $$;
create trigger world_00_validate_claim_insert_v3 before insert on world_knowledge_private.claims for each row execute function world_knowledge_private.validate_claim_insert_v3();

alter table world_knowledge_private.authoring_applicability_events_v1 drop constraint authoring_applicability_events_v1_registry_version_check;
alter table world_knowledge_private.authoring_applicability_events_v1 alter column registry_version set default 'backyrd.world-knowledge.registry@2.1';
alter table world_knowledge_private.authoring_applicability_events_v1 add constraint authoring_applicability_events_v1_registry_version_check check (registry_version in ('backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.registry@2.0','backyrd.world-knowledge.registry@2.1'));

revoke execute on function world_knowledge_private.context_conditions_valid_v1(jsonb,boolean),world_knowledge_private.attribute_value_valid_v3(text,text,text,jsonb),world_knowledge_private.validate_claim_insert_v3() from public,anon,authenticated,service_role;
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
  where r.policy_version='backyrd.world-knowledge.entitlement-policy@4b.1' and r.actor_scope=entitlement;
  return jsonb_build_object('role',actor_role,'entitlement',entitlement,'allowedAttributeKeys',allowed_keys);
end $$;

revoke execute on function world_knowledge_private.attribute_value_valid_v3(text,text,text,jsonb),world_knowledge_private.validate_claim_insert_v2() from public,anon,authenticated,service_role;

comment on function world_knowledge_private.attribute_value_valid_v3(text,text,text,jsonb) is
  'Fail-closed Registry 2.0 runtime boundary. Historical Registry 1.1 validation is unchanged.';
comment on table world_knowledge_private.registry_releases is
  'Append-only registry history. Registry 2.0 expands objective authoring values and adds scoped age and special-kitchen-hours contracts; no Production activation.';

create or replace function world_knowledge_private.submit_authoritative_claim_v3(
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
    where policy_version='backyrd.world-knowledge.entitlement-policy@4b.1'
      and actor_scope=entitlement_scope and attribute_key=p_attribute_key
  ) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  if p_observed_at is null or p_observed_at>pg_catalog.clock_timestamp()+interval '60 seconds' then raise exception 'invalid_observed_at' using errcode='22023'; end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from then raise exception 'invalid_validity_window' using errcode='22023'; end if;
  if p_attribute_key='state.current' and p_valid_until is null then raise exception 'current_state_valid_until_required' using errcode='22023'; end if;
  if p_visibility not in ('PUBLIC','INTERNAL') or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_claim_metadata' using errcode='22023'; end if;
  if not world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1',p_attribute_key,p_knowledge_state,p_value) then raise exception 'invalid_attribute_value' using errcode='22023'; end if;
  if p_supersedes_claim_id is not null then
    select * into prior from world_knowledge_private.claims where id=p_supersedes_claim_id;
    if not found or prior.spot_id<>p_spot_id or prior.attribute_key<>p_attribute_key then raise exception 'invalid_supersedes_claim' using errcode='22023'; end if;
  end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,p_actor_type);
  content_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'spotId',p_spot_id,'key',p_attribute_key,'state',p_knowledge_state,'value',p_value,
    'actorBinding',binding_id,'observedAt',p_observed_at,'validFrom',p_valid_from,
    'validUntil',p_valid_until,'supersedes',p_supersedes_claim_id,
    'registry','backyrd.world-knowledge.registry@2.1',
    'policy','backyrd.world-knowledge.source-policy@4b.1'
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
    p_idempotency_key,p_spot_id,'backyrd.world-knowledge.registry@2.1',
    'backyrd.world-knowledge.source-policy@4b.1',p_attribute_key,p_knowledge_state,p_value,
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
    'scope','SPOT','policyVersion','backyrd.world-knowledge.source-policy@4b.1','method',method,
    'authority',authority,'verifierBinding',binding_id,'result','VERIFIED',
    'checkedAt',checked_at_value,'reverificationPolicyRef',freshness_ref,'reasonCodes',to_jsonb(reason_values)
  )::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.verification_records(
    claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,
    execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,
    reason_codes,result_hash
  ) values (
    v_claim_id,content_hash,p_spot_id,p_attribute_key,'SPOT',
    'backyrd.world-knowledge.source-policy@4b.1',method,authority,binding_id,'VERIFIED',
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
  select world_knowledge_private.submit_authoritative_claim_v3(
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
  select world_knowledge_private.submit_authoritative_claim_v3(
    'ADMIN',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key
  );
$$;
revoke execute on function world_knowledge_private.submit_authoritative_claim_v3(text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
revoke execute on function public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text),public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text) to authenticated;

create or replace function world_knowledge_private.resolution_input_components_v3(p_spot_id uuid,p_as_of timestamptz,p_ledger_cutoff_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare registry_record world_knowledge_private.registry_releases%rowtype; policy_record world_knowledge_private.source_policy_releases%rowtype; attribute_policy jsonb; attribute_policy_hash text;
begin
  select * into strict registry_record from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@2.1';
  select * into strict policy_record from world_knowledge_private.source_policy_releases where policy_version='backyrd.world-knowledge.source-policy@4b.1' and state='ACCEPTED' and registry_version=registry_record.registry_version and registry_hash=registry_record.registry_hash;
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
    'resolver',jsonb_build_object('contract','backyrd.world-knowledge.shadow-resolver@1.0','version','2.1.0'),
    'conflictPolicyRef','conflict:latest-authoritative-change-review@3b.1',
    'freshnessPolicyRef','freshness:attribute-policy-bound@3b.1',
    'shadowPolicyRef','shadow:excluded-inputs-bind-manifest@3b.1'
  );
exception when no_data_found then raise exception 'resolver_release_not_accepted' using errcode='22023';
end $$;

create or replace function public.world_shadow_rebuild_spot_v1(p_spot_id uuid,p_as_of timestamptz,p_mode text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_registry_version constant text:='backyrd.world-knowledge.registry@2.1'; v_policy_version constant text:='backyrd.world-knowledge.source-policy@4b.1';
  v_resolver_contract constant text:='backyrd.world-knowledge.shadow-resolver@1.0'; v_resolver_version constant text:='2.1.0';
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
  v_components:=world_knowledge_private.resolution_input_components_v3(p_spot_id,p_as_of,v_cutoff);
  v_input_hash:=encode(extensions.digest(pg_catalog.convert_to(v_components::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.rebuild_jobs(spot_id,idempotency_key,mode,as_of,request_hash,input_hash,registry_version,policy_version,resolver_contract,resolver_version,status)
  values(p_spot_id,p_idempotency_key,p_mode,p_as_of,v_request_hash,v_input_hash,v_registry_version,v_policy_version,v_resolver_contract,v_resolver_version,'RUNNING') returning * into job;
  with eligible_pre as (
    select c.*
    from world_knowledge_private.claims c
    join world_knowledge_private.source_policy_attribute_rules policy on policy.policy_version=c.policy_version and policy.attribute_key=c.attribute_key
      and c.source_type=any(policy.allowed_source_types) and c.actor_type=any(policy.allowed_actor_types)
      and c.source_reference_id is not null and 'GENERAL_WORLD'=any(policy.allowed_use_cases)
    where c.spot_id=p_spot_id and c.created_at<=v_cutoff and c.observed_at<=p_as_of and c.visibility<>'SHADOW_HELD' and (c.valid_from is null or c.valid_from<=p_as_of) and (c.valid_until is null or c.valid_until>p_as_of)
      and exists(select 1 from world_knowledge_private.verification_records v where v.claim_id=c.id and v.claim_hash=c.content_hash and v.result='VERIFIED' and v.created_at<=v_cutoff and v.checked_at<=p_as_of and ((v.verification_method='OWNER_CONFIRMED' and 'process:owner-confirmed'=any(policy.verification_process_ids)) or (v.verification_method='ADMIN_CONFIRMED' and 'process:admin-confirmed'=any(policy.verification_process_ids))))
  ), eligible as (
    select c.*
    from eligible_pre c
    where not exists(select 1 from eligible_pre successor where successor.supersedes_claim_id=c.id)
  ), ranked as (
    select c.*,row_number() over(partition by c.attribute_key,c.scope order by c.last_changed_at desc,c.id desc) rn,
      count(*) over(partition by c.attribute_key,c.scope,c.last_changed_at) same_time
    from eligible c
  ), conflict_stats as (
    select c.attribute_key,c.scope,
      count(distinct c.knowledge_state||':'||coalesce(c.value::text,'null')) as distinct_values,
      array_agg(c.content_hash order by c.content_hash) as all_basis_hashes
    from eligible c
    group by c.attribute_key,c.scope
  ), resolved as (
    select e.attribute_key,e.scope,
      case when (e.attribute_key in ('purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts') and s.distinct_values>1) or e.same_time>1 then 'DISPUTED' else e.knowledge_state end resolution,
      case when (e.attribute_key in ('purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts') and s.distinct_values>1) or e.same_time>1 then null else e.value end value,
      case when (e.attribute_key in ('purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts') and s.distinct_values>1) or e.same_time>1 then 'CONFLICTING' else 'VERIFIED' end trust,
      'CURRENT' freshness,
      case when e.attribute_key in ('purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts') and s.distinct_values>1 then s.all_basis_hashes else array(select e2.content_hash from ranked e2 where e2.attribute_key=e.attribute_key and e2.scope=e.scope and e2.last_changed_at=e.last_changed_at order by e2.content_hash) end basis_hashes,
      e.same_time
    from ranked e join conflict_stats s using(attribute_key,scope) where e.rn=1
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
       and not (current_pointer.registry_version in ('backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.registry@2.0') and v_registry_version='backyrd.world-knowledge.registry@2.1' and v_policy_version='backyrd.world-knowledge.source-policy@4b.1' and v_resolver_version='2.1.0')
    then raise exception 'current_projection_version_order_not_configured' using errcode='22023'; end if;
    if (current_pointer.registry_version in ('backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.registry@2.0') and v_registry_version='backyrd.world-knowledge.registry@2.1')
       or p_as_of>current_pointer.as_of
       or (p_as_of=current_pointer.as_of and (select m.ledger_cutoff_at from world_knowledge_private.resolution_manifests m where m.id=v_manifest_id)>current_pointer.ledger_cutoff_at) then
      update world_knowledge_private.current_projection_pointers p set manifest_id=m.id,manifest_hash=m.manifest_hash,as_of=m.as_of,ledger_cutoff_at=m.ledger_cutoff_at,registry_version=m.registry_version,policy_version=m.policy_version,resolver_version=m.resolver_version,updated_at=pg_catalog.clock_timestamp() from world_knowledge_private.resolution_manifests m where p.spot_id=p_spot_id and m.id=v_manifest_id;
      pointer_updated:=true;
    end if;
  end if;
  update world_knowledge_private.rebuild_jobs set status='SUCCEEDED',completed_at=pg_catalog.clock_timestamp(),manifest_id=v_manifest_id where id=job.id;
  return stored||jsonb_build_object('mode',p_mode,'reused',false,'manifestReused',manifest_reused,'pointerUpdated',pointer_updated);
end $$;



revoke execute on function world_knowledge_private.resolution_input_components_v3(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;
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
  expected_components:=case
    when m.registry_version='backyrd.world-knowledge.registry@2.1' then world_knowledge_private.resolution_input_components_v3(m.spot_id,m.as_of,m.ledger_cutoff_at)
    when m.registry_version='backyrd.world-knowledge.registry@2.0' then world_knowledge_private.resolution_input_components_v2(m.spot_id,m.as_of,m.ledger_cutoff_at)
    else world_knowledge_private.resolution_input_components_v1(m.spot_id,m.as_of,m.ledger_cutoff_at)
  end;
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

-- Context is exported through its own fail-closed handoff. It is deliberately
-- absent from the pre-existing Decision candidate projection until Decision
-- Intelligence owns and releases a Capability-to-Intent relation contract.
create or replace function world_knowledge_private.decision_projection_v1(p_snapshot jsonb)
returns jsonb language sql immutable security definer set search_path='' as $$
  select jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.shadow-decision-projection@1.0','spotId',p_snapshot->>'spotId',
    'registryVersion',p_snapshot->>'registryVersion','policyVersion',p_snapshot->>'policyVersion',
    'facts',coalesce(jsonb_agg(item order by item->>'key',item->>'scope') filter(where item->>'key' not like 'contact.%' and item->>'key'<>'description.highlight' and item->>'key' not like 'context.%' and item->>'key' not in ('purpose.primary_visit','offering.onsite')),'[]'::jsonb),
    'explicitUnknowns',coalesce((select jsonb_agg(u order by u->>'key',u->>'scope') from jsonb_array_elements(coalesce(p_snapshot->'explicitUnknowns','[]'::jsonb)) u where u->>'key' not like 'context.%' and u->>'key' not in ('purpose.primary_visit','offering.onsite')),'[]'::jsonb),
    'conflicts',coalesce((select jsonb_agg(c order by c->>'key',c->>'scope') from jsonb_array_elements(coalesce(p_snapshot->'conflicts','[]'::jsonb)) c where c->>'key' not like 'context.%' and c->>'key' not in ('purpose.primary_visit','offering.onsite')),'[]'::jsonb)
  ) from jsonb_array_elements(coalesce(p_snapshot->'facts','[]'::jsonb)) item;
$$;

create or replace function world_knowledge_private.context_handoff_v1(p_snapshot jsonb)
returns jsonb language plpgsql immutable security definer set search_path='' as $$
declare keys constant text[]:=array['purpose.primary_visit','offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts']; body jsonb; facts jsonb; explicit_unknowns jsonb; conflicts jsonb; absent_keys jsonb;
begin
  if p_snapshot->>'registryVersion'<>'backyrd.world-knowledge.registry@2.1' or p_snapshot->>'policyVersion'<>'backyrd.world-knowledge.source-policy@4b.1' then raise exception 'context_handoff_version_mismatch' using errcode='22023'; end if;
  select coalesce(jsonb_object_agg(f->>'key',f),'{}'::jsonb) into facts from jsonb_array_elements(coalesce(p_snapshot->'facts','[]'::jsonb)) f where f->>'key'=any(keys);
  select coalesce(jsonb_agg(u->>'key' order by u->>'key'),'[]'::jsonb) into explicit_unknowns from jsonb_array_elements(coalesce(p_snapshot->'explicitUnknowns','[]'::jsonb)) u where u->>'key'=any(keys);
  select coalesce(jsonb_agg(c order by c->>'key',c->>'scope'),'[]'::jsonb) into conflicts from jsonb_array_elements(coalesce(p_snapshot->'conflicts','[]'::jsonb)) c where c->>'key'=any(keys);
  select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into absent_keys from unnest(keys) k where not facts ? k and not explicit_unknowns ? k;
  body:=jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.context-handoff-shadow@1.0','registryVersion','backyrd.world-knowledge.registry@2.1','policyVersion','backyrd.world-knowledge.source-policy@4b.1',
    'spotId',p_snapshot->>'spotId','resolvedAt',p_snapshot->>'resolvedAt','entries',facts,'absentKeys',absent_keys,'explicitUnknowns',explicit_unknowns,'conflicts',conflicts,
    'exclusions',jsonb_build_array('CAPABILITY_INTENT_MAPPING','CONTACTS','OWNER_TIER','PAYMENT','PRIVATE_PROVENANCE','RANKING_WEIGHTS','SUBSCRIPTION','USER_TASTE')
  );
  return body||jsonb_build_object('handoffHash',encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex'));
end $$;

create or replace function public.world_founder_export_cohort_v1(p_cohort_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; body jsonb; body_hash text; cohort_count integer; current_count integer;
begin
  if not world_knowledge_private.founder_authoring_enabled_v1() then raise exception 'founder_authoring_environment_disabled' using errcode='42501'; end if;
  if length(trim(coalesce(p_cohort_id,''))) not between 1 and 128 then raise exception 'invalid_cohort_id' using errcode='22023'; end if;
  select count(*) into cohort_count from world_knowledge_private.founder_evaluation_spots_v1 f where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  if cohort_count not between 1 and 40 then raise exception 'founder_cohort_size_invalid' using errcode='22023'; end if;
  select count(*) into current_count from world_knowledge_private.founder_evaluation_spots_v1 f join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id where f.lifecycle_status='ACTIVE' and f.cohort_selected and p.registry_version='backyrd.world-knowledge.registry@2.1' and p.policy_version='backyrd.world-knowledge.source-policy@4b.1';
  if current_count<>cohort_count then raise exception 'founder_cohort_rebuild_required' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('spotId',m.spot_id,'manifestHash',m.manifest_hash,'resolutionHash',m.resolution_hash,'inputHash',m.input_hash,'snapshotHash',encode(extensions.digest(pg_catalog.convert_to(m.world_snapshot::text,'UTF8'),'sha256'),'hex'),'contextHandoff',h.handoff,'contextHandoffHash',h.handoff->>'handoffHash') order by m.spot_id),'[]'::jsonb) into rows
  from world_knowledge_private.founder_evaluation_spots_v1 f join world_knowledge_private.current_projection_pointers p on p.spot_id=f.spot_id join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id cross join lateral (select world_knowledge_private.context_handoff_v1(m.world_snapshot) handoff) h where f.lifecycle_status='ACTIVE' and f.cohort_selected;
  body:=jsonb_build_object('contractVersion','backyrd.world-knowledge.founder-cohort-shadow@3.0','scope','FOUNDER_EVALUATION_ONLY','cohortId',p_cohort_id,'registryVersion','backyrd.world-knowledge.registry@2.1','policyVersion','backyrd.world-knowledge.source-policy@4b.1','spots',rows,'exclusions',jsonb_build_array('ADMIN_NOTES','CAPABILITY_INTENT_MAPPING','OWNER_TIER','PAYMENT','PRIVATE_ACTOR_IDS','PRIVATE_SOURCE_REFERENCES','RAW_AI_OUTPUTS','RANKING_WEIGHTS','SUBSCRIPTION','USER_TASTE'));
  body_hash:=encode(extensions.digest(pg_catalog.convert_to(body::text,'UTF8'),'sha256'),'hex'); return body||jsonb_build_object('cohortHash',body_hash);
end $$;

revoke execute on function world_knowledge_private.context_handoff_v1(jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.world_founder_export_cohort_v1(text) from public,anon,authenticated;
grant execute on function public.world_founder_export_cohort_v1(text) to service_role;

-- Keep the catalog-driven security inventory aligned with the append-only
-- authoring tables introduced after the original Slice 3B inventory.  These
-- relations intentionally grant service_role SELECT + INSERT only; requiring
-- UPDATE/DELETE here would make the inventory encourage a weaker ledger
-- boundary than the tables themselves provide.
create or replace view world_knowledge_private.security_inventory_v1
with (security_invoker=true)
as
select
  n.nspname::text as schema_name,
  c.relname::text as object_name,
  case c.relkind when 'r' then 'TABLE' when 'p' then 'PARTITIONED_TABLE' when 'v' then 'VIEW' when 'm' then 'MATERIALIZED_VIEW' end::text as object_type,
  (n.nspname='public') as data_api_schema,
  case when c.relkind in ('r','p') then c.relrowsecurity else null end as rls_enabled,
  (pg_catalog.has_table_privilege('public',c.oid,'SELECT') or pg_catalog.has_table_privilege('public',c.oid,'INSERT') or pg_catalog.has_table_privilege('public',c.oid,'UPDATE') or pg_catalog.has_table_privilege('public',c.oid,'DELETE')) as public_dml,
  (pg_catalog.has_table_privilege('anon',c.oid,'SELECT') or pg_catalog.has_table_privilege('anon',c.oid,'INSERT') or pg_catalog.has_table_privilege('anon',c.oid,'UPDATE') or pg_catalog.has_table_privilege('anon',c.oid,'DELETE')) as anon_dml,
  (pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') or pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT') or pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE') or pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE')) as authenticated_dml,
  (
    pg_catalog.has_table_privilege('service_role',c.oid,'SELECT')
    and (
      c.relkind in ('v','m')
      or (
        pg_catalog.has_table_privilege('service_role',c.oid,'INSERT')
        and (
          c.relname in ('authoring_section_review_events_v1','authoring_taxonomy_candidates_v1','authoring_taxonomy_candidates_v2')
          or (
            pg_catalog.has_table_privilege('service_role',c.oid,'UPDATE')
            and pg_catalog.has_table_privilege('service_role',c.oid,'DELETE')
          )
        )
      )
    )
  ) as service_role_access,
  coalesce((select jsonb_agg(p.polname order by p.polname) from pg_catalog.pg_policy p where p.polrelid=c.oid),'[]'::jsonb) as policies,
  case
    when n.nspname='public' then 'SERVICE_ROLE_SHADOW_ONLY'
    when c.relname in ('claims','source_references','verification_records','confirmation_records','authoring_section_review_events_v1','authoring_taxonomy_candidates_v1','authoring_taxonomy_candidates_v2') then 'AUTHORIZED_SERVER_RPC_APPEND_ONLY'
    when c.relname='identity_events' then 'ADMIN_PREPARATORY_EVENT_ONLY'
    when c.relname in ('resolution_manifests','resolution_entries','current_projection_pointers','rebuild_jobs') then 'SERVICE_ROLE_SHADOW_RESOLVER'
    else 'SERVICE_ROLE_INTERNAL'
  end::text as expected_mutation_authority
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p','v','m')
  and (n.nspname='world_knowledge_private' or (n.nspname='public' and c.relname like 'world_knowledge_%'));

revoke all on world_knowledge_private.security_inventory_v1 from public,anon,authenticated;
grant select on world_knowledge_private.security_inventory_v1 to service_role;
