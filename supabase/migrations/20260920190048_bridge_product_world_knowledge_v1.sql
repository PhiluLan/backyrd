-- Product-only read view. The immutable shadow projection and its sealed manifests are untouched.
-- Context is included only from a validated canonical snapshot; no contact or actor data.
create function world_knowledge_private.product_decision_projection_v1(p_snapshot jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  with base as (
    select world_knowledge_private.decision_projection_v1(p_snapshot) as body
  ), assembled as (
    select item from base, jsonb_array_elements(base.body->'facts') item
      where item->>'key' not like 'contact.%' and item->>'key' not in ('description.highlight','operation.payment_methods')
    union all
    select item from jsonb_array_elements(coalesce(p_snapshot->'facts','[]'::jsonb)) item
      where item->>'key'=any(array['purpose.primary_visit','offering.onsite',
        'context.visit_situations','context.atmosphere','context.typical_dayparts'])
  ), facts as (
    select case when a.item->>'key'='state.current' then a.item||jsonb_build_object(
      'validFrom',c.valid_from,'validUntil',c.valid_until,'validityVerified',c.id is not null)
      else a.item end as item
    from assembled a
    left join world_knowledge_private.claims c
      on a.item->>'key'='state.current'
     and c.spot_id=(p_snapshot->>'spotId')::uuid
     and c.content_hash=a.item->'basisClaimHashes'->>0
  ), unknowns as (
    select item from base,jsonb_array_elements(base.body->'explicitUnknowns') item
      where item->>'key' not like 'contact.%' and item->>'key' not in ('description.highlight','operation.payment_methods')
    union all
    select item from jsonb_array_elements(coalesce(p_snapshot->'explicitUnknowns','[]'::jsonb)) item
      where item->>'key'=any(array['purpose.primary_visit','offering.onsite',
        'context.visit_situations','context.atmosphere','context.typical_dayparts'])
  ), conflicts as (
    select item from base,jsonb_array_elements(base.body->'conflicts') item
      where item->>'key' not like 'contact.%' and item->>'key' not in ('description.highlight','operation.payment_methods')
    union all
    select item from jsonb_array_elements(coalesce(p_snapshot->'conflicts','[]'::jsonb)) item
      where item->>'key'=any(array['purpose.primary_visit','offering.onsite',
        'context.visit_situations','context.atmosphere','context.typical_dayparts'])
  )
  select jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.product-decision-projection@1.0',
    'spotId',p_snapshot->>'spotId','registryVersion',p_snapshot->>'registryVersion',
    'policyVersion',p_snapshot->>'policyVersion',
    'facts',coalesce((select jsonb_agg(item order by item->>'key',item->>'scope') from facts),'[]'::jsonb),
    'explicitUnknowns',coalesce((select jsonb_agg(item order by item->>'key',item->>'scope') from unknowns),'[]'::jsonb),
    'conflicts',coalesce((select jsonb_agg(item order by item->>'key',item->>'scope') from conflicts),'[]'::jsonb)
  );
$$;
revoke all on function world_knowledge_private.product_decision_projection_v1(jsonb)
  from public,anon,authenticated,service_role;

