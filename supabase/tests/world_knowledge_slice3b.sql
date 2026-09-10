\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'world knowledge slice3b failed: %',p_message; end if;
end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics actual_state=returned_sqlstate;
    if actual_state=p_state then return; end if;
    raise exception '% (expected %, received %)',p_message,p_state,actual_state;
  end;
  raise exception '% (statement unexpectedly succeeded)',p_message;
end$$;

select pg_temp.assert((select registry_hash='e51e78f929d8d11ca149a50eaba250cf484e916ef38f2d447d3c8d881bb203be' from world_knowledge_private.registry_releases where registry_version='backyrd.world-knowledge.registry@1.1'),'registry release/hash mismatch');
select pg_temp.assert((select policy_hash='029582851b57914ce8f360e27dd7d6697fa6144cdf1febcf38d866290f4da95b' from world_knowledge_private.source_policy_releases where policy_version='backyrd.world-knowledge.source-policy@3b.1'),'source policy mismatch');
select pg_temp.assert((select policy_hash='ba8032f09eafc0ac561f0fdab112b457aca84bf69c94c85c4ad34396c7649575' from world_knowledge_private.entitlement_policy_releases where policy_version='backyrd.world-knowledge.entitlement-policy@3b.1'),'entitlement policy mismatch');
select pg_temp.assert((select count(*)=4 from world_knowledge_private.attribute_definitions where registry_version='backyrd.world-knowledge.registry@1.1' and attribute_key in ('contact.public_email','operation.price_level','accessibility.elevator','accessibility.accessible_indoor')),'additive keys missing');

-- Catalog-derived inventory: every World table must be represented; no hand-maintained allowlist.
select pg_temp.assert(not exists(
  select 1
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p')
    and (n.nspname='world_knowledge_private' or (n.nspname='public' and c.relname like 'world_knowledge_%'))
    and not exists(select 1 from world_knowledge_private.security_inventory_v1 i where i.schema_name=n.nspname and i.object_name=c.relname and i.object_type='TABLE')
),'security inventory omitted a World table');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.security_inventory_v1 where schema_name='world_knowledge_private' and object_name='source_policy_attribute_rules'),'source policy rules absent from inventory');
select pg_temp.assert(not exists(
  select 1 from world_knowledge_private.security_inventory_v1
  where object_type in ('TABLE','PARTITIONED_TABLE') and (rls_enabled is not true or public_dml or anon_dml or authenticated_dml or not service_role_access)
),'World table lacks RLS or exposes a client grant');
select pg_temp.assert(not has_schema_privilege('anon','world_knowledge_private','usage') and not has_schema_privilege('authenticated','world_knowledge_private','usage'),'private schema exposed');
select pg_temp.assert(not has_table_privilege('anon','public.world_knowledge_public_projection_v1','select') and not has_table_privilege('authenticated','public.world_knowledge_public_projection_v1','select'),'unactivated projection exposed');
select pg_temp.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','world_knowledge_private') and p.proname like 'world_%' and has_function_privilege('public',p.oid,'execute')),'security definer executable by PUBLIC');

do $$
declare u text;
begin
  foreach u in array array['wk-basic','wk-pro','wk-admin','wk-other','wk-reporter','wk-new-owner'] loop
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000000',pg_temp.id(u),'authenticated','authenticated',u||'@test.invalid','','{}','{}',clock_timestamp(),clock_timestamp());
    insert into public.profiles(id,is_admin) values(pg_temp.id(u),u='wk-admin') on conflict(id) do update set is_admin=excluded.is_admin;
  end loop;
  insert into public.spots(id,name,lat,lng,status,city,owner_id,data_origin) values
    (pg_temp.id('wk-basic-spot'),'Basic synthetic',47.1,8.1,'approved','Zürich',pg_temp.id('wk-basic'),'TEST'),
    (pg_temp.id('wk-pro-spot'),'Pro synthetic',47.2,8.2,'approved','Zürich',pg_temp.id('wk-pro'),'TEST'),
    (pg_temp.id('wk-other-spot'),'Other synthetic',47.3,8.3,'approved','Zürich',pg_temp.id('wk-other'),'TEST');
  insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source,valid_from,contract_version)
  values(pg_temp.id('wk-pro-spot'),pg_temp.id('wk-pro'),'PREMIUM','TEST_FIXTURE',clock_timestamp()-interval '1 day','backyrd-owner-free-premium-boundary-v1');
