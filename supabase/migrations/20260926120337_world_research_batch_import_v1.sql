-- Admin-assisted, bounded research batches. Claims still flow through the
-- canonical authoritative writer; this table only binds private provenance.
create table world_knowledge_private.research_claim_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references world_knowledge_private.claims(id) on delete restrict,
  batch_id uuid not null,
  spot_id uuid not null references public.spots(id) on delete restrict,
  attribute_key text not null,
  source_url text not null check (length(source_url) between 9 and 800 and source_url ~ '^https://'),
  evidence_excerpt text not null check (length(trim(evidence_excerpt)) between 1 and 1200),
  observed_at timestamptz not null,
  trust_level text not null check (trust_level in ('OFFICIAL_PRIMARY','AUTHORITATIVE_PRIMARY','CORROBORATED_SECONDARY')),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(batch_id,spot_id,attribute_key)
);
alter table world_knowledge_private.research_claim_evidence_v1 enable row level security;
revoke all on world_knowledge_private.research_claim_evidence_v1 from public,anon,authenticated,service_role;

create function world_knowledge_private.reject_research_evidence_mutation_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'world_research_evidence_immutable' using errcode='42501';
end;
$$;
revoke all on function world_knowledge_private.reject_research_evidence_mutation_v1()
  from public,anon,authenticated,service_role;
create trigger research_claim_evidence_immutable_v1
before update or delete on world_knowledge_private.research_claim_evidence_v1
for each row execute function world_knowledge_private.reject_research_evidence_mutation_v1();

create function public.world_product_admin_import_research_claim_v1(
  p_batch_id uuid,p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_source_url text,p_evidence_excerpt text,p_observed_at timestamptz,p_trust_level text,
  p_expected_manifest_hash text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_current_manifest text;
  v_result jsonb;
  v_claim_id uuid;
  v_evidence_hash text;
  v_existing world_knowledge_private.research_claim_evidence_v1%rowtype;
begin
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode='42501';
  end if;
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.spots s where s.id=p_spot_id and s.status='approved') then
    raise exception 'world_product_spot_not_approved' using errcode='42501';
  end if;
  if p_batch_id is null or p_attribute_key is null
     or p_knowledge_state not in ('KNOWN_TRUE','KNOWN_FALSE','KNOWN_VALUE')
     or p_source_url is null or length(p_source_url) not between 9 and 800
     or p_source_url !~ '^https://'
     or p_source_url ~* '(access_token|refresh_token|api[_-]?key|secret|session|email)='
     or length(trim(coalesce(p_evidence_excerpt,''))) not between 1 and 1200
     or p_evidence_excerpt ~* '(bearer[[:space:]]+[a-z0-9._-]+|service[_-]?role|access[_-]?token|refresh[_-]?token|password[[:space:]]*[:=]|[[:alnum:]._%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})'
     or p_observed_at is null or p_observed_at>clock_timestamp()+interval '60 seconds'
     or p_trust_level not in ('OFFICIAL_PRIMARY','AUTHORITATIVE_PRIMARY','CORROBORATED_SECONDARY')
     or p_expected_manifest_hash !~ '^[0-9a-f]{64}$'
     or length(trim(coalesce(p_idempotency_key,''))) not between 1 and 180 then
    raise exception 'world_research_metadata_invalid' using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'world-research:'||p_spot_id::text||':'||p_attribute_key,0));

  v_evidence_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'batchId',p_batch_id,'spotId',p_spot_id,'attributeKey',p_attribute_key,
    'knowledgeState',p_knowledge_state,'value',p_value,'sourceUrl',p_source_url,
    'evidence',trim(p_evidence_excerpt),'observedAt',p_observed_at,'trust',p_trust_level
  )::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from world_knowledge_private.research_claim_evidence_v1
    where batch_id=p_batch_id and spot_id=p_spot_id and attribute_key=p_attribute_key;
  if found then
    if v_existing.evidence_hash<>v_evidence_hash then
      raise exception 'world_research_idempotency_conflict' using errcode='23505';
    end if;
    return jsonb_build_object('claimId',v_existing.claim_id,'created',false,'evidenceHash',v_evidence_hash);
  end if;

  select m.manifest_hash into v_current_manifest
  from world_knowledge_private.current_projection_pointers p
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
  where p.spot_id=p_spot_id;
  if v_current_manifest is null or v_current_manifest<>p_expected_manifest_hash then
    raise exception 'world_research_manifest_drift' using errcode='40001';
  end if;
  if exists(select 1 from world_knowledge_private.claims c where c.spot_id=p_spot_id and c.attribute_key=p_attribute_key) then
    raise exception 'world_research_existing_value_conflict' using errcode='23505';
  end if;

  v_result:=world_knowledge_private.submit_authoritative_claim_v3(
    'ADMIN',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    null,null,'PUBLIC',null,p_idempotency_key);
  v_claim_id:=(v_result->>'claimId')::uuid;
  insert into world_knowledge_private.research_claim_evidence_v1(
    claim_id,batch_id,spot_id,attribute_key,source_url,evidence_excerpt,observed_at,
    trust_level,evidence_hash
  ) values (
    v_claim_id,p_batch_id,p_spot_id,p_attribute_key,p_source_url,trim(p_evidence_excerpt),
    p_observed_at,p_trust_level,v_evidence_hash
  );
  return jsonb_build_object('claimId',v_claim_id,'created',true,'evidenceHash',v_evidence_hash);
end;
$$;
revoke all on function public.world_product_admin_import_research_claim_v1(uuid,uuid,text,text,jsonb,text,text,timestamptz,text,text,text)
  from public,anon,service_role;
grant execute on function public.world_product_admin_import_research_claim_v1(uuid,uuid,text,text,jsonb,text,text,timestamptz,text,text,text)
  to authenticated;

comment on table world_knowledge_private.research_claim_evidence_v1 is
  'Private immutable provenance for bounded Admin-assisted research imports; never exposed to product clients.';
comment on function public.world_product_admin_import_research_claim_v1(uuid,uuid,text,text,jsonb,text,text,timestamptz,text,text,text) is
  'Fail-closed append-only research import. Refuses drift and existing values; delegates claims to the canonical authoritative writer.';
