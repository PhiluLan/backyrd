-- Regional discovery preserves original localities, manifest validation, actor/release authority and consent.
create or replace function public.backyrd_decision_vnext_product_context_v7(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,p_primary_intent text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_events jsonb; v_world jsonb; v_count integer; v_now timestamptz:=clock_timestamp();
  v_localities text[]; v_control jsonb; v_consent public.user_consents%rowtype; v_snapshot jsonb;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_control:=public.backyrd_decision_vnext_product_control_v1(p_release_hash,p_artifact_hash,p_source_set_hash,p_generation);
  if coalesce((v_control->>'enabled')::boolean,false) is not true then
    raise exception 'decision_vnext_product_runtime_off' using errcode='55000';
  end if;
  if p_auth_user_id is null or p_subject_binding_hash is null or p_subject_binding_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_target_city),'') is null or length(p_target_city)>120
     or (p_primary_intent is not null and p_primary_intent not in
       ('EAT','COFFEE','DRINKS','SPORT_MOVEMENT','NATURE_ANIMAL_EXPERIENCE','CULTURE_ART','ACTIVITY_EXPERIENCE','NIGHTLIFE'))
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_context_authority_denied' using errcode='42501';
  end if;
  v_localities := case when lower(btrim(p_target_city))='basel' then array['Basel','Riehen','Bettingen','Birsfelden','Muttenz','Pratteln','Münchenstein','Arlesheim','Reinach','Bottmingen','Binningen','Allschwil','Oberwil','Therwil']::text[] else array[btrim(p_target_city)] end;
  with verified as materialized (
    select s.id spot_id,m.manifest_hash,m.world_snapshot
    from public.spots s
    join world_knowledge_private.current_projection_pointers p on p.spot_id=s.id
    join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
    where s.status='approved'
      and ((m.registry_version='backyrd.world-knowledge.registry@2.5' and m.policy_version='backyrd.world-knowledge.source-policy@4f.1') or (m.registry_version='backyrd.world-knowledge.registry@2.1' and m.policy_version='backyrd.world-knowledge.source-policy@4b.1') or (m.registry_version='backyrd.world-knowledge.registry@2.3' and m.policy_version='backyrd.world-knowledge.source-policy@4d.1') or (m.registry_version='backyrd.world-knowledge.registry@2.4' and m.policy_version='backyrd.world-knowledge.source-policy@4e.1'))
      and (world_knowledge_private.validate_resolution_manifest_v1(m.id)->>'manifestHash')=m.manifest_hash
      and exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='location.locality' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and lower(translate(f->>'value','äöüÄÖÜ','aouAOU'))=
              any(select lower(translate(l,'äöüÄÖÜ','aouAOU')) from unnest(v_localities) l)
      )
      and exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='identity.name' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and nullif(btrim(f->>'value'),'') is not null
      )
      and not exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'conflicts','[]'::jsonb)) conflict
        where conflict->>'key'='location.locality'
      )
    order by s.id
    limit 1001
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.product-resolver-binding@1.0',
    'manifestHash',v.manifest_hash,'registryHash',v.world_snapshot->>'registryHash',
    'resolvedAt',v.world_snapshot->>'resolvedAt',
    'decisionProjection',world_knowledge_private.product_decision_projection_v1(v.world_snapshot)
  ) order by v.spot_id),'[]'::jsonb) into v_count,v_world from verified v;
  if v_count>1000 then raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000'; end if;
  with upcoming as materialized (
    select e.id event_id, o.id occurrence_id, e.primary_source_id, e.title, e.categories, e.decision_tags, e.decision_activities, o.ticket_status,
      case when e.image_rights_verified then e.image_storage_path else null end image_storage_path,
      d.city, d.venue_name, d.address_line, d.matched_spot_id,
      o.start_at,o.end_at,e.status event_status,o.status occurrence_status,
      e.published_at,o.published_at occurrence_published_at,greatest(e.updated_at,o.updated_at) updated_at,
      e.is_free,e.price_min,e.price_currency,e.minimum_age,e.family_friendly,
      coalesce(o.source_url,e.source_url) source_url,coalesce(o.ticket_url,e.ticket_url) ticket_url
    from public.events_v1 e
    join public.event_occurrences_v1 o on o.event_id=e.id
    join public.event_discovery_v1 d on d.occurrence_id=o.id
    where e.primary_source_id in ('manual_admin','manual_owner')
      and e.published_at<=v_now and o.published_at<=v_now
      and e.status not in ('DRAFT','DELETED') and o.status<>'DELETED'
      and lower(translate(btrim(d.city),'äöüÄÖÜ','aouAOU'))=any(select lower(translate(l,'äöüÄÖÜ','aouAOU')) from unnest(v_localities) l)
      and o.start_at < v_now + interval '366 days'
      and (o.end_at > v_now or (o.end_at is null and o.start_at >= date_trunc('day',v_now at time zone 'Europe/Zurich') at time zone 'Europe/Zurich'))
    order by o.start_at,o.id limit 501
  )
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'activities',decision_activities,'tags',decision_tags,'ticketStatus',ticket_status,'imageStoragePath',image_storage_path,
    'eventId',event_id,'occurrenceId',occurrence_id,'source',primary_source_id,'title',title,'categories',categories,
    'city',city,'venueName',venue_name,'address',address_line,'matchedSpotId',matched_spot_id,
    'startAt',start_at,'endAt',end_at,'eventStatus',event_status,'occurrenceStatus',occurrence_status,
    'publishedAt',published_at,'occurrencePublishedAt',occurrence_published_at,'updatedAt',updated_at,
    'isFree',is_free,'priceMin',price_min,'currency',price_currency,'minimumAge',minimum_age,'familyFriendly',family_friendly,
    'sourceUrl',source_url,'ticketUrl',ticket_url,'imageUrl',null
  ) order by start_at,occurrence_id),'[]'::jsonb) into v_count,v_events from upcoming;
  if v_count>500 then raise exception 'decision_event_cohort_limit' using errcode='55000'; end if;
  if jsonb_array_length(v_world)=0 and v_count=0 then raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000'; end if;
  select * into v_consent from public.user_consents c
    where c.user_id=p_auth_user_id and c.purpose_key='personalized_recommendations';
  if not found or v_consent.status<>'granted' then
    return jsonb_build_object('contractVersion','backyrd.decision-vnext.product-runtime-context@1.0',
      'authorizedCity',btrim(p_target_city),'authorizedLocalities',to_jsonb(v_localities),'serverTime',v_now,'worldSnapshots',v_world,'eventOccurrences',v_events,
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
    'authorizedCity',btrim(p_target_city),'authorizedLocalities',to_jsonb(v_localities),'serverTime',v_now,'worldSnapshots',v_world,'eventOccurrences',v_events,
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
revoke all on function public.backyrd_decision_vnext_product_context_v7(uuid,text,text,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.backyrd_decision_vnext_product_context_v7(uuid,text,text,text,text,text,text,bigint) to service_role;
