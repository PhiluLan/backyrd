\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception '%',message; end if;
end;
$$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','ca010000-0000-4000-8000-000000000001','authenticated','authenticated','search-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000','ca010000-0000-4000-8000-000000000002','authenticated','authenticated','search-other@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin)
values('ca010000-0000-4000-8000-000000000001',true) on conflict(id) do update set is_admin=true;
insert into public.spots(id,name,city,lat,lng,status,data_origin)
values('ca010000-0000-4000-8000-000000000003','Search freshness fixture','Basel',47.55,7.58,'approved','REAL');
select world_knowledge_private.set_product_admin_authoring_control_v1(0,'ON','SEARCH_FRESHNESS_TEST');

select pg_temp.assert(not has_function_privilege('anon','public.world_product_admin_refresh_stale_search_v1(integer)','execute'),
  'Anonymous users must not be able to refresh the catalog');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ca010000-0000-4000-8000-000000000002"}',true);
do $$
begin
  perform public.world_product_admin_refresh_stale_search_v1(1);
  raise exception 'Unprivileged repair unexpectedly succeeded';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"ca010000-0000-4000-8000-000000000001"}',true);
select pg_temp.assert((public.world_product_save_and_publish_claim_v1(
  'ca010000-0000-4000-8000-000000000003','identity.name','KNOWN_VALUE','"Search freshness fixture"',clock_timestamp(),
  p_idempotency_key=>'search-freshness-name'
)->>'manifestHash') is not null,'An editor save must publish in the same transaction');
select pg_temp.assert((public.world_product_authoring_detail_v1('ca010000-0000-4000-8000-000000000003')#>>'{manifest,manifestHash}') is not null,
  'Editor must be able to read the published manifest immediately');
select public.world_product_admin_submit_claim_v1(
  'ca010000-0000-4000-8000-000000000003','location.latitude','KNOWN_VALUE','47.55',clock_timestamp(),
  p_idempotency_key=>'search-freshness-older-save');
select pg_temp.assert((public.world_product_admin_refresh_stale_search_v1(1)->>'processedSpots')::integer=1,
  'The backlog repair must pick up a previously accepted update');
select pg_temp.assert((public.world_product_admin_refresh_stale_search_v1(1)->>'processedSpots')::integer=0,
  'A retry must skip the repaired spot');

reset role;
select pg_temp.assert(exists(
  select 1 from world_knowledge_private.current_projection_pointers p
  join world_knowledge_private.resolution_manifests m on m.id=p.manifest_id
  cross join lateral jsonb_array_elements(world_knowledge_private.product_decision_projection_v1(m.world_snapshot)->'facts') as f
  where p.spot_id='ca010000-0000-4000-8000-000000000003' and f->>'key'='location.latitude' and f->'value'='47.55'::jsonb
),'Decision must receive the accepted coordinate');
-- A simulated newer pointer forces publication to fail after claim submission.
-- The failed transaction must leave no accepted edit behind.
update world_knowledge_private.current_projection_pointers
set as_of=clock_timestamp()+interval '1 minute'
where spot_id='ca010000-0000-4000-8000-000000000003';
set local role authenticated;
do $$
begin
  perform public.world_product_save_and_publish_claim_v1(
    'ca010000-0000-4000-8000-000000000003','location.longitude','KNOWN_VALUE','7.58',clock_timestamp(),
    p_idempotency_key=>'search-freshness-must-rollback');
  raise exception 'Expected publication to reject a stale pointer';
exception when serialization_failure then null;
end $$;
reset role;
select pg_temp.assert(not exists(
  select 1 from world_knowledge_private.claims where idempotency_key='search-freshness-must-rollback'
),'A failed publication must roll back its claim');
rollback;
