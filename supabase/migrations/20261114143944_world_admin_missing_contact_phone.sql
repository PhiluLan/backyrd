create or replace function public.world_product_admin_missing_contact_phone_v1(
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  with latest_phone as (
    select distinct on (c.spot_id)
      c.spot_id,
      c.knowledge_state,
      c.value
    from world_knowledge_private.claims c
    where c.attribute_key = 'contact.phone'
    order by c.spot_id, c.last_changed_at desc, c.id desc
  ),
  missing as (
    select
      s.id,
      s.name,
      s.address,
      s.city,
      s.country,
      s.website,
      s.google_place_id
    from public.spots s
    left join latest_phone p on p.spot_id = s.id
    where s.status = 'approved'
      and p.spot_id is null
      and nullif(btrim(s.phone), '') is null
  ),
  page as (
    select *
    from missing
    order by lower(name), id
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'contractVersion', 'backyrd.world-google-contact-phone-queue@1.0',
    'total', (select count(*) from missing),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'spotId', p.id,
        'name', p.name,
        'address', p.address,
        'city', p.city,
        'country', p.country,
        'website', p.website,
        'googlePlaceId', p.google_place_id
      ) order by lower(p.name), p.id)
      from page p
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.world_product_admin_missing_contact_phone_v1(integer, integer)
  from public, anon;

grant execute on function public.world_product_admin_missing_contact_phone_v1(integer, integer)
  to authenticated, service_role;

create or replace function public.world_product_admin_apply_google_contact_phone_v1(
  p_batch_id uuid,
  p_spot_id uuid,
  p_google_place_id text,
  p_phone text,
  p_source_url text,
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
      and s.google_place_id = nullif(trim(p_google_place_id), '')
      and nullif(btrim(s.phone), '') is null
  ) then
    raise exception 'world_product_spot_or_google_place_mismatch' using errcode = '42501';
  end if;
  if p_batch_id is null
    or v_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_source_url is null
    or p_source_url !~ '^https://'
    or length(p_source_url) > 800
    or p_observed_at is null
    or p_observed_at > now() + interval '5 minutes'
    or p_expected_manifest_hash !~ '^[0-9a-f]{64}$'
    or length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 180
  then
    raise exception 'invalid_google_contact_phone_payload' using errcode = '22023';
  end if;

  v_claim := public.world_product_admin_import_research_claim_v1(
    p_batch_id,
    p_spot_id,
    'contact.phone',
    'KNOWN_VALUE',
    to_jsonb(v_phone),
    p_source_url,
    'Das öffentliche Google-Unternehmensprofil veröffentlicht die geschäftliche Telefonnummer ' || v_phone || '.',
    p_observed_at,
    'CORROBORATED_SECONDARY',
    p_expected_manifest_hash,
    p_idempotency_key
  );

  update public.spots
  set phone = v_phone
  where id = p_spot_id
    and nullif(btrim(phone), '') is null;

  return jsonb_build_object(
    'spotId', p_spot_id,
    'googlePlaceId', trim(p_google_place_id),
    'phone', v_phone,
    'claim', v_claim
  );
end;
$function$;

revoke all on function public.world_product_admin_apply_google_contact_phone_v1(
  uuid, uuid, text, text, text, timestamptz, text, text
) from public, anon;

grant execute on function public.world_product_admin_apply_google_contact_phone_v1(
  uuid, uuid, text, text, text, timestamptz, text, text
) to authenticated, service_role;
