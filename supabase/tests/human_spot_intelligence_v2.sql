\set ON_ERROR_STOP on
begin;

create function pg_temp.hsi_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Human Spot Intelligence V2 failed: %',p_message; end if; end $$;
create function pg_temp.actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;

do $$
declare founder uuid:=pg_temp.hsi_uuid('hsi-founder');owner_id uuid:=pg_temp.hsi_uuid('hsi-owner');category_id uuid:=pg_temp.hsi_uuid('hsi-category');spot_id uuid:=pg_temp.hsi_uuid('hsi-spot');fixture_id uuid:=pg_temp.hsi_uuid('hsi-offering-fixture');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',founder,'authenticated','authenticated','hsi-founder@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','hsi-owner@invalid','','{}','{}',now(),now());
 update public.profiles set is_admin=true where id=founder;
 insert into public.admin_users(user_id,role) values(founder,'super_admin');
 insert into public.categories(id,name) values(category_id,'Bar');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin,owner_id) values
 (spot_id,'HSI V2 transactional Brewpub',47.55,7.59,'approved','Basel',category_id,'REAL',owner_id),
 (fixture_id,'HSI V2 isolated Offering fixture',47.55,7.59,'approved','Basel',category_id,'TEST',owner_id);
end $$;

select pg_temp.assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
select pg_temp.assert(not exists(select 1 from public.backyrd_human_spot_questions_v2 where mapping_class not in ('CANONICAL_WRITE','DISPLAY_METADATA','PROPOSAL_ONLY','NON_CANONICAL_NOTE')),'question has unknown destination');
select pg_temp.assert(not exists(select 1 from public.backyrd_human_spot_questions_v2 q left join public.backyrd_spot_fact_catalog_v1 c on c.field_key=q.canonical_field_key where q.mapping_class='CANONICAL_WRITE' and c.field_key is null),'canonical option has no Accepted Fact destination');
select pg_temp.assert((select count(*)=1 from public.backyrd_human_spot_questions_v2 where canonical_field_key='social.suitability'),'duplicate audience questions remain');
select pg_temp.assert((select not owner_public_enabled from public.backyrd_gold_authoring_settings_v1 where singleton),'Public Owner V2 was enabled');
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key like '%subscription%' or dimension_key like '%owner%'),'commercial status entered N4');

