-- World Knowledge is the sole semantic authoring source for approved spots.
-- Mobile and Web receive canonical identity/location data from the same current
-- World manifest used by Decision vNext. Existing catalog tables remain an
-- untouched compatibility source only for spots that do not yet have a World
-- manifest; they are no longer a second Admin authoring path.

create or replace function public.spot_detail_product_profile_v1(
  p_spot_id uuid,
  p_surface text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_legacy public.spots%rowtype;
  v_pointer world_knowledge_private.current_projection_pointers%rowtype;
  v_values jsonb := '{}'::jsonb;
  v_spot jsonb;
  v_fields jsonb;
begin
  if p_spot_id is null or p_surface not in ('MOBILE','WEB') then
    raise exception 'spot_detail_profile_input_invalid' using errcode = '22023';
  end if;

  select * into v_legacy
  from public.spots spot
  where spot.id = p_spot_id and spot.status = 'approved';
  if not found then
    raise exception 'spot_detail_profile_not_found' using errcode = 'P0002';
  end if;

  select * into v_pointer
  from world_knowledge_private.current_projection_pointers pointer
  where pointer.spot_id = p_spot_id;

  if found then
    select coalesce(jsonb_object_agg(entry.attribute_key, entry.value), '{}'::jsonb)
    into v_values
    from world_knowledge_private.resolution_entries entry
    where entry.manifest_id = v_pointer.manifest_id
      and entry.scope = 'SPOT'
      and entry.resolution in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE')
      and entry.freshness = 'CURRENT'
      and entry.attribute_key in (
        'identity.name','location.address_line1','location.locality',
        'location.country_code','location.latitude','location.longitude',
        'hours.regular'
      );

    if nullif(pg_catalog.btrim(v_values->>'identity.name'), '') is null then
      raise exception 'spot_detail_world_identity_invalid' using errcode = '23514';
    end if;
  end if;

  v_spot := jsonb_build_object(
    'spotId', v_legacy.id,
    'name', case when v_pointer.manifest_id is null
      then v_legacy.name else v_values->>'identity.name' end,
    'addressLine1', case when v_pointer.manifest_id is null
      then v_legacy.address else v_values->>'location.address_line1' end,
    'locality', case when v_pointer.manifest_id is null
      then v_legacy.city else v_values->>'location.locality' end,
    'countryCode', case when v_pointer.manifest_id is null
      then null else v_values->>'location.country_code' end,
    'latitude', case when v_pointer.manifest_id is null
      then to_jsonb(v_legacy.lat) else v_values->'location.latitude' end,
    'longitude', case when v_pointer.manifest_id is null
      then to_jsonb(v_legacy.lng) else v_values->'location.longitude' end,
    'regularHours', case when v_pointer.manifest_id is null
      then null else v_values->'hours.regular' end,
    'source', case when v_pointer.manifest_id is null
      then 'LEGACY_COMPATIBILITY' else 'WORLD_KNOWLEDGE' end,
    'headerPhotoPath', v_legacy.header_photo_path
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'attributeKey',entry.attribute_key,'sectionKey',policy.section_key,
    'sortOrder',policy.sort_order,'scope',entry.scope,'knowledgeState',entry.resolution,
    'value',case when entry.resolution in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE') then entry.value else null end,
    'trust',entry.trust,'freshness',entry.freshness
  ) order by policy.sort_order, entry.attribute_key), '[]'::jsonb)
  into v_fields
  from world_knowledge_private.current_projection_pointers pointer
  join world_knowledge_private.resolution_entries entry
    on entry.manifest_id = pointer.manifest_id
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
    'surface',p_surface,
    'spot',v_spot,
    'worldManifestHash',v_pointer.manifest_hash,
    'fields',v_fields
  );
end;
$$;

revoke all on function public.spot_detail_product_profile_v1(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.spot_detail_product_profile_v1(uuid,text)
  to anon, authenticated, service_role;

comment on function public.spot_detail_product_profile_v1(uuid,text) is
  'Public Spot detail projection. Once a current World manifest exists, identity, location and regular hours come only from that sealed manifest; no legacy semantic fallback is allowed.';