end$$;

-- Basic and Pro owner authority.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-basic')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('wk-basic-spot'),'identity.name','KNOWN_VALUE','"Basic Casa"',transaction_timestamp(),null,null,'PUBLIC',null,'basic-name')->>'verificationMethod')='OWNER_CONFIRMED','Basic owner write failed');
select pg_temp.assert((public.world_confirm_claim_v1(((public.world_owner_submit_claim_v1(pg_temp.id('wk-basic-spot'),'identity.name','KNOWN_VALUE','"Basic Casa"',transaction_timestamp(),null,null,'PUBLIC',null,'basic-name')->>'claimId')::uuid),'basic-name-confirmation')->>'claimUnchanged')::boolean,'confirmation did not preserve claim semantics');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('wk-other-spot'),'identity.name','KNOWN_VALUE','"Foreign"','PUBLIC','foreign'),'42501','foreign owner write accepted');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('wk-basic-spot'),'accessibility.accessible_toilet','KNOWN_TRUE','true','PUBLIC','basic-pro-key'),'42501','Basic Pro key accepted');
select pg_temp.expect_error('insert into world_knowledge_private.claims default values','42501','direct authenticated claim insert accepted');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-pro')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1(pg_temp.id('wk-pro-spot'),'accessibility.accessible_toilet','KNOWN_TRUE','true',clock_timestamp(),null,null,'PUBLIC',null,'pro-access')->>'verificationMethod')='OWNER_CONFIRMED','Pro accessibility write failed');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',pg_temp.id('wk-pro-spot'),'state.current','KNOWN_VALUE','{"kind":"OPEN","scope":"VENUE"}','PUBLIC','state-no-expiry'),'22023','current state without expiry accepted');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'accessibility.accessible_toilet','KNOWN_TRUE','true',clock_timestamp(),null,null,'PUBLIC',null,'admin-access')->>'verificationMethod')='ADMIN_CONFIRMED','server-bound Admin write failed');
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'contact.public_email','KNOWN_VALUE','"public@basic.example"',clock_timestamp(),null,null,'PUBLIC',null,'public-email')->>'verificationMethod')='ADMIN_CONFIRMED','public email write failed');
select pg_temp.assert((public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'description.highlight','KNOWN_VALUE','"Hass und verbotener Inhalt"',clock_timestamp(),null,null,'PUBLIC',null,'unsafe-description')->>'visibility')='SHADOW_HELD','problematic new text was not shadow-held');

