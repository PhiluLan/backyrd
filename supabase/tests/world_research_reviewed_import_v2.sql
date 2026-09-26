\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'research v2: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text,p_message text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(p_message in sqlerrm)>0 then return; end if;
    raise exception 'expected %, got %',p_message,sqlerrm;
  end;
  raise exception 'expected %, call succeeded',p_message;
end $$;
create function pg_temp.claim(p_key text,p_value jsonb,p_prior uuid default null) returns jsonb language sql as $$
select jsonb_build_object('attributeKey',p_key,'knowledgeState','KNOWN_VALUE','value',p_value,'supersedesClaimId',p_prior,
  'source',jsonb_build_object('url','https://example.org/venue','evidence','Public fixture evidence.','observedAt','2026-09-26T10:00:00Z','trust','OFFICIAL_PRIMARY')) $$;

select pg_temp.assert(has_function_privilege('authenticated','public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb)','execute')
  and not has_function_privilege('anon','public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb)','execute')
  and not has_function_privilege('service_role','public.world_product_admin_import_research_spot_v2(uuid,uuid,text,jsonb)','execute'),'RPC grants');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.research_claim_evidence_v1','select,insert,update,delete'),'private provenance grants');
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000',pg_temp.id('review-admin'),'authenticated','authenticated','review-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
('00000000-0000-0000-0000-000000000000',pg_temp.id('review-user'),'authenticated','authenticated','review-user@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('review-admin'),true),(pg_temp.id('review-user'),false) on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,city,lat,lng,status,data_origin) values(pg_temp.id('review-spot'),'Research transaction fixture','Basel',47.55,7.58,'approved','REAL');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('review-admin'))::text,true);
select world_knowledge_private.set_product_admin_authoring_control_v1(0,'ON','RESEARCH_REVIEW_TEST');
select public.world_product_admin_bootstrap_catalog_v1(null,1,'APPROVED_CATALOG_BASELINE_ONLY');
create temporary table binding as select
  public.world_product_authoring_detail_v1(pg_temp.id('review-spot'))#>>'{manifest,manifestHash}' manifest,
  (public.world_product_authoring_detail_v1(pg_temp.id('review-spot'))#>>'{answers,classification.primary_category,claimId}')::uuid category_claim;
create function pg_temp.run(p_claims jsonb,p_batch text default 'review-batch') returns jsonb language sql as $$
select public.world_product_admin_import_research_spot_v2(pg_temp.id(p_batch),pg_temp.id('review-spot'),(select manifest from binding),p_claims) $$;

-- Unconfirmed UNKNOWN is protected; a failed dependent field rolls everything back.
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('classification.primary_category','"EAT"'))) $q$,'world_research_existing_value_conflict');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"'),pg_temp.claim('classification.place_types','["RESTAURANT"]'))) $q$,'category_required_before_place_types');
select pg_temp.assert(not exists(select 1 from world_knowledge_private.claims where spot_id=pg_temp.id('review-spot') and attribute_key='contact.website'),'partial batch leaked a write');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('classification.primary_category','"EAT"',pg_temp.id('wrong-claim')))) $q$,'world_research_existing_value_conflict');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('review-user'))::text,true);
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"'))) $q$,'admin_required');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('review-admin'))::text,true);

create temporary table payload as select jsonb_build_array(
  pg_temp.claim('classification.place_types','["RESTAURANT","BAR"]'),
  pg_temp.claim('hours.regular','[{"day":"SUNDAY","intervals":[{"start":"07:00","end":"23:00"}]}]'),
  pg_temp.claim('hours.kitchen','[{"day":"SUNDAY","intervals":[{"start":"11:30","end":"14:00"},{"start":"18:00","end":"22:00"}]}]'),
  pg_temp.claim('location.timezone','"Europe/Zurich"'),
  pg_temp.claim('classification.primary_category','"EAT"',(select category_claim from binding))) claims;
select pg_temp.assert(jsonb_array_length(pg_temp.run((select claims from payload))->'claims')=5,'reviewed import failed');
select pg_temp.assert((select count(*) from world_knowledge_private.research_claim_evidence_v1 where spot_id=pg_temp.id('review-spot'))=5,'source evidence missing');
select pg_temp.assert((select count(*) from world_knowledge_private.claims where spot_id=pg_temp.id('review-spot') and attribute_key='classification.primary_category')=2,'historical UNKNOWN was deleted');
select pg_temp.assert((select supersedes_claim_id from world_knowledge_private.claims where spot_id=pg_temp.id('review-spot') and attribute_key='classification.primary_category' and knowledge_state='KNOWN_VALUE')=(select category_claim from binding),'supersession missing');
select pg_temp.assert(not exists(select 1 from jsonb_array_elements(pg_temp.run((select claims from payload))->'claims') where (value->>'created')::boolean),'replay duplicated claims');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('location.timezone','"Europe/London"'))) $q$,'world_research_idempotency_conflict');
select pg_temp.expect_error($q$select public.world_product_admin_import_research_spot_v2(pg_temp.id('drift'),pg_temp.id('review-spot'),repeat('f',64),jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"'))) $q$,'world_research_manifest_drift');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(jsonb_set(pg_temp.claim('contact.website','"https://example.org"'),'{source,url}','"https://user:pass@example.org"'))) $q$,'world_research_metadata_invalid');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('state.current','{"kind":"CLOSED","scope":"SPOT"}'))) $q$,'world_research_metadata_invalid');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"'),pg_temp.claim('contact.website','"https://other.example.org"'))) $q$,'world_research_batch_invalid');

-- Canonical rebuild/read after the write, using the same service boundary as API.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.world_product_rebuild_spot_v1(pg_temp.id('review-admin'),pg_temp.id('review-spot'),clock_timestamp(),'review-import-rebuild');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('review-admin'))::text,true);
select pg_temp.assert(public.world_product_authoring_detail_v1(pg_temp.id('review-spot'))#>>'{answers,classification.primary_category,value}'='EAT','category not visible after rebuild');
select pg_temp.assert(public.world_product_authoring_detail_v1(pg_temp.id('review-spot'))#>>'{answers,hours.regular,value,0,intervals,0,start}'='07:00','hours not visible');
select world_knowledge_private.set_product_admin_authoring_control_v1(1,'OFF','RESEARCH_REVIEW_OFF');
select pg_temp.expect_error($q$select pg_temp.run(jsonb_build_array(pg_temp.claim('contact.website','"https://example.org"'))) $q$,'world_product_admin_authoring_off');
rollback;
