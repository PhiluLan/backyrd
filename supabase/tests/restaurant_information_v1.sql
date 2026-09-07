\set ON_ERROR_STOP on
begin;

create function pg_temp.ri_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Restaurant Information V1 failed: %',p_message; end if; end $$;
create function pg_temp.actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;

do $$
declare founder uuid:=pg_temp.ri_uuid('founder');normal_user uuid:=pg_temp.ri_uuid('normal');category_id uuid:=pg_temp.ri_uuid('restaurant-category');product_id uuid:=pg_temp.ri_uuid('product');archived_id uuid:=pg_temp.ri_uuid('archived');fixture_id uuid:=pg_temp.ri_uuid('fixture');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',founder,'authenticated','authenticated','ri-founder@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',normal_user,'authenticated','authenticated','ri-user@invalid','','{}','{}',now(),now());
 update public.profiles set is_admin=true where id=founder;
 insert into public.admin_users(user_id,role) values(founder,'super_admin');
 insert into public.categories(id,name) values(category_id,'Restaurant');
 insert into public.spots(id,name,address,lat,lng,status,city,category_id,data_origin) values
 (product_id,'Restaurant Product','Testgasse 1',47.55,7.59,'approved','Basel',category_id,'REAL'),
 (archived_id,'Restaurant Archiv','Testgasse 2',47.55,7.59,'archived','Basel',category_id,'REAL'),
 (fixture_id,'Restaurant Fixture','Testgasse 3',47.55,7.59,'approved','Basel',category_id,'FIXTURE');
 perform pg_temp.actor(founder);
 perform public.backyrd_human_spot_set_archetypes_v2(product_id,'RESTAURANT','{}');
end $$;

select pg_temp.assert(public.backyrd_restaurant_value_is_valid_v1('restaurant.takeaway','"UNKNOWN"'),'UNKNOWN tri-state was rejected');
select pg_temp.assert(not public.backyrd_restaurant_value_is_valid_v1('restaurant.cuisines','["UNKNOWN","ITALIAN"]'),'UNKNOWN was accepted beside a known cuisine');
select pg_temp.assert(public.backyrd_restaurant_value_is_valid_v1('restaurant.payment_methods','{"CASH":"AVAILABLE","TWINT":"UNKNOWN"}'),'payment tri-state map was rejected');
select pg_temp.assert(not public.backyrd_restaurant_value_is_valid_v1('restaurant.payment_methods','{"TWINT":false}'),'boolean silently replaced payment UNKNOWN');
select pg_temp.assert(public.backyrd_restaurant_url_is_valid_v1('contact.instagram','"https://instagram.com/backyrd"'),'valid Instagram URL rejected');
select pg_temp.assert(not public.backyrd_restaurant_url_is_valid_v1('contact.instagram','"http://example.com/backyrd"'),'non-official/non-HTTPS social URL accepted');
select pg_temp.assert(public.backyrd_restaurant_value_is_valid_v1('opening.special_overrides','{"overrides":[{"date":"2026-12-25","status":"CLOSED","intervals":[],"label":"Weihnachten"}]}'),'valid special-hours override rejected');

set local role authenticated;
select pg_temp.actor(pg_temp.ri_uuid('founder'));
do $$
declare result jsonb;v_spot uuid:=pg_temp.ri_uuid('product');
begin
 result:=public.backyrd_human_spot_save_section_v3(v_spot,'PURPOSE','[{"questionId":"restaurant.cuisines","value":["ITALIAN","MEDITERRANEAN"]},{"questionId":"restaurant.meal_formats","value":["A_LA_CARTE"]}]','ADMIN_VERIFIED',null,'Founder vor Ort geprüft','SPOT','restaurant-v1-purpose',null);
 perform pg_temp.assert((result->>'persisted')::integer=2,'restaurant purpose facts did not persist atomically');
 result:=public.backyrd_human_spot_save_section_v3(v_spot,'PRACTICAL','[{"questionId":"restaurant.takeaway","value":"UNKNOWN"},{"questionId":"restaurant.payment","value":{"CASH":"AVAILABLE","DEBIT_CARD":"UNKNOWN","CREDIT_CARD":"UNKNOWN","TWINT":"AVAILABLE","OTHER":"UNKNOWN"}},{"questionId":"restaurant.reservation","value":"RECOMMENDED"}]','ADMIN_VERIFIED',null,'Founder vor Ort geprüft','SPOT','restaurant-v1-practical',null);
 perform pg_temp.assert((result->>'persisted')::integer=3,'restaurant practical facts did not persist atomically');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(result->'profile'->'acceptedFacts') fact where fact->>'field_key'='restaurant.takeaway' and fact->>'status'='UNKNOWN'),'scalar UNKNOWN was stored as false/active');
end $$;

select pg_temp.assert(public.backyrd_restaurant_information_v1(pg_temp.ri_uuid('product'))#>>'{facts,restaurant.cuisines,status}'='ACTIVE','eligible Product Restaurant is absent from consumer contract');
select pg_temp.assert(public.backyrd_restaurant_information_v1(pg_temp.ri_uuid('archived')) is null,'archived Restaurant leaked into consumer contract');
select pg_temp.assert(public.backyrd_restaurant_information_v1(pg_temp.ri_uuid('fixture')) is null,'fixture Restaurant leaked into consumer contract');

select pg_temp.actor(pg_temp.ri_uuid('normal'));
do $$ begin
 begin perform public.admin_restaurant_information_coverage_v1(); raise exception 'normal user accessed Admin coverage'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.assert(public.backyrd_restaurant_information_v1(pg_temp.ri_uuid('product')) is not null,'authenticated consumer could not read eligible Restaurant display data');

reset role;
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key like 'restaurant.%'),'Restaurant display facts entered N4');
rollback;
