-- Product v1 activation is a short-lived, operator-authorized lease. Applying
-- this migration never changes generation zero / OFF. PostgREST roles cannot
-- execute the ON transition; the manual release operator must hold postgres.
alter table decision_vnext_private.product_runtime_control_events_v1
  add column authority_version text,
  add column authority_expires_at timestamptz;

alter table decision_vnext_private.product_runtime_control_events_v1
  add constraint product_runtime_control_lease_v1 check (
    (state = 'OFF' and authority_version is null and authority_expires_at is null)
    or (state = 'ON' and authority_version = 'backyrd.decision-vnext.product-activation-authority@1.0'
        and authority_expires_at is not null)
  );

create function public.backyrd_decision_vnext_product_activate_v1(
  p_expected_generation bigint,p_release_hash text,p_artifact_hash text,
  p_source_set_hash text,p_authority_hash text,p_expires_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_current decision_vnext_private.product_runtime_control_events_v1%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp(); v_next bigint;
begin
  if current_user <> 'postgres' then
    raise exception 'decision_vnext_product_release_operator_required' using errcode = '42501';
  end if;
  if p_expected_generation is null or p_expected_generation < 0
     or p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_authority_hash is null or p_authority_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null or p_expires_at <= v_now + interval '1 minute'
     or p_expires_at > v_now + interval '24 hours' then
    raise exception 'decision_vnext_product_activation_authority_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_current from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  if v_current.generation <> p_expected_generation then
    raise exception 'decision_vnext_product_control_generation_conflict' using errcode = '40001';
  end if;
  if v_current.state <> 'OFF' then
    raise exception 'decision_vnext_product_activation_requires_off' using errcode = '55000';
  end if;
  v_next := v_current.generation + 1;
  insert into decision_vnext_private.product_runtime_control_events_v1(
    generation,state,release_hash,artifact_hash,source_set_hash,reason_code,
    authority_hash,authority_version,authority_expires_at
  ) values (
    v_next,'ON',p_release_hash,p_artifact_hash,p_source_set_hash,'OPERATOR_ACTIVATION',
    p_authority_hash,'backyrd.decision-vnext.product-activation-authority@1.0',p_expires_at
  );
  return jsonb_build_object(
    'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
    'state','ON','enabled',true,'killSwitch',false,'generation',v_next,
    'releaseHash',p_release_hash,'artifactHash',p_artifact_hash,
    'sourceSetHash',p_source_set_hash,'authorityHash',p_authority_hash,
    'authorityVersion','backyrd.decision-vnext.product-activation-authority@1.0',
    'expiresAt',p_expires_at
  );
end;
$$;

revoke all on function public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.backyrd_decision_vnext_product_control_v1(
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_generation is null or p_generation < 1 then
    raise exception 'decision_vnext_product_control_input_invalid' using errcode = '22023';
  end if;
  -- Shared transaction lock serializes every Product read/write authority
  -- check with the exclusive Emergency-OFF transition. The event lookup must
  -- happen after the lock is acquired so an in-flight request cannot resume
  -- a protected RPC on a stale ON generation.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_control from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  if v_control.generation <> p_generation
     or v_control.release_hash is distinct from p_release_hash
     or v_control.artifact_hash is distinct from p_artifact_hash
     or v_control.source_set_hash is distinct from p_source_set_hash
     or v_control.state <> 'ON'
     or v_control.authority_version is distinct from 'backyrd.decision-vnext.product-activation-authority@1.0'
     or v_control.authority_expires_at is null
     or v_control.authority_expires_at <= pg_catalog.clock_timestamp() then
    return jsonb_build_object(
      'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
      'state','OFF','enabled',false,'killSwitch',true,'generation',v_control.generation,
      'reason','BINDING_STATE_OR_AUTHORITY_DENIED'
    );
  end if;
  return jsonb_build_object(
    'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
    'state','ON','enabled',true,'killSwitch',false,'generation',v_control.generation,
    'releaseHash',v_control.release_hash,'artifactHash',v_control.artifact_hash,
    'sourceSetHash',v_control.source_set_hash,'authorityHash',v_control.authority_hash,
    'authorityVersion',v_control.authority_version,'expiresAt',v_control.authority_expires_at,
    'reason','EXACT_BINDING_ACTIVE'
  );
end;
$$;

comment on function public.backyrd_decision_vnext_product_activate_v1(bigint,text,text,text,text,timestamptz)
  is 'Manual postgres-only, compare-and-swap Product activation. Never called by a client or automated deploy.';

-- Product claim adapters reuse the sole canonical append-only v3 writer.
-- The historical Founder RPCs retain their local-only GUC and are never a
-- Product authority: no test setting can bypass this separate ON lease.
create function world_knowledge_private.product_authoring_active_v1()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_control from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  return v_control.state='ON'
    and v_control.authority_version='backyrd.decision-vnext.product-activation-authority@1.0'
    and v_control.authority_expires_at>pg_catalog.clock_timestamp();
end;
$$;
revoke all on function world_knowledge_private.product_authoring_active_v1()
  from public,anon,authenticated,service_role;

create function public.world_product_owner_submit_claim_v1(
  p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_observed_at timestamptz,p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',
  p_supersedes_claim_id uuid default null,p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not world_knowledge_private.product_authoring_active_v1() then
    raise exception 'world_product_authoring_authority_off' using errcode='42501';
  end if;
  return world_knowledge_private.submit_authoritative_claim_v3(
    'VERIFIED_OWNER',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
end;
$$;

create function public.world_product_admin_submit_claim_v1(
  p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_observed_at timestamptz,p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',
  p_supersedes_claim_id uuid default null,p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not world_knowledge_private.product_authoring_active_v1() then
    raise exception 'world_product_authoring_authority_off' using errcode='42501';
  end if;
  return world_knowledge_private.submit_authoritative_claim_v3(
    'ADMIN',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
end;
$$;
revoke execute on function public.world_product_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  from public,anon,service_role;
revoke execute on function public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  from public,anon,service_role;
grant execute on function public.world_product_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  to authenticated;
grant execute on function public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  to authenticated;

-- Read-only Product authoring detail is scoped to the same actor/spot as the
-- existing claim RPC; no Founder catalog or private table is exposed.
create function public.world_product_authoring_detail_v1(p_spot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_role text; v_entitlement text;
  v_allowed jsonb; v_result jsonb;
begin
  if v_actor is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if public.is_admin_v1(v_actor) then v_role:='ADMIN'; v_entitlement:='ADMIN';
  elsif exists(select 1 from public.spots s where s.id=p_spot_id and s.owner_id=v_actor) then
    v_role:='VERIFIED_OWNER';
    v_entitlement:=case when exists(
      select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1 e
      where e.spot_id=p_spot_id and e.owner_id=v_actor and e.tier='PREMIUM'
        and e.valid_from<=pg_catalog.clock_timestamp()
        and (e.valid_until is null or e.valid_until>pg_catalog.clock_timestamp())
    ) then 'OWNER_PRO' else 'OWNER_BASIC' end;
  else raise exception 'world_authoring_scope_denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(r.attribute_key order by r.attribute_key),'[]'::jsonb)
    into v_allowed from world_knowledge_private.entitlement_attribute_rules r
    where r.policy_version='backyrd.world-knowledge.entitlement-policy@4b.1'
      and r.actor_scope=v_entitlement;
  select jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.product-authoring-detail@1.0',
    'spotId',s.id,'name',s.name,'status',s.status,
    'actor',jsonb_build_object('role',v_role,'entitlement',v_entitlement,'allowedAttributeKeys',v_allowed),
    'answers',coalesce((select jsonb_object_agg(attribute_key,answer) from (
      select distinct on (c.attribute_key) c.attribute_key,
        jsonb_build_object('claimId',c.id,'knowledgeState',c.knowledge_state,'value',c.value,
          'validUntil',c.valid_until,'visibility',c.visibility) answer
      from world_knowledge_private.claims c where c.spot_id=p_spot_id
        and (v_role='ADMIN' or (c.visibility='PUBLIC' and c.attribute_key in (
          select r.attribute_key from world_knowledge_private.entitlement_attribute_rules r
          where r.policy_version='backyrd.world-knowledge.entitlement-policy@4b.1'
            and r.actor_scope=v_entitlement)))
      order by c.attribute_key,c.last_changed_at desc,c.id desc
    ) latest),'{}'::jsonb),
    'openConflicts',coalesce((select jsonb_agg(jsonb_build_object('class',w.work_class,'attributeKey',w.attribute_key,'reasonCodes',to_jsonb(w.reason_codes)))
      from world_knowledge_private.review_work_items w
      where w.spot_id=p_spot_id and w.status in ('OPEN','IN_REVIEW')),'[]'::jsonb),
    'manifest',case when m.id is null then null else jsonb_build_object(
      'manifestHash',m.manifest_hash,'worldSnapshot',m.world_snapshot) end
  ) into v_result from public.spots s
    left join world_knowledge_private.current_projection_pointers p on p.spot_id=s.id
    left join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
    where s.id=p_spot_id and s.status='approved';
  if v_result is null then raise exception 'world_product_spot_not_approved' using errcode='42501'; end if;
  return v_result;
end;
$$;
revoke execute on function public.world_product_authoring_detail_v1(uuid) from public,anon,service_role;
grant execute on function public.world_product_authoring_detail_v1(uuid) to authenticated;

create function public.world_product_rebuild_spot_v1(
  p_actor_user_id uuid,p_spot_id uuid,p_as_of timestamptz,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if not world_knowledge_private.product_authoring_active_v1() then
    raise exception 'world_product_authoring_authority_off' using errcode='42501';
  end if;
  if not exists(select 1 from public.spots s where s.id=p_spot_id and s.status='approved') then
    raise exception 'world_product_spot_not_approved' using errcode='42501';
  end if;
  if p_actor_user_id is null or not exists(select 1 from auth.users u
      where u.id=p_actor_user_id and u.deleted_at is null)
     or not (public.is_admin_v1(p_actor_user_id) or exists(select 1 from public.spots s
        where s.id=p_spot_id and s.owner_id=p_actor_user_id and s.status='approved')) then
    raise exception 'world_product_rebuild_actor_denied' using errcode='42501';
  end if;
  -- Reuse the canonical resolver's existing per-spot authority table. This
  -- scoped, short lease is granted only after Product ON and approved-spot
  -- checks; it is not an account allowlist or a second rebuild engine.
  insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
  values(p_spot_id,'PRODUCT_AUTHORIZED_REBUILD',pg_catalog.clock_timestamp()+interval '5 minutes')
  on conflict(spot_id) do update set
    valid_until=greatest(world_knowledge_private.shadow_spot_allowlist.valid_until,excluded.valid_until),
    reason='PRODUCT_AUTHORIZED_REBUILD';
  return public.world_shadow_rebuild_spot_v1(p_spot_id,p_as_of,'FULL',p_idempotency_key);
end;
$$;
revoke execute on function public.world_product_rebuild_spot_v1(uuid,uuid,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.world_product_rebuild_spot_v1(uuid,uuid,timestamptz,text)
  to service_role;

-- The published Product context used the shape of the TypeScript port to
-- filter a SQL resolver snapshot. The canonical SQL snapshot actually stores
-- keyed facts. Read and validate the current resolution manifest, require an
-- authoritative current locality fact, and bind each returned row to its
-- manifest. The Product adapter verifies and interprets this versioned shape.
create or replace function public.backyrd_decision_vnext_product_context_v1(
  p_auth_user_id uuid,p_subject_binding_hash text,p_target_city text,
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
     or not exists(select 1 from auth.users u where u.id=p_auth_user_id and u.deleted_at is null) then
    raise exception 'decision_vnext_product_context_authority_denied' using errcode='42501';
  end if;
  select count(*),coalesce(jsonb_agg(jsonb_build_object(
    'contractVersion','backyrd.world-knowledge.product-resolver-binding@1.0',
    'manifestHash',m.manifest_hash,'registryHash',m.world_snapshot->>'registryHash',
    'resolvedAt',m.world_snapshot->>'resolvedAt','decisionProjection',m.decision_projection
  ) order by p.spot_id),'[]'::jsonb)
    into v_count,v_world
  from world_knowledge_private.current_projection_pointers p
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id and m.manifest_hash=p.manifest_hash
  join public.spots s on s.id=p.spot_id and s.status='approved'
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
    );
  if v_count=0 or v_count>1000 then
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
