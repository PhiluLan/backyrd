\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world research batch: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_state(p_sql text,p_expected text) returns void language plpgsql as $$
declare v_state text;
begin
  begin execute p_sql; exception when others then
    get stacked diagnostics v_state=returned_sqlstate;
    if v_state=p_expected then return; end if;
    raise exception 'expected SQLSTATE %, got %',p_expected,v_state;
  end;
  raise exception 'expected SQLSTATE %, call succeeded',p_expected;
end $$;

select pg_temp.assert(
  has_function_privilege('authenticated','public.world_product_admin_import_research_claim_v1(uuid,uuid,text,text,jsonb,text,text,timestamptz,text,text,text)','execute')
  and not has_function_privilege('anon','public.world_product_admin_import_research_claim_v1(uuid,uuid,text,text,jsonb,text,text,timestamptz,text,text,text)','execute')
  and not has_function_privilege('service_role','public.world_product_admin_import_research_claim_v1(uuid,uuid,text,text,jsonb,text,text,timestamptz,text,text,text)','execute'),
  'RPC must be authenticated Admin-session only');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.research_claim_evidence_v1','select'),'private evidence leaked');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('00000000-0000-0000-0000-000000000000',pg_temp.id('research-admin'),'authenticated','authenticated','research-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
 ('00000000-0000-0000-0000-000000000000',pg_temp.id('research-user'),'authenticated','authenticated','research-user@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('research-admin'),true),(pg_temp.id('research-user'),false)
on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,city,lat,lng,status,data_origin)
values(pg_temp.id('nomad'),'Nomad Eatery & Bar','Basel',47.55,7.58,'approved','REAL');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('research-admin'))::text,true);
select pg_temp.assert((world_knowledge_private.set_product_admin_authoring_control_v1(0,'ON','RESEARCH_BATCH_TEST')->>'state')='ON','authoring control did not turn ON');
select public.world_product_admin_bootstrap_catalog_v1(null,1,'APPROVED_CATALOG_BASELINE_ONLY');

create temporary table research_binding as select
  (public.world_product_authoring_detail_v1(pg_temp.id('nomad'))#>>'{manifest,manifestHash}')::text manifest_hash,
  pg_temp.id('research-batch') batch_id;

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('research-user'))::text,true);
select pg_temp.expect_state(format(
  'select public.world_product_admin_import_research_claim_v1(%L,%L,''contact.website'',''KNOWN_VALUE'',''"https://nomad.ch"'',''https://nomad.ch/eatery'',''Official public website.'',clock_timestamp(),''OFFICIAL_PRIMARY'',%L,''research-denied'')',
  (select batch_id from research_binding),pg_temp.id('nomad'),(select manifest_hash from research_binding)),'42501');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('research-admin'))::text,true);
select pg_temp.assert((public.world_product_admin_import_research_claim_v1(
  (select batch_id from research_binding),pg_temp.id('nomad'),'contact.website','KNOWN_VALUE','"https://nomad.ch"',
  'https://nomad.ch/eatery','Official public website.','2026-09-26T10:00:00Z','OFFICIAL_PRIMARY',
  (select manifest_hash from research_binding),'research-nomad-website')->>'created')::boolean,
  'canonical research claim was not created');
select pg_temp.assert((select count(*) from world_knowledge_private.research_claim_evidence_v1 where spot_id=pg_temp.id('nomad'))=1,'evidence was not bound');
select pg_temp.assert((select count(*) from world_knowledge_private.claims where spot_id=pg_temp.id('nomad') and attribute_key='contact.website')=1,'canonical claim missing');
select pg_temp.assert(not (public.world_product_admin_import_research_claim_v1(
  (select batch_id from research_binding),pg_temp.id('nomad'),'contact.website','KNOWN_VALUE','"https://nomad.ch"',
  'https://nomad.ch/eatery','Official public website.','2026-09-26T10:00:00Z','OFFICIAL_PRIMARY',
  (select manifest_hash from research_binding),'research-nomad-website')->>'created')::boolean,
  'idempotent replay created another claim');
select pg_temp.expect_state(format(
  'select public.world_product_admin_import_research_claim_v1(%L,%L,''contact.phone'',''KNOWN_VALUE'',''"+41610000000"'',''https://nomad.ch/contact'',''Official contact page.'',clock_timestamp(),''OFFICIAL_PRIMARY'',%L,''research-stale'')',
  pg_temp.id('another-batch'),pg_temp.id('nomad'),repeat('f',64)),'40001');

select pg_temp.assert((world_knowledge_private.set_product_admin_authoring_control_v1(1,'OFF','RESEARCH_EMERGENCY_OFF_TEST')->>'state')='OFF','authoring control did not turn OFF');
select pg_temp.expect_state(format(
  'select public.world_product_admin_import_research_claim_v1(%L,%L,''contact.phone'',''KNOWN_VALUE'',''"+41610000000"'',''https://nomad.ch/contact'',''Official contact page.'',clock_timestamp(),''OFFICIAL_PRIMARY'',%L,''research-off'')',
  pg_temp.id('another-batch'),pg_temp.id('nomad'),(select manifest_hash from research_binding)),'42501');
rollback;
