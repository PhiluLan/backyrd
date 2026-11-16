-- Commit the accepted edit and the pointer read by Decision together.
create function world_knowledge_private.publish_approved_spot_search_v1(p_spot_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_manifest_hash text;
begin
  if not exists(select 1 from public.spots where id=p_spot_id and status='approved') then
    raise exception 'world_product_spot_publication_unavailable' using errcode='42501';
  end if;
  insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
  values(p_spot_id,'PRODUCT_ADMIN_AUTHORIZED_REBUILD',clock_timestamp()+interval '5 minutes')
  on conflict(spot_id) do update set
    valid_until=greatest(world_knowledge_private.shadow_spot_allowlist.valid_until,excluded.valid_until),
    reason=excluded.reason;
  v_manifest_hash := public.world_shadow_rebuild_spot_v1(
    p_spot_id, clock_timestamp(), 'FULL', 'spot-search-publish:' || gen_random_uuid()::text
  )->>'manifestHash';
  if v_manifest_hash is null or not exists (
    select 1 from world_knowledge_private.current_projection_pointers
    where spot_id=p_spot_id and manifest_hash=v_manifest_hash
  ) then
    raise exception 'world_product_spot_publication_unverified' using errcode='40001';
  end if;
  return v_manifest_hash;
end;
$$;
revoke all on function world_knowledge_private.publish_approved_spot_search_v1(uuid)
  from public, anon, authenticated, service_role;

create function public.world_product_save_and_publish_claim_v1(
  p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_observed_at timestamptz,p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',
  p_supersedes_claim_id uuid default null,p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_claim jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  -- Serialize canonical saves and repairs for this spot. The claim endpoints
  -- enforce the existing role, ownership, visibility and source policies.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-current-pointer:'||p_spot_id::text,0));
  if public.is_admin_v1(auth.uid()) then
    v_claim := public.world_product_admin_submit_claim_v1(
      p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,p_valid_from,
      p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
  else
    v_claim := public.world_product_owner_submit_claim_v1(
      p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,p_valid_from,
      p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
  end if;
  return v_claim || jsonb_build_object(
    'manifestHash',world_knowledge_private.publish_approved_spot_search_v1(p_spot_id)
  );
end;
$$;
revoke all on function public.world_product_save_and_publish_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.world_product_save_and_publish_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  to authenticated;

-- Replay existing accepted claims through the normal resolver in bounded,
-- restartable batches. The resolver still determines their eligibility.
create function public.world_product_admin_refresh_stale_search_v1(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_spot uuid;
  v_processed integer := 0;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode='42501';
  end if;
  if p_limit is null or p_limit not between 1 and 10 then
    raise exception 'world_product_refresh_limit_invalid' using errcode='22023';
  end if;
  -- One repair batch at a time. Individual edits use the same spot lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-search-refresh-batch',0));
  for v_spot in
    select s.id
    from public.spots s
    left join world_knowledge_private.current_projection_pointers p on p.spot_id=s.id
    where s.status='approved' and exists (
      select 1 from world_knowledge_private.claims c
      where c.spot_id=s.id and c.visibility='PUBLIC'
        and (p.spot_id is null or c.last_changed_at>p.ledger_cutoff_at)
    )
    order by s.id
    limit p_limit
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-current-pointer:'||v_spot::text,0));
    perform world_knowledge_private.publish_approved_spot_search_v1(v_spot);
    v_processed := v_processed+1;
  end loop;
  return jsonb_build_object('processedSpots',v_processed);
end;
$$;
revoke all on function public.world_product_admin_refresh_stale_search_v1(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.world_product_admin_refresh_stale_search_v1(integer)
  to authenticated;
