-- The approved catalog existed before World Knowledge. This is an explicit,
-- Admin-authorized baseline, not a claim that category or visit purpose has
-- been researched. Small keyset batches are safe to resume after interruption.
create function public.world_product_admin_catalog_coverage_v1()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_approved integer; v_claimed integer; v_snapshots integer; v_missing_city integer;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'world_product_admin_required' using errcode='42501';
  end if;
  select count(*),count(*) filter (where nullif(pg_catalog.btrim(s.city),'') is null)
    into v_approved,v_missing_city from public.spots s where s.status='approved';
  select count(*) into v_claimed from public.spots s where s.status='approved'
    and exists(select 1 from world_knowledge_private.claims c where c.spot_id=s.id);
  select count(*) into v_snapshots from public.spots s where s.status='approved'
    and exists(select 1 from world_knowledge_private.current_projection_pointers p where p.spot_id=s.id);
  return pg_catalog.jsonb_build_object('contractVersion','backyrd.world-knowledge.approved-catalog-coverage@1.0',
    'approved',v_approved,'withClaims',v_claimed,'withSnapshots',v_snapshots,'missingCity',v_missing_city,
    'authoringActive',world_knowledge_private.product_admin_authoring_active_v1());
end;
$$;
revoke all on function public.world_product_admin_catalog_coverage_v1() from public,anon,authenticated,service_role;
grant execute on function public.world_product_admin_catalog_coverage_v1() to authenticated;

create function public.world_product_admin_bootstrap_catalog_v1(
  p_cursor uuid default null,p_limit integer default 10,p_acknowledgement text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_spot public.spots%rowtype; v_key text; v_state text; v_value jsonb;
  v_claims integer:=0; v_rebuilt integer:=0; v_processed integer:=0;
  v_last uuid:=p_cursor; v_rebuild jsonb; v_at timestamptz; v_spot_claims integer;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'world_product_admin_required' using errcode='42501';
  end if;
  if p_acknowledgement is distinct from 'APPROVED_CATALOG_BASELINE_ONLY'
     or p_limit is null or p_limit not between 1 and 10 then
    raise exception 'world_product_catalog_bootstrap_invalid' using errcode='22023';
  end if;
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode='42501';
  end if;
  for v_spot in
    select s.* from public.spots s
    where s.status='approved' and (p_cursor is null or s.id>p_cursor)
    order by s.id limit p_limit
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('world-catalog-bootstrap:'||v_spot.id::text,0));
    -- The spot may have changed while waiting for the advisory lock.
    if not exists(select 1 from public.spots s where s.id=v_spot.id and s.status='approved') then
      raise exception 'world_product_spot_not_approved' using errcode='40001';
    end if;
    v_at:=pg_catalog.clock_timestamp();
    v_spot_claims:=0;
    foreach v_key in array array['identity.name','location.locality',
      'classification.primary_category','purpose.primary_visit'] loop
      -- Never overwrite a researched or owner-confirmed claim, including UNKNOWN.
      if not exists(select 1 from world_knowledge_private.claims c
        where c.spot_id=v_spot.id and c.attribute_key=v_key) then
        v_state:='UNKNOWN'; v_value:=null;
        if v_key='identity.name' and pg_catalog.char_length(pg_catalog.btrim(v_spot.name)) between 1 and 160 then
          v_state:='KNOWN_VALUE'; v_value:=pg_catalog.to_jsonb(pg_catalog.btrim(v_spot.name));
        elsif v_key='location.locality' and pg_catalog.char_length(pg_catalog.btrim(coalesce(v_spot.city,''))) between 1 and 120 then
          v_state:='KNOWN_VALUE'; v_value:=pg_catalog.to_jsonb(pg_catalog.btrim(v_spot.city));
        end if;
        perform world_knowledge_private.submit_authoritative_claim_v3(
          'ADMIN',v_spot.id,v_key,v_state,v_value,v_at,null,null,'PUBLIC',null,
          'approved-catalog-baseline-v1:'||v_spot.id::text||':'||v_key);
        v_claims:=v_claims+1;
        v_spot_claims:=v_spot_claims+1;
      end if;
    end loop;
    if v_spot_claims>0 or not exists(select 1 from world_knowledge_private.current_projection_pointers p where p.spot_id=v_spot.id) then
      insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
      values(v_spot.id,'PRODUCT_ADMIN_AUTHORIZED_REBUILD',pg_catalog.clock_timestamp()+interval '5 minutes')
      on conflict(spot_id) do update set
        valid_until=greatest(world_knowledge_private.shadow_spot_allowlist.valid_until,excluded.valid_until),
        reason='PRODUCT_ADMIN_AUTHORIZED_REBUILD';
      v_rebuild:=public.world_shadow_rebuild_spot_v1(v_spot.id,pg_catalog.clock_timestamp(),'FULL',
        'approved-catalog-baseline-v1:rebuild:'||v_spot.id::text||':'||pg_catalog.gen_random_uuid()::text);
      if v_rebuild->>'manifestHash' is null then
        raise exception 'world_product_catalog_rebuild_unverified' using errcode='55000';
      end if;
      v_rebuilt:=v_rebuilt+1;
    end if;
    v_processed:=v_processed+1; v_last:=v_spot.id;
  end loop;
  return pg_catalog.jsonb_build_object('contractVersion','backyrd.world-knowledge.approved-catalog-bootstrap@1.0',
    'processed',v_processed,'claimsCreated',v_claims,'snapshotsRebuilt',v_rebuilt,
    'nextCursor',v_last,'complete',v_processed<p_limit);
end;
$$;
revoke all on function public.world_product_admin_bootstrap_catalog_v1(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.world_product_admin_bootstrap_catalog_v1(uuid,integer,text) to authenticated;

comment on function public.world_product_admin_bootstrap_catalog_v1(uuid,integer,text) is
  'Explicit Admin-only, bounded approved-catalog baseline. Name/city are approved-catalog observations; category and visit purpose remain UNKNOWN. Existing World claims are never superseded.';