set local role authenticated;
select pg_temp.actor(pg_temp.hsi_uuid('hsi-founder'));
do $$
declare v_spot uuid:=pg_temp.hsi_uuid('hsi-spot');result jsonb;profile jsonb;before_count bigint;after_count bigint;
begin
 profile:=public.backyrd_human_spot_set_archetypes_v2(v_spot,'BREWPUB',array['BAR','RESTAURANT']);
 perform pg_temp.assert(profile#>>'{authoring,primaryArchetype}'='BREWPUB','Brewpub authoring archetype did not persist');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(profile->'questions') q where q->>'question_id'='purpose.activities' and not (q->>'relevant')::boolean),'Brewpub still receives activity catalog');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(profile->'questions') q where q->>'question_id'='purpose.gastronomy' and (q->>'relevant')::boolean and q->'engine_use' ? 'DECISION_FACTUAL_MATCHER'),'Brewpub purpose question is missing factual Engine authority');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(profile->'questions') q where q->>'question_id'='offering.gastronomy' and (q->>'relevant')::boolean and q->>'canonical_field_key'='offering.availability'),'Brewpub canonical Offering question is missing');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(profile->'questions') q where q->>'question_id'='fit.audience' and (q->>'relevant')::boolean),'common audience question disappeared');
 perform pg_temp.assert(not public.backyrd_human_spot_validate_answer_v2(v_spot,'fit.dayparts','["MORNING","FORGED"]'),'forged canonical option accepted');
 perform pg_temp.assert(not public.backyrd_human_spot_validate_answer_v2(v_spot,'purpose.activities','["MUSEUM"]'),'hidden activity question accepted for Brewpub');
 perform pg_temp.assert(public.backyrd_human_spot_validate_answer_v2(v_spot,'offering.gastronomy','{"DRINKS":"AVAILABLE","BEER":"AVAILABLE","CRAFT_BEER":"AVAILABLE","OWN_BREWED_BEER":"AVAILABLE","FOOD":"AVAILABLE","DINNER":"AVAILABLE"}'),'whitelisted Brewpub Offering facts rejected');
 perform pg_temp.assert(public.backyrd_human_spot_validate_answer_v2(v_spot,'purpose.gastronomy','{"DRINK":"SUITABLE","EAT":"SUITABLE","AFTERWORK":"SUITABLE","APERO":"SUITABLE"}'),'whitelisted Brewpub Purpose facts rejected');
 before_count:=(select count(*) from public.backyrd_spot_accepted_facts_v1 where spot_id=v_spot);
 result:=public.backyrd_human_spot_save_section_v2(v_spot,'FIT','[{"questionId":"fit.audience","value":{"solo":"UNKNOWN","date":"SUITABLE","friends":"SUITABLE","family":"UNKNOWN","groups":"SUITABLE","work":"SUITABLE"}},{"questionId":"fit.dayparts","value":["EVENING","WEEKEND"]}]','ADMIN_VERIFIED',null,'controlled transaction','SPOT','hsi-v2-fit',null);
 after_count:=(select count(*) from public.backyrd_spot_accepted_facts_v1 where spot_id=v_spot);
 perform pg_temp.assert((result->>'persisted')::integer=2 and (result->>'accepted')::boolean,'atomic section save did not confirm both answers');
 perform pg_temp.assert(after_count-before_count=2,'section save did not write exactly two canonical facts');
 perform pg_temp.assert(result->'rebuild' is not null,'atomic section save omitted N4 rebuild');
 result:=public.backyrd_human_spot_save_section_v2(v_spot,'PURPOSE','[{"questionId":"offering.gastronomy","value":{"DRINKS":"AVAILABLE","BEER":"AVAILABLE","CRAFT_BEER":"AVAILABLE","OWN_BREWED_BEER":"AVAILABLE","FOOD":"AVAILABLE","DINNER":"AVAILABLE"}},{"questionId":"purpose.gastronomy","value":{"DRINK":"SUITABLE","EAT":"SUITABLE","AFTERWORK":"SUITABLE","APERO":"SUITABLE"}}]','ADMIN_VERIFIED',null,'controlled transaction','SPOT','hsi-v2-offering',null);
 perform pg_temp.assert((result->>'persisted')::integer=2 and (result->>'accepted')::boolean,'Offering/Purpose section did not persist atomically');
 perform pg_temp.assert(public.backyrd_human_spot_summary_v2(v_spot)->>'deterministic'='true','summary is not deterministic');
 perform pg_temp.assert((public.backyrd_human_spot_summary_v2(v_spot)->>'text') like '%Craft Beer%','truth-bound summary omitted confirmed Offering');
 perform pg_temp.assert((public.backyrd_human_spot_save_section_v2(v_spot,'FIT','[{"questionId":"fit.audience","value":{"solo":"UNKNOWN","date":"SUITABLE","friends":"SUITABLE","family":"UNKNOWN","groups":"SUITABLE","work":"SUITABLE"}},{"questionId":"fit.dayparts","value":["EVENING","WEEKEND"]}]','ADMIN_VERIFIED',null,'controlled transaction','SPOT','hsi-v2-fit',null)->>'replayed')::boolean,'idempotent retry created a second write');
end $$;

do $$ begin
 begin
  perform public.backyrd_human_spot_save_section_v2(pg_temp.hsi_uuid('hsi-spot'),'FIT','[{"questionId":"fit.dayparts","value":["FORGED"]}]','ADMIN_VERIFIED',null,'attack','SPOT','hsi-v2-attack',null);
  raise exception 'forged option was accepted';
 exception when invalid_parameter_value then null; end;
end $$;

do $$
declare v_spot uuid:=pg_temp.hsi_uuid('hsi-offering-fixture');result jsonb;
begin
 perform public.backyrd_human_spot_set_archetypes_v2(v_spot,'BREWPUB','{}');
 result:=public.backyrd_human_spot_save_section_v2(v_spot,'PURPOSE','[{"questionId":"offering.gastronomy","value":{"CRAFT_BEER":"AVAILABLE","FOOD":"AVAILABLE"}},{"questionId":"purpose.gastronomy","value":{"AFTERWORK":"SUITABLE"}}]','ADMIN_VERIFIED',null,'isolated acceptance fixture','SPOT','hsi-v2-fixture-offering',null);
 perform pg_temp.assert((result->>'persisted')::integer=2 and result#>>'{rebuild,reason}'='TEST_FIXTURE_OFFERING_OUTSIDE_N4','isolated Offering fixture did not persist without N4');
 perform pg_temp.assert((public.backyrd_human_spot_save_section_v2(v_spot,'PURPOSE','[{"questionId":"offering.gastronomy","value":{"CRAFT_BEER":"AVAILABLE","FOOD":"AVAILABLE"}},{"questionId":"purpose.gastronomy","value":{"AFTERWORK":"SUITABLE"}}]','ADMIN_VERIFIED',null,'isolated acceptance fixture','SPOT','hsi-v2-fixture-offering',null)->>'replayed')::boolean,'isolated fixture retry was not idempotent');
 perform pg_temp.assert((select count(*)=2 from public.backyrd_spot_accepted_facts_v1 where spot_id=v_spot and status='ACTIVE'),'isolated fixture created duplicate active facts');
 begin
  perform public.backyrd_human_spot_save_section_v2(v_spot,'FIT','[{"questionId":"fit.dayparts","value":["EVENING"]}]','ADMIN_VERIFIED',null,'forbidden fixture write','SPOT','hsi-v2-fixture-fit',null);
  raise exception 'non-Offering fixture authoring was accepted';
 exception when insufficient_privilege then null; end;
end $$;

reset role;
select pg_temp.assert(not exists(select 1 from public.backyrd_embedding_jobs_v1 where spot_id=pg_temp.hsi_uuid('hsi-offering-fixture')),'isolated fixture enqueued an embedding job');
select pg_temp.assert(not exists(select 1 from public.backyrd_read_offering_for_decision_v1(array[pg_temp.hsi_uuid('hsi-offering-fixture')])),'isolated fixture leaked into normal Offering read model');
select pg_temp.assert(exists(select 1 from public.backyrd_read_offering_for_decision_v1(array[pg_temp.hsi_uuid('hsi-spot')]) where offerings->>'CRAFT_BEER'='AVAILABLE' and purposes->>'AFTERWORK'='SUITABLE'),'Accepted Offering/Purpose did not reach Decision read model');
select pg_temp.assert(exists(select 1 from public.backyrd_retrieve_spots_by_offering_v1('Basel',array['CRAFT_BEER'],array['AFTERWORK'],10,'{}') where spot_id=pg_temp.hsi_uuid('hsi-spot') and 'CRAFT_BEER'=any(offering_matches) and 'AFTERWORK'=any(purpose_matches)),'canonical Offering/Purpose did not reach retrieval');
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key in ('offering.availability','purpose.occasions')),'Offering/Purpose leaked into frozen N4 dimensions');
select pg_temp.assert(not exists(select 1 from public.backyrd_user_taste_events_v2 where user_id=pg_temp.hsi_uuid('hsi-founder')),'Admin authoring contaminated User Taste');
rollback;
