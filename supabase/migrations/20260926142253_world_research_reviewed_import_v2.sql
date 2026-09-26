-- A reviewed spot batch is one transaction, including category dependencies.
-- Existing v1 and its immutable provenance remain intact for old callers.
create function public.world_product_admin_import_research_spot_v2(
  p_batch_id uuid, p_spot_id uuid, p_expected_manifest_hash text, p_claims jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_item jsonb; v_key text; v_source jsonb; v_supersedes uuid; v_latest uuid;
  v_manifest text; v_hash text; v_result jsonb; v_claim_id uuid;
  v_existing world_knowledge_private.research_claim_evidence_v1%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_observed timestamptz;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode='42501';
  end if;
  if p_batch_id is null or p_expected_manifest_hash is null or p_expected_manifest_hash !~ '^[0-9a-f]{64}$'
    or p_claims is null or jsonb_typeof(p_claims)<>'array' then
    raise exception 'world_research_batch_invalid' using errcode='22023';
  end if;
  if jsonb_array_length(p_claims) not between 1 and 60
    or (select count(distinct value->>'attributeKey') from jsonb_array_elements(p_claims))<>jsonb_array_length(p_claims) then
    raise exception 'world_research_batch_invalid' using errcode='22023';
  end if;
  -- FK KEY SHARE locks taken by all canonical claim inserts conflict with this
  -- row lock, including writes through the existing editor. No global lock.
  perform 1 from public.spots where id=p_spot_id and status='approved' for update;
  if not found then raise exception 'world_product_spot_not_approved' using errcode='42501'; end if;
  select m.manifest_hash into v_manifest
    from world_knowledge_private.current_projection_pointers p
    join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
    where p.spot_id=p_spot_id;
  if v_manifest is distinct from p_expected_manifest_hash then
    raise exception 'world_research_manifest_drift' using errcode='40001';
  end if;
  for v_item in select value from jsonb_array_elements(p_claims)
    order by case value->>'attributeKey' when 'classification.primary_category' then 0 when 'classification.place_types' then 2 else 1 end, value->>'attributeKey'
  loop
    v_key:=v_item->>'attributeKey'; v_source:=v_item->'source';
    v_supersedes:=(v_item->>'supersedesClaimId')::uuid;
    v_observed:=(v_source->>'observedAt')::timestamptz;
    if v_key is null or v_key='state.current'
      or coalesce(v_item->>'knowledgeState','') not in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE')
      or coalesce(v_source->>'url','') !~ '^https://[^/@[:space:]]+([/:?#]|$)'
      or (v_source->>'url') ~ '^https://[^/?#]*@'
      or length(coalesce(v_source->>'url','')) not between 9 and 800
      or (v_source->>'url') ~* '[?&][^=]*(token|secret|key|auth|session|email)[^=]*='
      or length(trim(coalesce(v_source->>'evidence',''))) not between 1 and 1200
      or (v_source->>'evidence') ~* '(bearer[[:space:]]+[a-z0-9._-]+|service[_-]?role|api[_-]?key|access[_-]?token|refresh[_-]?token|password[[:space:]]*[:=]|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})'
      or v_observed is null or v_observed>clock_timestamp()+interval '60 seconds'
      or coalesce(v_source->>'trust','') not in ('OFFICIAL_PRIMARY','AUTHORITATIVE_PRIMARY','CORROBORATED_SECONDARY') then
      raise exception 'world_research_metadata_invalid:%',v_key using errcode='22023';
    end if;
    v_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
      'batchId',p_batch_id,'spotId',p_spot_id,'claim',v_item
    )::text,'UTF8'),'sha256'),'hex');
    select * into v_existing from world_knowledge_private.research_claim_evidence_v1
      where batch_id=p_batch_id and spot_id=p_spot_id and attribute_key=v_key;
    if found then
      if v_existing.evidence_hash<>v_hash then raise exception 'world_research_idempotency_conflict' using errcode='23505'; end if;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('attributeKey',v_key,'claimId',v_existing.claim_id,'created',false));
      continue;
    end if;
    select id into v_latest from world_knowledge_private.claims
      where spot_id=p_spot_id and attribute_key=v_key order by last_changed_at desc,id desc limit 1;
    -- The admin explicitly confirms the exact previous claim, including UNKNOWN.
    -- Omitting that identity never grants overwrite authority.
    if v_latest is distinct from v_supersedes then
      raise exception 'world_research_existing_value_conflict:%',v_key using errcode='40001';
    end if;
    v_result:=world_knowledge_private.submit_authoritative_claim_v3(
      'ADMIN',p_spot_id,v_key,v_item->>'knowledgeState',v_item->'value',v_observed,
      null,null,'PUBLIC',v_supersedes,'research:'||p_batch_id||':'||p_spot_id||':'||v_key);
    v_claim_id:=(v_result->>'claimId')::uuid;
    insert into world_knowledge_private.research_claim_evidence_v1(
      claim_id,batch_id,spot_id,attribute_key,source_url,evidence_excerpt,observed_at,trust_level,evidence_hash
    ) values(v_claim_id,p_batch_id,p_spot_id,v_key,v_source->>'url',trim(v_source->>'evidence'),v_observed,v_source->>'trust',v_hash);
    v_results:=v_results||jsonb_build_array(jsonb_build_object('attributeKey',v_key,'claimId',v_claim_id,'created',true));
  end loop;
  return jsonb_build_object('spotId',p_spot_id,'claims',v_results);
end $$;
revoke all on function public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb) to authenticated;
comment on function public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb) is
  'Admin-reviewed atomic research batch. Append-only canonical claims, exact prior-claim confirmation, private provenance, category-first ordering and drift checks.';