-- A registry approval is not identity-event authority; only preparatory events exist in Slice 3B.
select pg_temp.expect_error(format('select public.world_admin_record_identity_event_v1(%L,%L,%L,null,null,array[%L],%L)','MERGE_CONFIRMED',pg_temp.id('wk-basic-spot'),pg_temp.id('wk-pro-spot'),'GENERAL_APPROVAL_MUST_NOT_AUTHORIZE','merge-1'),'42501','general approval authorized merge');
select pg_temp.expect_error(format('select public.world_admin_record_identity_event_v1(%L,%L,%L,null,null,array[%L],%L)','SPLIT',pg_temp.id('wk-basic-spot'),pg_temp.id('wk-pro-spot'),'NOT_CONFIGURED','split-1'),'42501','split authority unexpectedly configured');
select pg_temp.expect_error(format('select public.world_admin_record_identity_event_v1(%L,%L,%L,null,null,array[%L],%L)','MERGE_REVERSED',pg_temp.id('wk-basic-spot'),pg_temp.id('wk-pro-spot'),'NOT_CONFIGURED','reverse-1'),'42501','reversal authority unexpectedly configured');
select pg_temp.expect_error(format('select public.world_admin_record_identity_event_v1(%L,%L,null,null,null,array[%L],%L)','MERGE_PROPOSED',pg_temp.id('wk-basic-spot'),'PAIR_REQUIRED','proposal-no-pair'),'22023','pairless proposal accepted');
select pg_temp.assert((public.world_admin_record_identity_event_v1('MERGE_PROPOSED',pg_temp.id('wk-basic-spot'),pg_temp.id('wk-pro-spot'),null,null,array['SYNTHETIC_DUPLICATE_SIGNAL'],'proposal-ab')->>'automaticMerge')::boolean=false,'proposal mutated identity');
select pg_temp.assert((public.world_admin_record_identity_event_v1('MERGE_PROPOSED',pg_temp.id('wk-basic-spot'),pg_temp.id('wk-pro-spot'),null,null,array['SYNTHETIC_DUPLICATE_SIGNAL'],'proposal-ab')->>'created')::boolean=false,'identical proposal was not idempotent');
select pg_temp.expect_error(format('select public.world_admin_record_identity_event_v1(%L,%L,%L,null,null,array[%L],%L)','MERGE_PROPOSED',pg_temp.id('wk-basic-spot'),pg_temp.id('wk-other-spot'),'SYNTHETIC_DUPLICATE_SIGNAL','proposal-ab'),'23505','A/B idempotency authorized A/C');
select pg_temp.expect_error(format('select public.world_admin_record_identity_event_v1(%L,%L,%L,null,null,array[%L],%L)','MERGE_PROPOSED',pg_temp.id('wk-pro-spot'),pg_temp.id('wk-basic-spot'),'SYNTHETIC_DUPLICATE_SIGNAL','proposal-ab'),'23505','reversed merge direction reused authority');
reset role;

select pg_temp.assert((select count(*)=5 from world_knowledge_private.claims),'unexpected authoritative claim count');
select pg_temp.assert((select count(*)=1 and bool_and(confirmation_due_at=confirmed_at+interval '3 months') from world_knowledge_private.confirmation_records),'confirmation record missing or invalid');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.identity_events where event_type='MERGE_PROPOSED'),'preparatory identity event missing');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.review_work_items where work_class='CONTENT_SAFETY'),'content-safety work item missing');
select pg_temp.assert(not exists(select 1 from world_knowledge_private.claims c left join world_knowledge_private.verification_records v on v.claim_id=c.id where v.id is null or v.result<>'VERIFIED'),'verified write missing bound verification');
select pg_temp.assert((select bool_and((actor_type='VERIFIED_OWNER' and verification_method='OWNER_CONFIRMED' and execution_authority='SERVER_BOUND_OWNER_WRITE') or (actor_type='ADMIN' and verification_method='ADMIN_CONFIRMED' and execution_authority='SERVER_BOUND_ADMIN_WRITE')) from world_knowledge_private.claims c join world_knowledge_private.verification_records v on v.claim_id=c.id),'verification method/authority mismatch');

-- Fully rehashed hostile verification and confirmation records remain invalid.
do $$
declare
  owner_claim world_knowledge_private.claims%rowtype;
  owner_b_binding uuid;
  checked timestamptz:=clock_timestamp();
  hostile_hash text;
