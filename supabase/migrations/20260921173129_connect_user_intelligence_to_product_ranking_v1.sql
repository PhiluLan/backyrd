-- Connect the consent-bound canonical User snapshot and durable Product
-- learning to the single Decision-vNext Product context. This is additive:
-- v3 remains byte-identical for rollback, while the deployed adapter selects
-- v4. Contextual rejects are deliberately excluded from durable preference.

create function public.backyrd_decision_vnext_product_context_v4(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,p_primary_intent text,
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_base_snapshot jsonb;
  v_nodes jsonb := '[]'::jsonb;
  v_direct jsonb := '[]'::jsonb;
  v_domains jsonb := '[]'::jsonb;
  v_snapshot_body jsonb;
  v_snapshot_hash text;
  v_item_count integer := 0;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  v_context := public.backyrd_decision_vnext_product_context_v3(
    p_auth_user_id,p_subject_binding_hash,p_target_city,p_primary_intent,
    p_release_hash,p_artifact_hash,p_source_set_hash,p_generation
  );

  -- No consent means no snapshot lookup, no learning lookup and no profile
  -- detail. Preserve the v3 privacy-neutral envelope exactly.
  if v_context->>'status' = 'NO_CONSENT' then return v_context; end if;
  if v_context->>'status' not in ('ACTIVE','MISSING_SNAPSHOT')
     or v_context->'consent' is null then
    raise exception 'decision_vnext_product_user_context_invalid' using errcode='55000';
  end if;

  v_base_snapshot := v_context->'snapshot';
  if jsonb_typeof(v_base_snapshot)='object' then
    v_nodes := coalesce(v_base_snapshot->'nodes','[]'::jsonb);
    if jsonb_typeof(v_nodes)<>'array' then
      raise exception 'decision_vnext_product_user_snapshot_invalid' using errcode='55000';
    end if;
  end if;

  with active_records as materialized (
    select r.*
    from decision_vnext_private.product_learning_records_v1 r
    where r.user_id=p_auth_user_id
      and not exists (
        select 1 from decision_vnext_private.product_learning_records_v1 c
        where c.user_id=r.user_id and c.event_type='event_correction'
          and c.record->>'targetEventId'=r.event_id
          and c.record->>'targetRecordHash'=r.record_hash
      )
  ), per_spot as (
    select r.record->>'spotId' spot_id,
      max(r.occurred_at) filter(where r.event_type='candidate_opened') opened_at,
      max(r.occurred_at) filter(where r.event_type='candidate_saved') saved_at,
      max(r.occurred_at) filter(where r.event_type='outcome_confirmed') visited_at,
      max(r.occurred_at) filter(where r.event_type='explicit_feedback' and r.record#>>'{feedback,response}'='HAS_MATCHED') matched_at,
      max(r.occurred_at) filter(where r.event_type='explicit_feedback' and r.record#>>'{feedback,response}'='HAS_NOT_MATCHED') excluded_at,
      count(*) filter(where r.event_type in ('candidate_saved','outcome_confirmed')
        or (r.event_type='explicit_feedback' and r.record#>>'{feedback,response}'='HAS_MATCHED')) positive_count
    from active_records r
    where r.event_type in ('candidate_opened','candidate_saved','explicit_feedback','outcome_confirmed')
      and nullif(r.record->>'spotId','') is not null
    group by r.record->>'spotId'
  ), classified as (
    select spot_id,
      case
        when excluded_at is not null and excluded_at>greatest(
          coalesce(saved_at,'-infinity'::timestamptz),coalesce(visited_at,'-infinity'::timestamptz),coalesce(matched_at,'-infinity'::timestamptz)
        ) then 'EXCLUDED'
        when visited_at is not null and visited_at>=coalesce(excluded_at,'-infinity'::timestamptz) then 'VISITED'
        when positive_count>=2 and greatest(coalesce(saved_at,'-infinity'::timestamptz),coalesce(matched_at,'-infinity'::timestamptz))>=coalesce(excluded_at,'-infinity'::timestamptz) then 'REPEATEDLY_SELECTED'
        when greatest(coalesce(saved_at,'-infinity'::timestamptz),coalesce(matched_at,'-infinity'::timestamptz))>=coalesce(excluded_at,'-infinity'::timestamptz)
             and (saved_at is not null or matched_at is not null) then 'SAVED'
        when opened_at is not null then 'OBSERVED'
        else null end state,
      case
        when excluded_at is not null and excluded_at>greatest(coalesce(saved_at,'-infinity'::timestamptz),coalesce(visited_at,'-infinity'::timestamptz),coalesce(matched_at,'-infinity'::timestamptz)) then .90
        when visited_at is not null and visited_at>=coalesce(excluded_at,'-infinity'::timestamptz) then .95
        when positive_count>=2 then .85
        when saved_at is not null or matched_at is not null then .70
        else .25 end confidence,
      greatest(coalesce(opened_at,'-infinity'::timestamptz),coalesce(saved_at,'-infinity'::timestamptz),
        coalesce(visited_at,'-infinity'::timestamptz),coalesce(matched_at,'-infinity'::timestamptz),coalesce(excluded_at,'-infinity'::timestamptz)) latest_at
    from per_spot
  ), bounded as (
    select * from classified where state is not null order by latest_at desc,spot_id limit 32
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'relationshipId','product-direct-'||replace(spot_id,'-',''),
    'spotId',spot_id,'state',state,'confidence',confidence
  ) order by spot_id),'[]'::jsonb) into v_direct from bounded;

  v_item_count := jsonb_array_length(v_nodes)+jsonb_array_length(v_direct);
  if v_item_count=0 then return v_context; end if;

  v_domains := jsonb_build_array(
    jsonb_build_object('domain','taste','sufficiency',jsonb_build_object(
      'level',case when jsonb_array_length(v_nodes)=0 then 'UNKNOWN' when jsonb_array_length(v_nodes)<3 then 'LOW' else 'PARTIAL' end,
      'policyRef','backyrd-product-learning-projection-policy-v1',
      'reasons',jsonb_build_array(case when jsonb_array_length(v_nodes)=0 then 'NO_PROJECTABLE_EVIDENCE' else 'CANONICAL_SNAPSHOT_NODES' end))),
    jsonb_build_object('domain','direct-spot','sufficiency',jsonb_build_object(
      'level',case when jsonb_array_length(v_direct)=0 then 'UNKNOWN' when jsonb_array_length(v_direct)<3 then 'LOW' else 'PARTIAL' end,
      'policyRef','backyrd-product-learning-projection-policy-v1',
      'reasons',jsonb_build_array(case when jsonb_array_length(v_direct)=0 then 'NO_PROJECTABLE_EVIDENCE' else 'CONSENT_BOUND_PRODUCT_EVENTS' end))),
    jsonb_build_object('domain','practical','sufficiency',jsonb_build_object(
      'level','UNKNOWN','policyRef','backyrd-product-learning-projection-policy-v1',
      'reasons',jsonb_build_array('NO_PROJECTABLE_EVIDENCE')))
  );
  v_snapshot_body := jsonb_build_object(
    'baseSnapshotHash',v_base_snapshot->>'snapshotHash','runtimeVersion','backyrd-product-user-ranking-v1',
    'nodes',v_nodes,'practical','[]'::jsonb,'directSpot',v_direct,'domainSufficiency',v_domains,
    'knowledgeLevel',case when v_item_count<3 then 'LOW' else 'PARTIAL' end
  );
  v_snapshot_hash := encode(extensions.digest(convert_to(v_snapshot_body::text,'UTF8'),'sha256'),'hex');
  return v_context||jsonb_build_object(
    'status','ACTIVE',
    'snapshot',v_snapshot_body||jsonb_build_object(
      'snapshotId','product-snapshot-'||substring(v_snapshot_hash from 1 for 32),
      'snapshotHash',v_snapshot_hash,'sourceHash',v_snapshot_hash)
  );
end;
$$;

revoke all on function public.backyrd_decision_vnext_product_context_v4(uuid,text,text,text,text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.backyrd_decision_vnext_product_context_v4(uuid,text,text,text,text,text,text,bigint)
  to service_role;

comment on function public.backyrd_decision_vnext_product_context_v4(uuid,text,text,text,text,text,text,bigint)
  is 'Service-only Product context. Projects consent-bound canonical taste and durable direct-spot learning; contextual rejects never become global dislike.';
