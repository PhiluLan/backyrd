\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.category_id(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.category_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Admin category filter: %',p_message;end if;end$$;
create function pg_temp.category_actor(p_id uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(p_id::text,''),true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_id,'role','authenticated')::text,true);
end$$;
create function pg_temp.category_denied() returns void language plpgsql as $$
begin
 begin perform public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',1000,0,'CategoryFilterFixture ');
 exception when insufficient_privilege then return;end;
 raise exception 'Admin list admitted a non-Admin caller';
end$$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',pg_temp.category_id('category-filter-admin'),'authenticated','authenticated','category-filter-admin@fixture.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',pg_temp.category_id('category-filter-user'),'authenticated','authenticated','category-filter-user@fixture.invalid','','{}','{}',now(),now());
insert into public.profiles(id,is_admin) values(pg_temp.category_id('category-filter-admin'),true),(pg_temp.category_id('category-filter-user'),false)
 on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,city,lat,lng,status,data_origin)
 select pg_temp.category_id('category-filter-spot-'||i),'CategoryFilterFixture '||lpad(i::text,2,'0'),'Basel',47.55,7.58,'approved','REAL' from generate_series(1,32)i;
insert into public.spots(id,name,city,lat,lng,status,data_origin) values
 (pg_temp.category_id('category-tie-1'),'CategoryTieFixture','Basel',47.55,7.58,'approved','REAL'),
 (pg_temp.category_id('category-tie-2'),'CategoryTieFixture','Basel',47.55,7.58,'approved','REAL');
select pg_temp.category_actor(pg_temp.category_id('category-filter-admin'));
-- Seed through the existing validated canonical writer. No stubbed permissions,
-- bypassed triggers, guessed legacy categories or modified production fixtures.
do $$declare i integer;
begin
 for i in 1..31 loop
  perform world_knowledge_private.submit_authoritative_claim_v6('ADMIN',pg_temp.category_id('category-filter-spot-'||i),
   'classification.primary_category','KNOWN_VALUE',to_jsonb(case when i<=26 then 'EAT'::text else 'STAY'::text end),
   clock_timestamp(),null,null,'PUBLIC',null,'category-filter-seed-'||i);
 end loop;
 perform world_knowledge_private.submit_authoritative_claim_v6('ADMIN',pg_temp.category_id('category-filter-spot-1'),
  'classification.primary_category','UNKNOWN',null,clock_timestamp(),null,null,'PUBLIC',null,'category-filter-unknown');
 perform world_knowledge_private.submit_authoritative_claim_v6('ADMIN',pg_temp.category_id('category-filter-spot-2'),
  'classification.primary_category','KNOWN_VALUE','"STAY"',clock_timestamp(),null,null,'INTERNAL',null,'category-filter-internal');
end$$;
select pg_temp.category_assert(
 has_function_privilege('authenticated','public.admin_spots_intelligence_v1(timestamptz,timestamptz,integer,integer,text)','execute')
 and not has_function_privilege('anon','public.admin_spots_intelligence_v1(timestamptz,timestamptz,integer,integer,text)','execute'),
 'existing list execution grants changed');
set local role authenticated;
-- An actual authenticated Admin can read the complete catalogue and later pages.
do $$declare data jsonb;later jsonb;
begin
 data:=public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',1000,0,'CategoryFilterFixture ');
 perform pg_temp.category_assert(data->>'categorySource'='WORLD_AUTHORING_CURRENT_V1','category response marker missing');
 perform pg_temp.category_assert((data->'summary'->>'spots')::integer=32 and jsonb_array_length(data->'spots')=32,'whole catalogue missing');
 perform pg_temp.category_assert((select count(*) from jsonb_array_elements(data->'spots')s where s->>'primary_category'='EAT')=24,'wrong EAT count');
 perform pg_temp.category_assert((select count(*) from jsonb_array_elements(data->'spots')s where s->>'primary_category'='STAY')=5,'wrong STAY count');
 perform pg_temp.category_assert((select count(*) from jsonb_array_elements(data->'spots')s where s->'primary_category'='null'::jsonb)=3,'unknown/private successor revived an older category or missing was guessed');
 later:=public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',7,25,'CategoryFilterFixture ');
 perform pg_temp.category_assert(jsonb_array_length(later->'spots')=7 and not exists(select 1 from jsonb_array_elements(later->'spots')s where not(s?'primary_category')),'later page lacks category metadata');
 perform pg_temp.category_assert(not exists(select 1 from jsonb_array_elements(data->'spots')s where s?'claimId' or s?'actorId' or s?'value'),'private claim metadata leaked');
 perform pg_temp.category_assert(
  (public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',1,0,'CategoryTieFixture')->'spots'->0->>'spot_id')
  < (public.admin_spots_intelligence_v1('2026-10-01','2026-11-01',1,1,'CategoryTieFixture')->'spots'->0->>'spot_id'),
  'equal names and metrics need a deterministic ID tie-breaker across backend pages');
end$$;
-- Ordinary authenticated and missing-identity callers remain denied.
select pg_temp.category_actor(pg_temp.category_id('category-filter-user'));
select pg_temp.category_denied();
select pg_temp.category_actor(null);
select pg_temp.category_denied();
reset role;
rollback;
