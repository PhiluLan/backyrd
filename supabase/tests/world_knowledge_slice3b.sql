\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$begin if p_ok is not true then raise exception 'world knowledge slice3b failed: %',p_message;end if;end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid$$;

select pg_temp.assert((select registry_hash='e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be' from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@1.1'),'registry release/hash mismatch');
select pg_temp.assert((select policy_hash='029582851b57914ce8f360e27dd7d6697fa6144cdf1febcf38d866290f4da95b' from world_knowledge_private.source_policy_releases where policy_version='backyrd.world-knowledge.source-policy@3b.1'),'source policy mismatch');
select pg_temp.assert((select policy_hash='ba8032f09eafc0ac561f0fdab112b457aca84bf69c94c85c4ad34396c7649575' from world_knowledge_private.entitlement_policy_releases where policy_version='backyrd.world-knowledge.entitlement-policy@3b.1'),'entitlement policy mismatch');
select pg_temp.assert((select count(*)=4 from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@1.1' and attribute_key in ('contact.public_email','operation.price_level','accessibility.elevator','accessibility.accessible_indoor')),'additive keys missing');
select pg_temp.assert(not has_schema_privilege('anon','world_knowledge_private','usage') and not has_schema_privilege('authenticated','world_knowledge_private','usage'),'private schema exposed');
select pg_temp.assert(not has_table_privilege('anon','public.world_knowledge_public_projection_v1','select') and not has_table_privilege('authenticated','public.world_knowledge_public_projection_v1','select'),'unactivated projection exposed');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','world_knowledge_private') and p.proname like 'world_%' and has_function_privilege('public',p.oid,'execute')),'security definer executable by PUBLIC');
select pg_temp.assert(not has_function_privilege('anon','public.world_owner_submit_claim_v1(uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,uuid,text)','execute'),'anon owner write executable');

do $$
declare u text;
begin
  foreach u in array array['wk-basic','wk-pro','wk-admin','wk-other','wk-reporter'] loop
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000000',pg_temp.id(u),'authenticated','authenticated',u||'@test.invalid','','{}','{}',now(),now());
    insert into public.profiles(id,is_admin) values(pg_temp.id(u),u='wk-admin') on conflict(id) do update set is_admin=excluded.is_admin;
  end loop;
  insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin) values
    (pg_temp.id('wk-basic-spot'),'Basic synthetic',47.1,8.1,'approved','Zürich',pg_temp.id('wk-basic'),'TEST'),
    (pg_temp.id('wk-pro-spot'),'Pro synthetic',47.2,8.2,'approved','Zürich',pg_temp.id('wk-pro'),'TEST'),
    (pg_temp.id('wk-other-spot'),'Other synthetic',47.3,8.3,'approved','Zürich',pg_temp.id('wk-other'),'TEST');
  insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source,valid_from,contract_version)
  values(pg_temp.id('wk-pro-spot'),pg_temp.id('wk-pro'),'PREMIUM','TEST_FIXTURE',now()-interval '1 day','backyrd-owner-free-premium-boundary-v1');
end$$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('wk-basic'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('wk-basic')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('wk-basic-spot'),'identity.name','KNOWN_VALUE','"Basic Casa"',now(),null,null,'PUBLIC',null,'basic-name')->>'verificationMethod')='OWNER_CONFIRMED','Basic owner write failed');
select pg_temp.assert((public.world_confirm_claim_v1(((public.world_owner_submit_claim_v1(pg_temp.id('wk-basic-spot'),'identity.name','KNOWN_VALUE','"Basic Casa"',now(),null,null,'PUBLIC',null,'basic-name')->>'claimId')::uuid),'basic-name-confirmation')->>'claimUnchanged')::boolean,'confirmation did not preserve claim semantics');
do $$begin begin perform public.world_owner_submit_claim_v1(pg_temp.id('wk-other-spot'),'identity.name','KNOWN_VALUE','"Foreign"',now(),null,null,'PUBLIC',null,'foreign');raise exception 'foreign owner write accepted';exception when insufficient_privilege then null;end;end$$;
do $$begin begin perform public.world_owner_submit_claim_v1(pg_temp.id('wk-basic-spot'),'accessibility.accessible_toilet','KNOWN_TRUE','true',now(),null,null,'PUBLIC',null,'basic-pro-key');raise exception 'Basic Pro key accepted';exception when insufficient_privilege then null;end;end$$;
do $$begin begin insert into world_knowledge_private.claims default values;raise exception 'direct claim insert accepted';exception when insufficient_privilege then null;end;end$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('wk-pro'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('wk-pro')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('wk-pro-spot'),'accessibility.accessible_toilet','KNOWN_TRUE','true',now(),null,null,'PUBLIC',null,'pro-access')->>'verificationMethod')='OWNER_CONFIRMED','Pro accessibility write failed');
do $$begin begin perform public.world_owner_submit_claim_v1(pg_temp.id('wk-pro-spot'),'state.current','KNOWN_VALUE','{"kind":"OPEN","scope":"VENUE","note":null}',now(),null,null,'PUBLIC',null,'state-no-expiry');raise exception 'current state without expiry accepted';exception when invalid_parameter_value then null;end;end$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('wk-admin'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('wk-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'accessibility.accessible_toilet','KNOWN_TRUE','true',now(),null,null,'PUBLIC',null,'admin-access')->>'verificationMethod')='ADMIN_CONFIRMED','server-bound Admin write failed');
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'contact.public_email','KNOWN_VALUE','"public@basic.example"',now(),null,null,'PUBLIC',null,'public-email')->>'verificationMethod')='ADMIN_CONFIRMED','public email write failed');
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'description.highlight','KNOWN_VALUE','"Hass und verbotener Inhalt"',now(),null,null,'PUBLIC',null,'unsafe-description')->>'visibility')='SHADOW_HELD','problematic new text was not shadow-held');
reset role;

