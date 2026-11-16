create or replace function public.world_product_admin_missing_opening_hours_v1(
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

  with latest_hours as (
    select distinct on (c.spot_id)
      c.spot_id,
      c.knowledge_state,
      c.value
    from world_knowledge_private.claims c
    where c.attribute_key = 'hours.regular'
    order by c.spot_id, c.last_changed_at desc, c.id desc
  ),
  missing as (
    select
      s.id,
      s.name,
      s.address,
      s.city,
      s.country,
      s.google_place_id
    from public.spots s
    left join latest_hours h on h.spot_id = s.id
    where s.status = 'approved'
      and h.spot_id is null
  ),
  page as (
    select *
    from missing
    order by lower(name), id
    limit v_limit
    offset v_offset
  )
  select jsonb_build_object(
    'contractVersion', 'backyrd.world-google-opening-hours-queue@1.0',
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
        'googlePlaceId', p.google_place_id
      ) order by lower(p.name), p.id)
      from page p
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.world_product_admin_apply_google_opening_hours_v1(
  p_spot_id uuid,
  p_google_place_id text,
  p_schedule jsonb,
  p_observed_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
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
  ) then
    raise exception 'world_product_spot_or_google_place_mismatch' using errcode = '42501';
  end if;
  if exists (
    select 1
    from world_knowledge_private.claims c
    where c.spot_id = p_spot_id
      and c.attribute_key = 'hours.regular'
  ) then
    raise exception 'world_product_opening_hours_already_claimed' using errcode = '23505';
  end if;
  if p_observed_at is null
    or p_observed_at > now() + interval '5 minutes'
    or length(trim(coalesce(p_idempotency_key, ''))) not between 1 and 120
    or p_schedule is null
    or jsonb_typeof(p_schedule) <> 'array'
    or jsonb_array_length(p_schedule) <> 7
    or not world_knowledge_private.attribute_value_valid_v1(
      'backyrd.world-knowledge.registry@2.5',
      'hours.regular',
      'KNOWN_VALUE',
      p_schedule
    )
  then
    raise exception 'invalid_google_opening_hours_payload' using errcode = '22023';
  end if;

  v_claim := public.world_product_admin_submit_claim_v1(
    p_spot_id,
    'hours.regular',
    'KNOWN_VALUE',
    p_schedule,
    p_observed_at,
    null,
    null,
    'PUBLIC',
    null,
    p_idempotency_key
  );

  return jsonb_build_object(
    'spotId', p_spot_id,
    'googlePlaceId', trim(p_google_place_id),
    'claim', v_claim
  );
end;
$function$;

revoke all on function public.world_product_admin_missing_opening_hours_v1(integer, integer)
  from public, anon;
revoke all on function public.world_product_admin_apply_google_opening_hours_v1(
  uuid, text, jsonb, timestamptz, text
) from public, anon;

grant execute on function public.world_product_admin_missing_opening_hours_v1(integer, integer)
  to authenticated, service_role;
grant execute on function public.world_product_admin_apply_google_opening_hours_v1(
  uuid, text, jsonb, timestamptz, text
) to authenticated, service_role;
