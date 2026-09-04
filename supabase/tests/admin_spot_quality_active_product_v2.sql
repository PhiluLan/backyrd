\set ON_ERROR_STOP on
begin;

create function pg_temp.quality_v2_uuid(p_value text) returns uuid
language sql immutable as $$
  select (substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||'-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12))::uuid
$$;

create function pg_temp.quality_v2_assert(p_ok boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'admin quality active Product V2 failed: %', p_message;
  end if;
end
$$;

create function pg_temp.quality_v2_actor(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',p_user,'role','authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end
$$;

do $$
declare
  v_admin uuid := pg_temp.quality_v2_uuid('quality-v2-admin');
  v_user uuid := pg_temp.quality_v2_uuid('quality-v2-user');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',v_admin,'authenticated','authenticated','quality-v2-admin@invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','quality-v2-user@invalid','','{}','{}',now(),now());
  update public.profiles set is_admin=true where id=v_admin;
  insert into public.admin_users(user_id,role) values(v_admin,'super_admin');

  insert into public.spots(id,name,city,status,data_origin,lat,lng) values
    (pg_temp.quality_v2_uuid('quality-v2-approved'),'Quality V2 Approved','Basel','approved','REAL',47.55,7.59),
    (pg_temp.quality_v2_uuid('quality-v2-pending'),'Quality V2 Pending','Basel','pending','IMPORT',47.55,7.59),
    (pg_temp.quality_v2_uuid('quality-v2-archived'),'Quality V2 Archived','Basel','archived','LEGACY',47.55,7.59),
    (pg_temp.quality_v2_uuid('quality-v2-fixture'),'Quality V2 Fixture','Basel','approved','FIXTURE',47.55,7.59),
    (pg_temp.quality_v2_uuid('quality-v2-test'),'Quality V2 Test','Basel','approved','TEST',47.55,7.59);

  perform pg_temp.quality_v2_actor(v_user);
end
$$;

set local role authenticated;
do $$
declare v_denied boolean := false;
begin
  begin
    perform public.admin_spot_quality_v2(10,0,'Quality V2','all');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  perform pg_temp.quality_v2_assert(v_denied,'ordinary user could read the Admin-only V2 contract');
end
$$;
reset role;

select pg_temp.quality_v2_actor(pg_temp.quality_v2_uuid('quality-v2-admin'));
set local role authenticated;

do $$
declare
  v_result jsonb := public.admin_spot_quality_v2(1000,0,'Quality V2','all');
begin
  perform pg_temp.quality_v2_assert(v_result#>>'{population,contract}'='ACTIVE_PRODUCT_SPOTS_V2','population contract is not explicit');
  perform pg_temp.quality_v2_assert((v_result->>'filtered_total')::integer=2,'active Product search count must contain approved and pending only');
  perform pg_temp.quality_v2_assert(jsonb_array_length(v_result->'rows')=2,'count and drill-down row population diverged');
  perform pg_temp.quality_v2_assert(
    exists(select 1 from jsonb_array_elements(v_result->'rows') row where row->>'spot_id'=pg_temp.quality_v2_uuid('quality-v2-approved')::text),
    'approved Product Spot missing'
  );
  perform pg_temp.quality_v2_assert(
    exists(select 1 from jsonb_array_elements(v_result->'rows') row where row->>'spot_id'=pg_temp.quality_v2_uuid('quality-v2-pending')::text),
    'pending Product Spot missing'
  );
  perform pg_temp.quality_v2_assert(
    not exists(select 1 from jsonb_array_elements(v_result->'rows') row where row->>'spot_id' in (
      pg_temp.quality_v2_uuid('quality-v2-archived')::text,
      pg_temp.quality_v2_uuid('quality-v2-fixture')::text,
      pg_temp.quality_v2_uuid('quality-v2-test')::text
    )),
    'archived or synthetic Spot leaked into the Quality queue'
  );
  perform pg_temp.quality_v2_assert(
    (select count(*) from public.spots where name like 'Quality V2 %')=5,
    'the read contract deleted or rewrote source history'
  );

  v_result := public.admin_spot_quality_v2(1000,0,'Quality V2','missing_description');
  perform pg_temp.quality_v2_assert(
    (v_result->>'filtered_total')::integer=jsonb_array_length(v_result->'rows'),
    'issue count and issue drill-down use different populations'
  );
end
$$;

reset role;
rollback;
