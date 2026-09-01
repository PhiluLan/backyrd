\set ON_ERROR_STOP on
begin;

create function pg_temp.location_assert(p_ok boolean,p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'Decision Location admin contract failed: %',p_message; end if;
end
$$;

select pg_temp.location_assert(
  (public.backyrd_decision_location_runtime_config_v1('basel')->>'defaultNearRadiusM')::integer = 800,
  'initial 800 m runtime identity missing'
);
select pg_temp.location_assert(
  not has_table_privilege('authenticated','public.backyrd_decision_location_config_v1','select'),
  'authenticated can read server-only config table'
);
select pg_temp.location_assert(
  not has_table_privilege('authenticated','public.backyrd_decision_location_config_v1','update'),
  'authenticated can write server-only config table'
);
select pg_temp.location_assert(
  not has_function_privilege('authenticated','public.backyrd_admin_set_decision_near_radius_v1(uuid,text,integer,text,uuid)','execute'),
  'authenticated can invoke server-only admin mutation directly'
);

do $$
declare
  v_admin uuid := '10000000-0000-4000-8000-000000000001';
  v_non_admin uuid := '10000000-0000-4000-8000-000000000002';
  v_request uuid := '20000000-0000-4000-8000-000000000001';
  v_result jsonb;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',v_admin,'authenticated','authenticated','location-admin@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_non_admin,'authenticated','authenticated','location-user@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id,is_admin) values(v_admin,true),(v_non_admin,false) on conflict(id) do update set is_admin=excluded.is_admin;

  begin
    perform public.backyrd_admin_set_decision_near_radius_v1(v_non_admin,'basel',700,'Unauthorized radius change',gen_random_uuid());
    raise exception 'non-admin mutation succeeded';
  exception when insufficient_privilege then null; end;

  begin
    perform public.backyrd_admin_set_decision_near_radius_v1(v_admin,'basel',99,'Too narrow radius',gen_random_uuid());
    raise exception 'out-of-range mutation succeeded';
  exception when invalid_parameter_value then null; end;

  v_result := public.backyrd_admin_set_decision_near_radius_v1(v_admin,'basel',750,'Founder bounded operational adjustment',v_request);
  perform pg_temp.location_assert((v_result->>'defaultNearRadiusM')::integer=750,'valid update did not reach runtime contract');
  perform pg_temp.location_assert((v_result->>'replayed')::boolean=false,'first mutation marked as replay');
  perform pg_temp.location_assert((select count(*)=1 from public.backyrd_decision_location_config_audit_v1 where request_id=v_request and previous_near_radius_m=800 and next_near_radius_m=750 and actor_id=v_admin),'audit identity incomplete');

  v_result := public.backyrd_admin_set_decision_near_radius_v1(v_admin,'basel',750,'Founder bounded operational adjustment',v_request);
  perform pg_temp.location_assert((v_result->>'replayed')::boolean=true,'idempotent replay not recognized');
  perform pg_temp.location_assert((select count(*)=1 from public.backyrd_decision_location_config_audit_v1 where request_id=v_request),'replay duplicated audit');

  begin
    perform public.backyrd_admin_set_decision_near_radius_v1(v_admin,'basel',760,'Conflicting replay radius',v_request);
    raise exception 'conflicting replay succeeded';
  exception when unique_violation then null; end;

  begin
    update public.backyrd_decision_location_config_audit_v1 set reason='Tampered audit history' where request_id=v_request;
    raise exception 'audit mutation succeeded';
  exception when insufficient_privilege then null; end;
end
$$;

rollback;
