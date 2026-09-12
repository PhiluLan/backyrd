\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world knowledge product readiness failed: %',p_message; end if; end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$
begin begin execute p_sql; exception when sqlstate '22023' then return; end; raise exception '%',p_message; end$$;

select pg_temp.assert(world_knowledge_private.category_place_types_allowed_v1('EAT','["RESTAURANT","PUB"]'), 'food-led Pub was rejected');
select pg_temp.assert(world_knowledge_private.category_place_types_allowed_v1('DRINKS','["BAR","PUB"]'), 'drinks place types were rejected');
select pg_temp.assert(not world_knowledge_private.category_place_types_allowed_v1('ACTIVITIES_PLAY','["RESTAURANT"]'), 'gastronomic type crossed into activities');
select pg_temp.assert(not world_knowledge_private.category_place_types_allowed_v1('OTHER','["PUB"]'), 'NOT_CONFIGURED category invented a mapping');

select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.id('wk-readiness-admin'),'authenticated','authenticated','wk-readiness-admin@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
update public.profiles set is_admin=true where id=pg_temp.id('wk-readiness-admin');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-readiness-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table wk_readiness_spot as
  select (public.world_founder_create_spot_v1('Taxonomy Matrix Spot',null,'readiness-spot')->>'spotId')::uuid id;
select public.world_admin_submit_claim_v1((select id from wk_readiness_spot),'classification.primary_category','KNOWN_VALUE','"ACTIVITIES_PLAY"',clock_timestamp(),null,null,'PUBLIC',null,'readiness-category');
select pg_temp.expect_error(
  format('select public.world_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',(select id from wk_readiness_spot),'classification.place_types','KNOWN_VALUE','["RESTAURANT"]','PUBLIC','readiness-invalid-place'),
  'category/place-type mismatch reached the ledger'
);
select public.world_authoring_submit_taxonomy_candidate_v1(
  (select id from wk_readiness_spot),'classification.place_types','ACTIVITIES_PLAY','["ARCADE"]',
  'backyrd.world-knowledge.authoring-taxonomy@4a.2','readiness-activity-candidate'
);
select pg_temp.expect_error(
  format('select public.world_authoring_submit_taxonomy_candidate_v1(%L,%L,%L,%L::jsonb,%L,%L)',(select id from wk_readiness_spot),'classification.place_types','ACTIVITIES_PLAY','["RESTAURANT"]','backyrd.world-knowledge.authoring-taxonomy@4a.2','readiness-invalid-candidate'),
  'gastronomic candidate crossed into activities'
);
reset role;
select pg_temp.assert((select count(*)=1 from world_knowledge_private.claims where spot_id=(select id from wk_readiness_spot)), 'failed place type left a partial claim or verification');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.authoring_taxonomy_candidates_v1 where spot_id=(select id from wk_readiness_spot)), 'valid non-canonical choice was not preserved as one review-only candidate');
select pg_temp.assert((select candidate_value='["ARCADE"]'::jsonb from world_knowledge_private.authoring_taxonomy_candidates_v1 where spot_id=(select id from wk_readiness_spot)), 'candidate value changed');

select pg_temp.assert(not has_function_privilege('anon','world_knowledge_private.category_place_types_allowed_v1(text,jsonb)','execute'), 'anon can call private taxonomy validator');
select pg_temp.assert(not has_function_privilege('authenticated','world_knowledge_private.category_place_types_allowed_v1(text,jsonb)','execute'), 'authenticated can call private taxonomy validator');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.authoring_taxonomy_candidates_v1','select'), 'authenticated can read private taxonomy candidates directly');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.authoring_taxonomy_candidates_v1','insert'), 'authenticated can write private taxonomy candidates directly');
select pg_temp.assert(not has_function_privilege('anon','public.world_authoring_submit_taxonomy_candidate_v1(uuid,text,text,jsonb,text,text)','execute'), 'anon can submit taxonomy candidates');

rollback;
