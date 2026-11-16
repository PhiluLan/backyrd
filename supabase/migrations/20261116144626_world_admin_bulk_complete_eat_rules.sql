create or replace function public.world_product_admin_preview_eat_defaults_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  with eat_spots as (
    select s.id
    from public.spots s
    join world_knowledge_private.current_projection_pointers p on p.spot_id = s.id
    join world_knowledge_private.resolution_entries category
      on category.manifest_id = p.manifest_id
     and category.attribute_key = 'classification.primary_category'
     and category.resolution = 'KNOWN_VALUE'
     and category.value = '"EAT"'::jsonb
    where s.status = 'approved'
  ), missing as (
    select e.id as spot_id, attribute.attribute_key
    from eat_spots e
    cross join (values
      ('rule.external_food'::text),
      ('rule.external_drink'::text),
      ('rule.age_access_conditions'::text)
    ) attribute(attribute_key)
    where not exists (
      select 1
      from world_knowledge_private.claims claim
      where claim.spot_id = e.id
        and claim.attribute_key = attribute.attribute_key
    )
  )
  select jsonb_build_object(
    'contractVersion', 'backyrd.world-eat-defaults@1.0',
    'approvedEatSpots', (select count(*) from eat_spots),
    'eligibleSpots', (select count(distinct spot_id) from missing),
    'claimsToCreate', (select count(*) from missing),
    'byAttribute', coalesce((
      select jsonb_object_agg(attribute_key, claim_count order by attribute_key)
      from (
        select attribute_key, count(*) as claim_count
        from missing
        group by attribute_key
      ) counts
    ), '{}'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.world_product_admin_preview_eat_defaults_v1()
  from public, anon;

grant execute on function public.world_product_admin_preview_eat_defaults_v1()
  to authenticated, service_role;

create or replace function public.world_product_admin_apply_eat_defaults_v1(
  p_batch_id uuid,
  p_limit integer default 40
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 50);
  v_spot record;
  v_processed_spots integer := 0;
  v_external_food_created integer := 0;
  v_external_drink_created integer := 0;
  v_age_access_created integer := 0;
  v_remaining_spots integer := 0;
  v_remaining_claims integer := 0;
  v_observed_at timestamptz;
begin
  if auth.uid() is null or not public.is_admin_v1(auth.uid()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode = '42501';
  end if;
  if p_batch_id is null then
    raise exception 'batch_id_required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-admin-bulk-eat-defaults-v1', 0)
  );

  for v_spot in
    with eat_spots as (
      select s.id
      from public.spots s
      join world_knowledge_private.current_projection_pointers p on p.spot_id = s.id
      join world_knowledge_private.resolution_entries category
        on category.manifest_id = p.manifest_id
       and category.attribute_key = 'classification.primary_category'
       and category.resolution = 'KNOWN_VALUE'
       and category.value = '"EAT"'::jsonb
      where s.status = 'approved'
    )
    select e.id
    from eat_spots e
    where exists (
      select 1
      from (values
        ('rule.external_food'::text),
        ('rule.external_drink'::text),
        ('rule.age_access_conditions'::text)
      ) attribute(attribute_key)
      where not exists (
        select 1
        from world_knowledge_private.claims claim
        where claim.spot_id = e.id
          and claim.attribute_key = attribute.attribute_key
      )
    )
    order by e.id
    limit v_limit
  loop
    v_processed_spots := v_processed_spots + 1;
    v_observed_at := clock_timestamp();

    if not exists (
      select 1 from world_knowledge_private.claims claim
      where claim.spot_id = v_spot.id and claim.attribute_key = 'rule.external_food'
    ) then
      perform public.world_product_admin_submit_claim_v1(
        v_spot.id,
        'rule.external_food',
        'KNOWN_VALUE',
        jsonb_build_object('policy', 'NOT_ALLOWED', 'exceptions', jsonb_build_array()),
        v_observed_at,
        null,
        null,
        'PUBLIC',
        null,
        'bulk-eat-defaults-v1:' || p_batch_id::text || ':' || v_spot.id::text || ':external-food'
      );
      v_external_food_created := v_external_food_created + 1;
    end if;

    if not exists (
      select 1 from world_knowledge_private.claims claim
      where claim.spot_id = v_spot.id and claim.attribute_key = 'rule.external_drink'
    ) then
      perform public.world_product_admin_submit_claim_v1(
        v_spot.id,
        'rule.external_drink',
        'KNOWN_VALUE',
        jsonb_build_object('policy', 'NOT_ALLOWED', 'exceptions', jsonb_build_array()),
        v_observed_at,
        null,
        null,
        'PUBLIC',
        null,
        'bulk-eat-defaults-v1:' || p_batch_id::text || ':' || v_spot.id::text || ':external-drink'
      );
      v_external_drink_created := v_external_drink_created + 1;
    end if;

    if not exists (
      select 1 from world_knowledge_private.claims claim
      where claim.spot_id = v_spot.id and claim.attribute_key = 'rule.age_access_conditions'
    ) then
      perform public.world_product_admin_submit_claim_v1(
        v_spot.id,
        'rule.age_access_conditions',
        'KNOWN_VALUE',
        jsonb_build_object(
          'rules', jsonb_build_array(jsonb_build_object(
            'mode', 'NO_MINIMUM',
            'minimumAge', null,
            'accompaniment', 'NONE',
            'appliesFromTime', null,
            'days', jsonb_build_array(),
            'area', null,
            'event', null
          )),
          'notes', null
        ),
        v_observed_at,
        null,
        null,
        'PUBLIC',
        null,
        'bulk-eat-defaults-v1:' || p_batch_id::text || ':' || v_spot.id::text || ':age-access'
      );
      v_age_access_created := v_age_access_created + 1;
    end if;
  end loop;

  with eat_spots as (
    select s.id
    from public.spots s
    join world_knowledge_private.current_projection_pointers p on p.spot_id = s.id
    join world_knowledge_private.resolution_entries category
      on category.manifest_id = p.manifest_id
     and category.attribute_key = 'classification.primary_category'
     and category.resolution = 'KNOWN_VALUE'
     and category.value = '"EAT"'::jsonb
    where s.status = 'approved'
  ), missing as (
    select e.id as spot_id, attribute.attribute_key
    from eat_spots e
    cross join (values
      ('rule.external_food'::text),
      ('rule.external_drink'::text),
      ('rule.age_access_conditions'::text)
    ) attribute(attribute_key)
    where not exists (
      select 1
      from world_knowledge_private.claims claim
      where claim.spot_id = e.id
        and claim.attribute_key = attribute.attribute_key
    )
  )
  select count(distinct spot_id), count(*)
  into v_remaining_spots, v_remaining_claims
  from missing;

  return jsonb_build_object(
    'contractVersion', 'backyrd.world-eat-defaults@1.0',
    'batchId', p_batch_id,
    'processedSpots', v_processed_spots,
    'created', jsonb_build_object(
      'rule.external_food', v_external_food_created,
      'rule.external_drink', v_external_drink_created,
      'rule.age_access_conditions', v_age_access_created,
      'total', v_external_food_created + v_external_drink_created + v_age_access_created
    ),
    'remainingEligibleSpots', v_remaining_spots,
    'remainingClaims', v_remaining_claims
  );
end;
$function$;

revoke all on function public.world_product_admin_apply_eat_defaults_v1(uuid, integer)
  from public, anon;

grant execute on function public.world_product_admin_apply_eat_defaults_v1(uuid, integer)
  to authenticated, service_role;
