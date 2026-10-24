-- Keep the reviewed import API stable and use the current authoritative writer.
-- Private evidence remains append-only; additional citations retain their own URL and time.
begin;
alter table world_knowledge_private.research_claim_evidence_v1
  add column supporting_sources jsonb not null default '[]'::jsonb
  check(jsonb_typeof(supporting_sources)='array' and jsonb_array_length(supporting_sources)<=30);

create function world_knowledge_private.research_source_valid_v1(p_key text,p_value jsonb,p_source jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare v_evidence text:=p_source->>'evidence'; v_email text; v_at timestamptz;
begin
  if jsonb_typeof(p_source)<>'object'
    or coalesce(p_source->>'url','') !~ '^https://[^/@[:space:]]+([/:?#]|$)'
    or (p_source->>'url') ~ '^https://[^/?#]*@'
    or length(coalesce(p_source->>'url','')) not between 9 and 800
    or (p_source->>'url') ~* '[?&][^=]*(token|secret|key|auth|session|email)[^=]*='
    or length(trim(coalesce(v_evidence,''))) not between 1 and 1200
    or v_evidence ~* '(bearer[[:space:]]+[a-z0-9._-]+|service[_-]?role|api[_-]?key|access[_-]?token|refresh[_-]?token|password[[:space:]]*[:=])'
    or coalesce(p_source->>'trust','') not in ('OFFICIAL_PRIMARY','AUTHORITATIVE_PRIMARY','CORROBORATED_SECONDARY')
    or coalesce(p_source->>'observedAt','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' then return false; end if;
  begin v_at:=(p_source->>'observedAt')::timestamptz; exception when others then return false; end;
  if v_at>clock_timestamp()+interval '60 seconds' then return false; end if;
  for v_email in select (regexp_matches(v_evidence,'[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}','gi'))[1]
  loop
    if p_key<>'contact.public_email' or jsonb_typeof(p_value)<>'string'
      or lower(v_email) is distinct from lower(p_value#>>'{}') then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function world_knowledge_private.research_source_valid_v1(text,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function world_knowledge_private.submit_authoritative_claim_v6(
  p_actor_type text,p_spot_id uuid,p_attribute_key text,p_knowledge_state text,
  p_value jsonb,p_observed_at timestamptz,p_valid_from timestamptz,
  p_valid_until timestamptz,p_visibility text,p_supersedes_claim_id uuid,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid(); entitlement_scope text; binding_id uuid; source_id uuid;
  v_claim_id uuid; content_hash text; method text; authority text;
  prior world_knowledge_private.claims%rowtype; shadow_hold boolean;
  checked_at_value timestamptz; freshness_ref text; reason_values text[];
  verification_hash text;
begin
  if actor_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_actor_type='VERIFIED_OWNER' then
    if not exists(select 1 from public.spots where id=p_spot_id and owner_id=actor_id) then raise exception 'spot_owner_required' using errcode='42501'; end if;
    entitlement_scope:=case when exists(
      select 1 from public.backyrd_spot_owner_intelligence_entitlements_v1
      where spot_id=p_spot_id and owner_id=actor_id and tier='PREMIUM'
        and valid_from<=pg_catalog.clock_timestamp()
        and (valid_until is null or valid_until>pg_catalog.clock_timestamp())
    ) then 'OWNER_PRO' else 'OWNER_BASIC' end;
    method:='OWNER_CONFIRMED'; authority:='SERVER_BOUND_OWNER_WRITE';
  elsif p_actor_type='ADMIN' then
    if not public.is_admin_v1(actor_id) then raise exception 'admin_required' using errcode='42501'; end if;
    entitlement_scope:='ADMIN'; method:='ADMIN_CONFIRMED'; authority:='SERVER_BOUND_ADMIN_WRITE';
  else raise exception 'invalid_authoritative_actor' using errcode='22023';
  end if;
  if not exists(
    select 1 from world_knowledge_private.entitlement_attribute_rules
    where policy_version='backyrd.world-knowledge.entitlement-policy@4f.1'
      and actor_scope=entitlement_scope and attribute_key=p_attribute_key
  ) then raise exception 'attribute_entitlement_denied' using errcode='42501'; end if;
  if p_observed_at is null or p_observed_at>pg_catalog.clock_timestamp()+interval '60 seconds' then raise exception 'invalid_observed_at' using errcode='22023'; end if;
  if p_valid_until is not null and p_valid_from is not null and p_valid_until<p_valid_from then raise exception 'invalid_validity_window' using errcode='22023'; end if;
  if p_attribute_key='state.current' and p_valid_until is null then raise exception 'current_state_valid_until_required' using errcode='22023'; end if;
  if p_visibility not in ('PUBLIC','INTERNAL') or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then raise exception 'invalid_claim_metadata' using errcode='22023'; end if;
  if p_attribute_key='discovery.profile' and p_knowledge_state='KNOWN_VALUE' and not exists(
    select 1 from (select * from world_knowledge_private.claims where spot_id=p_spot_id and attribute_key='description.discovery_source' order by last_changed_at desc,id desc limit 1) source
    where source.visibility='PUBLIC' and source.knowledge_state='KNOWN_VALUE' and source.value=to_jsonb(p_value->>'description') and source.stance='SUPPORTS'
  ) then raise exception 'discovery_source_changed_or_not_public' using errcode='22023';end if;
  if not world_knowledge_private.attribute_value_valid_v7('backyrd.world-knowledge.registry@2.5',p_attribute_key,p_knowledge_state,p_value) then raise exception 'invalid_attribute_value' using errcode='22023'; end if;
  if p_supersedes_claim_id is not null then
    select * into prior from world_knowledge_private.claims where id=p_supersedes_claim_id;
    if not found or prior.spot_id<>p_spot_id or prior.attribute_key<>p_attribute_key then raise exception 'invalid_supersedes_claim' using errcode='22023'; end if;
  end if;
  binding_id:=world_knowledge_private.get_actor_binding_v1(actor_id,p_actor_type);
  content_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'spotId',p_spot_id,'key',p_attribute_key,'state',p_knowledge_state,'value',p_value,
    'actorBinding',binding_id,'observedAt',p_observed_at,'validFrom',p_valid_from,
    'validUntil',p_valid_until,'supersedes',p_supersedes_claim_id,
    'registry','backyrd.world-knowledge.registry@2.5',
    'policy','backyrd.world-knowledge.source-policy@4f.1'
  )::text,'UTF8'),'sha256'),'hex');
  select id into v_claim_id from world_knowledge_private.claims
  where actor_binding_id=binding_id and idempotency_key=p_idempotency_key;
  if found then
    if (select c.content_hash from world_knowledge_private.claims c where c.id=v_claim_id)<>content_hash then raise exception 'claim_idempotency_conflict' using errcode='23505'; end if;
    return jsonb_build_object('claimId',v_claim_id,'created',false);
  end if;
  insert into world_knowledge_private.source_references(spot_id,source_type,visibility,source_hash)
  values(
    p_spot_id,case when p_actor_type='ADMIN' then 'ADMIN_OBSERVATION' else 'OWNER_ASSERTION' end,'INTERNAL',
    encode(extensions.digest(pg_catalog.convert_to(binding_id::text||':'||p_idempotency_key,'UTF8'),'sha256'),'hex')
  ) returning id into source_id;
  shadow_hold:=world_knowledge_private.text_requires_shadow_v1(p_attribute_key,p_value);
  insert into world_knowledge_private.claims(
    idempotency_key,spot_id,registry_version,policy_version,attribute_key,knowledge_state,value,
    actor_binding_id,actor_type,source_reference_id,source_type,observed_at,valid_from,
    valid_until,last_changed_at,stance,visibility,supersedes_claim_id,content_hash
  ) values (
    p_idempotency_key,p_spot_id,'backyrd.world-knowledge.registry@2.5',
    'backyrd.world-knowledge.source-policy@4f.1',p_attribute_key,p_knowledge_state,p_value,
    binding_id,p_actor_type,source_id,case when p_actor_type='ADMIN' then 'ADMIN_OBSERVATION' else 'OWNER_ASSERTION' end,
    p_observed_at,p_valid_from,p_valid_until,pg_catalog.clock_timestamp(),'SUPPORTS',
    case when shadow_hold then 'SHADOW_HELD' else p_visibility end,p_supersedes_claim_id,content_hash
  ) returning id into v_claim_id;
  checked_at_value:=pg_catalog.clock_timestamp();
  freshness_ref:=case
    when p_attribute_key='state.current' then 'freshness:current-state:explicit-valid-until'
    when p_attribute_key in ('hours.special','hours.kitchen_special') then 'freshness:special-hours:date-bound'
    when p_attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed'
    else 'freshness:durable-until-contradicted'
  end;
  reason_values:=array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'];
  verification_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'claimId',v_claim_id,'claimHash',content_hash,'spotId',p_spot_id,'attributeKey',p_attribute_key,
    'scope','SPOT','policyVersion','backyrd.world-knowledge.source-policy@4f.1','method',method,
    'authority',authority,'verifierBinding',binding_id,'result','VERIFIED',
    'checkedAt',checked_at_value,'reverificationPolicyRef',freshness_ref,'reasonCodes',to_jsonb(reason_values)
  )::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.verification_records(
    claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,
    execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,
    reason_codes,result_hash
  ) values (
    v_claim_id,content_hash,p_spot_id,p_attribute_key,'SPOT',
    'backyrd.world-knowledge.source-policy@4f.1',method,authority,binding_id,'VERIFIED',
    checked_at_value,freshness_ref,reason_values,verification_hash
  );
  if shadow_hold then
    insert into world_knowledge_private.review_work_items(
      spot_id,work_class,priority,attribute_key,candidate_payload,reason_codes
    ) values (p_spot_id,'CONTENT_SAFETY','HIGH',p_attribute_key,jsonb_build_object('claimId',v_claim_id),array['NEW_TEXT_SHADOW_HELD']);
  end if;
  if exists(
    select 1 from world_knowledge_private.claims c
    join world_knowledge_private.verification_records v on v.claim_id=c.id and v.result='VERIFIED'
    where c.spot_id=p_spot_id and c.attribute_key=p_attribute_key and c.id<>v_claim_id
      and c.value is distinct from p_value
      and c.id not in (
        with recursive replaced as (
          select replaced_start.id,replaced_start.supersedes_claim_id from world_knowledge_private.claims replaced_start where replaced_start.id=p_supersedes_claim_id
          union
          select ancestor.id,ancestor.supersedes_claim_id from world_knowledge_private.claims ancestor
          join replaced child on child.supersedes_claim_id=ancestor.id
        ) select replaced.id from replaced
      )
      and c.observed_at between p_observed_at-interval '5 minutes' and p_observed_at+interval '5 minutes'
  ) then
    insert into world_knowledge_private.review_work_items(
      spot_id,work_class,priority,attribute_key,candidate_payload,reason_codes
    ) values (p_spot_id,'AUTHORITY_CONFLICT','HIGH',p_attribute_key,jsonb_build_object('claimId',v_claim_id),array['CONCURRENT_AUTHORITATIVE_CONFLICT']);
  end if;
  return jsonb_build_object('claimId',v_claim_id,'created',true,'verificationMethod',method,'visibility',case when shadow_hold then 'SHADOW_HELD' else p_visibility end);
