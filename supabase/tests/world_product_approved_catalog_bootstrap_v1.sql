\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'catalog baseline test: %',p_message; end if; end $$;
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
  has_function_privilege('authenticated','public.world_product_admin_bootstrap_catalog_v1(uuid,integer,text)','execute')
  and not has_function_privilege('anon','public.world_product_admin_bootstrap_catalog_v1(uuid,integer,text)','execute')
  and not has_function_privilege('service_role','public.world_product_admin_bootstrap_catalog_v1(uuid,integer,text)','execute')
  and not has_function_privilege('anon','public.world_product_admin_catalog_coverage_v1()','execute'),
  'bootstrap ACL must be Admin-session-only'
);
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000',pg_temp.id('catalog-admin'),'authenticated','authenticated','catalog-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('catalog-admin'),true)
  on conflict(id) do update set is_admin=true;
insert into public.spots(id,name,city,lat,lng,status,data_origin) values
  (pg_temp.id('catalog-1'),'Catalog One','Basel',47.55,7.58,'approved','REAL'),
  (pg_temp.id('catalog-2'),'Catalog Two',null,47.55,7.58,'approved','REAL'),
  (pg_temp.id('catalog-3'),'Catalog Three','Basel',47.55,7.58,'approved','REAL'),
  (pg_temp.id('catalog-pending'),'Not Approved','Basel',47.55,7.58,'pending','REAL');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('catalog-admin'))::text,true);
select pg_temp.expect_state('select public.world_product_admin_bootstrap_catalog_v1(null,1,''APPROVED_CATALOG_BASELINE_ONLY'')','42501');
select pg_temp.assert((public.world_product_admin_catalog_coverage_v1()->>'approved')::integer=3,'approved coverage incorrect');
select pg_temp.assert((public.world_product_admin_catalog_coverage_v1()->>'missingCity')::integer=1,'missing city must remain visible');
select pg_temp.expect_state('select public.world_product_admin_bootstrap_catalog_v1(null,11,''APPROVED_CATALOG_BASELINE_ONLY'')','22023');
select pg_temp.expect_state('select public.world_product_admin_bootstrap_catalog_v1(null,1,''INVALID'')','22023');

select pg_temp.assert((world_knowledge_private.set_product_admin_authoring_control_v1(0,'ON','CATALOG_BASELINE_TEST')->>'state')='ON','World control ON failed');
select pg_temp.assert((public.world_product_admin_submit_claim_v1(
  pg_temp.id('catalog-3'),'identity.name','KNOWN_VALUE','"Reviewed Name"',clock_timestamp(),
  null,null,'PUBLIC',null,'preexisting-reviewed-name')->>'created')::boolean,
  'preexisting reviewed claim failed');

-- A client can resume from the returned keyset cursor. An identical pass must
-- produce neither replacement claims nor fresh snapshots.
create temporary table catalog_progress (cursor uuid, processed integer, complete boolean);
do $$
declare v_cursor uuid; v_batch jsonb; v_runs integer:=0;
begin
  loop
    v_batch:=public.world_product_admin_bootstrap_catalog_v1(v_cursor,1,'APPROVED_CATALOG_BASELINE_ONLY');
    v_runs:=v_runs+1;
    insert into catalog_progress values((v_batch->>'nextCursor')::uuid,(v_batch->>'processed')::integer,(v_batch->>'complete')::boolean);
    exit when (v_batch->>'complete')::boolean;
    v_cursor:=(v_batch->>'nextCursor')::uuid;
    if v_runs>10 then raise exception 'catalog cursor did not terminate'; end if;
  end loop;
end $$;
select pg_temp.assert((select sum(processed) from catalog_progress)=3,'not every approved spot was visited');
select pg_temp.assert((public.world_product_admin_catalog_coverage_v1()->>'withClaims')::integer=3,'not every approved spot has claims');
select pg_temp.assert((public.world_product_admin_catalog_coverage_v1()->>'withSnapshots')::integer=3,'not every approved spot has a snapshot');
select pg_temp.assert((select count(*) from world_knowledge_private.claims c where c.spot_id=pg_temp.id('catalog-pending'))=0,'pending spot received claims');
select pg_temp.assert((select count(*) from world_knowledge_private.claims c where c.spot_id=pg_temp.id('catalog-3') and c.attribute_key='identity.name')=1,'reviewed name was overwritten');
select pg_temp.assert((public.world_product_authoring_detail_v1(pg_temp.id('catalog-3'))#>>'{answers,identity.name,value}')='Reviewed Name','reviewed name was not preserved');
select pg_temp.assert((public.world_product_authoring_detail_v1(pg_temp.id('catalog-2'))#>>'{answers,location.locality,knowledgeState}')='UNKNOWN','missing city was fabricated');
select pg_temp.assert((public.world_product_authoring_detail_v1(pg_temp.id('catalog-1'))#>>'{answers,purpose.primary_visit,knowledgeState}')='UNKNOWN','visit purpose was fabricated');
select pg_temp.assert((public.world_product_authoring_detail_v1(pg_temp.id('catalog-1'))#>>'{answers,classification.primary_category,knowledgeState}')='UNKNOWN','category was fabricated');

create temporary table catalog_before as select
  (select count(*) from world_knowledge_private.claims c where c.spot_id in (pg_temp.id('catalog-1'),pg_temp.id('catalog-2'),pg_temp.id('catalog-3'))) claim_count,
  (select count(*) from world_knowledge_private.rebuild_jobs j where j.spot_id in (pg_temp.id('catalog-1'),pg_temp.id('catalog-2'),pg_temp.id('catalog-3'))) rebuild_count;
select pg_temp.assert((public.world_product_admin_bootstrap_catalog_v1(null,10,'APPROVED_CATALOG_BASELINE_ONLY')->>'claimsCreated')::integer=0,'replay created duplicate claims');
select pg_temp.assert((select claim_count from catalog_before)=(select count(*) from world_knowledge_private.claims c where c.spot_id in (pg_temp.id('catalog-1'),pg_temp.id('catalog-2'),pg_temp.id('catalog-3'))),'replay changed claim ledger');
select pg_temp.assert((select rebuild_count from catalog_before)=(select count(*) from world_knowledge_private.rebuild_jobs j where j.spot_id in (pg_temp.id('catalog-1'),pg_temp.id('catalog-2'),pg_temp.id('catalog-3'))),'replay rebuilt unchanged spots');

select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('catalog-not-admin'))::text,true);
select pg_temp.expect_state('select public.world_product_admin_catalog_coverage_v1()','42501');
select pg_temp.expect_state('select public.world_product_admin_bootstrap_catalog_v1(null,1,''APPROVED_CATALOG_BASELINE_ONLY'')','42501');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('catalog-admin'))::text,true);
select pg_temp.assert((world_knowledge_private.set_product_admin_authoring_control_v1(1,'OFF','CATALOG_EMERGENCY_OFF_TEST')->>'state')='OFF','World emergency OFF failed');
select pg_temp.expect_state('select public.world_product_admin_bootstrap_catalog_v1(null,1,''APPROVED_CATALOG_BASELINE_ONLY'')','42501');
rollback;
