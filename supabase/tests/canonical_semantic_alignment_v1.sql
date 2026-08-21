\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'canonical alignment failed: %',p_message;end if;end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid$$;

select pg_temp.assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
select pg_temp.assert((select count(*)=14 from public.backyrd_category_place_type_v1),'14 live categories are not covered');
select pg_temp.assert(not exists(select 1 from public.backyrd_category_place_type_v1 where place_type='other'),'known categories silently fell back to other');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_read_n4_for_decision_v2(uuid[])','execute'),'client can read privileged Decision N4');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_self_declared_taste_v1','insert'),'client can forge self-declared source rows');

do $$declare u uuid:=pg_temp.id('semantic-user');c uuid:=pg_temp.id('semantic-category');s uuid:=pg_temp.id('semantic-spot');src uuid;begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','semantic@test.invalid','','{}','{}',now(),now());
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active) values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true) on conflict do nothing;
 insert into public.user_consents(user_id,purpose_key,status,granted_at,source) values(u,'personalized_recommendations','granted',now(),'system_migration');
 insert into public.categories(id,name) values(c,'Aktivität');
 -- Existing real spots may retain LEGACY identity provenance. Canonical REAL
 -- evidence must remain readable without treating legacy evidence as N4.
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin) values(s,'Semantic Spot',47,7,'approved','Basel',c,'LEGACY');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin) values
 (pg_temp.id('semantic-spot-2'),'Semantic Spot 2',47.01,7.01,'approved','Basel',c,'REAL'),
 (pg_temp.id('semantic-spot-3'),'Semantic Spot 3',47.02,7.02,'approved','Basel',c,'REAL');
 insert into public.backyrd_basel_gold_spots_v1(spot_id,coverage_bucket,selection_reason) values(s,'SEMANTIC_TEST','transaction-local conformance fixture');
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_reference,title,retrieved_at,last_checked_at,legal_use_status,created_by_type) values(s,'ADMIN_VERIFIED','admin:test','Verified',now(),now(),'NOT_REQUIRED','ADMIN') returning id into src;
 insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,status,confidence_policy_result,accepted_by,semantic_contract_version) values
 (s,'suitability.family_kids','"SUITABLE"',src,'ACTIVE',.9,u,'backyrd-canonical-semantics-v1'),
 (s,'suitability.age','{"min_age":3,"max_age":8,"adult_supervision_required":true}',src,'ACTIVE',.9,u,'backyrd-canonical-semantics-v1'),
 (s,'suitability.environment','"INDOOR"',src,'ACTIVE',.9,u,'backyrd-canonical-semantics-v1'),
 (s,'suitability.rain','"SUITABLE"',src,'ACTIVE',.9,u,'backyrd-canonical-semantics-v1');
 perform set_config('request.jwt.claim.role','service_role',true);
 perform public.backyrd_rebuild_gold_n4_snapshot_v1(s);
 perform pg_temp.assert((select suitability_facts ?& array['suitability.family_kids','suitability.age','suitability.environment','suitability.rain'] from public.backyrd_read_n4_for_decision_v2(array[s])),'accepted facts did not reach Decision N4 serialization');
end$$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('semantic-user'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('semantic-user')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.backyrd_set_self_declared_taste_v1('vibe.cozy',true,'PROFILE')->>'evidenceAuthority')='SELF_DECLARED','self-declared evidence authority missing');
select pg_temp.assert((select state='ACTIVE' and semantic_contract_version='backyrd-canonical-semantics-v1' from public.backyrd_self_declared_taste_v1 where user_id=pg_temp.id('semantic-user') and concept_key='vibe.cozy'),'self-declared evidence not versioned');
select pg_temp.assert((public.backyrd_set_self_declared_taste_v1('vibe.cozy',false,'PROFILE')->>'state')='REMOVED','self-declared correction path failed');
select pg_temp.assert((public.complete_decision_onboarding_v2('Basel',array[pg_temp.id('semantic-spot'),pg_temp.id('semantic-spot-2'),pg_temp.id('semantic-spot-3')])->>'selectedCount')::integer=3,'canonical onboarding failed');
select pg_temp.assert(not exists(select 1 from public.decision_sessions where user_id=pg_temp.id('semantic-user')),'canonical onboarding invoked legacy synthetic Decision/Taste inference');
do $$begin begin perform public.backyrd_set_self_declared_taste_v1('not.a.concept',true,'PROFILE');raise exception 'invalid concept accepted';exception when sqlstate '22023' then null;end;end$$;
reset role;
rollback;
