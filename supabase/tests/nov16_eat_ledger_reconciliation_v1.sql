begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values ('5a4902a5-0649-4f65-8000-000000000001', 'authenticated', 'authenticated', 'nov16-admin@fixture.invalid', '{}', '{}');
insert into public.profiles (id, is_admin)
values ('5a4902a5-0649-4f65-8000-000000000001', true)
on conflict (id) do update set is_admin = excluded.is_admin;

-- backyrd:authorization-positive
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"5a4902a5-0649-4f65-8000-000000000001"}', true);
set local role authenticated;
do $$
begin
  if public.world_product_admin_preview_eat_defaults_v1()->>'contractVersion' is distinct from 'backyrd.world-eat-defaults@1.0' then
    raise exception 'Admin could not read the Eat defaults preview';
  end if;
end $$;

-- backyrd:authorization-negative
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"5a4902a5-0649-4f65-8000-000000000002"}', true);
do $$
begin
  begin
    perform public.world_product_admin_preview_eat_defaults_v1();
    raise exception 'Ordinary user accessed the Eat defaults preview';
  exception when insufficient_privilege then
    if sqlerrm <> 'admin_required' then raise; end if;
  end;
  begin
    perform public.world_product_admin_apply_eat_defaults_v1(null, 1);
    raise exception 'Ordinary user accessed the Eat defaults write function';
  exception when insufficient_privilege then
    if sqlerrm <> 'admin_required' then raise; end if;
  end;
end $$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.world_product_admin_preview_eat_defaults_v1()', 'EXECUTE')
    or has_function_privilege('anon', 'public.world_product_admin_apply_eat_defaults_v1(uuid,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.world_product_service_rebuild_eat_defaults_v1(uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.world_product_service_rebuild_eat_defaults_v1(uuid,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.world_product_service_rebuild_eat_defaults_v1(uuid,integer)', 'EXECUTE') then
    raise exception 'Eat defaults permissions differ from their Admin and service roles';
  end if;
end $$;
rollback;
