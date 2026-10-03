-- Versioned Product retrieval: evaluate the full verified city cohort before
-- ranking semantic facets. The previous category-prioritized 48-spot sample
-- could permanently hide a relevant museum, activity or indoor venue.
create function public.backyrd_decision_vnext_product_context_v5(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,p_primary_intent text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_context jsonb; v_world jsonb; v_count integer;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_context := public.backyrd_decision_vnext_product_context_v4(
    p_auth_user_id,p_subject_binding_hash,p_target_city,
    case when p_primary_intent='NIGHTLIFE' then 'DRINKS' else p_primary_intent end,
    p_release_hash,p_artifact_hash,p_source_set_hash,p_generation
  );
  with verified as materialized (
    select s.id spot_id,m.manifest_hash,m.world_snapshot
    from public.spots s
    join world_knowledge_private.current_projection_pointers p on p.spot_id=s.id
    join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
    where s.status='approved'
      and m.registry_version='backyrd.world-knowledge.registry@2.1'
      and m.policy_version='backyrd.world-knowledge.source-policy@4b.1'
      and (world_knowledge_private.validate_resolution_manifest_v1(m.id)->>'manifestHash')=m.manifest_hash
      and exists (
        select 1 from jsonb_array_elements(coalesce(m.world_snapshot->'facts','[]'::jsonb)) f
        where f->>'key'='location.locality' and f->>'resolution'='KNOWN_VALUE'
          and f->>'trust'='VERIFIED' and f->>'freshness'='CURRENT'
          and lower(translate(f->>'value','äöüÄÖÜ','aouAOU'))=
              lower(translate(btrim(p_target_city),'äöüÄÖÜ','aouAOU'))
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
  if v_count=0 or v_count>1000 then
    raise exception 'decision_vnext_product_world_cohort_unavailable' using errcode='55000';
  end if;
  return v_context||jsonb_build_object('worldSnapshots',v_world);
end;
$$;
revoke all on function public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)
  to service_role;
