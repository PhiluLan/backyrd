\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Unified spot presentation failed: %',p_message; end if; end $$;
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
  (select count(*) from world_knowledge_private.spot_detail_presentation_policy_v1 where registry_version='backyrd.world-knowledge.registry@2.1')
  = (select count(*) from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@2.1'),
  'every canonical World attribute must have presentation metadata'
);
select pg_temp.assert(
  not exists(
    select 1 from world_knowledge_private.attribute_definitions definition
    left join world_knowledge_private.spot_detail_presentation_policy_v1 policy
      on policy.registry_version=definition.registry_version and policy.attribute_key=definition.attribute_key
    where definition.registry_version='backyrd.world-knowledge.registry@2.1' and policy.attribute_key is null
  ), 'World attribute was lost from the presentation inventory'
);
select pg_temp.assert(
  has_function_privilege('authenticated','public.admin_spot_presentation_policy_v1()','execute')
  and not has_function_privilege('anon','public.admin_spot_presentation_policy_v1()','execute')
  and has_function_privilege('anon','public.spot_detail_product_profile_v1(uuid,text)','execute'),
  'RPC grants do not match Admin/private and public/read-only boundaries'
);

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000',pg_temp.id('presentation-admin'),'authenticated','authenticated','presentation-admin@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp()),
  ('00000000-0000-0000-0000-000000000000',pg_temp.id('presentation-user'),'authenticated','authenticated','presentation-user@fixture.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(id,is_admin) values(pg_temp.id('presentation-admin'),true),(pg_temp.id('presentation-user'),false)
on conflict(id) do update set is_admin=excluded.is_admin;
insert into public.spots(id,name,status,city,lat,lng,data_origin)
values(pg_temp.id('presentation-spot'),'Presentation Café','approved','Basel',47.5,7.5,'REAL');

insert into world_knowledge_private.resolution_manifests(
  id,spot_id,registry_version,policy_version,registry_release_hash,policy_release_hash,
  attribute_policy_hash,resolver_contract,resolver_version,conflict_policy_ref,
  freshness_policy_ref,shadow_policy_ref,as_of,ledger_cutoff_at,input_components,
  input_hash,resolution_hash,manifest_hash,world_snapshot,decision_projection
) select
  pg_temp.id('presentation-manifest'),pg_temp.id('presentation-spot'),
  'backyrd.world-knowledge.registry@2.1','backyrd.world-knowledge.source-policy@4b.1',
  registry.registry_hash,policy.policy_hash,pg_temp.hash('presentation-attribute-policy'),
  'test:reader','test:v1','test:conflict','test:freshness','test:shadow',
  '2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','{}'::jsonb,
  pg_temp.hash('presentation-input'),pg_temp.hash('presentation-resolution'),pg_temp.hash('presentation-manifest'),
  '{"facts":{"description.highlight":"A calm room"}}'::jsonb,
  '{"eligibility":{"open":true},"ranking":{"purpose":"COFFEE_DAYTIME"}}'::jsonb
from world_knowledge_private.registry_releases registry
join world_knowledge_private.source_policy_releases policy on policy.registry_version=registry.registry_version
where registry.registry_version='backyrd.world-knowledge.registry@2.1'
  and policy.policy_version='backyrd.world-knowledge.source-policy@4b.1';
insert into world_knowledge_private.resolution_entries(manifest_id,attribute_key,scope,resolution,value,trust,freshness,basis_claim_hashes,entry_hash)
values
  (pg_temp.id('presentation-manifest'),'identity.name','SPOT','KNOWN_VALUE','"Presentation Café"','VERIFIED','CURRENT',array[pg_temp.hash('claim-name')],pg_temp.hash('entry-name')),
  (pg_temp.id('presentation-manifest'),'description.highlight','VENUE','KNOWN_VALUE','"A calm room"','VERIFIED','CURRENT',array[pg_temp.hash('claim-highlight')],pg_temp.hash('entry-highlight')),
  (pg_temp.id('presentation-manifest'),'contact.public_email','SPOT','KNOWN_VALUE','"hello@example.org"','VERIFIED','CURRENT',array[pg_temp.hash('claim-email')],pg_temp.hash('entry-email')),
  (pg_temp.id('presentation-manifest'),'contact.instagram','SPOT','KNOWN_VALUE','"https://www.instagram.com/example/"','VERIFIED','CURRENT',array[pg_temp.hash('claim-instagram')],pg_temp.hash('entry-instagram')),
  (pg_temp.id('presentation-manifest'),'contact.facebook','SPOT','KNOWN_VALUE','"https://www.facebook.com/example/"','VERIFIED','CURRENT',array[pg_temp.hash('claim-facebook')],pg_temp.hash('entry-facebook')),
  (pg_temp.id('presentation-manifest'),'contact.tiktok','SPOT','UNKNOWN',null,'ASSERTED','CURRENT',array[]::text[],pg_temp.hash('entry-tiktok')),
  (pg_temp.id('presentation-manifest'),'location.latitude','VENUE','KNOWN_VALUE','47.5','VERIFIED','CURRENT',array[pg_temp.hash('claim-lat')],pg_temp.hash('entry-lat'));
insert into world_knowledge_private.current_projection_pointers(spot_id,manifest_id,manifest_hash,as_of,ledger_cutoff_at,registry_version,policy_version,resolver_version)
values(pg_temp.id('presentation-spot'),pg_temp.id('presentation-manifest'),pg_temp.hash('presentation-manifest'),'2026-09-22T10:00:00Z','2026-09-22T10:00:00Z','backyrd.world-knowledge.registry@2.1','backyrd.world-knowledge.source-policy@4b.1','test:v1');

select set_config('request.jwt.claim.sub',pg_temp.id('presentation-user')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('presentation-user'))::text,true);
select pg_temp.expect_state('select public.admin_spot_presentation_policy_v1()','42501');
select pg_temp.expect_state('select public.admin_update_spot_presentation_policy_v1(''description.highlight'',true,true,''HIDE'')','42501');

