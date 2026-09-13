\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'slice4a legacy import failed: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$ declare state text; begin begin execute p_sql; exception when others then get stacked diagnostics state=returned_sqlstate; if state=p_state then return; end if; raise exception '% expected %, got %',p_message,p_state,state; end; raise exception '% unexpectedly succeeded',p_message; end $$;
select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000',pg_temp.id('legacy-admin'),'authenticated','authenticated','legacy-admin@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
('00000000-0000-0000-0000-000000000000',pg_temp.id('legacy-owner'),'authenticated','authenticated','legacy-owner@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
update public.profiles set is_admin=true where id=pg_temp.id('legacy-admin');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('legacy-owner')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.expect_error($q$select public.world_admin_import_legacy_batch_v1('{}')$q$,'42501','non-admin imported legacy batch');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('legacy-admin')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
create temporary table import_payload(payload jsonb);
insert into import_payload values(jsonb_build_object(
  'contractVersion','backyrd.world-knowledge.legacy-local-import@4a.1','requestId','import:sql:1','targetEnvironment','LOCAL_FOUNDER_EVALUATION','exportBatchId','export:sql:1','sourceSnapshotAt','2026-09-11T19:00:00Z','sourceManifestHash',repeat('1',64),'transformManifestHash',repeat('2',64),'mappingHash',repeat('3',64),'registryHash',repeat('4',64),
  'spots',jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('legacy-spot'),'lifecycle','ACTIVE_PUBLISHED','displayName','Legacy Test','values',jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('legacy-spot'),'sourceField','name','targetKey','identity.name','mappingStatus','MISSING_PROVENANCE','originalValueHash',repeat('5',64),'transformedValue','Legacy Test','disposition','PREFILL_REQUIRES_CONFIRMATION','reasonCode','LEGACY_VALUE_REQUIRES_ADMIN_CONFIRMATION','resultHash',repeat('6',64)))))
));
update import_payload set payload=payload||jsonb_build_object('importManifestHash',encode(extensions.digest(pg_catalog.convert_to(payload::text,'UTF8'),'sha256'),'hex'));
create temporary table import_result as select public.world_admin_import_legacy_batch_v1(payload) result from import_payload;
select pg_temp.assert((select (result->>'created')::boolean and (result->>'claimsCreated')::integer=0 from import_result),'import must stage without claiming truth');
reset role;
select pg_temp.assert((select count(*)=1 from world_knowledge_private.founder_evaluation_spots_v1 f where f.spot_id=pg_temp.id('legacy-spot') and f.catalog_origin='LEGACY_PRODUCTION_IMPORT' and not f.cohort_selected),'catalog/cohort separation failed');
select pg_temp.assert((select count(*)=0 from world_knowledge_private.claims c where c.spot_id=pg_temp.id('legacy-spot')),'prefill created a claim');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('legacy-admin')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((select (public.world_admin_import_legacy_batch_v1(payload)->>'created')::boolean=false from import_payload),'identical import did not replay');
create temporary table bad_payload(payload jsonb);
insert into bad_payload select (payload-'importManifestHash')||jsonb_build_object('requestId','import:sql:unsafe','spots',jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('legacy-unsafe'),'lifecycle','ACTIVE_PUBLISHED','values',jsonb_build_array(jsonb_build_object('spotId',pg_temp.id('legacy-unsafe'),'sourceField','suitability','targetKey','accessibility.step_free_entrance','mappingStatus','SUBJECTIVE','originalValueHash',repeat('a',64),'transformedValue',true,'disposition','PREFILL_REQUIRES_CONFIRMATION','reasonCode','LEGACY_VALUE_REQUIRES_ADMIN_CONFIRMATION','resultHash',repeat('b',64)))))) from import_payload;
update bad_payload set payload=payload||jsonb_build_object('importManifestHash',encode(extensions.digest(pg_catalog.convert_to(payload::text,'UTF8'),'sha256'),'hex'));
select pg_temp.expect_error($q$select public.world_admin_import_legacy_batch_v1(payload) from bad_payload$q$,'22023','rehashed subjective prefill');

reset role;
create temporary table confirmable as select v.id,v.batch_id from world_knowledge_private.legacy_import_values_v1 v where v.spot_id=pg_temp.id('legacy-spot');
grant select on confirmable to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('legacy-admin')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_admin_confirm_legacy_values_v1(pg_temp.id('legacy-spot'),(select batch_id from confirmable),array[(select id from confirmable)],'confirm:sql:1')->>'verificationMethod')='ADMIN_CONFIRMED','admin confirmation failed');
reset role;
select pg_temp.assert((select count(*)=1 from world_knowledge_private.claims c where c.spot_id=pg_temp.id('legacy-spot')),'confirmation did not create exactly one claim');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.verification_records v join world_knowledge_private.claims c on c.id=v.claim_id where c.spot_id=pg_temp.id('legacy-spot') and v.verification_method='ADMIN_CONFIRMED'),'verification binding missing');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('legacy-admin')::text,true); select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_founder_set_cohort_membership_v1(pg_temp.id('legacy-spot'),true)->>'selected')::boolean,'cohort selection failed');
reset role;

select pg_temp.assert(not has_table_privilege('anon','world_knowledge_private.legacy_import_values_v1','select') and not has_table_privilege('authenticated','world_knowledge_private.legacy_import_values_v1','select'),'private import provenance exposed');
select pg_temp.assert(not has_function_privilege('anon','public.world_admin_import_legacy_batch_v1(jsonb)','execute'),'anon can invoke import');
select pg_temp.assert((select count(*)=1 from public.spots where id=pg_temp.id('legacy-spot') and data_origin='TEST' and status='archived'),'imported spot escaped local isolation');
rollback;
