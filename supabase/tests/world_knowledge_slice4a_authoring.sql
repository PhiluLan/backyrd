\set ON_ERROR_STOP on
-- backyrd:authorization-positive
-- backyrd:authorization-negative
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'world knowledge slice4a failed: %',p_message; end if; end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
  select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.expect_error(p_sql text,p_state text,p_message text) returns void language plpgsql as $$
declare actual_state text; begin begin execute p_sql; exception when others then get stacked diagnostics actual_state=returned_sqlstate; if actual_state=p_state then return; end if; raise exception '% (expected %, received %)',p_message,p_state,actual_state; end; raise exception '% (unexpected success)',p_message; end$$;

select set_config('app.world_knowledge_founder_authoring_enabled','on',true);
do $$ declare u text; begin
  foreach u in array array['wk4a-admin','wk4a-basic','wk4a-pro','wk4a-other'] loop
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values('00000000-0000-0000-0000-000000000000',pg_temp.id(u),'authenticated','authenticated',u||'@test.invalid','','{}','{"is_admin":true}',clock_timestamp(),clock_timestamp());
    update public.profiles set is_admin=(u='wk4a-admin') where id=pg_temp.id(u);
  end loop;
end$$;

-- Admin creates isolated, archived Founder spots; client metadata grants nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4a-other')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.expect_error($q$select public.world_founder_create_spot_v1('Forged',null,'forged')$q$,'42501','user_metadata forged Admin authority');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4a-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table wk4a_created as select public.world_founder_create_spot_v1('Founder Basic',pg_temp.id('wk4a-basic'),'create-basic') payload;
insert into wk4a_created select public.world_founder_create_spot_v1('Founder Pro',pg_temp.id('wk4a-pro'),'create-pro');
select pg_temp.assert((select count(*)=2 and bool_and((payload->>'created')::boolean) from wk4a_created),'Admin could not create Founder spots');
select pg_temp.assert((public.world_founder_create_spot_v1('Founder Basic',pg_temp.id('wk4a-basic'),'create-basic')->>'created')::boolean=false,'create was not idempotent');
reset role;

insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source,valid_from,contract_version)
select (payload->>'spotId')::uuid,pg_temp.id('wk4a-pro'),'PREMIUM','TEST_FIXTURE',clock_timestamp()-interval '1 minute','backyrd-owner-free-premium-boundary-v1'
from wk4a_created where payload->>'spotId'=(select payload->>'spotId' from wk4a_created offset 1 limit 1);

select pg_temp.assert((select count(*)=2 and bool_and(s.status='archived' and s.data_origin='TEST' and f.evaluation_scope='FOUNDER_EVALUATION_ONLY') from world_knowledge_private.founder_evaluation_spots_v1 f join public.spots s on s.id=f.spot_id),'Founder isolation marker or archived product state missing');

-- Basic owner: own Basic keys only, explicit unknown and not-applicable stay distinct.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4a-basic')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),'operation.takeaway','UNKNOWN','null',clock_timestamp(),null,null,'PUBLIC',null,'basic-unknown')->>'verificationMethod')='OWNER_CONFIRMED','Basic owner unknown claim failed');
select pg_temp.assert((public.world_authoring_set_applicability_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),'rule.external_food','NOT_APPLICABLE','basic-na')->>'applicability')='NOT_APPLICABLE','not-applicable authoring event failed');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',(select payload->>'spotId' from wk4a_created offset 1 limit 1),'identity.name','KNOWN_VALUE','"Foreign"','PUBLIC','foreign-spot'),'42501','owner wrote foreign spot');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',(select payload->>'spotId' from wk4a_created limit 1),'accessibility.accessible_toilet','KNOWN_TRUE','true','PUBLIC','basic-pro'),'42501','Basic owner wrote Pro key');
select pg_temp.expect_error('insert into world_knowledge_private.claims default values','42501','authenticated direct ledger write');
reset role;

