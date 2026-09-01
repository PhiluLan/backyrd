-- Gate 3 Founder Location operations. This is deliberately one bounded
-- runtime parameter, not a landmark catalogue or a general Geo platform.

create table public.backyrd_decision_location_config_v1 (
  city_key text primary key,
  default_near_radius_m integer not null,
  status text not null default 'ACTIVE',
  contract_version text not null default 'backyrd-decision-location-config-v1',
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  constraint backyrd_decision_location_city_key_v1 check (city_key = 'basel'),
  constraint backyrd_decision_location_radius_v1 check (default_near_radius_m between 100 and 2000),
  constraint backyrd_decision_location_status_v1 check (status in ('ACTIVE', 'DISABLED')),
  constraint backyrd_decision_location_contract_v1 check (contract_version = 'backyrd-decision-location-config-v1')
);

create table public.backyrd_decision_location_config_audit_v1 (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  city_key text not null,
  actor_id uuid null,
  action text not null,
  previous_near_radius_m integer null,
  next_near_radius_m integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint backyrd_decision_location_audit_city_v1 check (city_key = 'basel'),
  constraint backyrd_decision_location_audit_action_v1 check (action in ('INITIALIZE', 'UPDATE_DEFAULT_NEAR_RADIUS')),
  constraint backyrd_decision_location_audit_radius_v1 check (next_near_radius_m between 100 and 2000),
  constraint backyrd_decision_location_audit_reason_v1 check (char_length(btrim(reason)) between 8 and 500)
);

insert into public.backyrd_decision_location_config_v1(city_key, default_near_radius_m)
values ('basel', 800);

insert into public.backyrd_decision_location_config_audit_v1(
  request_id, city_key, actor_id, action, previous_near_radius_m, next_near_radius_m, reason
) values (
  '00000000-0000-4000-8000-000000000800', 'basel', null, 'INITIALIZE', null, 800,
  'Gate 3 Founder-authorized initial Production default'
);

create or replace function public.backyrd_decision_location_audit_immutable_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'decision_location_audit_immutable' using errcode = '42501';
end;
$$;

create trigger trg_backyrd_decision_location_audit_immutable_v1
before update or delete on public.backyrd_decision_location_config_audit_v1
for each row execute function public.backyrd_decision_location_audit_immutable_v1();

create or replace function public.backyrd_decision_location_runtime_config_v1(p_city_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.backyrd_decision_location_config_v1%rowtype;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_city_key, ''))) <> 'basel' then
    raise exception 'decision_location_city_unsupported' using errcode = '22023';
  end if;

  select * into v_row
  from public.backyrd_decision_location_config_v1
  where city_key = 'basel' and status = 'ACTIVE';

  if not found
     or v_row.contract_version <> 'backyrd-decision-location-config-v1'
     or v_row.default_near_radius_m not between 100 and 2000 then
    raise exception 'decision_location_config_invalid' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'version', v_row.contract_version,
    'cityKey', v_row.city_key,
    'defaultNearRadiusM', v_row.default_near_radius_m,
    'status', v_row.status,
    'updatedAt', v_row.updated_at,
    'updatedBy', v_row.updated_by
  );
end;
$$;

create or replace function public.backyrd_admin_set_decision_near_radius_v1(
  p_actor_id uuid,
  p_city_key text,
  p_radius_m integer,
  p_reason text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous integer;
  v_existing public.backyrd_decision_location_config_audit_v1%rowtype;
  v_result jsonb;
begin
  if current_user not in ('postgres', 'service_role') then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_actor_id is null or not exists (
    select 1 from public.profiles where id = p_actor_id and is_admin is true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if lower(btrim(coalesce(p_city_key, ''))) <> 'basel' then
    raise exception 'decision_location_city_unsupported' using errcode = '22023';
  end if;
  if p_radius_m is null or p_radius_m not between 100 and 2000 then
    raise exception 'decision_location_radius_out_of_bounds' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 8 and 500 then
    raise exception 'decision_location_reason_invalid' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'decision_location_request_id_required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.backyrd_decision_location_config_audit_v1
  where request_id = p_request_id;
  if found then
    if v_existing.actor_id is distinct from p_actor_id
       or v_existing.city_key <> 'basel'
       or v_existing.next_near_radius_m <> p_radius_m
       or v_existing.reason <> btrim(p_reason) then
      raise exception 'decision_location_request_identity_conflict' using errcode = '23505';
    end if;
    return public.backyrd_decision_location_runtime_config_v1('basel') || jsonb_build_object('replayed', true);
  end if;

  select default_near_radius_m into v_previous
  from public.backyrd_decision_location_config_v1
  where city_key = 'basel' and status = 'ACTIVE'
  for update;
  if not found then
    raise exception 'decision_location_config_invalid' using errcode = '55000';
  end if;

  update public.backyrd_decision_location_config_v1
  set default_near_radius_m = p_radius_m,
      updated_at = now(),
      updated_by = p_actor_id
  where city_key = 'basel';

  insert into public.backyrd_decision_location_config_audit_v1(
    request_id, city_key, actor_id, action, previous_near_radius_m, next_near_radius_m, reason
  ) values (
    p_request_id, 'basel', p_actor_id, 'UPDATE_DEFAULT_NEAR_RADIUS', v_previous, p_radius_m, btrim(p_reason)
  );

  v_result := public.backyrd_decision_location_runtime_config_v1('basel');
  return v_result || jsonb_build_object('replayed', false, 'previousNearRadiusM', v_previous);
end;
$$;

alter table public.backyrd_decision_location_config_v1 enable row level security;
alter table public.backyrd_decision_location_config_audit_v1 enable row level security;

create policy backyrd_decision_location_config_no_direct_v1
on public.backyrd_decision_location_config_v1 for all to anon, authenticated
using (false) with check (false);

create policy backyrd_decision_location_audit_no_direct_v1
on public.backyrd_decision_location_config_audit_v1 for all to anon, authenticated
using (false) with check (false);

revoke all on public.backyrd_decision_location_config_v1 from public, anon, authenticated;
revoke all on public.backyrd_decision_location_config_audit_v1 from public, anon, authenticated;
grant select, update on public.backyrd_decision_location_config_v1 to service_role;
grant select, insert on public.backyrd_decision_location_config_audit_v1 to service_role;

revoke all on function public.backyrd_decision_location_audit_immutable_v1() from public, anon, authenticated;
revoke all on function public.backyrd_decision_location_runtime_config_v1(text) from public, anon, authenticated;
revoke all on function public.backyrd_admin_set_decision_near_radius_v1(uuid,text,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.backyrd_decision_location_runtime_config_v1(text) to service_role;
grant execute on function public.backyrd_admin_set_decision_near_radius_v1(uuid,text,integer,text,uuid) to service_role;

comment on table public.backyrd_decision_location_config_v1 is
  'Server-only bounded Decision Location runtime configuration. It does not store or replace dynamically resolved reference places.';
comment on table public.backyrd_decision_location_config_audit_v1 is
  'Immutable audit trail for Founder-administered Decision Location configuration.';
comment on function public.backyrd_decision_location_runtime_config_v1(text) is
  'Service-only fail-closed runtime reader for the bounded default Near radius.';
comment on function public.backyrd_admin_set_decision_near_radius_v1(uuid,text,integer,text,uuid) is
  'Service-only atomic, idempotent and audited admin update for the bounded default Near radius.';