begin
  select * into owner_claim from world_knowledge_private.claims where idempotency_key='basic-name';
  insert into world_knowledge_private.actor_bindings(actor_id,actor_type) values(pg_temp.id('wk-other'),'VERIFIED_OWNER') returning id into owner_b_binding;
  hostile_hash:=encode(extensions.digest(convert_to(jsonb_build_object('claimId',owner_claim.id,'claimHash',owner_claim.content_hash,'spotId',owner_claim.spot_id,'attributeKey',owner_claim.attribute_key,'scope',owner_claim.scope,'policyVersion',owner_claim.policy_version,'method','OWNER_CONFIRMED','authority','SERVER_BOUND_OWNER_WRITE','verifierBinding',owner_b_binding,'result','VERIFIED','checkedAt',checked,'reverificationPolicyRef','freshness:durable-until-contradicted','reasonCodes',to_jsonb(array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[]))::text,'UTF8'),'sha256'),'hex');
  perform pg_temp.expect_error(format($q$insert into world_knowledge_private.verification_records(claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,reason_codes,result_hash) values(%L,%L,%L,%L,%L,%L,'OWNER_CONFIRMED','SERVER_BOUND_OWNER_WRITE',%L,'VERIFIED',%L,'freshness:durable-until-contradicted',array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'],%L)$q$,owner_claim.id,owner_claim.content_hash,owner_claim.spot_id,owner_claim.attribute_key,owner_claim.scope,owner_claim.policy_version,owner_b_binding,checked,hostile_hash),'42501','Owner B verified Owner A claim');

  hostile_hash:=encode(extensions.digest(convert_to(jsonb_build_object('claimId',owner_claim.id,'claimHash',owner_claim.content_hash,'actorBinding',owner_b_binding,'confirmationMethod','OWNER_CONFIRMED','confirmedAt',checked,'confirmationDueAt',checked+interval '3 months','policyVersion',owner_claim.policy_version,'reconfirmationPolicyRef','confirmation:quarterly-request-v1','idempotencyIdentity','foreign-confirm')::text,'UTF8'),'sha256'),'hex');
  perform pg_temp.expect_error(format($q$insert into world_knowledge_private.confirmation_records(claim_id,claim_hash,actor_binding_id,confirmation_method,policy_version,reconfirmation_policy_ref,confirmed_at,confirmation_due_at,idempotency_key,record_hash) values(%L,%L,%L,'OWNER_CONFIRMED',%L,'confirmation:quarterly-request-v1',%L,%L,'foreign-confirm',%L)$q$,owner_claim.id,owner_claim.content_hash,owner_b_binding,owner_claim.policy_version,checked,checked+interval '3 months',hostile_hash),'42501','foreign owner confirmation accepted');
end$$;

-- Ownership at verification time is mandatory, even for the original claim actor.
do $$
declare c world_knowledge_private.claims%rowtype; checked timestamptz:=clock_timestamp(); h text;
begin
  select * into c from world_knowledge_private.claims where idempotency_key='basic-name';
  update public.spots set owner_id=pg_temp.id('wk-new-owner') where id=c.spot_id;
  h:=encode(extensions.digest(convert_to(jsonb_build_object('claimId',c.id,'claimHash',c.content_hash,'spotId',c.spot_id,'attributeKey',c.attribute_key,'scope',c.scope,'policyVersion',c.policy_version,'method','OWNER_CONFIRMED','authority','SERVER_BOUND_OWNER_WRITE','verifierBinding',c.actor_binding_id,'result','VERIFIED','checkedAt',checked,'reverificationPolicyRef','freshness:durable-until-contradicted','reasonCodes',to_jsonb(array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[]))::text,'UTF8'),'sha256'),'hex');
  perform pg_temp.expect_error(format($q$insert into world_knowledge_private.verification_records(claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,reason_codes,result_hash) values(%L,%L,%L,%L,%L,%L,'OWNER_CONFIRMED','SERVER_BOUND_OWNER_WRITE',%L,'VERIFIED',%L,'freshness:durable-until-contradicted',array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'],%L)$q$,c.id,c.content_hash,c.spot_id,c.attribute_key,c.scope,c.policy_version,c.actor_binding_id,checked,h),'42501','former owner verification accepted');
end$$;

-- Revoking server-side admin authority invalidates a fully rehashed admin verification.
do $$
declare c world_knowledge_private.claims%rowtype; checked timestamptz:=clock_timestamp(); h text;
begin
  select * into c from world_knowledge_private.claims where idempotency_key='admin-access';
  update public.profiles set is_admin=false where id=pg_temp.id('wk-admin');
  h:=encode(extensions.digest(convert_to(jsonb_build_object('claimId',c.id,'claimHash',c.content_hash,'spotId',c.spot_id,'attributeKey',c.attribute_key,'scope',c.scope,'policyVersion',c.policy_version,'method','ADMIN_CONFIRMED','authority','SERVER_BOUND_ADMIN_WRITE','verifierBinding',c.actor_binding_id,'result','VERIFIED','checkedAt',checked,'reverificationPolicyRef','freshness:durable-until-contradicted','reasonCodes',to_jsonb(array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[]))::text,'UTF8'),'sha256'),'hex');
  perform pg_temp.expect_error(format($q$insert into world_knowledge_private.verification_records(claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,reason_codes,result_hash) values(%L,%L,%L,%L,%L,%L,'ADMIN_CONFIRMED','SERVER_BOUND_ADMIN_WRITE',%L,'VERIFIED',%L,'freshness:durable-until-contradicted',array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'],%L)$q$,c.id,c.content_hash,c.spot_id,c.attribute_key,c.scope,c.policy_version,c.actor_binding_id,checked,h),'42501','revoked admin verification accepted');
  update public.profiles set is_admin=true where id=pg_temp.id('wk-admin');
end$$;

-- AI-only verification cannot become authoritative even with matching hashes.
do $$
declare binding_id uuid; source_id uuid; claim_id uuid:=gen_random_uuid(); observed timestamptz:=clock_timestamp(); checked timestamptz; claim_hash text; verification_hash text;
begin
  insert into world_knowledge_private.actor_bindings(actor_id,actor_type) values(pg_temp.id('wk-reporter'),'SYSTEM') returning id into binding_id;
  insert into world_knowledge_private.source_references(spot_id,source_type,visibility,source_hash) values(pg_temp.id('wk-other-spot'),'AI_INFERENCE','INTERNAL',encode(extensions.digest(convert_to('ai-source','UTF8'),'sha256'),'hex')) returning id into source_id;
  claim_hash:=encode(extensions.digest(convert_to(jsonb_build_object('spotId',pg_temp.id('wk-other-spot'),'key','operation.takeaway','state','KNOWN_TRUE','value','true'::jsonb,'actorBinding',binding_id,'observedAt',observed,'validFrom',null,'validUntil',null,'supersedes',null,'registry','backyrd.world-knowledge.registry@1.1','policy','backyrd.world-knowledge.source-policy@3b.1')::text,'UTF8'),'sha256'),'hex');
  insert into world_knowledge_private.claims(id,idempotency_key,spot_id,registry_version,policy_version,attribute_key,knowledge_state,value,actor_binding_id,actor_type,source_reference_id,source_type,observed_at,last_changed_at,stance,visibility,content_hash)
  values(claim_id,'ai-candidate',pg_temp.id('wk-other-spot'),'backyrd.world-knowledge.registry@1.1','backyrd.world-knowledge.source-policy@3b.1','operation.takeaway','KNOWN_TRUE','true',binding_id,'SYSTEM',source_id,'AI_INFERENCE',observed,observed,'SUPPORTS','INTERNAL',claim_hash);
  checked:=clock_timestamp();
  verification_hash:=encode(extensions.digest(convert_to(jsonb_build_object('claimId',claim_id,'claimHash',claim_hash,'spotId',pg_temp.id('wk-other-spot'),'attributeKey','operation.takeaway','scope','SPOT','policyVersion','backyrd.world-knowledge.source-policy@3b.1','method','INDEPENDENT_PROCESS','authority','ACCEPTED_INDEPENDENT_PROCESS','verifierBinding',binding_id,'result','VERIFIED','checkedAt',checked,'reverificationPolicyRef','freshness:durable-until-contradicted','reasonCodes',to_jsonb(array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED']::text[]))::text,'UTF8'),'sha256'),'hex');
  perform pg_temp.expect_error(format($q$insert into world_knowledge_private.verification_records(claim_id,claim_hash,spot_id,attribute_key,scope,policy_version,verification_method,execution_authority,verifier_binding_id,result,checked_at,reverification_policy_ref,reason_codes,result_hash) values(%L,%L,%L,'operation.takeaway','SPOT','backyrd.world-knowledge.source-policy@3b.1','INDEPENDENT_PROCESS','ACCEPTED_INDEPENDENT_PROCESS',%L,'VERIFIED',%L,'freshness:durable-until-contradicted',array['SERVER_ACTOR_SCOPE_AND_PAYLOAD_CONFIRMED'],%L)$q$,claim_id,claim_hash,pg_temp.id('wk-other-spot'),binding_id,checked,verification_hash),'42501','AI-only verification accepted');
end$$;

-- User reports create review work only.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-reporter')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_submit_user_report_v1(pg_temp.id('wk-basic-spot'),'identity.name','{"message":"wrong name"}','report-1')->>'factChanged')::boolean=false,'user report changed fact');
reset role;
select pg_temp.assert((select count(*)=1 from world_knowledge_private.review_work_items where work_class='USER_REPORT'),'user report did not create review work item');
select pg_temp.assert((select count(*)=6 from world_knowledge_private.claims),'user report created claim');

-- Actual database-role boundary, not a caller-controlled JWT role string.
create temporary table wk_resolution_results(label text primary key,payload jsonb);
create temporary table wk_clock as select clock_timestamp() as as_of;
grant select on wk_clock to authenticated,service_role;
grant all on wk_resolution_results to service_role;
set local role anon;
select pg_temp.expect_error(format('select public.world_shadow_rebuild_spot_v1(%L,clock_timestamp(),%L,%L)',pg_temp.id('wk-basic-spot'),'FULL','anon-rebuild'),'42501','anon executed shadow rebuild');
reset role;
set local role authenticated;
select pg_temp.expect_error(format('select public.world_shadow_rebuild_spot_v1(%L,clock_timestamp(),%L,%L)',pg_temp.id('wk-basic-spot'),'FULL','authenticated-rebuild'),'42501','authenticated executed shadow rebuild');
reset role;
set local role service_role;
select pg_temp.expect_error(format('select world_knowledge_private.get_actor_binding_v1(%L,%L)',pg_temp.id('wk-new-owner'),'VERIFIED_OWNER'),'42501','service role called internal helper directly');

-- Manifest identity: excluded inputs change input/manifest identity, not the resolved output.
insert into wk_resolution_results values('baseline',public.world_shadow_rebuild_spot_v1(pg_temp.id('wk-basic-spot'),(select as_of from wk_clock),'FULL','full-baseline'));
insert into wk_resolution_results values('baseline-replay',public.world_shadow_rebuild_spot_v1(pg_temp.id('wk-basic-spot'),(select as_of from wk_clock),'INCREMENTAL','replay-baseline'));
select pg_temp.assert((select (a.payload->>'manifestHash')=(b.payload->>'manifestHash') and (a.payload->>'inputHash')=(b.payload->>'inputHash') from wk_resolution_results a,wk_resolution_results b where a.label='baseline' and b.label='baseline-replay'),'identical request was not idempotent');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'description.highlight','KNOWN_VALUE','"Illegal shadow candidate"',(select as_of-interval '1 minute' from wk_clock),null,null,'PUBLIC',null,'excluded-shadow');
select public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'operation.takeaway','KNOWN_TRUE','true',(select as_of-interval '1 minute' from wk_clock),(select as_of+interval '1 day' from wk_clock),null,'PUBLIC',null,'excluded-future');
select public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'operation.takeaway','KNOWN_FALSE','false',(select as_of-interval '2 minutes' from wk_clock),null,(select as_of-interval '1 minute' from wk_clock),'PUBLIC',null,'excluded-expired');
reset role;

set local role service_role;
insert into wk_resolution_results values('excluded-inputs',public.world_shadow_rebuild_spot_v1(pg_temp.id('wk-basic-spot'),(select as_of from wk_clock),'FULL','full-excluded'));
select pg_temp.assert((select a.payload->'worldSnapshot'=b.payload->'worldSnapshot' and a.payload->'decisionProjection'=b.payload->'decisionProjection' and a.payload->>'resolutionHash'=b.payload->>'resolutionHash' and a.payload->>'inputHash'<>b.payload->>'inputHash' and a.payload->>'manifestHash'<>b.payload->>'manifestHash' from wk_resolution_results a,wk_resolution_results b where a.label='baseline' and b.label='excluded-inputs'),'excluded inputs changed snapshot or failed to change manifest identity');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.world_admin_submit_claim_v1(pg_temp.id('wk-basic-spot'),'operation.takeaway','KNOWN_TRUE','true',(select as_of-interval '30 seconds' from wk_clock),null,null,'PUBLIC',null,'current-takeaway');
reset role;
set local role service_role;
insert into wk_resolution_results values('authorized-change',public.world_shadow_rebuild_spot_v1(pg_temp.id('wk-basic-spot'),(select as_of from wk_clock),'INCREMENTAL','incremental-current'));
select pg_temp.assert((select a.payload->>'resolutionHash'<>b.payload->>'resolutionHash' and a.payload->'worldSnapshot'<>b.payload->'worldSnapshot' from wk_resolution_results a,wk_resolution_results b where a.label='excluded-inputs' and b.label='authorized-change'),'authorized fact did not change resolution');
select pg_temp.assert((select count(*)=3 and count(distinct input_hash)=3 and count(distinct manifest_hash)=3 and count(distinct resolution_hash)=2 from world_knowledge_private.resolution_manifests where spot_id=pg_temp.id('wk-basic-spot')),'manifest/input/output identities are not distinct as required');
select pg_temp.assert(not ((select payload->'decisionProjection'->'facts' from wk_resolution_results where label='authorized-change') @> '[{"key":"contact.public_email"}]'),'public contact leaked to Decision projection');
select pg_temp.assert((select payload->'worldSnapshot'->'facts' @> '[{"key":"contact.public_email"}]' from wk_resolution_results where label='authorized-change'),'public email missing from World snapshot');
select pg_temp.assert(not (select payload->'worldSnapshot'->'facts' @> '[{"key":"description.highlight","value":"Illegal shadow candidate"}]' from wk_resolution_results where label='authorized-change'),'shadow-held text leaked to World snapshot');
select pg_temp.expect_error(format($q$insert into world_knowledge_private.identity_events(event_type,subject_spot_id,related_spot_id,recorded_by_binding_id,idempotency_key,occurred_at,reason_codes,event_hash) select 'MERGE_CONFIRMED',%L,%L,id,'direct-merge',clock_timestamp(),array['UNAUTHORIZED'],encode(extensions.digest(convert_to('direct-merge','UTF8'),'sha256'),'hex') from world_knowledge_private.actor_bindings where actor_id=%L and actor_type='ADMIN'$q$,pg_temp.id('wk-basic-spot'),pg_temp.id('wk-pro-spot'),pg_temp.id('wk-admin')),'23514','service role directly recorded a mutating identity event');
reset role;

-- Two account deletions detach without collision and retain immutable evidence.
create temporary table wk_history_before as
select (select count(*) from world_knowledge_private.claims) claim_count,
       (select encode(extensions.digest(convert_to(coalesce(string_agg(content_hash,',' order by content_hash),''),'UTF8'),'sha256'),'hex') from world_knowledge_private.claims) claim_digest,
       (select count(*) from world_knowledge_private.verification_records) verification_count,
       (select encode(extensions.digest(convert_to(coalesce(string_agg(result_hash,',' order by result_hash),''),'UTF8'),'sha256'),'hex') from world_knowledge_private.verification_records) verification_digest,
       (select count(*) from world_knowledge_private.identity_events) identity_count,
       (select encode(extensions.digest(convert_to(coalesce(string_agg(event_hash,',' order by event_hash),''),'UTF8'),'sha256'),'hex') from world_knowledge_private.identity_events) identity_digest;
delete from auth.users where id in (pg_temp.id('wk-basic'),pg_temp.id('wk-other'));
select pg_temp.assert((select count(*)=2 and count(distinct actor_pseudonym_id)=2 and bool_and(actor_id is null and detached_at is not null) from world_knowledge_private.actor_bindings where actor_type='VERIFIED_OWNER' and actor_id is null),'multiple owner bindings did not detach independently');
select pg_temp.assert(not exists(select 1 from world_knowledge_private.actor_bindings b cross join (values(pg_temp.id('wk-basic')), (pg_temp.id('wk-other'))) old(id) where to_jsonb(b)::text like '%'||encode(extensions.digest(convert_to(old.id::text||':world-knowledge-actor-v1','UTF8'),'sha256'),'hex')||'%'),'detached binding retained reproducible user-id hash');
select pg_temp.assert((select claim_count=(select count(*) from world_knowledge_private.claims) and claim_digest=(select encode(extensions.digest(convert_to(coalesce(string_agg(content_hash,',' order by content_hash),''),'UTF8'),'sha256'),'hex') from world_knowledge_private.claims) and verification_count=(select count(*) from world_knowledge_private.verification_records) and verification_digest=(select encode(extensions.digest(convert_to(coalesce(string_agg(result_hash,',' order by result_hash),''),'UTF8'),'sha256'),'hex') from world_knowledge_private.verification_records) and identity_count=(select count(*) from world_knowledge_private.identity_events) and identity_digest=(select encode(extensions.digest(convert_to(coalesce(string_agg(event_hash,',' order by event_hash),''),'UTF8'),'sha256'),'hex') from world_knowledge_private.identity_events) from wk_history_before),'detachment mutated historical records');
insert into world_knowledge_private.actor_bindings(actor_id,actor_type) values(pg_temp.id('wk-new-owner'),'VERIFIED_OWNER');
select pg_temp.expect_error(format('insert into world_knowledge_private.actor_bindings(actor_id,actor_type) values(%L,%L)',pg_temp.id('wk-new-owner'),'VERIFIED_OWNER'),'23505','duplicate active actor binding accepted');
select pg_temp.expect_error(format('update world_knowledge_private.actor_bindings set actor_id=%L where actor_id=%L and actor_type=%L',pg_temp.id('wk-reporter'),pg_temp.id('wk-new-owner'),'VERIFIED_OWNER'),'55000','foreign actor binding takeover accepted');

do $$declare claim_id uuid; before_value jsonb; begin
  select id,value into claim_id,before_value from world_knowledge_private.claims where idempotency_key='basic-name';
  perform pg_temp.expect_error(format('update world_knowledge_private.claims set value=%L::jsonb where id=%L','"mutated"',claim_id),'55000','append-only update accepted');
  perform pg_temp.assert((select value=before_value from world_knowledge_private.claims where id=claim_id),'claim history mutated');
end$$;

select pg_temp.assert(not exists(select 1 from world_knowledge_private.resolution_manifests where decision_projection::text ~* '(subscription|payment|owner[_ ]?tier|actor_id|private_payload)'),'commercial/private data leaked to projection');
rollback;