end $$;

create or replace function public.world_product_admin_import_research_spot_v2(
  p_batch_id uuid, p_spot_id uuid, p_expected_manifest_hash text, p_claims jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_item jsonb; v_key text; v_source jsonb; v_supersedes uuid; v_latest uuid;
  v_manifest text; v_hash text; v_result jsonb; v_claim_id uuid;
  v_existing world_knowledge_private.research_claim_evidence_v1%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_observed timestamptz; v_support jsonb; v_check_source jsonb;
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
    v_support:=coalesce(v_item->'supportingSources','[]'::jsonb);
    if v_key is null or v_key='state.current'
      or coalesce(v_item->>'knowledgeState','') not in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE')
      or jsonb_typeof(v_support)<>'array' or jsonb_array_length(v_support)>30 then
      raise exception 'world_research_metadata_invalid:%',v_key using errcode='22023';
    end if;
    for v_check_source in select value from jsonb_array_elements(jsonb_build_array(v_source)||v_support)
    loop
      if not world_knowledge_private.research_source_valid_v1(v_key,v_item->'value',v_check_source) then
        raise exception 'world_research_metadata_invalid:%',v_key using errcode='22023';
      end if;
    end loop;
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
    v_result:=world_knowledge_private.submit_authoritative_claim_v6(
      'ADMIN',p_spot_id,v_key,v_item->>'knowledgeState',v_item->'value',v_observed,
      null,null,'PUBLIC',v_supersedes,'research:'||p_batch_id||':'||p_spot_id||':'||v_key);
    v_claim_id:=(v_result->>'claimId')::uuid;
    insert into world_knowledge_private.research_claim_evidence_v1(
      claim_id,batch_id,spot_id,attribute_key,source_url,evidence_excerpt,observed_at,trust_level,evidence_hash,supporting_sources
    ) values(v_claim_id,p_batch_id,p_spot_id,v_key,v_source->>'url',trim(v_source->>'evidence'),v_observed,v_source->>'trust',v_hash,v_support);
    v_results:=v_results||jsonb_build_array(jsonb_build_object('attributeKey',v_key,'claimId',v_claim_id,'created',true));
  end loop;
  return jsonb_build_object('spotId',p_spot_id,'claims',v_results);
end $$;
revoke all on function public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb) to authenticated;
comment on function public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb) is
  'Admin-reviewed atomic research batch. Append-only canonical claims, exact prior-claim confirmation, private provenance, category-first ordering and drift checks.';

commit;