select set_config('request.jwt.claim.sub',pg_temp.id('presentation-admin')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id('presentation-admin'))::text,true);
select pg_temp.assert(jsonb_array_length(public.admin_spot_presentation_policy_v1()->'fields') > 0,'Admin policy inventory missing');
select pg_temp.expect_state('select public.admin_update_spot_presentation_policy_v1(''location.latitude'',true,false,''HIDE'')','42501');

create temporary table pg_temp.decision_before as
select decision_projection from world_knowledge_private.resolution_manifests where id=pg_temp.id('presentation-manifest');
select public.admin_update_spot_presentation_policy_v1('description.highlight',true,false,'HIDE');
select pg_temp.assert(
  (select decision_projection from world_knowledge_private.resolution_manifests where id=pg_temp.id('presentation-manifest'))
  = (select decision_projection from pg_temp.decision_before),
  'presentation toggle changed the sealed Decision projection'
);
select pg_temp.assert(
  jsonb_array_length(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'fields')=4
  and jsonb_array_length(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'WEB')->'fields')=3,
  'surface visibility did not control the canonical public projection'
);
select pg_temp.assert(
  (public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'fields') @> '[{"attributeKey":"contact.public_email"},{"attributeKey":"contact.instagram"},{"attributeKey":"contact.facebook"}]'::jsonb
  and not ((public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'fields') @> '[{"attributeKey":"contact.tiktok"}]'::jsonb),
  'known public contacts missing or unknown TikTok exposed'
);
select pg_temp.assert(
  not ((public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'fields') @> '[{"attributeKey":"location.latitude"}]'::jsonb),
  'non-public coordinate escaped through product profile'
);
select pg_temp.assert(
  (select count(*) from world_knowledge_private.spot_detail_presentation_audit_v1 where actor_id=pg_temp.id('presentation-admin'))=1,
  'Admin presentation change was not audited'
);
select pg_temp.expect_state(format('select public.spot_detail_product_profile_v1(%L,''OTHER'')',pg_temp.id('presentation-spot')),'22023');


