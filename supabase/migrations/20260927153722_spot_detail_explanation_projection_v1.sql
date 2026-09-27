-- Description highlights are explanation-only World claims. The general
-- Decision/World snapshot intentionally excludes them, but the public Spot
-- reader must still present a current, verified and policy-visible highlight.
-- This changes neither Decision eligibility nor ranking.
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
  v_description jsonb;
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

  -- A verified explanation-only claim is not a Decision fact. Resolve it in
  -- this same public reader, independently of the Decision manifest. Never
  -- expose hidden, unverified, superseded, conflicted or future claims.
  if v_pointer.manifest_id is not null and not exists (
    select 1 from world_knowledge_private.resolution_entries entry
    where entry.manifest_id = v_pointer.manifest_id
      and entry.attribute_key = 'description.highlight' and entry.scope = 'SPOT'
  ) then
    with eligible_pre as (
      select claim.*
      from world_knowledge_private.claims claim
      join world_knowledge_private.source_policy_attribute_rules source_policy
        on source_policy.policy_version = claim.policy_version
       and source_policy.attribute_key = claim.attribute_key
      where claim.spot_id = p_spot_id
        and claim.registry_version = v_pointer.registry_version
        and claim.policy_version = v_pointer.policy_version
        and claim.attribute_key = 'description.highlight'
        and claim.scope = 'SPOT'
        and claim.visibility = 'PUBLIC'
        and claim.stance = 'SUPPORTS'
        and claim.source_type = any(source_policy.allowed_source_types)
        and claim.actor_type = any(source_policy.allowed_actor_types)
        and 'EXPLANATION' = any(source_policy.allowed_use_cases)
        and claim.source_reference_id is not null
        and claim.observed_at <= pg_catalog.clock_timestamp()
        and (claim.valid_from is null or claim.valid_from <= pg_catalog.clock_timestamp())
        and (claim.valid_until is null or claim.valid_until > pg_catalog.clock_timestamp())
        and exists (
          select 1 from world_knowledge_private.verification_records verification
          where verification.claim_id = claim.id
            and verification.claim_hash = claim.content_hash
            and verification.result = 'VERIFIED'
            and verification.checked_at <= pg_catalog.clock_timestamp()
            and ((verification.verification_method = 'OWNER_CONFIRMED'
                and 'process:owner-confirmed' = any(source_policy.verification_process_ids))
              or (verification.verification_method = 'ADMIN_CONFIRMED'
                and 'process:admin-confirmed' = any(source_policy.verification_process_ids)))
        )
    ), eligible as (
      select claim.* from eligible_pre claim
      where not exists (
        select 1 from eligible_pre successor
        where successor.supersedes_claim_id = claim.id
      )
    ), consistent as (
      select count(distinct knowledge_state || ':' || coalesce(value::text, 'null')) = 1 as agreed
      from eligible
    )
    select jsonb_build_object(
      'attributeKey',claim.attribute_key,'sectionKey',policy.section_key,
      'sortOrder',policy.sort_order,'scope',claim.scope,
      'knowledgeState',claim.knowledge_state,'value',claim.value,
      'trust','VERIFIED','freshness','CURRENT'
    ) into v_description
    from eligible claim
    join world_knowledge_private.spot_detail_presentation_policy_v1 policy
      on policy.registry_version = v_pointer.registry_version
     and policy.attribute_key = claim.attribute_key
    cross join consistent
    where consistent.agreed
      and claim.knowledge_state = 'KNOWN_VALUE'
      and policy.public_allowed
      and case when p_surface = 'MOBILE' then policy.mobile_visible else policy.web_visible end
    order by claim.last_changed_at desc, claim.id desc
    limit 1;

    if v_description is not null then
      v_fields := v_fields || jsonb_build_array(v_description);
    end if;
  end if;

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
  'Public Spot detail reader: manifest-bound World facts plus verified, public, policy-visible explanation-only description from the same World claim ledger. Description never changes the Decision projection.';
