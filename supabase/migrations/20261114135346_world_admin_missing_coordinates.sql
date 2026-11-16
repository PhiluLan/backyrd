create or replace function public.world_product_admin_missing_coordinates_v1(
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

  with latest_location_claims as (
    select distinct on (c.spot_id, c.attribute_key)
      c.spot_id,
      c.attribute_key,
      c.value
    from world_knowledge_private.claims c
    where c.attribute_key in (
      'location.address_line1',
      'location.locality',
      'location.country_code',
      'location.latitude',
      'location.longitude'
    )
    order by c.spot_id, c.attribute_key, c.last_changed_at desc, c.id desc
  ),
  locations as (
    select
      c.spot_id,
      jsonb_object_agg(c.attribute_key, c.value) as values_by_key
    from latest_location_claims c
    group by c.spot_id
  ),
  missing as (
    select
      s.id,
      s.name,
      s.address,
      s.city,
      s.country,
      s.lat,
      s.lng,
      s.google_place_id,
      l.values_by_key -> 'location.address_line1' as address_line1,
      l.values_by_key -> 'location.locality' as locality,
      l.values_by_key -> 'location.country_code' as country_code
    from public.spots s
    left join locations l on l.spot_id = s.id
    where s.status = 'approved'
      and (
        (l.values_by_key -> 'location.latitude') is null
        or jsonb_typeof(l.values_by_key -> 'location.latitude') <> 'number'
        or (l.values_by_key -> 'location.longitude') is null
        or jsonb_typeof(l.values_by_key -> 'location.longitude') <> 'number'
      )
  ),
  page as (
    select *
    from missing
    order by lower(name), id
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'contractVersion', 'backyrd.world-google-coordinate-queue@1.0',
    'total', (select count(*) from missing),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'spotId', p.id,
        'name', p.name,
        'address', coalesce(p.address_line1 #>> '{}', p.address),
        'city', coalesce(p.locality #>> '{}', p.city),
        'country', coalesce(p.country_code #>> '{}', p.country),
        'legacyLatitude', p.lat,
        'legacyLongitude', p.lng,
        'googlePlaceId', p.google_place_id
      ) order by lower(p.name), p.id)
      from page p
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.world_product_admin_apply_google_location_v1(
  p_spot_id uuid,
  p_google_place_id text,
  p_address_line1 text,
  p_locality text,
  p_country_code text,
  p_latitude double precision,
  p_longitude double precision,
  p_observed_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.spots s where s.id = p_spot_id and s.status = 'approved'
  ) then
    raise exception 'world_product_spot_not_approved' using errcode = '42501';
  end if;
  if nullif(trim(p_google_place_id), '') is null
    or nullif(trim(p_address_line1), '') is null
    or nullif(trim(p_locality), '') is null
    or upper(trim(p_country_code)) !~ '^[A-Z]{2}$'
    or p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_observed_at is null
    or length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 120
  then
    raise exception 'invalid_google_location_payload' using errcode = '22023';
  end if;

  v_result := v_result || jsonb_build_array(public.world_product_admin_submit_claim_v1(
    p_spot_id, 'location.address_line1', 'KNOWN_VALUE', to_jsonb(trim(p_address_line1)),
    p_observed_at, null, null, 'PUBLIC', null, p_idempotency_key || ':address'
  ));
  v_result := v_result || jsonb_build_array(public.world_product_admin_submit_claim_v1(
    p_spot_id, 'location.locality', 'KNOWN_VALUE', to_jsonb(trim(p_locality)),
    p_observed_at, null, null, 'PUBLIC', null, p_idempotency_key || ':locality'
  ));
  v_result := v_result || jsonb_build_array(public.world_product_admin_submit_claim_v1(
    p_spot_id, 'location.country_code', 'KNOWN_VALUE', to_jsonb(upper(trim(p_country_code))),
    p_observed_at, null, null, 'PUBLIC', null, p_idempotency_key || ':country'
  ));
  v_result := v_result || jsonb_build_array(public.world_product_admin_submit_claim_v1(
    p_spot_id, 'location.latitude', 'KNOWN_VALUE', to_jsonb(p_latitude),
    p_observed_at, null, null, 'PUBLIC', null, p_idempotency_key || ':latitude'
  ));
  v_result := v_result || jsonb_build_array(public.world_product_admin_submit_claim_v1(
    p_spot_id, 'location.longitude', 'KNOWN_VALUE', to_jsonb(p_longitude),
    p_observed_at, null, null, 'PUBLIC', null, p_idempotency_key || ':longitude'
  ));

  update public.spots
  set google_place_id = trim(p_google_place_id),
      google_photo_enabled = true
  where id = p_spot_id;

  return jsonb_build_object(
    'spotId', p_spot_id,
    'googlePlaceId', trim(p_google_place_id),
    'claims', v_result
  );
end;
$function$;

revoke all on function public.world_product_admin_missing_coordinates_v1(integer, integer)
  from public, anon;
revoke all on function public.world_product_admin_apply_google_location_v1(
  uuid, text, text, text, text, double precision, double precision, timestamptz, text
) from public, anon;

grant execute on function public.world_product_admin_missing_coordinates_v1(integer, integer)
  to authenticated, service_role;
grant execute on function public.world_product_admin_apply_google_location_v1(
  uuid, text, text, text, text, double precision, double precision, timestamptz, text
) to authenticated, service_role;
