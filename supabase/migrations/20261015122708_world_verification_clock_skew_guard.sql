-- Align verification with the existing authoritative-writer tolerance of 60 seconds.
-- observed_at is supplied by the device; created_at and checked_at are server times.
-- Verification must follow server receipt, even when the device clock is slightly ahead.
-- Preserve original timestamps, hashes, idempotency, actor checks, RLS and ACLs.
create or replace function world_knowledge_private.validate_verification_insert_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  claim world_knowledge_private.claims%rowtype;
  binding world_knowledge_private.actor_bindings%rowtype;
  expected_freshness_ref text;
  expected_hash text;
begin
  select * into claim from world_knowledge_private.claims where id=new.claim_id;
  select * into binding from world_knowledge_private.actor_bindings where id=new.verifier_binding_id;
  if claim.id is null or binding.id is null or new.claim_hash<>claim.content_hash
     or new.spot_id<>claim.spot_id or new.attribute_key<>claim.attribute_key
     or new.scope<>claim.scope or new.policy_version<>claim.policy_version
     or new.checked_at<claim.created_at
     or new.checked_at<claim.observed_at-interval '60 seconds'
     or new.checked_at>pg_catalog.clock_timestamp()+interval '60 seconds'
  then raise exception 'verification_binding_invalid' using errcode='22023'; end if;
  expected_freshness_ref:=case
    when claim.attribute_key='state.current' then 'freshness:current-state:explicit-valid-until'
    when claim.attribute_key in ('hours.special','hours.kitchen_special') then 'freshness:special-hours:date-bound'
    when claim.attribute_key like 'hours.%' then 'freshness:opening-hours:confirmed-until-changed'
    else 'freshness:durable-until-contradicted'
  end;
  if new.reverification_policy_ref<>expected_freshness_ref
     or new.reason_codes<>array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[]
     or new.result<>'VERIFIED'
  then raise exception 'verification_policy_binding_invalid' using errcode='22023'; end if;
  if new.verification_method='OWNER_CONFIRMED' then
    if new.execution_authority<>'SERVER_BOUND_OWNER_WRITE' or binding.actor_type<>'VERIFIED_OWNER'
       or binding.actor_id is null or claim.actor_type<>'VERIFIED_OWNER'
       or claim.actor_binding_id<>binding.id
       or not exists(select 1 from public.spots s where s.id=claim.spot_id and s.owner_id=binding.actor_id)
    then raise exception 'verification_authority_invalid' using errcode='42501'; end if;
  elsif new.verification_method='ADMIN_CONFIRMED' then
    if new.execution_authority<>'SERVER_BOUND_ADMIN_WRITE' or binding.actor_type<>'ADMIN'
       or binding.actor_id is null or claim.actor_type<>'ADMIN' or claim.actor_binding_id<>binding.id
       or not public.is_admin_v1(binding.actor_id)
    then raise exception 'verification_authority_invalid' using errcode='42501'; end if;
  else raise exception 'independent_process_authority_not_configured' using errcode='42501';
  end if;
  if claim.source_type='AI_INFERENCE' and new.result='VERIFIED' then raise exception 'ai_cannot_self_verify' using errcode='42501'; end if;
  expected_hash:=encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object(
    'claimId',new.claim_id,'claimHash',new.claim_hash,'spotId',new.spot_id,
    'attributeKey',new.attribute_key,'scope',new.scope,'policyVersion',new.policy_version,
    'method',new.verification_method,'authority',new.execution_authority,
    'verifierBinding',new.verifier_binding_id,'result',new.result,'checkedAt',new.checked_at,
    'reverificationPolicyRef',new.reverification_policy_ref,'reasonCodes',to_jsonb(new.reason_codes)
  )::text,'UTF8'),'sha256'),'hex');
  if new.result_hash<>expected_hash then raise exception 'verification_result_hash_mismatch' using errcode='22023'; end if;
  return new;
end $$;
