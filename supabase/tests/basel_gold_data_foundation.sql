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
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 dimension registry remains unchanged');

do $$
declare u uuid:=pg_temp.uuid('gold-user');u_invalid uuid:=pg_temp.uuid('gold-user-invalid'); real_spot uuid:=pg_temp.uuid('gold-real'); fixture_spot uuid:=pg_temp.uuid('gold-fixture'); category uuid:=pg_temp.uuid('gold-category');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values
  ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','gold@fixture.invalid','','{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000',u_invalid,'authenticated','authenticated','gold-invalid@fixture.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u),(u_invalid) on conflict do nothing;
 insert into public.categories(id,name) values(category,'Aktivität');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin) values
  (real_spot,'Gold real',47,7,'approved','Basel',category,'REAL'),
  (fixture_spot,'Gold fixture',47.1,7.1,'approved','Basel',category,'FIXTURE');
 insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance,data_origin) values
  (real_spot,'occasion.kids_friendly','INTERPRETATION','1','backyrd_derived','test:real',.9,now(),now(),'{"test":"gold"}','REAL'),
  (fixture_spot,'occasion.kids_friendly','INTERPRETATION','1','backyrd_derived','test:fixture',.9,now(),now(),'{"test":"fixture"}','FIXTURE');
 insert into public.backyrd_spot_suitability_facts_v1(
  spot_id,dimension_key,value,confidence,source_origin,source_table,source_record
 ) values
  (real_spot,'family_kids','{"suitable":true}',.9,'LEGACY','test_fixture','family'),
  (real_spot,'age_suitability','{"minAge":4}',.9,'LEGACY','test_fixture','age'),
  (real_spot,'environment','"INDOOR"',.9,'LEGACY','test_fixture','environment'),
  (real_spot,'rain_suitability','{"suitable":true}',.9,'LEGACY','test_fixture','rain'),
  (real_spot,'activity_type','["museum"]',.9,'LEGACY','test_fixture','activity'),
  (real_spot,'conversation_suitability','{"level":"HIGH"}',.9,'LEGACY','test_fixture','conversation'),
  (real_spot,'social_context_suitability','["family"]',.9,'LEGACY','test_fixture','social');
 perform pg_temp.assert(
  (select count(*)=7 from public.backyrd_spot_suitability_facts_v1 where spot_id=real_spot),
  'all Product suitability dimensions are structurally representable outside the frozen N4 registry'
 );
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uuid('gold-user'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.uuid('gold-user')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into public.reviews(spot_id,user_id,mood_a,mood_b,text)
values(pg_temp.uuid('gold-real'),pg_temp.uuid('gold-user'),'ruhig','gemütlich','valid product review');
select pg_temp.assert((select data_origin='REAL' and review_origin='STANDARD_REVIEW' and mood_a='ruhig' and mood_b='gemütlich'
 from public.reviews where text='valid product review'),'server assigns provenance and preserves raw Mood expressions');
reset role;
select pg_temp.assert((select concept_key='mood.quiet' and resolution_status='RESOLVED'
 from public.backyrd_review_mood_expressions_v1 e join public.reviews r on r.id=e.review_id
 where r.text='valid product review' and e.slot=1),'raw Mood expression resolves through the canonical layer');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uuid('gold-user-invalid'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.uuid('gold-user-invalid')::text,true);
insert into public.reviews(spot_id,user_id,mood_a,mood_b,text)
values(pg_temp.uuid('gold-real'),pg_temp.uuid('gold-user-invalid'),'a','b','invalid product review');
reset role;
select pg_temp.assert((select count(*)=2 and bool_and(resolution_status='INVALID')
 from public.backyrd_review_mood_expressions_v1 e join public.reviews r on r.id=e.review_id
 where r.text='invalid product review'),'invalid Mood evidence is preserved and excluded');
select pg_temp.assert(not exists(
 select 1 from public.backyrd_spot_mood_contributions_v1 c join public.reviews r on r.id=c.source_review_id
 where r.text='invalid product review'
),'invalid Mood evidence cannot create a community contribution');
set local role authenticated;
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
