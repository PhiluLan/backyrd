-- World maintenance is independent from Decision execution. Applying this
-- migration leaves the new Admin authority OFF. Only the database release
-- operator can enable it; an OFF event is the World-specific kill switch.
create table world_knowledge_private.product_admin_authoring_control_events_v1 (
  generation bigint primary key check (generation >= 0),
  state text not null check (state in ('OFF','ON')),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table world_knowledge_private.product_admin_authoring_control_events_v1 enable row level security;
revoke all on world_knowledge_private.product_admin_authoring_control_events_v1
  from public, anon, authenticated, service_role;
insert into world_knowledge_private.product_admin_authoring_control_events_v1
  (generation,state,reason_code) values (0,'OFF','INITIAL_OFF');

create function world_knowledge_private.reject_product_admin_authoring_control_mutation_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'world_product_admin_authoring_control_immutable' using errcode='55000';
end;
$$;
create trigger world_product_admin_authoring_control_immutable_v1
  before update or delete on world_knowledge_private.product_admin_authoring_control_events_v1
  for each row execute function world_knowledge_private.reject_product_admin_authoring_control_mutation_v1();
revoke all on function world_knowledge_private.reject_product_admin_authoring_control_mutation_v1()
  from public, anon, authenticated, service_role;

create function world_knowledge_private.set_product_admin_authoring_control_v1(
  p_expected_generation bigint, p_state text, p_reason_code text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_generation bigint; v_state text;
begin
  if current_user <> 'postgres' then
    raise exception 'world_product_admin_authoring_operator_required' using errcode='42501';
  end if;
  if p_expected_generation is null or p_expected_generation < 0
     or p_state is null or p_state not in ('ON','OFF')
     or p_reason_code is null
     or p_reason_code !~ '^[A-Z][A-Z0-9_]{2,79}$' then
    raise exception 'world_product_admin_authoring_control_invalid' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('backyrd.world-knowledge.product-admin-authoring-control@1.0',0));
  select generation,state into strict v_generation,v_state
    from world_knowledge_private.product_admin_authoring_control_events_v1
    order by generation desc limit 1;
  if v_generation <> p_expected_generation or v_state = p_state then
    raise exception 'world_product_admin_authoring_generation_conflict' using errcode='40001';
  end if;
  insert into world_knowledge_private.product_admin_authoring_control_events_v1
    (generation,state,reason_code) values (v_generation+1,p_state,p_reason_code);
  return jsonb_build_object('contractVersion','backyrd.world-knowledge.product-admin-authoring-control@1.0',
    'generation',v_generation+1,'state',p_state,'killSwitch',p_state='OFF');
end;
$$;
revoke all on function world_knowledge_private.set_product_admin_authoring_control_v1(bigint,text,text)
  from public, anon, authenticated, service_role;

create function world_knowledge_private.product_admin_authoring_active_v1()
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare v_state text;
begin
  -- Serializes every Admin write/rebuild with an emergency OFF transition.
  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('backyrd.world-knowledge.product-admin-authoring-control@1.0',0));
  select state into strict v_state
    from world_knowledge_private.product_admin_authoring_control_events_v1
    order by generation desc limit 1;
  return v_state='ON';
end;
$$;
revoke all on function world_knowledge_private.product_admin_authoring_active_v1()
  from public, anon, authenticated, service_role;

create or replace function public.world_product_admin_submit_claim_v1(
  p_spot_id uuid,p_attribute_key text,p_knowledge_state text,p_value jsonb,
  p_observed_at timestamptz,p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,p_visibility text default 'PUBLIC',
  p_supersedes_claim_id uuid default null,p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
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
  return world_knowledge_private.submit_authoritative_claim_v3(
    'ADMIN',p_spot_id,p_attribute_key,p_knowledge_state,p_value,p_observed_at,
    p_valid_from,p_valid_until,p_visibility,p_supersedes_claim_id,p_idempotency_key);
end;
$$;
revoke all on function public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  from public,anon,service_role;
grant execute on function public.world_product_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)
  to authenticated;

create or replace function public.world_product_rebuild_spot_v1(
  p_actor_user_id uuid,p_spot_id uuid,p_as_of timestamptz,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if not world_knowledge_private.product_admin_authoring_active_v1() then
    raise exception 'world_product_admin_authoring_off' using errcode='42501';
  end if;
  if p_actor_user_id is null
     or not exists(select 1 from auth.users u where u.id=p_actor_user_id and u.deleted_at is null)
     or not public.is_admin_v1(p_actor_user_id) then
    raise exception 'world_product_rebuild_admin_required' using errcode='42501';
  end if;
  if not exists(select 1 from public.spots s where s.id=p_spot_id and s.status='approved') then
    raise exception 'world_product_spot_not_approved' using errcode='42501';
  end if;
  insert into world_knowledge_private.shadow_spot_allowlist(spot_id,reason,valid_until)
  values(p_spot_id,'PRODUCT_ADMIN_AUTHORIZED_REBUILD',pg_catalog.clock_timestamp()+interval '5 minutes')
  on conflict(spot_id) do update set
    valid_until=greatest(world_knowledge_private.shadow_spot_allowlist.valid_until,excluded.valid_until),
    reason='PRODUCT_ADMIN_AUTHORIZED_REBUILD';
  return public.world_shadow_rebuild_spot_v1(p_spot_id,p_as_of,'FULL',p_idempotency_key);
end;
$$;
revoke all on function public.world_product_rebuild_spot_v1(uuid,uuid,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.world_product_rebuild_spot_v1(uuid,uuid,timestamptz,text)
  to service_role;