select pg_temp.assert((select count(*)=5 from world_knowledge_private.claims),'unexpected authoritative claim count');
select pg_temp.assert((select count(*)=1 and bool_and(confirmation_due_at>confirmed_at) from world_knowledge_private.confirmation_records),'confirmation record missing or invalid');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.review_work_items where work_class='CONTENT_SAFETY'),'content-safety work item missing');
select pg_temp.assert(not exists(select 1 from world_knowledge_private.claims c left join world_knowledge_private.verification_records v on v.claim_id=c.id where v.id is null or v.result<>'VERIFIED'),'verified write missing bound verification');
select pg_temp.assert((select bool_and((actor_type='VERIFIED_OWNER' and verification_method='OWNER_CONFIRMED' and execution_authority='SERVER_BOUND_OWNER_WRITE') or (actor_type='ADMIN' and verification_method='ADMIN_CONFIRMED' and execution_authority='SERVER_BOUND_ADMIN_WRITE')) from world_knowledge_private.claims c join world_knowledge_private.verification_records v on v.claim_id=c.id),'verification method/authority mismatch');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('wk-reporter'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('wk-reporter')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_submit_user_report_v1(pg_temp.id('wk-basic-spot'),'identity.name','{"message":"wrong name"}','report-1')->>'factChanged')::boolean=false,'user report changed fact');
reset role;
select pg_temp.assert((select count(*)=1 from world_knowledge_private.review_work_items where work_class='USER_REPORT'),'user report did not create review work item');
select pg_temp.assert((select count(*)=5 from world_knowledge_private.claims),'user report created claim');

select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert((public.world_shadow_rebuild_spot_v1(pg_temp.id('wk-basic-spot'),now(),'FULL','full-1')->'decisionProjection'->'facts') @> '[{"key":"accessibility.accessible_toilet"}]','authorized fact missing from decision projection');
insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source,valid_from,contract_version)
values(pg_temp.id('wk-basic-spot'),pg_temp.id('wk-basic'),'PREMIUM','TEST_FIXTURE',now()-interval '1 day','backyrd-owner-free-premium-boundary-v1');
select pg_temp.assert(not ((public.world_shadow_rebuild_spot_v1(pg_temp.id('wk-basic-spot'),now(),'INCREMENTAL','incremental-1')->'decisionProjection'->'facts') @> '[{"key":"contact.public_email"}]'),'public contact leaked to Decision projection');
select pg_temp.assert((select count(distinct resolution_hash)=1 from world_knowledge_private.resolution_manifests where spot_id=pg_temp.id('wk-basic-spot')),'full/incremental replay diverged');
select pg_temp.assert((select world_snapshot->'facts' @> '[{"key":"contact.public_email"}]' from world_knowledge_private.resolution_manifests where spot_id=pg_temp.id('wk-basic-spot') limit 1),'public email missing from World snapshot');
select pg_temp.assert(not (select world_snapshot->'facts' @> '[{"key":"description.highlight"}]' from world_knowledge_private.resolution_manifests where spot_id=pg_temp.id('wk-basic-spot') limit 1),'shadow-held text leaked to World snapshot');
select pg_temp.assert(not (select world_snapshot->'facts' @> '[{"key":"accessibility.step_free_entrance","resolution":"KNOWN_FALSE"}]' from world_knowledge_private.resolution_manifests where spot_id=pg_temp.id('wk-basic-spot') limit 1),'missing accessibility was invented as false');

do $$declare claim_id uuid;before_value jsonb;begin
 select id,value into claim_id,before_value from world_knowledge_private.claims where idempotency_key='basic-name';
 begin update world_knowledge_private.claims set value='"mutated"' where id=claim_id;raise exception 'append-only update accepted';exception when sqlstate '55000' then null;end;
 perform pg_temp.assert((select value=before_value from world_knowledge_private.claims where id=claim_id),'claim history mutated');
end$$;

select pg_temp.assert(not exists(select 1 from world_knowledge_private.resolution_manifests where decision_projection::text ~* '(subscription|payment|owner[_ ]?tier|actor_id|private_payload)'),'commercial/private data leaked to projection');
rollback;
