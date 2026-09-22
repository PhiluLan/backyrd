-- One canonical World Knowledge source, two independently controlled public
-- presentation surfaces. Presentation policy never mutates claims, manifests,
-- snapshots or Decision projections.

create table world_knowledge_private.spot_detail_presentation_policy_v1 (
  registry_version text not null,
  attribute_key text not null,
  section_key text not null check (section_key in (
    'IDENTITY','LOCATION','DESCRIPTION','CLASSIFICATION','PURPOSE','OFFERING',
    'CONTEXT','PRICE','HOURS','CAPACITY','RULES','AMENITIES','ACCESSIBILITY','CONTACT'
  )),
  sort_order integer not null check (sort_order between 0 and 10000),
  mobile_visible boolean not null default false,
  web_visible boolean not null default false,
  unknown_behavior text not null default 'HIDE' check (unknown_behavior in ('HIDE','SHOW_UNKNOWN')),
  public_allowed boolean not null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete restrict,
  primary key (registry_version, attribute_key),
  foreign key (registry_version, attribute_key)
    references world_knowledge_private.attribute_definitions(registry_version, attribute_key)
    on delete restrict
);

create table world_knowledge_private.spot_detail_presentation_audit_v1 (
  id bigint generated always as identity primary key,
  registry_version text not null,
  attribute_key text not null,
  previous_value jsonb not null,
  next_value jsonb not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  foreign key (registry_version, attribute_key)
    references world_knowledge_private.spot_detail_presentation_policy_v1(registry_version, attribute_key)
    on delete restrict
);

alter table world_knowledge_private.spot_detail_presentation_policy_v1 enable row level security;
alter table world_knowledge_private.spot_detail_presentation_audit_v1 enable row level security;
revoke all on world_knowledge_private.spot_detail_presentation_policy_v1 from public, anon, authenticated;
revoke all on world_knowledge_private.spot_detail_presentation_audit_v1 from public, anon, authenticated;
grant select, insert, update, delete on world_knowledge_private.spot_detail_presentation_policy_v1 to service_role;
grant select, insert on world_knowledge_private.spot_detail_presentation_audit_v1 to service_role;
grant usage, select on sequence world_knowledge_private.spot_detail_presentation_audit_v1_id_seq to service_role;

insert into world_knowledge_private.spot_detail_presentation_policy_v1 (
  registry_version, attribute_key, section_key, sort_order,
  mobile_visible, web_visible, unknown_behavior, public_allowed
)
select
  definition.registry_version,
  definition.attribute_key,
  case
    when definition.attribute_key like 'identity.%' then 'IDENTITY'
    when definition.attribute_key like 'location.%' then 'LOCATION'
    when definition.attribute_key like 'description.%' then 'DESCRIPTION'
    when definition.attribute_key like 'classification.%' then 'CLASSIFICATION'
    when definition.attribute_key like 'purpose.%' then 'PURPOSE'
    when definition.attribute_key like 'offering.%' then 'OFFERING'
    when definition.attribute_key like 'context.%' then 'CONTEXT'
    when definition.attribute_key like 'operation.price%' then 'PRICE'
    when definition.attribute_key like 'hours.%' or definition.attribute_key = 'state.current' then 'HOURS'
    when definition.attribute_key like 'capacity.%' then 'CAPACITY'
    when definition.attribute_key like 'rule.%' or definition.attribute_key like 'operation.%' then 'RULES'
    when definition.attribute_key like 'amenity.%' then 'AMENITIES'
    when definition.attribute_key like 'accessibility.%' then 'ACCESSIBILITY'
    when definition.attribute_key like 'contact.%' then 'CONTACT'
    else 'DESCRIPTION'
  end,
  row_number() over (order by definition.attribute_key) * 10,
  definition.attribute_key in (
    'description.highlight','classification.primary_category','classification.place_types',
    'purpose.primary_visit','offering.cuisines','offering.food_specialities','offering.groups',
    'offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts',
    'operation.price_level','hours.regular','hours.special','state.current','amenity.features',
    'accessibility.step_free_entrance','accessibility.accessible_toilet','accessibility.elevator',
    'rule.pet_access','rule.age_access_conditions','contact.website','contact.phone'
  ),
  definition.attribute_key in (
    'description.highlight','classification.primary_category','classification.place_types',
    'purpose.primary_visit','offering.cuisines','offering.food_specialities','offering.groups',
    'offering.onsite','context.visit_situations','context.atmosphere','context.typical_dayparts',
    'operation.price_level','hours.regular','hours.special','state.current','amenity.features',
    'accessibility.step_free_entrance','accessibility.accessible_toilet','accessibility.elevator',
    'rule.pet_access','rule.age_access_conditions','contact.website','contact.phone'
  ),
  'HIDE',
  definition.attribute_key not in (
    'location.latitude','location.longitude','location.timezone','research.subjective_fits'
  )
from world_knowledge_private.attribute_definitions definition
where definition.registry_version = 'backyrd.world-knowledge.registry@2.1';

create function public.admin_spot_presentation_policy_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_fields jsonb;
begin
  if auth.uid() is null or not public.admin_is_admin_v1() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'attributeKey', policy.attribute_key,
    'sectionKey', policy.section_key,
    'sortOrder', policy.sort_order,
    'mobileVisible', policy.mobile_visible,
    'webVisible', policy.web_visible,
    'unknownBehavior', policy.unknown_behavior,
    'publicAllowed', policy.public_allowed,
    'engineAuthorization', definition.engine_authorization,
    'valueType', definition.value_type,
    'updatedAt', policy.updated_at
  ) order by policy.sort_order, policy.attribute_key), '[]'::jsonb)
  into v_fields
  from world_knowledge_private.spot_detail_presentation_policy_v1 policy
  join world_knowledge_private.attribute_definitions definition
    on definition.registry_version = policy.registry_version
   and definition.attribute_key = policy.attribute_key
  where policy.registry_version = 'backyrd.world-knowledge.registry@2.1';
  return jsonb_build_object(
    'contractVersion','backyrd.spot-detail-presentation-policy@1.0',
    'registryVersion','backyrd.world-knowledge.registry@2.1',
    'fields',v_fields
  );
