\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'research current profile: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$
begin
 begin execute p_sql; exception when others then
  if position(p_message in sqlerrm)>0 then return; end if;
  raise exception 'expected %, got %',p_message,sqlerrm;
 end;
 raise exception 'expected %, succeeded',p_message;
end $$;
create function pg_temp.source(p_evidence text) returns jsonb language sql as $$
select jsonb_build_object('url','https://example.org/venue','evidence',p_evidence,'observedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'trust','OFFICIAL_PRIMARY') $$;
create function pg_temp.claim(p_key text,p_value jsonb,p_evidence text,p_prior uuid default null) returns jsonb language sql as $$
select jsonb_build_object('attributeKey',p_key,'knowledgeState','KNOWN_VALUE','value',p_value,'supersedesClaimId',p_prior,'source',pg_temp.source(p_evidence)) $$;

select pg_temp.assert(has_function_privilege('authenticated','public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb)','execute')
 and not has_function_privilege('anon','public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb)','execute')
 and not has_function_privilege('service_role','public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb)','execute'),'API execution boundary');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.research_claim_evidence_v1','select,insert,update,delete'),'private evidence permissions');
select pg_temp.assert((select relrowsecurity from pg_class where oid='world_knowledge_private.research_claim_evidence_v1'::regclass),'private evidence RLS');
select pg_temp.assert(not has_function_privilege('authenticated','world_knowledge_private.research_source_valid_v1(text,jsonb,jsonb)','execute'),'private helper grants');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000',pg_temp.id('current-admin'),'authenticated','authenticated','current-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
('00000000-0000-0000-0000-000000000000',pg_temp.id('current-owner'),'authenticated','authenticated','current-owner@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('current-admin'),true),(pg_temp.id('current-owner'),false) on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,city,lat,lng,status,data_origin,owner_id) values(pg_temp.id('current-spot'),'Current research fixture','Basel',47.55,7.58,'approved','REAL',pg_temp.id('current-owner'));
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('current-admin'))::text,true);
select world_knowledge_private.set_product_admin_authoring_control_v1(0,'ON','CURRENT_RESEARCH_TEST');
select public.world_product_admin_bootstrap_catalog_v1(null,1,'APPROVED_CATALOG_BASELINE_ONLY');
create temporary table binding as select
 public.world_product_authoring_detail_v1(pg_temp.id('current-spot'))#>>'{manifest,manifestHash}' manifest,
 (public.world_product_authoring_detail_v1(pg_temp.id('current-spot'))#>>'{answers,classification.primary_category,claimId}')::uuid category_claim;
create function pg_temp.run(p_claims jsonb,p_batch text default 'current-batch') returns jsonb language sql as $$
select public.world_product_admin_import_research_spot_v2(pg_temp.id(p_batch),pg_temp.id('current-spot'),(select manifest from binding),p_claims) $$;
create temporary table sample as select '{"contractVersion":"backyrd.world-knowledge.experience-profile@1.0","category":"EAT","reviewed":true,"properties":[],"areas":[{"id":"restaurant","kind":"DINING_AREA","name":"Restaurant","properties":[{"key":"offer.capacity","label":null,"state":"KNOWN","value":50,"conditions":{"weekdays":[],"dayparts":[],"event":null,"validFrom":null,"validUntil":null}}]}],"offers":[{"id":"drinks","kind":"DRINKS","name":"Getränke","areaIds":[],"properties":[],"prices":[],"schedule":[],"validFrom":null,"validUntil":null}]}'::jsonb profile;

-- Authorization is checked inside the RPC, independently of the visible Admin UI.
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('current-owner'))::text,true);
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"','Official website'))) $q$,'admin_required');
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"','Official website'))) $q$,'admin_required');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('current-admin'))::text,true);

