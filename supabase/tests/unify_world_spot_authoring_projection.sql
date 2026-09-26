\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Unified World spot projection failed: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.hash(p text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(p,'UTF8'),'sha256'),'hex')
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
  has_function_privilege('anon','public.spot_detail_product_profile_v1(uuid,text)','execute')
  and has_function_privilege('authenticated','public.spot_detail_product_profile_v1(uuid,text)','execute'),
  'public Spot detail reader grants changed'
);

insert into public.spots(id,name,address,city,country,lat,lng,status,data_origin)
values(pg_temp.id('unified-spot'),'Stale name','Stale address','Stale city','Stale country',1,2,'approved','REAL');

select pg_temp.assert(
  public.spot_detail_product_profile_v1(pg_temp.id('unified-spot'),'MOBILE')->'spot'->>'source'='LEGACY_COMPATIBILITY',
  'a spot without a World manifest must declare its compatibility source'
);

insert into world_knowledge_private.resolution_manifests(
  id,spot_id,registry_version,policy_version,registry_release_hash,policy_release_hash,
  attribute_policy_hash,resolver_contract,resolver_version,conflict_policy_ref,
  freshness_policy_ref,shadow_policy_ref,as_of,ledger_cutoff_at,input_components,
  input_hash,resolution_hash,manifest_hash,world_snapshot,decision_projection
) select
  pg_temp.id('unified-manifest'),pg_temp.id('unified-spot'),
  'backyrd.world-knowledge.registry@2.1','backyrd.world-knowledge.source-policy@4b.1',
  registry.registry_hash,policy.policy_hash,pg_temp.hash('unified-attribute-policy'),
  'test:reader','test:v1','test:conflict','test:freshness','test:shadow',
  '2026-09-23T05:00:00Z','2026-09-23T05:00:00Z','{}'::jsonb,
  pg_temp.hash('unified-input'),pg_temp.hash('unified-resolution'),pg_temp.hash('unified-manifest'),
  '{}'::jsonb,'{}'::jsonb
from world_knowledge_private.registry_releases registry
join world_knowledge_private.source_policy_releases policy
  on policy.registry_version=registry.registry_version
where registry.registry_version='backyrd.world-knowledge.registry@2.1'
  and policy.policy_version='backyrd.world-knowledge.source-policy@4b.1';

insert into world_knowledge_private.resolution_entries(
  manifest_id,attribute_key,scope,resolution,value,trust,freshness,basis_claim_hashes,entry_hash
) values
  (pg_temp.id('unified-manifest'),'identity.name','SPOT','KNOWN_VALUE','"Volta Bräu"','VERIFIED','CURRENT',array[pg_temp.hash('name-claim')],pg_temp.hash('name-entry')),
  (pg_temp.id('unified-manifest'),'location.address_line1','SPOT','KNOWN_VALUE','"Voltastrasse 30"','VERIFIED','CURRENT',array[pg_temp.hash('address-claim')],pg_temp.hash('address-entry')),
  (pg_temp.id('unified-manifest'),'location.locality','SPOT','KNOWN_VALUE','"Basel"','VERIFIED','CURRENT',array[pg_temp.hash('city-claim')],pg_temp.hash('city-entry')),
  (pg_temp.id('unified-manifest'),'location.country_code','SPOT','KNOWN_VALUE','"CH"','VERIFIED','CURRENT',array[pg_temp.hash('country-claim')],pg_temp.hash('country-entry')),
  (pg_temp.id('unified-manifest'),'location.latitude','SPOT','KNOWN_VALUE','47.57103','VERIFIED','CURRENT',array[pg_temp.hash('lat-claim')],pg_temp.hash('lat-entry')),
  (pg_temp.id('unified-manifest'),'location.longitude','SPOT','KNOWN_VALUE','7.57845','VERIFIED','CURRENT',array[pg_temp.hash('lng-claim')],pg_temp.hash('lng-entry')),
  (pg_temp.id('unified-manifest'),'hours.regular','SPOT','KNOWN_VALUE','[{"day":"MONDAY","intervals":[{"start":"17:00","end":"23:00"}]},{"day":"SUNDAY","intervals":[{"start":"10:00","end":"18:00"}]}]','VERIFIED','CURRENT',array[pg_temp.hash('hours-claim')],pg_temp.hash('hours-entry'));
insert into world_knowledge_private.current_projection_pointers(
  spot_id,manifest_id,manifest_hash,as_of,ledger_cutoff_at,registry_version,policy_version,resolver_version
) values(
  pg_temp.id('unified-spot'),pg_temp.id('unified-manifest'),pg_temp.hash('unified-manifest'),
  '2026-09-23T05:00:00Z','2026-09-23T05:00:00Z','backyrd.world-knowledge.registry@2.1',
  'backyrd.world-knowledge.source-policy@4b.1','test:v1'
);

select pg_temp.assert(
  public.spot_detail_product_profile_v1(pg_temp.id('unified-spot'),'MOBILE')->'spot'
    @> '{"name":"Volta Bräu","addressLine1":"Voltastrasse 30","locality":"Basel","countryCode":"CH","source":"WORLD_KNOWLEDGE"}'::jsonb,
  'Mobile did not receive canonical World identity and location'
);
select pg_temp.assert(
  jsonb_array_length(public.spot_detail_product_profile_v1(pg_temp.id('unified-spot'),'MOBILE')->'spot'->'regularHours')=2,
  'Mobile did not receive canonical World opening hours'
);
select pg_temp.assert(
  public.spot_detail_product_profile_v1(pg_temp.id('unified-spot'),'WEB')->'spot'
    = public.spot_detail_product_profile_v1(pg_temp.id('unified-spot'),'MOBILE')->'spot',
  'Mobile and Browser do not share one canonical Spot source'
);
select pg_temp.assert(
  (select name='Stale name' and address='Stale address' from public.spots where id=pg_temp.id('unified-spot')),
  'reader migration mutated legacy catalog data'
);
select pg_temp.expect_state(
  format('select public.spot_detail_product_profile_v1(%L,''OTHER'')',pg_temp.id('unified-spot')),
  '22023'
);

rollback;