-- Existing single transport keeps its service-only authority and 48-row bound.
create or replace function public.backyrd_decision_vnext_product_context_v2(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,p_primary_intent text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_control jsonb;v_world jsonb;v_consent public.user_consents%rowtype;
  v_snapshot jsonb;v_count integer;v_now timestamptz:=clock_timestamp();
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode='55000';
  end if;
  if p_auth_user_id is null or p_subject_binding_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_target_city),'') is null or length(p_target_city)>120
     or (p_primary_intent is not null and p_primary_intent not in
       ('EAT','COFFEE','DRINKS','SPORT_MOVEMENT','NATURE_ANIMAL_EXPERIENCE','CULTURE_ART','ACTIVITY_EXPERIENCE'))
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_context_authority_denied' using errcode='42501';
  end if;
  with catalog as materialized (
    select s.id spot_id
    from public.spots s
    join world_knowledge_private.current_projection_pointers p on p.spot_id=s.id
    join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
    left join public.categories c on c.id=s.category_id
    where s.status='approved'
      and exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='location.locality' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and lower(translate(f->>'value','äöüÄÖÜ','aouAOU'))=
              lower(translate(btrim(p_target_city),'äöüÄÖÜ','aouAOU'))
      )
    order by case
      when p_primary_intent is not null and exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'resolution'='KNOWN_VALUE' and f->>'trust'='VERIFIED'
          and f->>'freshness'='CURRENT' and (
            (f->>'key'='classification.primary_category' and f->>'value'=any(
              case p_primary_intent
                when 'EAT' then array['EAT']
                when 'COFFEE' then array['COFFEE_DAYTIME']
                when 'DRINKS' then array['DRINKS','NIGHTLIFE']
                when 'SPORT_MOVEMENT' then array['SPORT_MOVEMENT']
                when 'NATURE_ANIMAL_EXPERIENCE' then array['OUTDOOR_NATURE']
                when 'CULTURE_ART' then array['CULTURE_ART']
                when 'ACTIVITY_EXPERIENCE' then array['ACTIVITY_EXPERIENCE']
                else array[]::text[] end))
            or (f->>'key'='classification.place_types' and f->'value' ?| (
              case p_primary_intent
                when 'EAT' then array['RESTAURANT','BRASSERIE','BISTRO']
                when 'COFFEE' then array['CAFE']
                when 'DRINKS' then array['PUB','WINE_BAR','BAR','BREWERY','TAPROOM','COCKTAIL_BAR','LOUNGE']
                when 'SPORT_MOVEMENT' then array['CLIMBING_GYM','GYM','SPORTS_CENTRE','SPORTS_COURT']
                when 'NATURE_ANIMAL_EXPERIENCE' then array['PARK','NATURE_RESERVE','ZOO','AQUARIUM']
                when 'CULTURE_ART' then array['MUSEUM']
                when 'ACTIVITY_EXPERIENCE' then array['ACTIVITY_VENUE']
                else array[]::text[] end))
          )
      ) then -2
      when p_primary_intent='COFFEE' and exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='classification.primary_category'
          and f->>'value'='COFFEE_DAYTIME' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
      ) then -1
      when p_primary_intent='COFFEE' and exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='classification.place_types'
          and f->'value' ? 'CAFE' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
      ) then -1
      when p_primary_intent='EAT' and c.name='Restaurant' then 0
      when p_primary_intent='COFFEE' and c.name='Café' then 0
      when p_primary_intent='DRINKS' and c.name='Bar' then 0
      when p_primary_intent='SPORT_MOVEMENT' and c.name='Activity' then 0
      when p_primary_intent='NATURE_ANIMAL_EXPERIENCE' and c.name in ('Activity','Special experience','Viewpoint') then 0
      when p_primary_intent='CULTURE_ART' and c.name='Museum' then 0
      when p_primary_intent='ACTIVITY_EXPERIENCE' and c.name in ('Activity','Special experience') then 0
      else 1 end,
      md5(s.id::text || p_subject_binding_hash),s.id
    limit 48
  ), verified as materialized (
    select p.spot_id,m.manifest_hash,m.world_snapshot,m.decision_projection
    from catalog c
    join world_knowledge_private.current_projection_pointers p on p.spot_id=c.spot_id
    join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
    where m.registry_version='backyrd.world-knowledge.registry@2.1'
      and m.policy_version='backyrd.world-knowledge.source-policy@4b.1'
      and (world_knowledge_private.validate_resolution_manifest_v1(m.id)->>'manifestHash')=m.manifest_hash
      and exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='location.locality' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and lower(translate(f->>'value','äöüÄÖÜ','aouAOU'))=
              lower(translate(btrim(p_target_city),'äöüÄÖÜ','aouAOU'))
      )
      and exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='identity.name' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and nullif(btrim(f->>'value'),'') is not null
      )
      and not exists(
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'conflicts','[]'::jsonb)) conflict
        where conflict->>'key'='location.locality'
      )
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.product-resolver-binding@1.0',
    'manifestHash',v.manifest_hash,'registryHash',v.world_snapshot->>'registryHash',
    'resolvedAt',v.world_snapshot->>'resolvedAt','decisionProjection',world_knowledge_private.product_decision_projection_v1(v.world_snapshot)
  ) order by v.spot_id),'[]'::jsonb) into v_count,v_world from verified v;
  if v_count=0 or v_count>48 then
    raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000';
  end if;
  select * into v_consent from public.user_consents c
    where c.user_id=p_auth_user_id and c.purpose_key='personalized_recommendations';
  if not found or v_consent.status<>'granted' then
    return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
      'authorizedCity',btrim(p_target_city),'serverTime',v_now,'worldSnapshots',v_world,
      'status','NO_CONSENT','consent',null,'snapshot',null);
  end if;
  select jsonb_build_object('snapshotId',s.snapshot_id,'snapshotHash',s.snapshot_hash,
      'runtimeVersion',s.runtime_version,'sourceHash',s.source_hash,
      'nodes',coalesce((select jsonb_agg(n.node order by n.node_key)
        from public.backyrd_user_intelligence_snapshot_nodes_v1 n where n.snapshot_id=s.snapshot_id),'[]'::jsonb))
    into v_snapshot
  from public.backyrd_user_intelligence_latest_v1 l
  join public.backyrd_user_intelligence_snapshots_v2 s on s.snapshot_id=l.snapshot_id and s.user_id=l.user_id
  where l.user_id=p_auth_user_id and s.status='COMMITTED';
  return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
    'authorizedCity',btrim(p_target_city),'serverTime',v_now,'worldSnapshots',v_world,
    'status',case when v_snapshot is null then 'MISSING_SNAPSHOT' else 'ACTIVE' end,
    'consent',jsonb_build_object(
      'contractVersion','backyrd.user-intelligence.consent-envelope@1.0',
      'purpose','PERSONALIZED_RECOMMENDATIONS','state','GRANTED',
      'consentVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),
      'policyVersion',coalesce(v_consent.document_id::text,'personalized-recommendations-v1'),
      'uxVersion','canonical-consent-ledger-v1','effectiveAt',v_consent.granted_at,
      'captureContext',case when v_consent.source='mobile' then 'ONBOARDING' when v_consent.source='web' then 'SETTINGS' else 'MIGRATION_VERIFIED' end,
      'allowedProcessing',jsonb_build_array('PERSONALIZATION_EVIDENCE','TRANSPARENCY','EXPORT','ERASURE'),
      'lifecycleEffect','ALLOW'),'snapshot',v_snapshot);
end;
$$;

revoke all on function public.backyrd_decision_vnext_product_context_v2(uuid,text,text,text,text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.backyrd_decision_vnext_product_context_v2(uuid,text,text,text,text,text,text,bigint)
  to service_role;