-- Reject leaked secrets and unrelated addresses, including supplementary sources.
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"','tobias@example.org'))) $q$,'world_research_metadata_invalid');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.public_email','"tobias@example.org"','other@example.org'))) $q$,'world_research_metadata_invalid');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.public_email','"tobias@example.org"','Bearer leaked_secret'))) $q$,'world_research_metadata_invalid');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"','Official website')||jsonb_build_object('supportingSources',jsonb_build_array(pg_temp.source('password: secret'))))) $q$,'world_research_metadata_invalid');
select pg_temp.assert(not exists(select 1 from world_knowledge_private.claims where spot_id=pg_temp.id('current-spot') and attribute_key='contact.website'),'rejected metadata wrote a claim');

-- A current profile, its category, opening hours and public email commit atomically.
select pg_temp.run(jsonb_build_array(
 pg_temp.claim('classification.primary_category','"EAT"','Restaurant',(select category_claim from binding)),
 pg_temp.claim('classification.place_types','["RESTAURANT"]','Restaurant'),
 pg_temp.claim('experience.profile',(select profile from sample),'Restaurant 50 Plätze')||jsonb_build_object('supportingSources',jsonb_build_array(pg_temp.source('Getränke verfügbar'))),
 pg_temp.claim('hours.regular','[{"day":"MONDAY","intervals":[{"start":"12:00","end":"14:00"},{"start":"18:00","end":"23:00"}]}]','Monday 12–14 and 18–23'),
 pg_temp.claim('contact.public_email','"tobias@example.org"','Kontakt: tobias@example.org')
));
select pg_temp.assert((select registry_version='backyrd.world-knowledge.registry@2.5' from world_knowledge_private.claims where spot_id=pg_temp.id('current-spot') and attribute_key='experience.profile'),'current profile writer not used');
select pg_temp.assert((select supporting_sources#>>'{0,evidence}'='Getränke verfügbar' from world_knowledge_private.research_claim_evidence_v1 where spot_id=pg_temp.id('current-spot') and attribute_key='experience.profile'),'supporting evidence lost');
select pg_temp.assert((select count(*)=5 from world_knowledge_private.research_claim_evidence_v1 where spot_id=pg_temp.id('current-spot')),'not all provenance persisted');
select pg_temp.expect_error($q$update world_knowledge_private.research_claim_evidence_v1 set supporting_sources='[]' where spot_id=pg_temp.id('current-spot')$q$,'immutable');

-- An explicit replacement must not be mistaken for a concurrent disagreement.
create temporary table prior as select id from world_knowledge_private.claims where spot_id=pg_temp.id('current-spot') and attribute_key='experience.profile';
select world_knowledge_private.submit_authoritative_claim_v6('ADMIN',pg_temp.id('current-spot'),'experience.profile','KNOWN_VALUE',jsonb_set((select profile from sample),'{areas,0,properties,0,value}','40'),clock_timestamp(),null,null,'PUBLIC',(select id from prior),'explicit-current-replacement');
select pg_temp.assert(not exists(select 1 from world_knowledge_private.review_work_items where spot_id=pg_temp.id('current-spot') and attribute_key='experience.profile' and 'CONCURRENT_AUTHORITATIVE_CONFLICT'=any(reason_codes)),'explicit replacement produced false conflict');
-- A separate differing assertion without a replacement relationship still needs review.
select world_knowledge_private.submit_authoritative_claim_v6('ADMIN',pg_temp.id('current-spot'),'experience.profile','KNOWN_VALUE',jsonb_set((select profile from sample),'{areas,0,properties,0,value}','30'),clock_timestamp(),null,null,'PUBLIC',null,'genuine-concurrent-assertion');
select pg_temp.assert(exists(select 1 from world_knowledge_private.review_work_items where spot_id=pg_temp.id('current-spot') and attribute_key='experience.profile' and 'CONCURRENT_AUTHORITATIVE_CONFLICT'=any(reason_codes)),'genuine conflict was hidden');
select world_knowledge_private.set_product_admin_authoring_control_v1(1,'OFF','CURRENT_RESEARCH_TEST_END');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"','Official website'))) $q$,'world_product_admin_authoring_off');
rollback;
