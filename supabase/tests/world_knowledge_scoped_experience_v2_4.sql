\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$ begin if p_ok is not true then raise exception 'scoped knowledge failed: %',p_message;end if;end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$ select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$ declare code text;begin begin execute p_sql;exception when others then get stacked diagnostics code=returned_sqlstate;if code=p_state then return;end if;raise exception '%: received %',p_message,code;end;raise exception '%: unexpected success',p_message;end $$;
select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
create temporary table experience_fixture(value jsonb);
insert into experience_fixture values ('{"contractVersion":"backyrd.world-knowledge.experience-profile@1.0","category":"RESTAURANT","properties":[],"areas":[{"id":"terrace","kind":"TERRACE","name":"Terrasse","properties":[{"key":"location.waterbody","label":null,"state":"KNOWN","value":"Rhein","conditions":{"weekdays":[],"dayparts":[],"event":null,"validFrom":null,"validUntil":null}}]}],"offers":[{"id":"lunch","kind":"LUNCH","name":"Mittagessen","areaIds":["terrace"],"properties":[],"prices":[{"label":"Menü","currency":"CHF","min":19,"max":25,"basis":"PER_PERSON","minimumAge":null,"maximumAge":null,"mandatoryFeesIncluded":true,"includes":"Hauptgericht","conditions":{"weekdays":[],"dayparts":[],"event":null,"validFrom":null,"validUntil":null}}],"schedule":[],"validFrom":null,"validUntil":null}],"reviewed":true}'::jsonb);
select pg_temp.assert(world_knowledge_private.experience_profile_valid_v1((select value from experience_fixture)),'valid profile rejected');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{reviewed}','false')),'unreviewed accepted');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{offers,0,areaIds}','["missing"]')),'dangling area accepted');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{offers,0,prices,0,min}','99')),'inverted price accepted');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{offers,0,prices,0,min}','1.001')),'fractional cents accepted');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{areas,0,properties,0,key}','"unexpected.key"')),'unknown property accepted');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{offers,0,validFrom}','"2026-02-30"')),'invalid date accepted');
select pg_temp.assert(not world_knowledge_private.experience_profile_valid_v1(jsonb_set((select value from experience_fixture),'{offers,0,validFrom}','"2027-01-01"')||jsonb_build_object('invalidExtra',1)),'extra top field accepted');
select pg_temp.assert(world_knowledge_private.attribute_value_valid_v6('backyrd.world-knowledge.registry@2.4','experience.profile','UNKNOWN','null'),'explicit unknown lost');
select pg_temp.assert((select registry_hash='c3016e37bc0bb178c390a01a55cf69fa8d8f748593e1a794d2b2f9d84e513cc3' from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@2.3'),'historical registry changed');
do $$ declare actor text;begin
 foreach actor in array array['experience-owner','experience-admin','experience-stranger'] loop
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',pg_temp.id(actor),'authenticated','authenticated',actor||'@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
  insert into public.profiles(id,is_admin) values(pg_temp.id(actor),actor='experience-admin') on conflict(id) do update set is_admin=excluded.is_admin;
 end loop;
 insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin) values(pg_temp.id('experience-restaurant'),'Synthetic scoped restaurant',47.1,8.1,'approved','Basel',pg_temp.id('experience-owner'),'TEST');
end $$;
grant select on experience_fixture to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('experience-owner')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('experience-restaurant'),'experience.profile','KNOWN_VALUE',(select value from experience_fixture),clock_timestamp(),null,null,'PUBLIC',null,'experience-owner-write')->>'verificationMethod')='OWNER_CONFIRMED','owner write denied');
select pg_temp.assert(public.world_product_authoring_detail_v1(pg_temp.id('experience-restaurant'))#>'{answers,experience.profile,value}'=(select value from experience_fixture),'owner saved value did not round-trip');
select set_config('request.jwt.claim.sub',pg_temp.id('experience-stranger')::text,true);
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('experience-restaurant'),'experience.profile','KNOWN_VALUE',(select value::text from experience_fixture),'PUBLIC','experience-foreign-write'),'42501','foreign owner write accepted');
select pg_temp.expect_error(format('select public.world_product_authoring_detail_v1(%L)',pg_temp.id('experience-restaurant')),'42501','foreign detail accepted');
select set_config('request.jwt.claim.sub',pg_temp.id('experience-admin')::text,true);
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('experience-restaurant'),'identity.name','KNOWN_VALUE','"Synthetic scoped restaurant"',clock_timestamp(),null,null,'PUBLIC',null,'experience-admin-name')->>'verificationMethod')='ADMIN_CONFIRMED','admin write denied');
reset role;
set local role service_role;
create temporary table experience_manifest as select public.world_shadow_rebuild_spot_v1(pg_temp.id('experience-restaurant'),clock_timestamp()+interval '1 second','FULL','experience-rebuild') payload;
reset role;
select pg_temp.assert((select payload#>>'{worldSnapshot,registryVersion}'='backyrd.world-knowledge.registry@2.4' from experience_manifest),'new registry missing from snapshot');
select pg_temp.assert((select (world_knowledge_private.product_decision_projection_v1(payload->'worldSnapshot')->'facts') @> '[{"key":"experience.profile","hardConstraintAuthorized":true}]' from experience_manifest),'scoped knowledge missing from decision projection');
select pg_temp.assert((select (world_knowledge_private.validate_resolution_manifest_v1((payload->>'manifestId')::uuid)->>'manifestHash')=payload->>'manifestHash' from experience_manifest),'manifest binding invalid');
select pg_temp.assert(not has_function_privilege('anon','public.world_product_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'anonymous write granted');
select pg_temp.assert(not has_function_privilege('authenticated','world_knowledge_private.submit_authoritative_claim_v5(text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'private writer exposed');
select pg_temp.assert(not has_function_privilege('authenticated','world_knowledge_private.experience_profile_valid_v1(jsonb)','execute'),'private validator exposed');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.claims','SELECT,INSERT,UPDATE,DELETE'),'private ledger exposed');
select pg_temp.assert((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_knowledge_private' and c.relname='claims'),'RLS lost');
select pg_temp.assert(world_knowledge_private.text_requires_shadow_v1('experience.profile',jsonb_set((select value from experience_fixture),'{areas,0,name}','"illegal content"')),'moderation bypass');
rollback;
