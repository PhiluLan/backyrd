create or replace function public.world_product_admin_apply_official_contact_phone_v1(
  p_batch_id uuid,
  p_spot_id uuid,
  p_phone text,
  p_source_url text,
  p_evidence_excerpt text,
  p_observed_at timestamptz,
  p_expected_manifest_hash text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_claim jsonb;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.spots s
    where s.id = p_spot_id
      and s.status = 'approved'
      and nullif(btrim(s.phone), '') is null
  ) then
    raise exception 'world_product_spot_not_eligible' using errcode = '42501';
  end if;
  if p_batch_id is null
    or v_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_source_url is null
    or p_source_url !~ '^https://'
    or length(p_source_url) > 800
    or length(btrim(coalesce(p_evidence_excerpt, ''))) not between 1 and 1200
    or p_observed_at is null
    or p_observed_at > now() + interval '5 minutes'
    or p_expected_manifest_hash !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 180
  then
    raise exception 'invalid_official_contact_phone_payload' using errcode = '22023';
  end if;

  v_claim := public.world_product_admin_import_research_claim_v1(
    p_batch_id,
    p_spot_id,
    'contact.phone',
    'KNOWN_VALUE',
    to_jsonb(v_phone),
    p_source_url,
    btrim(p_evidence_excerpt),
    p_observed_at,
    'OFFICIAL_PRIMARY',
    p_expected_manifest_hash,
    p_idempotency_key
  );

  update public.spots
  set phone = v_phone
  where id = p_spot_id
    and nullif(btrim(phone), '') is null;

  return jsonb_build_object(
    'spotId', p_spot_id,
    'phone', v_phone,
    'claim', v_claim
  );
end;
$function$;

revoke all on function public.world_product_admin_apply_official_contact_phone_v1(
  uuid, uuid, text, text, text, timestamptz, text, text
) from public, anon;

grant execute on function public.world_product_admin_apply_official_contact_phone_v1(
  uuid, uuid, text, text, text, timestamptz, text, text
) to authenticated, service_role;
