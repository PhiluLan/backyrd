\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'knowledge expansion failed: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$
declare code text; begin begin execute p_sql; exception when others then get stacked diagnostics code=returned_sqlstate; if code=p_state then return; end if; raise exception '%: received %',p_message,code; end; raise exception '%: unexpected success',p_message; end $$;
select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
create temporary table knowledge_price as select '[{"purposes":["DRINK","SNACK"],"allOfferingsCovered":true,"basis":"PER_PERSON","currency":"CHF","min":8.50,"max":12.50,"minimumAge":null,"maximumAge":null,"mandatoryFeesIncluded":true,"conditions":{"dayparts":[],"days":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}}]'::jsonb value;
select pg_temp.assert(world_knowledge_private.attribute_value_valid_v4('backyrd.world-knowledge.registry@2.2','operation.price_options','KNOWN_VALUE',(select value from knowledge_price)),'valid combo price rejected');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v4('backyrd.world-knowledge.registry@2.2','operation.price_options','KNOWN_VALUE',jsonb_set((select value from knowledge_price),'{0,max}','12.501')),'fractional cents accepted');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v4('backyrd.world-knowledge.registry@2.2','operation.price_options','KNOWN_VALUE',jsonb_set((select value from knowledge_price),'{0,purposes}','["UNKNOWN"]')),'unknown purpose accepted');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v4('backyrd.world-knowledge.registry@2.2','operation.price_options','KNOWN_VALUE',jsonb_set((select value from knowledge_price),'{0,minimumAge}','18.5')),'fractional age accepted');
select pg_temp.assert(world_knowledge_private.attribute_value_valid_v4('backyrd.world-knowledge.registry@2.2','offering.food_specialities','KNOWN_VALUE','["CAKE"]'),'CAKE missing in new SQL enum');
select pg_temp.assert(not world_knowledge_private.attribute_value_valid_v3('backyrd.world-knowledge.registry@2.1','offering.food_specialities','KNOWN_VALUE','["CAKE"]'),'historical enum was expanded');
select pg_temp.assert((select registry_hash='cc9c5d1ac55d0080dc8a4a2e9b240b28d30dabc35ec5f35e5a4603b203e169f3' from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@2.1'),'historical registry identity changed');

do $$ declare actor text; begin
 foreach actor in array array['knowledge-admin','knowledge-owner','knowledge-stranger'] loop
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000',pg_temp.id(actor),'authenticated','authenticated',actor||'@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
  insert into public.profiles(id,is_admin) values(pg_temp.id(actor),actor='knowledge-admin') on conflict(id) do update set is_admin=excluded.is_admin;
 end loop;
 insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin) values(pg_temp.id('knowledge-cafe'),'Knowledge synthetic Café',47.1,8.1,'approved','Zurich',pg_temp.id('knowledge-owner'),'TEST');
end $$;
grant select on knowledge_price to authenticated,service_role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('knowledge-owner')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('knowledge-cafe'),'operation.price_options','KNOWN_VALUE',(select value from knowledge_price),clock_timestamp(),null,null,'PUBLIC',null,'knowledge-owner-price')->>'verificationMethod')='OWNER_CONFIRMED','Basic owner price write failed');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('knowledge-cafe'),'context.atmosphere','KNOWN_VALUE','[]','PUBLIC','knowledge-basic-scope'),'42501','new prices widened unrelated Basic scope');
select set_config('request.jwt.claim.sub',pg_temp.id('knowledge-stranger')::text,true);
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('knowledge-cafe'),'operation.price_options','KNOWN_VALUE',(select value::text from knowledge_price),'PUBLIC','knowledge-foreign-price'),'42501','foreign owner price write accepted');
select set_config('request.jwt.claim.sub',pg_temp.id('knowledge-admin')::text,true);
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'operation.price_options','KNOWN_VALUE',(select value from knowledge_price),clock_timestamp(),null,null,'PUBLIC',null,'knowledge-admin-price')->>'verificationMethod')='ADMIN_CONFIRMED','Admin price write failed');
select public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'identity.name','KNOWN_VALUE','"Knowledge synthetic Café"',clock_timestamp(),null,null,'PUBLIC',null,'knowledge-name');
select public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'location.locality','KNOWN_VALUE','"Zurich"',clock_timestamp(),null,null,'PUBLIC',null,'knowledge-city');
select public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'classification.primary_category','KNOWN_VALUE','"COFFEE_DAYTIME"',clock_timestamp(),null,null,'PUBLIC',null,'knowledge-category');
select public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'classification.place_types','KNOWN_VALUE','["CAFE"]',clock_timestamp(),null,null,'PUBLIC',null,'knowledge-type');
select public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'offering.food_specialities','KNOWN_VALUE','["CAKE"]',clock_timestamp(),null,null,'PUBLIC',null,'knowledge-cake');
reset role;
create temporary table knowledge_old_atmosphere as select world_knowledge_private.submit_authoritative_claim_v3('ADMIN',pg_temp.id('knowledge-cafe'),'context.atmosphere','KNOWN_VALUE','[{"atmosphere":"QUIET","conditions":{"dayparts":[],"days":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}}]',clock_timestamp(),null,null,'PUBLIC',null,'knowledge-old-quiet') receipt;
set local role service_role;
create temporary table knowledge_manifest as select public.world_shadow_rebuild_spot_v1(pg_temp.id('knowledge-cafe'),clock_timestamp()+interval '1 second','FULL','knowledge-rebuild') payload;
select pg_temp.assert((select payload#>>'{worldSnapshot,registryVersion}'=(select registry_version from world_knowledge_private.registry_releases order by approved_at desc,registry_version desc limit 1) from knowledge_manifest),'rebuild did not use latest approved registry while retaining the 2.2 price claims');
reset role;
select pg_temp.assert((select (world_knowledge_private.product_decision_projection_v1(payload->'worldSnapshot')->'facts') @> '[{"key":"operation.price_options"}]' from knowledge_manifest),'new price fact missing in Product projection');
select pg_temp.assert((select (world_knowledge_private.product_decision_projection_v1(payload->'worldSnapshot')->'facts') @> '[{"key":"offering.food_specialities","value":["CAKE"]}]' from knowledge_manifest),'precise cake missing in Product projection');
select pg_temp.assert((select (world_knowledge_private.validate_resolution_manifest_v1((payload->>'manifestId')::uuid)->>'manifestHash')=payload->>'manifestHash' from knowledge_manifest),'new manifest binding invalid');
select pg_temp.assert((select (world_knowledge_private.product_decision_projection_v1(payload->'worldSnapshot')->'facts') @> '[{"key":"context.atmosphere","hardConstraintAuthorized":false,"validityVerified":true}]' from knowledge_manifest),'historical atmosphere was silently upgraded');
select pg_temp.assert((select (world_knowledge_private.product_decision_projection_v1(payload->'worldSnapshot')->'facts') @> '[{"key":"operation.price_options","validityVerified":true,"validFrom":null,"validUntil":null}]' from knowledge_manifest),'price validity missing');
grant select on knowledge_old_atmosphere to authenticated;
set local role authenticated;
select public.world_admin_submit_claim_v1(pg_temp.id('knowledge-cafe'),'context.atmosphere','KNOWN_VALUE','[{"atmosphere":"QUIET","conditions":{"dayparts":[],"days":[],"area":null,"occasion":null,"groupSize":null,"ageContext":null,"accompaniment":null,"eventMode":null}}]',clock_timestamp(),null,null,'PUBLIC',(select (receipt->>'claimId')::uuid from knowledge_old_atmosphere),'knowledge-new-quiet');
reset role;
set local role service_role;
create temporary table knowledge_new_manifest as select public.world_shadow_rebuild_spot_v1(pg_temp.id('knowledge-cafe'),clock_timestamp()+interval '2 seconds','FULL','knowledge-rebuild-quiet') payload;
reset role;
select pg_temp.assert((select (world_knowledge_private.product_decision_projection_v1(payload->'worldSnapshot')->'facts') @> '[{"key":"context.atmosphere","hardConstraintAuthorized":true,"validityVerified":true}]' from knowledge_new_manifest),'new verified atmosphere authorization missing');
select pg_temp.assert(not has_function_privilege('anon','public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'anonymous write granted');
select pg_temp.assert(not has_function_privilege('authenticated','world_knowledge_private.submit_authoritative_claim_v4(text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'direct privileged writer exposed');
select pg_temp.assert(not has_table_privilege('authenticated','world_knowledge_private.claims','SELECT,INSERT,UPDATE,DELETE'),'private claims exposed');
select pg_temp.assert((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='world_knowledge_private' and c.relname='claims'),'RLS lost');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_decision_vnext_product_context_v5(uuid,text,text,text,text,text,text,bigint)','execute'),'Product retrieval exposed to clients');
rollback;
