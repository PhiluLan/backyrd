\set ON_ERROR_STOP on
begin;

create function pg_temp.basics_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.basics_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'admin spot basics persistence failed: %',p_message; end if; end $$;
create function pg_temp.basics_actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
create function pg_temp.basics_spot(p_spot uuid) returns jsonb language sql security definer set search_path=public,pg_catalog as $$
 select to_jsonb(s) from public.spots s where id=p_spot
$$;
create function pg_temp.basics_active_value(p_spot uuid,p_key text) returns jsonb language sql security definer set search_path=public,pg_catalog as $$
 select value from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot and field_key=p_key and status='ACTIVE' order by accepted_at desc limit 1
$$;

do $$
declare founder uuid:=pg_temp.basics_uuid('basics-founder');owner_id uuid:=pg_temp.basics_uuid('basics-owner');other_owner uuid:=pg_temp.basics_uuid('basics-other-owner');spot_id uuid:=pg_temp.basics_uuid('basics-spot');category_id uuid;
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',founder,'authenticated','authenticated','basics-founder@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','basics-owner@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',other_owner,'authenticated','authenticated','basics-other@invalid','','{}','{}',now(),now());
 update public.profiles set is_admin=true where id=founder;
 insert into public.admin_users(user_id,role) values(founder,'super_admin');
 select id into category_id from public.categories order by name limit 1;
 insert into public.spots(id,name,address,city,country,lat,lng,status,category_id,data_origin,owner_id,website,phone,email)
 values(spot_id,'Basis Persistence Spot','Teststrasse 1','Basel','Switzerland',47.55,7.59,'approved',category_id,'REAL',owner_id,'https://old.invalid','old-phone','old@invalid.test');
 insert into public.backyrd_gold_authoring_owner_allowlist_v1(user_id,reason) values(owner_id,'basis persistence security test');
end $$;

set local role authenticated;
select pg_temp.basics_actor(pg_temp.basics_uuid('basics-founder'));

-- Reproduce the old failure: the direct table update is filtered by RLS and
-- reports no SQL error, but the row remains unchanged.
update public.spots set website='https://direct-write.invalid' where id=pg_temp.basics_uuid('basics-spot');
select pg_temp.basics_assert(pg_temp.basics_spot(pg_temp.basics_uuid('basics-spot'))->>'website'='https://old.invalid','test precondition changed: direct RLS update unexpectedly persisted');