-- Pro and Admin writes are verified server-side; entitlement itself is not part of fact truth.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4a-pro')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_owner_submit_claim_v1((select (payload->>'spotId')::uuid from wk4a_created offset 1 limit 1),'accessibility.accessible_toilet','KNOWN_TRUE','true',clock_timestamp(),null,null,'PUBLIC',null,'pro-access')->>'verificationMethod')='OWNER_CONFIRMED','Pro owner could not write Pro key');
select pg_temp.expect_error(format('select public.world_owner_submit_claim_v1(%L,%L,%L,%L::jsonb,clock_timestamp(),null,null,%L,null,%L)',(select payload->>'spotId' from wk4a_created offset 1 limit 1),'state.current','KNOWN_VALUE','{"kind":"OPEN","scope":"VENUE"}','PUBLIC','no-expiry'),'22023','current state without valid_until');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id('wk4a-admin')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert((public.world_admin_submit_claim_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),'accessibility.accessible_toilet','KNOWN_TRUE','true',clock_timestamp(),null,null,'PUBLIC',null,'admin-access')->>'verificationMethod')='ADMIN_CONFIRMED','Admin could not write Pro key on Basic spot');
select pg_temp.assert((public.world_admin_submit_claim_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),'description.highlight','KNOWN_VALUE','"Hass und verbotener Inhalt"',clock_timestamp(),null,null,'PUBLIC',null,'held-text')->>'visibility')='SHADOW_HELD','unsafe description was not held');
select pg_temp.assert(jsonb_array_length(public.world_founder_list_spots_v1(null,null,true)->'spots')=2,'Admin list omitted Founder spots');
select pg_temp.assert((public.world_authoring_get_spot_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1))#>>'{applicability,rule.external_food}')='NOT_APPLICABLE','applicability not restored');
select pg_temp.assert((public.world_founder_set_spot_lifecycle_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),'ARCHIVED','FOUNDER TESTSET ÄNDERN')->>'historyPreserved')::boolean,'archive destroyed history');
select pg_temp.assert((public.world_founder_set_spot_lifecycle_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),'ACTIVE','FOUNDER TESTSET ÄNDERN')->>'historyPreserved')::boolean,'reactivation destroyed history');
reset role;

select pg_temp.assert((select count(*)=6 from world_knowledge_private.claims),'append-only claim count mismatch');
select pg_temp.assert((select count(*)=6 from world_knowledge_private.verification_records where result='VERIFIED'),'verification count mismatch');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.authoring_applicability_events_v1),'applicability event missing');
select pg_temp.assert((select count(*)=1 from world_knowledge_private.review_work_items where work_class='CONTENT_SAFETY'),'content review work missing');

-- Complete catalog-driven grant/RLS inventory includes every new table.
select pg_temp.assert(not exists(
  select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname='world_knowledge_private'
    and (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
),'private World table exposed or lacks RLS');
select pg_temp.assert(not has_function_privilege('anon','public.world_founder_create_spot_v1(text,uuid,text)','execute') and not has_function_privilege('anon','public.world_authoring_get_spot_v1(uuid)','execute'),'anon authoring function access');
select pg_temp.assert(not has_function_privilege('authenticated','public.world_founder_export_cohort_v1(text)','execute'),'client cohort export access');

-- Only the actual server role can rebuild/export; snapshots contain no commercial/private fields.
set local role authenticated;
select pg_temp.expect_error(format('select public.world_shadow_rebuild_spot_v1(%L,clock_timestamp(),%L,%L)',(select payload->>'spotId' from wk4a_created limit 1),'FULL','client-rebuild'),'42501','client called rebuild');
reset role;
set local role service_role;
create temporary table wk4a_manifest as select public.world_shadow_rebuild_spot_v1((select (payload->>'spotId')::uuid from wk4a_created limit 1),clock_timestamp()+interval '1 second','FULL','service-rebuild') payload;
select pg_temp.assert((select payload->>'manifestHash' ~ '^[0-9a-f]{64}$' from wk4a_manifest),'service rebuild failed');
select pg_temp.assert((public.world_founder_export_cohort_v1('founder-test')->>'scope')='FOUNDER_EVALUATION_ONLY','cohort export failed');
reset role;
select pg_temp.assert((select m.world_snapshot::text !~* 'subscription|payment|owner[_ ]?tier|actor_id|private_source' from world_knowledge_private.resolution_manifests m join wk4a_manifest r on m.id=(r.payload->>'manifestId')::uuid),'private/commercial material leaked into snapshot');

rollback;
