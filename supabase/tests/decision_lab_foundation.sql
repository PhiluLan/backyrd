begin;

do $$
declare
  v_exposed boolean;
begin
  select exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'decision_lab'
      and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ) into v_exposed;
  if v_exposed then raise exception 'Decision Lab latent tables are exposed to Product roles'; end if;

  if has_schema_privilege('anon', 'decision_lab', 'usage')
     or has_schema_privilege('authenticated', 'decision_lab', 'usage')
     or has_schema_privilege('service_role', 'decision_lab', 'usage') then
    raise exception 'Decision Lab schema is accessible to a Product role';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and (column_name like 'latent\_%' escape '\' or column_name like 'true\_%' escape '\' or column_name = 'expected_utility')
  ) then
    raise exception 'Latent truth leaked into public Product tables';
  end if;

  if not exists (select 1 from pg_namespace where nspname = 'decision_lab') then
    raise exception 'Decision Lab schema missing';
  end if;
end
$$;

set local role authenticated;
do $$
begin
  begin
    perform * from decision_lab.latent_users limit 1;
    raise exception 'authenticated unexpectedly read latent user truth';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from decision_lab.latent_spots limit 1;
    raise exception 'authenticated unexpectedly read latent Spot truth';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from decision_lab.ground_truth_utilities limit 1;
    raise exception 'authenticated unexpectedly read ground-truth utility';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