do $$
declare v_spot uuid:=pg_temp.basics_uuid('basics-spot');v_request uuid:=pg_temp.basics_uuid('basics-request-1');v_result jsonb;v_before jsonb;
begin
 v_result:=public.backyrd_admin_save_spot_basics_v1(v_spot,jsonb_build_object(
   'name','Basis Persistence Spot','address','Teststrasse 1','city','Basel','country','Schweiz',
   'lat',47.55,'lng',7.59,'price_level',2,'website','https://persisted.example','phone','+41 61 555 01 02',
   'email','museum@example.test','google_photo_enabled',true,'status','approved'
 ),v_request);
 perform pg_temp.basics_assert((v_result->>'persisted')::boolean,'RPC did not confirm committed persistence');
 perform pg_temp.basics_assert(v_result#>>'{spot,website}'='https://persisted.example','returned website is stale');
 perform pg_temp.basics_assert(v_result#>>'{spot,phone}'='+41 61 555 01 02','returned phone is stale');
 perform pg_temp.basics_assert(v_result#>>'{spot,email}'='museum@example.test','returned email is stale');
 perform pg_temp.basics_assert(v_result#>>'{spot,country}'='Schweiz','returned country is stale');
 perform pg_temp.basics_assert((v_result#>>'{spot,price_level}')::integer=2,'returned price level is stale');
 perform pg_temp.basics_assert(jsonb_path_exists(v_result->'readiness'->'ready','$[*] ? (@.item == "CONTACT")'),'readiness did not consume committed contact fields');

 perform pg_temp.basics_assert(pg_temp.basics_active_value(v_spot,'contact.website')='"https://persisted.example"'::jsonb,'website accepted-fact projection diverged');
 perform pg_temp.basics_assert(pg_temp.basics_active_value(v_spot,'contact.phone')='"+41 61 555 01 02"'::jsonb,'phone accepted-fact projection diverged');
 perform pg_temp.basics_assert(pg_temp.basics_active_value(v_spot,'contact.email')='"museum@example.test"'::jsonb,'email accepted-fact projection diverged');
 perform pg_temp.basics_assert(pg_temp.basics_active_value(v_spot,'price.level')='2'::jsonb,'price accepted-fact projection diverged');

 -- Response-loss retry is idempotent and returns the same committed row.
 v_before:=pg_temp.basics_spot(v_spot);
 v_result:=public.backyrd_admin_save_spot_basics_v1(v_spot,jsonb_build_object('website','https://ignored-on-replay.invalid'),v_request);
 perform pg_temp.basics_assert((v_result->>'replayed')::boolean,'same request was not replay-safe');
 perform pg_temp.basics_assert(pg_temp.basics_spot(v_spot)->>'website'=v_before->>'website','replay mutated the committed row');

 -- Invalid input fails without changing durable state.
 begin
   perform public.backyrd_admin_save_spot_basics_v1(v_spot,jsonb_build_object('email','not-an-email'),pg_temp.basics_uuid('basics-invalid'));
   raise exception 'invalid email unexpectedly succeeded';
 exception when sqlstate '22023' then null; end;
 perform pg_temp.basics_assert(pg_temp.basics_spot(v_spot)->>'email'='museum@example.test','failed save changed the row');
end $$;

-- Owner and cross-owner callers cannot enter the Founder/Admin write boundary.
select pg_temp.basics_actor(pg_temp.basics_uuid('basics-owner'));
do $$ begin
 begin
   perform public.backyrd_admin_save_spot_basics_v1(pg_temp.basics_uuid('basics-spot'),jsonb_build_object('website','https://owner.invalid'),pg_temp.basics_uuid('basics-owner-request'));
   raise exception 'owner entered admin persistence boundary';
 exception when insufficient_privilege then perform pg_temp.basics_assert(sqlerrm='admin_or_founder_required','owner denial returned wrong boundary'); end;
end $$;
select pg_temp.basics_actor(pg_temp.basics_uuid('basics-other-owner'));
do $$ begin
 begin
   perform public.backyrd_admin_save_spot_basics_v1(pg_temp.basics_uuid('basics-spot'),jsonb_build_object('website','https://cross-owner.invalid'),pg_temp.basics_uuid('basics-cross-owner-request'));
   raise exception 'cross-owner entered admin persistence boundary';
 exception when insufficient_privilege then perform pg_temp.basics_assert(sqlerrm='spot_access_denied','cross-owner denial returned wrong boundary'); end;
end $$;

-- Clearing retracts equivalent accepted truth and survives a fresh read.
select pg_temp.basics_actor(pg_temp.basics_uuid('basics-founder'));
do $$
declare v_spot uuid:=pg_temp.basics_uuid('basics-spot');v_result jsonb;
begin
 v_result:=public.backyrd_admin_save_spot_basics_v1(v_spot,'{"website":null,"phone":null,"email":null,"country":null,"price_level":null}'::jsonb,pg_temp.basics_uuid('basics-clear'));
 perform pg_temp.basics_assert(v_result#>>'{spot,website}' is null and v_result#>>'{spot,phone}' is null and v_result#>>'{spot,email}' is null,'clear response retained contact values');
 perform pg_temp.basics_assert(pg_temp.basics_spot(v_spot)->>'website' is null and pg_temp.basics_spot(v_spot)->>'country' is null,'fresh DB read retained cleared values');
 perform pg_temp.basics_assert(pg_temp.basics_active_value(v_spot,'contact.website') is null and pg_temp.basics_active_value(v_spot,'price.level') is null,'clear retained contradictory active facts');
 perform pg_temp.basics_assert(jsonb_path_exists(v_result->'readiness'->'gaps','$[*] ? (@.item == "CONTACT")'),'readiness did not refresh after clear');
end $$;

reset role;
select pg_temp.basics_assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
select pg_temp.basics_assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
rollback;
