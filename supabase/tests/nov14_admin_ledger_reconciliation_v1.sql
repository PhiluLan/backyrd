begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('8a2b063d-3016-4410-8000-000000000001', 'authenticated', 'authenticated', 'nov14-admin@fixture.invalid', '{}', '{}');
insert into public.profiles (id, is_admin)
values ('8a2b063d-3016-4410-8000-000000000001', true)
on conflict (id) do update set is_admin = excluded.is_admin;

-- backyrd:authorization-positive
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"8a2b063d-3016-4410-8000-000000000001"}', true);
set local role authenticated;
do $$
begin
  if jsonb_typeof(public.world_product_admin_missing_coordinates_v1(1,0)->'rows') is distinct from 'array'
    or jsonb_typeof(public.world_product_admin_missing_opening_hours_v1(1,0)->'rows') is distinct from 'array'
    or jsonb_typeof(public.world_product_admin_missing_contact_phone_v1(1,0)->'rows') is distinct from 'array' then
    raise exception 'Admin queues must return a bounded page';
  end if;
end $$;

-- backyrd:authorization-negative
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"8a2b063d-3016-4410-8000-000000000002"}', true);
do $$
declare invocation text;
begin
  foreach invocation in array array[
    'world_product_admin_missing_coordinates_v1(1,0)',
    'world_product_admin_missing_opening_hours_v1(1,0)',
    'world_product_admin_missing_contact_phone_v1(1,0)',
    'world_product_admin_apply_google_location_v1(null,null,null,null,null,null,null,null,null)',
    'world_product_admin_apply_google_opening_hours_v1(null,null,null,null,null)',
    'world_product_admin_apply_google_contact_phone_v1(null,null,null,null,null,null,null,null)',
    'world_product_admin_apply_official_contact_phone_v1(null,null,null,null,null,null,null,null)'
  ] loop
    begin
      execute 'select public.' || invocation;
      raise exception 'Unprivileged user reached Admin RPC %', invocation;
    exception when insufficient_privilege then
      if sqlerrm <> 'admin_required' then raise; end if;
    end;
  end loop;
end $$;
reset role;

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('world_product_admin_missing_coordinates_v1','world_product_admin_apply_google_location_v1',
      'world_product_admin_missing_opening_hours_v1','world_product_admin_apply_google_opening_hours_v1',
      'world_product_admin_missing_contact_phone_v1','world_product_admin_apply_google_contact_phone_v1',
      'world_product_admin_apply_official_contact_phone_v1')
    and has_function_privilege('anon', oid, 'EXECUTE')) then
    raise exception 'Anonymous client has access to an Admin RPC';
  end if;
end $$;
rollback;