-- Additive registries must keep the same public inventory as legacy spots.
select pg_temp.assert(not exists (
 select 1 from world_knowledge_private.attribute_definitions d
 left join world_knowledge_private.spot_detail_presentation_policy_v1 p
 on p.registry_version=d.registry_version and p.attribute_key=d.attribute_key
 where d.registry_version in ('backyrd.world-knowledge.registry@2.2','backyrd.world-knowledge.registry@2.3','backyrd.world-knowledge.registry@2.4','backyrd.world-knowledge.registry@2.5') and p.attribute_key is null
), 'additive registry presentation inventory incomplete');
insert into world_knowledge_private.resolution_manifests
select (jsonb_populate_record(null::world_knowledge_private.resolution_manifests,
 to_jsonb(m)||jsonb_build_object('id',pg_temp.id('presentation-v25'),'registry_version','backyrd.world-knowledge.registry@2.5','policy_version','backyrd.world-knowledge.source-policy@4f.1',
 'registry_release_hash',(select registry_hash from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@2.5'),
 'policy_release_hash',(select policy_hash from world_knowledge_private.source_policy_releases where policy_version='backyrd.world-knowledge.source-policy@4f.1'),
 'manifest_hash',pg_temp.hash('presentation-v25')))).*
from world_knowledge_private.resolution_manifests m where m.id=pg_temp.id('presentation-manifest');
insert into world_knowledge_private.resolution_entries
select (jsonb_populate_record(null::world_knowledge_private.resolution_entries,to_jsonb(e)||jsonb_build_object('manifest_id',pg_temp.id('presentation-v25')))).*
from world_knowledge_private.resolution_entries e where e.manifest_id=pg_temp.id('presentation-manifest');
update world_knowledge_private.current_projection_pointers set manifest_id=pg_temp.id('presentation-v25'),manifest_hash=pg_temp.hash('presentation-v25'),registry_version='backyrd.world-knowledge.registry@2.5',policy_version='backyrd.world-knowledge.source-policy@4f.1' where spot_id=pg_temp.id('presentation-spot');
insert into world_knowledge_private.resolution_entries(manifest_id,attribute_key,scope,resolution,value,trust,freshness,basis_claim_hashes,entry_hash)
values
(pg_temp.id('presentation-v25'),'experience.profile','SPOT','KNOWN_VALUE','{"contractVersion":"backyrd.world-knowledge.experience-profile@1.0","reviewed":true,"offers":[{"id":"dinner","name":"Abendessen"}],"areas":[],"properties":[]}', 'VERIFIED','CURRENT',array[pg_temp.hash('profile-claim')],pg_temp.hash('profile-entry')),
(pg_temp.id('presentation-v25'),'discovery.profile','SPOT','KNOWN_VALUE','{"reviewed":true,"description":"Public confirmed description"}', 'VERIFIED','CURRENT',array[pg_temp.hash('discovery-claim')],pg_temp.hash('discovery-entry'));
set local role anon;
select pg_temp.assert(
 jsonb_array_length(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'WEB')->'fields')>0
 and public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'WEB')->'experienceProfile'->'offers'->0->>'name'='Abendessen'
 and public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->>'publicDescription'='Public confirmed description',
 'new registry loses public fields or scoped profiles');
select pg_temp.assert(not exists(select 1 from jsonb_array_elements(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'WEB')->'fields') f where f->>'attributeKey' in ('experience.profile','discovery.profile','description.discovery_source')), 'raw profile escaped into legacy fields');
select pg_temp.expect_state('select * from world_knowledge_private.spot_detail_presentation_policy_v1','42501');
reset role;
update world_knowledge_private.spot_detail_presentation_policy_v1 set web_visible=false where registry_version='backyrd.world-knowledge.registry@2.5' and attribute_key='experience.profile';
select pg_temp.assert(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'WEB')->'experienceProfile'='null'::jsonb and public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'experienceProfile'<>'null'::jsonb,'surface policy ignored');
-- Immutable manifests/entries: each negative fixture is a new sealed snapshot.
create function pg_temp.profile_variant(p_variant text,p_reviewed boolean,p_freshness text,p_trust text) returns void language plpgsql as $$
begin
 insert into world_knowledge_private.resolution_manifests
 select (jsonb_populate_record(null::world_knowledge_private.resolution_manifests,to_jsonb(m)||jsonb_build_object('id',pg_temp.id(p_variant),'manifest_hash',pg_temp.hash(p_variant),'input_hash',pg_temp.hash(p_variant||'-input')))).*
 from world_knowledge_private.resolution_manifests m where m.id=pg_temp.id('presentation-v25');
 insert into world_knowledge_private.resolution_entries
 select (jsonb_populate_record(null::world_knowledge_private.resolution_entries,to_jsonb(e)||jsonb_build_object('manifest_id',pg_temp.id(p_variant))||case when e.attribute_key='experience.profile' then jsonb_build_object('value',jsonb_set(e.value,'{reviewed}',to_jsonb(p_reviewed)),'freshness',p_freshness,'trust',p_trust) else '{}'::jsonb end)).*
 from world_knowledge_private.resolution_entries e where e.manifest_id=pg_temp.id('presentation-v25');
 update world_knowledge_private.current_projection_pointers set manifest_id=pg_temp.id(p_variant),manifest_hash=pg_temp.hash(p_variant) where spot_id=pg_temp.id('presentation-spot');
end $$;
select pg_temp.profile_variant('unreviewed',false,'CURRENT','VERIFIED');
select pg_temp.assert(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'experienceProfile'='null'::jsonb,'unreviewed profile exposed');
select pg_temp.profile_variant('stale',true,'STALE','VERIFIED');
select pg_temp.assert(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'experienceProfile'='null'::jsonb,'stale profile exposed');
select pg_temp.profile_variant('asserted',true,'CURRENT','ASSERTED');
select pg_temp.assert(public.spot_detail_product_profile_v1(pg_temp.id('presentation-spot'),'MOBILE')->'experienceProfile'='null'::jsonb,'unverified profile exposed');
update public.spots set status='pending' where id=pg_temp.id('presentation-spot');
select pg_temp.expect_state(format('select public.spot_detail_product_profile_v1(%L,''WEB'')',pg_temp.id('presentation-spot')),'P0002');

rollback;
