\set ON_ERROR_STOP on
begin;

create function pg_temp.uuid(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'basel gold test failed: %',p_message; end if; end $$;

select pg_temp.assert((select count(*)=60 from public.backyrd_basel_gold_spots_v1 where selection_status='SELECTED'),'frozen Gold manifest contains 60 Spots');
select pg_temp.assert((public.backyrd_resolve_product_mood_v1('ruhig')->>'canonicalMood')='leise','explicit Mood alias resolves canonically');
select pg_temp.assert(not (public.backyrd_resolve_product_mood_v1('a')->>'valid')::boolean,'placeholder Mood a is rejected');
select pg_temp.assert(not (public.backyrd_resolve_product_mood_v1('test')->>'valid')::boolean,'placeholder Mood test is rejected');
select pg_temp.assert((select count(*)=7 from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key in
 ('family_kids','age_suitability','rain_suitability','activity_type','social_context_suitability','conversation_suitability','weather.rain_suitable')),'Product suitability dimensions are registered');

do $$
declare u uuid:=pg_temp.uuid('gold-user'); real_spot uuid:=pg_temp.uuid('gold-real'); fixture_spot uuid:=pg_temp.uuid('gold-fixture'); category uuid:=pg_temp.uuid('gold-category');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','gold@fixture.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.categories(id,name) values(category,'Aktivität');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin) values
  (real_spot,'Gold real',47,7,'approved','Basel',category,'REAL'),
  (fixture_spot,'Gold fixture',47.1,7.1,'approved','Basel',category,'FIXTURE');
 insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,data_origin) values
  (real_spot,'occasion.kids_friendly','INTERPRETATION','1','backyrd_derived','test:real',.9,now(),now(),'{"test":"gold"}','REAL'),
  (fixture_spot,'occasion.kids_friendly','INTERPRETATION','1','backyrd_derived','test:fixture',.9,now(),now(),'{"test":"fixture"}','FIXTURE');
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uuid('gold-user'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.uuid('gold-user')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.reviews(spot_id,user_id,mood_a,mood_b,text)
values(pg_temp.uuid('gold-real'),pg_temp.uuid('gold-user'),'ruhig','gemütlich','valid product review');
select pg_temp.assert((select data_origin='REAL' and review_origin='STANDARD_REVIEW' and mood_a='leise' and mood_b='gemütlich'
 from public.reviews where text='valid product review'),'server assigns provenance and canonical Moods');
do $$ begin
 begin
  insert into public.reviews(spot_id,user_id,mood_a,mood_b,text) values(pg_temp.uuid('gold-real'),pg_temp.uuid('gold-user'),'a','b','invalid product review');
  raise exception 'placeholder Mood accepted';
 exception when sqlstate '22023' then null; end;
end $$;
select pg_temp.assert(not public.distribution_trust_entity_is_eligible_v1('spot',pg_temp.uuid('gold-fixture'),'decision'),'Fixture Spot is isolated from Decisions');
select pg_temp.assert(
 not has_function_privilege(
  'authenticated',
  'public.backyrd_read_n4_for_user_intelligence_v1(uuid[])',
  'execute'
 ),
 'authenticated client cannot execute privileged N4 reads'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert((select available and jsonb_array_length(concepts)=1 from public.backyrd_read_n4_for_user_intelligence_v1(array[pg_temp.uuid('gold-real')])),'REAL N4 remains available');
select pg_temp.assert(not exists(select 1 from public.backyrd_read_n4_for_user_intelligence_v1(array[pg_temp.uuid('gold-fixture')])),'Fixture N4 is absent from canonical read');
select pg_temp.assert(public.distribution_trust_entity_is_eligible_v1('spot',pg_temp.uuid('gold-fixture'),'internal'),'Fixture remains auditable on internal surface');
reset role;

rollback;