end;
$$;

create function public.admin_update_spot_presentation_policy_v1(
  p_attribute_key text,
  p_mobile_visible boolean,
  p_web_visible boolean,
  p_unknown_behavior text default 'HIDE'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_before jsonb; v_after jsonb;
begin
  if v_actor is null or not public.admin_is_admin_v1() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_attribute_key is null or p_unknown_behavior not in ('HIDE','SHOW_UNKNOWN') then
    raise exception 'presentation_policy_input_invalid' using errcode = '22023';
  end if;
  select to_jsonb(policy) into v_before
  from world_knowledge_private.spot_detail_presentation_policy_v1 policy
  where policy.registry_version = 'backyrd.world-knowledge.registry@2.1'
    and policy.attribute_key = p_attribute_key
  for update;
  if v_before is null then
    raise exception 'presentation_policy_field_unknown' using errcode = '22023';
  end if;
  if coalesce((v_before->>'public_allowed')::boolean,false) is not true
     and (p_mobile_visible or p_web_visible) then
    raise exception 'presentation_policy_field_not_public' using errcode = '42501';
  end if;
  update world_knowledge_private.spot_detail_presentation_policy_v1
  set mobile_visible = p_mobile_visible,
      web_visible = p_web_visible,
      unknown_behavior = p_unknown_behavior,
      updated_at = clock_timestamp(),
      updated_by = v_actor
  where registry_version = 'backyrd.world-knowledge.registry@2.1'
    and attribute_key = p_attribute_key
  returning to_jsonb(spot_detail_presentation_policy_v1.*) into v_after;
  insert into world_knowledge_private.spot_detail_presentation_audit_v1(
    registry_version,attribute_key,previous_value,next_value,actor_id
  ) values ('backyrd.world-knowledge.registry@2.1',p_attribute_key,v_before,v_after,v_actor);
  return jsonb_build_object(
    'contractVersion','backyrd.spot-detail-presentation-policy-update@1.0',
    'attributeKey',p_attribute_key,
    'mobileVisible',p_mobile_visible,
    'webVisible',p_web_visible,
    'unknownBehavior',p_unknown_behavior
  );
end;
$$;

create function public.spot_detail_product_profile_v1(
  p_spot_id uuid,
  p_surface text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_spot jsonb; v_fields jsonb; v_manifest_hash text;
begin
  if p_spot_id is null or p_surface not in ('MOBILE','WEB') then
    raise exception 'spot_detail_profile_input_invalid' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'spotId',spot.id,'name',spot.name,'slug',spot.slug,'address',spot.address,
    'city',spot.city,'country',spot.country,'categoryId',spot.category_id,
    'headerPhotoPath',spot.header_photo_path
  ) into v_spot
  from public.spots spot
  where spot.id = p_spot_id and spot.status = 'approved';
  if v_spot is null then
    raise exception 'spot_detail_profile_not_found' using errcode = 'P0002';
  end if;
  select pointer.manifest_hash into v_manifest_hash
  from world_knowledge_private.current_projection_pointers pointer
  where pointer.spot_id = p_spot_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'attributeKey',entry.attribute_key,'sectionKey',policy.section_key,
    'sortOrder',policy.sort_order,'scope',entry.scope,'knowledgeState',entry.resolution,
    'value',case when entry.resolution in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE') then entry.value else null end,
    'trust',entry.trust,'freshness',entry.freshness
  ) order by policy.sort_order, entry.attribute_key), '[]'::jsonb)
  into v_fields
  from world_knowledge_private.current_projection_pointers pointer
  join world_knowledge_private.resolution_entries entry on entry.manifest_id = pointer.manifest_id
  join world_knowledge_private.spot_detail_presentation_policy_v1 policy
    on policy.registry_version = pointer.registry_version
   and policy.attribute_key = entry.attribute_key
  where pointer.spot_id = p_spot_id
    and policy.public_allowed
    and case when p_surface = 'MOBILE' then policy.mobile_visible else policy.web_visible end
    and (entry.resolution in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE')
      or (entry.resolution = 'UNKNOWN' and policy.unknown_behavior = 'SHOW_UNKNOWN'));
  return jsonb_build_object(
    'contractVersion','backyrd.spot-detail-product-profile@1.0',
    'surface',p_surface,'spot',v_spot,'worldManifestHash',v_manifest_hash,'fields',v_fields
  );
end;
$$;

revoke all on function public.admin_spot_presentation_policy_v1() from public, anon, authenticated, service_role;
revoke all on function public.admin_update_spot_presentation_policy_v1(text,boolean,boolean,text) from public, anon, authenticated, service_role;
revoke all on function public.spot_detail_product_profile_v1(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_spot_presentation_policy_v1() to authenticated;
grant execute on function public.admin_update_spot_presentation_policy_v1(text,boolean,boolean,text) to authenticated;
grant execute on function public.spot_detail_product_profile_v1(uuid,text) to anon, authenticated, service_role;

comment on function public.spot_detail_product_profile_v1(uuid,text) is
  'Canonical approved-spot detail projection from current World Knowledge. Presentation policy cannot change Decision snapshots.';
