\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world knowledge registry2 failed: %',p_message; end if; end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$
declare actual_state text; begin begin execute p_sql; exception when others then get stacked diagnostics actual_state=returned_sqlstate; if actual_state=p_state then return; end if; raise exception '% (expected %, received %)',p_message,p_state,actual_state; end; raise exception '% (unexpected success)',p_message; end$$;

select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
select pg_temp.assert((select registry_hash='e93a7399c41535f7da2987c46343fbe82d1e3c07bca345b076d604f8d39f5a72' from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@2.0'),'registry release missing');
select pg_temp.assert((select count(*)=2 from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@2.0' and attribute_key in ('hours.kitchen_special','rule.age_access_conditions')),'new definitions missing');
select pg_temp.assert((select registry_hash='e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be' from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@1.1'),'historical registry changed');

select pg_temp.assert(world_knowledge_private.attribute_value_valid_v2('backyrd.world-knowledge.registry@2.0','rule.age_access_conditions','KNOWN_VALUE','{"rules":[{"mode":"UNACCOMPANIED_MINIMUM","minimumAge":16,"accompaniment":"LEGAL_GUARDIAN","appliesFromTime":"22:00","days":["FRIDAY","SATURDAY"],"area":"Bar","event":null}],"notes":null}'),'valid age rules rejected');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v2('backyrd.world-knowledge.registry@2.0','rule.age_access_conditions','KNOWN_VALUE','{"rules":[{"mode":"UNACCOMPANIED_MINIMUM","minimumAge":16,"accompaniment":"NONE","appliesFromTime":"22:00","days":[],"area":null,"event":null}],"notes":null}'),'invalid accompaniment accepted');
select pg_temp.assert(world_knowledge_private.attribute_value_valid_v2('backyrd.world-knowledge.registry@2.0','hours.kitchen_special','KNOWN_VALUE','[{"date":"2026-12-31","status":"OPEN","intervals":[{"start":"18:00","end":"02:00"}]}]'),'special kitchen hours rejected');
select pg_temp.assert(world_knowledge_private.category_place_types_allowed_v1('ACTIVITIES_PLAY','["ESCAPE_ROOM","BOWLING_ALLEY"]'),'activity place types rejected');
select pg_temp.assert(not world_knowledge_private.category_place_types_allowed_v1('ACTIVITIES_PLAY','["RESTAURANT"]'),'gastronomy leaked into activity category');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.id('wk4a-r2-admin'),'authenticated','authenticated','wk4a-r2-admin@test.invalid','','{}','{"is_admin":true}',clock_timestamp(),clock_timestamp());
update public.profiles set is_admin=true where id=pg_temp.id('wk4a-r2-admin');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4a-r2-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table r2_spot as select (public.world_founder_create_spot_v1('Registry Two Spot',null,'r2-create')->>'spotId')::uuid id;
select pg_temp.assert((select c.registry_version='backyrd.world-knowledge.registry@2.0' and c.policy_version='backyrd.world-knowledge.source-policy@4a.2' from world_knowledge_private.claims c join r2_spot s on s.id=c.spot_id where c.attribute_key='identity.name'),'create did not bind current releases');
select pg_temp.assert((public.world_admin_submit_claim_v1((select id from r2_spot),'rule.age_access_conditions','KNOWN_VALUE','{"rules":[{"mode":"GENERAL_MINIMUM","minimumAge":18,"accompaniment":"NONE","appliesFromTime":"22:00","days":["FRIDAY"],"area":"Bar","event":null}],"notes":null}',clock_timestamp(),null,null,'PUBLIC',null,'r2-age')->>'verificationMethod')='ADMIN_CONFIRMED','current age write failed');
select pg_temp.assert((public.world_authoring_set_section_review_v1((select id from r2_spot),'classification','REVIEWED','r2-review')->>'created')::boolean,'section review event failed');
select pg_temp.assert(public.world_authoring_get_section_reviews_v1((select id from r2_spot))#>'{reviewedSections}'='["classification"]'::jsonb,'section review was not restored');
select pg_temp.assert((public.world_authoring_set_section_review_v1((select id from r2_spot),'classification','REVIEWED','r2-review')->>'created')::boolean=false,'section review replay not idempotent');
select pg_temp.assert((public.world_authoring_set_section_review_v1((select id from r2_spot),'classification','REOPENED','r2-reopen')->>'created')::boolean,'section reopen failed');
select pg_temp.assert(public.world_authoring_get_section_reviews_v1((select id from r2_spot))#>'{reviewedSections}'='[]'::jsonb,'reopened section remained reviewed');
select pg_temp.expect_error(format('select public.world_admin_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',(select id from r2_spot),'rule.age_access_conditions','KNOWN_VALUE','{"rules":[{"mode":"GENERAL_MINIMUM","minimumAge":null,"accompaniment":"NONE","appliesFromTime":null,"days":[],"area":null,"event":null}],"notes":null}','PUBLIC','r2-invalid-age'),'22023','invalid rehashed age value accepted');
reset role;

select pg_temp.assert(not has_function_privilege('anon','public.world_admin_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'anon gained claim submit');
select pg_temp.assert(not has_function_privilege('authenticated','public.world_shadow_rebuild_spot_v1(uuid,timestamptz,text,text)','execute'),'client gained rebuild');
select pg_temp.assert((select relrowsecurity and relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_knowledge_private' and c.relname='authoring_section_review_events_v1'),'section review ledger lacks forced RLS');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.authoring_section_review_events_v1','select,insert,update,delete'),'section review ledger exposed directly');

rollback;
