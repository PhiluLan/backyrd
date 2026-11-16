begin;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000','96dfdfda-6aa4-4558-8000-000000000001','authenticated','authenticated','page-admin@fixture.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000','96dfdfda-6aa4-4558-8000-000000000002','authenticated','authenticated','page-viewer@fixture.invalid','','{}','{}',now(),now());
insert into public.profiles(id,is_admin) values('96dfdfda-6aa4-4558-8000-000000000001',true) on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
values ('optional_product_analytics','Optionale Produktanalyse','Synthetische Fixture für den Aufrufbericht.',
 'analytics','consent',true,false,false,100,true) on conflict (key) do nothing;
insert into public.user_consents(user_id,purpose_key,status,granted_at,source)
values('96dfdfda-6aa4-4558-8000-000000000002','optional_product_analytics','granted',now(),'system_migration');

select set_config('request.jwt.claims','{"role":"authenticated","sub":"96dfdfda-6aa4-4558-8000-000000000002"}',true);
set local role authenticated;
select public.analytics_track_event_v1('screen_view', p_screen_name=>'web:/spots/:id', p_platform=>'web');
select public.analytics_track_event_v1('screen_view', p_screen_name=>'web:/spots/:id', p_platform=>'web');
select public.analytics_track_event_v1('screen_view', p_screen_name=>'wohin', p_platform=>'ios');
select public.analytics_track_event_v1('screen_view', p_screen_name=>'profile/private-sample');
select public.analytics_track_event_v1('spot_opened', p_screen_name=>'wohin');

-- backyrd:authorization-negative
do $$
begin
  begin
    perform public.admin_analytics_pageviews_v1(now()-interval '1 second',now()+interval '1 second');
    raise exception 'ordinary user can read Analytics';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- backyrd:authorization-positive
select set_config('request.jwt.claims','{"role":"authenticated","sub":"96dfdfda-6aa4-4558-8000-000000000001"}',true);
set local role authenticated;
do $$
declare report jsonb;
begin
  if public.analytics_track_event_v1('screen_view', p_screen_name=>'web:/booking', p_platform=>'web') is not null then
    raise exception 'Web view persisted without Analytics consent';
  end if;
  report := public.admin_analytics_pageviews_v1(now()-interval '1 second',now()+interval '1 second');
  if report->'kpis' <> '{"screen_views":4,"viewers":1}'::jsonb
    or not (report->'pages' @> '[{"screen_name":"web:/spots/:id","views":2,"users":1},{"screen_name":"wohin","views":1,"users":1}]'::jsonb)
    or report::text like '%private-sample%' then
    raise exception 'Analytics screen grouping or privacy contract mismatch';
  end if;
  begin
    perform public.admin_analytics_pageviews_v1(now()-interval '371 days',now());
    raise exception 'overlong range accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

do $$
begin
  if has_function_privilege('anon','public.admin_analytics_pageviews_v1(timestamptz,timestamptz)','execute') then
    raise exception 'anon can execute the Analytics report';
  end if;
end $$;

rollback;
