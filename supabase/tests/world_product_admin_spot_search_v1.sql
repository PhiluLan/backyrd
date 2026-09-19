\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Product Admin spot search failed: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_state(p_sql text,p_expected text) returns void language plpgsql as $$
declare v_state text;
begin
  begin execute p_sql; exception when others then
    get stacked diagnostics v_state=returned_sqlstate;
    if v_state=p_expected then return; end if;
    raise exception 'expected SQLSTATE %, got %',p_expected,v_state;
  end;
  raise exception 'expected SQLSTATE %, call succeeded',p_expected;
end $$;

select pg_temp.assert(
  has_function_privilege('authenticated','public.world_product_admin_search_spots_v1(text,integer)','execute')
  and not has_function_privilege('anon','public.world_product_admin_search_spots_v1(text,integer)','execute')
  and not has_function_privilege('service_role','public.world_product_admin_search_spots_v1(text,integer)','execute'),
  'search RPC ACL must admit authenticated Admin checks only'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000',pg_temp.id('search-admin'),'authenticated','authenticated','search-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',pg_temp.id('search-user'),'authenticated','authenticated','search-user@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('search-admin'),true),(pg_temp.id('search-user'),false)
  on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin) values
  (pg_temp.id('search-approved'),'Synthetic River Café',47.3,8.5,'approved','Zürich',null,'REAL'),
  (pg_temp.id('search-rejected'),'Synthetic River Hidden',47.3,8.5,'rejected','Zürich',null,'REAL');

select set_config('request.jwt.claim.sub',pg_temp.id('search-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('search-admin'))::text,true);
select pg_temp.assert(
  (public.world_product_admin_search_spots_v1('River',20)->'spots') @> jsonb_build_array(jsonb_build_object(
    'spotId',pg_temp.id('search-approved'),'name','Synthetic River Café','city','Zürich')),
  'approved Production catalog spot not discoverable by name'
);
select pg_temp.assert(
  jsonb_array_length(public.world_product_admin_search_spots_v1('River',20)->'spots')=1
  and jsonb_array_length(public.world_product_admin_search_spots_v1('Absent',20)->'spots')=0
  and jsonb_array_length(public.world_product_admin_search_spots_v1('%',20)->'spots')=0,
  'rejected, genuinely empty or wildcard-like search was misclassified'
);
select pg_temp.assert(
  (public.world_product_admin_search_spots_v1('River',20)->'spots'->0) ?& array['spotId','name','city'],
  'minimal catalog row missing'
);
select pg_temp.assert(
  (select count(*) from jsonb_object_keys(public.world_product_admin_search_spots_v1('River',20)->'spots'->0))=3,
  'private fields leaked into Product Admin search'
);
select pg_temp.expect_state('select public.world_product_admin_search_spots_v1(''x'',31)','22023');
select pg_temp.expect_state(format('select public.world_product_authoring_detail_v1(%L)',pg_temp.id('search-rejected')),'42501');

select set_config('request.jwt.claim.sub',pg_temp.id('search-user')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('search-user'))::text,true);
select pg_temp.expect_state('select public.world_product_admin_search_spots_v1(''River'',20)','42501');
select pg_temp.expect_state(format('select public.world_product_authoring_detail_v1(%L)',pg_temp.id('search-approved')),'42501');
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect_state('select public.world_product_admin_search_spots_v1(''River'',20)','42501');
rollback;
