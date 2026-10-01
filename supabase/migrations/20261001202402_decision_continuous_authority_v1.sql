-- A manually approved Product generation may remain available through short,
-- append-only leases. This migration does not activate Decision or authorize a
-- generation. Emergency-OFF changes the generation and immediately invalidates
-- every renewal belonging to the previous one.
create table decision_vnext_private.product_continuity_authorizations_v1 (
  generation bigint primary key references decision_vnext_private.product_runtime_control_events_v1(generation),
  release_hash text not null check (release_hash ~ '^[0-9a-f]{64}$'),
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  source_set_hash text not null check (source_set_hash ~ '^[0-9a-f]{64}$'),
  authority_hash text not null check (authority_hash ~ '^[0-9a-f]{64}$'),
  authorized_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table decision_vnext_private.product_continuity_renewals_v1 (
  id bigint generated always as identity primary key,
  generation bigint not null references decision_vnext_private.product_continuity_authorizations_v1(generation),
  renewed_at timestamptz not null,
  expires_at timestamptz not null,
  constraint product_continuity_renewal_window_v1 check (
    expires_at > renewed_at + interval '1 minute'
    and expires_at <= renewed_at + interval '24 hours'
  )
);
create index product_continuity_renewals_generation_expiry_v1
  on decision_vnext_private.product_continuity_renewals_v1(generation,expires_at desc);

alter table decision_vnext_private.product_continuity_authorizations_v1 enable row level security;
alter table decision_vnext_private.product_continuity_renewals_v1 enable row level security;
revoke all on table decision_vnext_private.product_continuity_authorizations_v1,
  decision_vnext_private.product_continuity_renewals_v1 from public,anon,authenticated,service_role;
revoke all on sequence decision_vnext_private.product_continuity_renewals_v1_id_seq
  from public,anon,authenticated,service_role;

create trigger decision_vnext_product_continuity_authorization_immutable_v1
before update or delete on decision_vnext_private.product_continuity_authorizations_v1
for each row execute function decision_vnext_private.reject_runtime_control_mutation_v1();
create trigger decision_vnext_product_continuity_renewal_immutable_v1
before update or delete on decision_vnext_private.product_continuity_renewals_v1
for each row execute function decision_vnext_private.reject_runtime_control_mutation_v1();

create function decision_vnext_private.product_effective_authority_expiry_v1(p_generation bigint)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select greatest(c.authority_expires_at,
    (select max(r.expires_at)
     from decision_vnext_private.product_continuity_renewals_v1 r
     where r.generation=c.generation))
  from decision_vnext_private.product_runtime_control_events_v1 c
  where c.generation=p_generation
$$;
revoke all on function decision_vnext_private.product_effective_authority_expiry_v1(bigint)
  from public,anon,authenticated,service_role;

create function decision_vnext_private.authorize_product_continuity_v1(
  p_expected_generation bigint,p_release_hash text,p_artifact_hash text,
  p_source_set_hash text,p_authority_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_current decision_vnext_private.product_runtime_control_events_v1%rowtype;
begin
  if current_user <> 'postgres' then
    raise exception 'decision_vnext_product_release_operator_required' using errcode='42501';
  end if;
  if p_expected_generation is null or p_expected_generation < 1
     or p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_authority_hash is null or p_authority_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'decision_vnext_product_continuity_authority_invalid' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_current from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  if v_current.generation <> p_expected_generation or v_current.state <> 'ON'
     or v_current.release_hash is distinct from p_release_hash
     or v_current.artifact_hash is distinct from p_artifact_hash
     or v_current.source_set_hash is distinct from p_source_set_hash
     or v_current.authority_version is distinct from 'backyrd.decision-vnext.product-activation-authority@1.0'
     or decision_vnext_private.product_effective_authority_expiry_v1(v_current.generation)
        <= pg_catalog.clock_timestamp() then
    raise exception 'decision_vnext_product_continuity_binding_denied' using errcode='42501';
  end if;
  insert into decision_vnext_private.product_continuity_authorizations_v1(
    generation,release_hash,artifact_hash,source_set_hash,authority_hash
  ) values (p_expected_generation,p_release_hash,p_artifact_hash,p_source_set_hash,p_authority_hash);
  return pg_catalog.jsonb_build_object('authorized',true,'generation',p_expected_generation,
    'releaseHash',p_release_hash,'artifactHash',p_artifact_hash,'sourceSetHash',p_source_set_hash);
end;
$$;
revoke all on function decision_vnext_private.authorize_product_continuity_v1(bigint,text,text,text,text)
  from public,anon,authenticated,service_role;

create function decision_vnext_private.renew_product_continuity_v1()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_current decision_vnext_private.product_runtime_control_events_v1%rowtype;
  v_authorization decision_vnext_private.product_continuity_authorizations_v1%rowtype;
  v_now timestamptz; v_expiry timestamptz;
begin
  if current_user <> 'postgres' then
    raise exception 'decision_vnext_product_release_operator_required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  v_now := pg_catalog.clock_timestamp();
  select * into strict v_current from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  if v_current.state <> 'ON' then
    return pg_catalog.jsonb_build_object('renewed',false,'reason','OFF');
  end if;
  select * into v_authorization from decision_vnext_private.product_continuity_authorizations_v1
    where generation=v_current.generation;
  if not found or v_authorization.release_hash is distinct from v_current.release_hash
     or v_authorization.artifact_hash is distinct from v_current.artifact_hash
     or v_authorization.source_set_hash is distinct from v_current.source_set_hash
     or v_current.authority_version is distinct from 'backyrd.decision-vnext.product-activation-authority@1.0' then
    return pg_catalog.jsonb_build_object('renewed',false,'reason','NOT_AUTHORIZED');
  end if;
  v_expiry := decision_vnext_private.product_effective_authority_expiry_v1(v_current.generation);
  if v_expiry is null or v_expiry <= v_now then
    return pg_catalog.jsonb_build_object('renewed',false,'reason','EXPIRED');
  end if;
  if v_expiry > v_now + interval '6 hours' then
    return pg_catalog.jsonb_build_object('renewed',false,'reason','NOT_DUE','expiresAt',v_expiry);
  end if;
  insert into decision_vnext_private.product_continuity_renewals_v1(generation,renewed_at,expires_at)
  values (v_current.generation,v_now,v_now+interval '18 hours');
  return pg_catalog.jsonb_build_object('renewed',true,'generation',v_current.generation,
    'expiresAt',v_now+interval '18 hours');
end;
$$;
revoke all on function decision_vnext_private.renew_product_continuity_v1()
  from public,anon,authenticated,service_role;

-- pg_cron is an operational renewal attempt, never an activation authority.
-- Failed/missed runs expire naturally and cannot resurrect an expired release.
select cron.schedule('backyrd-decision-vnext-continuity-v1','17 * * * *',
  'select decision_vnext_private.renew_product_continuity_v1()');

create or replace function public.backyrd_decision_vnext_product_control_v1(
  p_release_hash text,p_artifact_hash text,p_source_set_hash text,p_generation bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
  v_expiry timestamptz;
begin
  perform decision_vnext_private.assert_service_authority_v1();
  if p_release_hash is null or p_release_hash !~ '^[0-9a-f]{64}$'
     or p_artifact_hash is null or p_artifact_hash !~ '^[0-9a-f]{64}$'
     or p_source_set_hash is null or p_source_set_hash !~ '^[0-9a-f]{64}$'
     or p_generation is null or p_generation < 1 then
    raise exception 'decision_vnext_product_control_input_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_control from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  v_expiry := decision_vnext_private.product_effective_authority_expiry_v1(v_control.generation);
  if v_control.generation <> p_generation
     or v_control.release_hash is distinct from p_release_hash
     or v_control.artifact_hash is distinct from p_artifact_hash
     or v_control.source_set_hash is distinct from p_source_set_hash
     or v_control.state <> 'ON'
     or v_control.authority_version is distinct from 'backyrd.decision-vnext.product-activation-authority@1.0'
     or v_expiry is null or v_expiry <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
      'state','OFF','enabled',false,'killSwitch',true,'generation',v_control.generation,
      'reason','BINDING_STATE_OR_AUTHORITY_DENIED'
    );
  end if;
  return pg_catalog.jsonb_build_object(
    'contractVersion','backyrd.decision-vnext.product-runtime-control@1.0',
    'state','ON','enabled',true,'killSwitch',false,'generation',v_control.generation,
    'releaseHash',v_control.release_hash,'artifactHash',v_control.artifact_hash,
    'sourceSetHash',v_control.source_set_hash,'authorityHash',v_control.authority_hash,
    'authorityVersion',v_control.authority_version,'expiresAt',v_expiry,
    'reason','EXACT_BINDING_ACTIVE'
  );
end;
$$;

create or replace function world_knowledge_private.product_authoring_active_v1()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('backyrd.decision-vnext.product-runtime-control@1.0',0));
  select * into strict v_control from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  return v_control.state='ON'
    and v_control.authority_version='backyrd.decision-vnext.product-activation-authority@1.0'
    and decision_vnext_private.product_effective_authority_expiry_v1(v_control.generation)
      > pg_catalog.clock_timestamp();
end;
$$;

-- Preserve the established aggregate cockpit implementation and update only
-- its control projection. The base function still enforces admin identity.
alter function public.founder_live_product_overview_v2()
  rename to founder_live_product_overview_base_v2;
revoke all on function public.founder_live_product_overview_base_v2()
  from public,anon,authenticated,service_role;

create function public.founder_live_product_overview_v2()
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_product jsonb; v_attention jsonb;
  v_control decision_vnext_private.product_runtime_control_events_v1%rowtype;
  v_expiry timestamptz; v_effective boolean; v_now timestamptz;
begin
  v_result := public.founder_live_product_overview_base_v2();
  v_now := pg_catalog.clock_timestamp();
  select * into strict v_control from decision_vnext_private.product_runtime_control_events_v1
    order by generation desc limit 1;
  v_expiry := decision_vnext_private.product_effective_authority_expiry_v1(v_control.generation);
  v_effective := v_control.state='ON'
    and v_control.authority_version='backyrd.decision-vnext.product-activation-authority@1.0'
    and v_expiry>v_now;
  v_product := v_result->'product';
  v_product := pg_catalog.jsonb_set(v_product,'{effectiveState}',
    pg_catalog.to_jsonb(case when v_effective then 'ON' else 'OFF' end));
  v_product := pg_catalog.jsonb_set(v_product,'{killSwitchEngaged}',
    pg_catalog.to_jsonb(not v_effective));
  v_product := pg_catalog.jsonb_set(v_product,'{authorityExpiresAt}',
    coalesce(pg_catalog.to_jsonb(v_expiry),'null'::jsonb));
  select coalesce(pg_catalog.jsonb_agg(item),'[]'::jsonb) into v_attention
  from pg_catalog.jsonb_array_elements(v_result->'attention') item
  where item->>'code' not in ('PRODUCT_OFF','AUTHORITY_EXPIRING');
  if not v_effective then
    v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','CRITICAL','code','PRODUCT_OFF','title','Decision vNext ist nicht wirksam ON',
      'detail','Der Product-Control oder seine zeitlich begrenzte Authority ist OFF beziehungsweise abgelaufen.'
    ));
  elsif v_expiry <= v_now + interval '2 hours' then
    v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'severity','WARNING','code','AUTHORITY_EXPIRING','title','Product-Authority läuft bald ab',
      'detail','Die aktuelle ON-Authority läuft innerhalb der nächsten zwei Stunden ab.'
    ));
  end if;
  return pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_result,'{product}',v_product),
    '{attention}',v_attention);
end;
$$;
revoke all on function public.founder_live_product_overview_v2()
  from public,anon,authenticated,service_role;
grant execute on function public.founder_live_product_overview_v2()
  to authenticated,service_role;
