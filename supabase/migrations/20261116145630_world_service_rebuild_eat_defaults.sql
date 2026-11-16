create or replace function public.world_product_service_rebuild_eat_defaults_v1(
  p_actor_user_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 25);
  v_spot record;
  v_processed integer := 0;
  v_remaining integer := 0;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_actor_user_id is null
    or not exists (
      select 1
      from auth.users actor
      where actor.id = p_actor_user_id
        and actor.deleted_at is null
    )
    or not public.is_admin_v1(p_actor_user_id)
  then
    raise exception 'world_product_rebuild_admin_required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('world-service-rebuild-eat-defaults-v1', 0)
  );

  for v_spot in
    select
      pointer.spot_id,
      max(claim.last_changed_at) as latest_changed_at
    from world_knowledge_private.current_projection_pointers pointer
    join world_knowledge_private.claims claim on claim.spot_id = pointer.spot_id
    where claim.idempotency_key like 'bulk-eat-defaults-v1:%'
      and claim.last_changed_at > pointer.updated_at
    group by pointer.spot_id
    order by max(claim.last_changed_at), pointer.spot_id
    limit v_limit
  loop
    perform public.world_product_rebuild_spot_v1(
      p_actor_user_id,
      v_spot.spot_id,
      clock_timestamp(),
      'bulk-eat-defaults-rebuild-v1:' || v_spot.spot_id::text || ':' ||
        extract(epoch from v_spot.latest_changed_at)::text
    );
    v_processed := v_processed + 1;
  end loop;

  select count(distinct pointer.spot_id)
  into v_remaining
  from world_knowledge_private.current_projection_pointers pointer
  join world_knowledge_private.claims claim on claim.spot_id = pointer.spot_id
  where claim.idempotency_key like 'bulk-eat-defaults-v1:%'
    and claim.last_changed_at > pointer.updated_at;

  return jsonb_build_object(
    'contractVersion', 'backyrd.world-eat-defaults-rebuild@1.0',
    'processedSpots', v_processed,
    'remainingSpots', v_remaining
  );
end;
$function$;

revoke all on function public.world_product_service_rebuild_eat_defaults_v1(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.world_product_service_rebuild_eat_defaults_v1(uuid, integer)
  to service_role;
