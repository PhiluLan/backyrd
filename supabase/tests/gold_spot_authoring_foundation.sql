\set ON_ERROR_STOP on
begin;

create function pg_temp.gold_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'gold authoring test failed: %',p_message; end if; end $$;
create function pg_temp.actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;

do $$
declare owner_basic uuid:=pg_temp.gold_uuid('owner-basic');owner_pro uuid:=pg_temp.gold_uuid('owner-pro');other_owner uuid:=pg_temp.gold_uuid('other-owner');admin_id uuid:=pg_temp.gold_uuid('admin');founder_id uuid:=pg_temp.gold_uuid('founder');category_id uuid:=pg_temp.gold_uuid('category');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',owner_basic,'authenticated','authenticated','basic@gold.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',owner_pro,'authenticated','authenticated','pro@gold.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',other_owner,'authenticated','authenticated','other@gold.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',admin_id,'authenticated','authenticated','admin@gold.invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',founder_id,'authenticated','authenticated','founder@gold.invalid','','{}','{}',now(),now());
 update public.profiles set is_admin=true where id in (admin_id,founder_id);
 insert into public.admin_users(user_id,role) values(admin_id,'admin'),(founder_id,'super_admin');
 insert into public.categories(id,name) values(category_id,'Aktivität');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin,owner_id) values
 (pg_temp.gold_uuid('basic-spot'),'Basic Gold Spot',47,7,'approved','Basel',category_id,'REAL',owner_basic),
 (pg_temp.gold_uuid('pro-spot'),'Pro Gold Spot',47.1,7.1,'approved','Basel',category_id,'REAL',owner_pro),
 (pg_temp.gold_uuid('other-spot'),'Other Gold Spot',47.2,7.2,'approved','Basel',category_id,'REAL',other_owner);
 insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source) values
 (pg_temp.gold_uuid('basic-spot'),owner_basic,'FREE','SYSTEM_DEFAULT'),
 (pg_temp.gold_uuid('pro-spot'),owner_pro,'PREMIUM','TEST_FIXTURE');
 insert into public.backyrd_gold_authoring_owner_allowlist_v1(user_id,reason) values(owner_basic,'test'),(owner_pro,'test'),(other_owner,'test');
end $$;

select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry remains 60');
select pg_temp.assert(public.backyrd_gold_validate_fact_value_v1('suitability.family_kids','"UNKNOWN"'),'UNKNOWN is a typed first-class enum value');
select pg_temp.assert(not public.backyrd_gold_validate_fact_value_v1('suitability.family_kids','"YES"'),'invalid enum is rejected');

set local role authenticated;
select pg_temp.actor(pg_temp.gold_uuid('owner-basic'));
do $$
declare source_id uuid;result jsonb;
begin
 source_id:=public.backyrd_gold_create_source_v1(pg_temp.gold_uuid('basic-spot'),'OWNER_CLAIM',null,'owner:family','Owner claim',null,now(),null,'NOT_REQUIRED');
 result:=public.backyrd_gold_submit_proposal_v1(pg_temp.gold_uuid('basic-spot'),'suitability.family_kids','"SUITABLE"',source_id,'basic-family',null,null);
 perform pg_temp.assert(result->>'status'='PENDING','Basic owner can submit Basic suitability');
 begin
  perform public.backyrd_gold_submit_proposal_v1(pg_temp.gold_uuid('basic-spot'),'suitability.rain','"SUITABLE"',source_id,'basic-deep',null,null);
  raise exception 'Basic owner bypassed Pro capability';
 exception when insufficient_privilege then perform pg_temp.assert(sqlerrm='owner_pro_required','Basic is denied Deep authoring'); end;
 begin
  perform public.backyrd_gold_profile_v1(pg_temp.gold_uuid('other-spot'));
  raise exception 'cross-owner profile exposed';
 exception when insufficient_privilege then perform pg_temp.assert(sqlerrm='spot_access_denied','cross-owner profile fails closed'); end;
 begin
  insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,confidence_policy_result) values(pg_temp.gold_uuid('basic-spot'),'suitability.rain','"SUITABLE"',source_id,1);
  raise exception 'client directly wrote canonical fact';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.backyrd_spot_intelligence_evidence_v1(spot_id,dimension_key,value_kind,value,source_family,source_reference,signal_confidence,observed_at,valid_from,provenance) values(pg_temp.gold_uuid('basic-spot'),'vibe.cozy','INTERPRETATION','1','owner_provided','forged',1,now(),now(),'{}');
  raise exception 'client directly wrote N4';
 exception when insufficient_privilege then null; end;
 begin
  perform public.backyrd_gold_rebuild_spot_v1(pg_temp.gold_uuid('basic-spot'));
  raise exception 'Owner invoked privileged rebuild';
 exception when insufficient_privilege then perform pg_temp.assert(sqlerrm='gold_rebuild_service_or_admin_required','Owner cannot invoke privileged rebuild'); end;
end $$;

select pg_temp.actor(pg_temp.gold_uuid('owner-pro'));
do $$
declare source_id uuid;result jsonb;
begin
 source_id:=public.backyrd_gold_create_source_v1(pg_temp.gold_uuid('pro-spot'),'OFFICIAL_WEBSITE','https://example.invalid/pro',null,'Official',null,now(),now(),'NOT_REQUIRED');
 result:=public.backyrd_gold_submit_proposal_v1(pg_temp.gold_uuid('pro-spot'),'suitability.rain','"SUITABLE"',source_id,'pro-rain','Official website explicitly describes indoor rain use.',null);
 perform pg_temp.assert(result->>'status'='PENDING','Pro owner can submit Deep typed fact');
 begin
  perform public.backyrd_gold_review_proposal_v1((result->>'proposalId')::uuid,'ACCEPT',null);
  raise exception 'Owner accepted own restricted proposal';
 exception when insufficient_privilege then perform pg_temp.assert(sqlerrm='admin_review_required','Owner cannot self-qualify truth'); end;
end $$;

select pg_temp.actor(pg_temp.gold_uuid('other-owner'));
do $$ begin
 begin
  perform public.backyrd_gold_create_source_v1(pg_temp.gold_uuid('pro-spot'),'OWNER_CLAIM',null,'attack',null,null,now(),null,'NOT_REQUIRED');
  raise exception 'cross owner source accepted';
 exception when insufficient_privilege then null; end;
end $$;

select pg_temp.actor(pg_temp.gold_uuid('admin'));
do $$
declare proposal_id uuid;environment_proposal uuid;opening_proposal uuid;source_id uuid;first_hash text;second_hash text;profile jsonb;
begin
 perform public.upsert_spot_admin_content_v1(pg_temp.gold_uuid('pro-spot'),'Persisted Admin description used after reload.',array['gold','verified'],'admin',null);
 perform pg_temp.assert((select admin_description='Persisted Admin description used after reload.' and admin_keywords=array['gold','verified'] from public.spot_descriptions where spot_id=pg_temp.gold_uuid('pro-spot')),'Admin description and keywords persist for save/reload');
 select (item->>'id')::uuid into proposal_id
 from jsonb_array_elements(public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'proposals') item
 where item->>'field_key'='suitability.rain' limit 1;
 perform public.backyrd_gold_review_proposal_v1(proposal_id,'ACCEPT','Verified official source');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'acceptedFacts') item where (item->>'proposal_id')::uuid=proposal_id and item->>'status'='ACTIVE'),'Admin acceptance creates canonical accepted fact');
 perform pg_temp.assert((public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'canonicalN4'->>'snapshotHash') is not null,'qualification atomically rebuilds canonical N4');
 first_hash:=public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'canonicalN4'->>'snapshotHash';
 perform public.backyrd_gold_rebuild_spot_v1(pg_temp.gold_uuid('pro-spot'));
 second_hash:=public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'canonicalN4'->>'snapshotHash';
 perform pg_temp.assert(first_hash=second_hash,'N4 rebuild is idempotent and deterministic');
 perform pg_temp.assert((public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'canonicalN4'->'intelligence')::text not like '%PREMIUM%' and (public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'canonicalN4'->'intelligence')::text not like '%payment%','commercial entitlement is absent from N4');
 source_id:=public.backyrd_gold_create_source_v1(pg_temp.gold_uuid('pro-spot'),'ADMIN_VERIFIED',null,'admin:verified-environment','Admin verified',null,now(),now(),'NOT_REQUIRED');
 environment_proposal:=(public.backyrd_gold_submit_proposal_v1(pg_temp.gold_uuid('pro-spot'),'suitability.environment','"MIXED"',source_id,'admin-environment',null,null)->>'proposalId')::uuid;
 perform public.backyrd_gold_review_proposal_v1(environment_proposal,'ACCEPT','Verified environment');
 profile:=public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'));
 perform pg_temp.assert(profile->'canonicalN4'->'intelligence'->'facts'->>'environment'='MIXED','accepted Product fact flows into canonical N4 facts');
 perform pg_temp.assert(profile->'canonicalN4'->'intelligence'->'concepts' ? 'environment.indoor' and profile->'canonicalN4'->'intelligence'->'concepts' ? 'environment.outdoor','frozen mapper emits only registered interpretations');
 opening_proposal:=(public.backyrd_gold_submit_proposal_v1(pg_temp.gold_uuid('pro-spot'),'opening.regular','{"days":[{"day":"Montag","intervals":[{"open":"09:00","close":"17:00"}]}]}',source_id,'admin-opening',null,null)->>'proposalId')::uuid;
 perform public.backyrd_gold_review_proposal_v1(opening_proposal,'ACCEPT','Verified opening hours');
 perform pg_temp.assert(exists(select 1 from public.spot_hours where spot_id=pg_temp.gold_uuid('pro-spot') and day_of_week='Montag'),'accepted opening fact atomically updates Product hours');
end $$;

select pg_temp.actor(pg_temp.gold_uuid('founder'));
select pg_temp.assert((public.backyrd_gold_profile_v1(pg_temp.gold_uuid('other-spot'))->'actor'->>'role')='FOUNDER','Founder has all-Spot access');

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare result jsonb;
begin
 result:=public.backyrd_gold_submit_research_proposal_v1(pg_temp.gold_uuid('pro-spot'),'suitability.conversation','"HIGH"','https://official.invalid/source','Official page',now(),'Quiet conversation areas stated.','Explicit official wording.','research-1');
 perform pg_temp.assert(result->>'status'='PENDING' and not (result->>'canonicalWrite')::boolean,'Research API creates proposal, never truth');
 perform pg_temp.assert(not exists(select 1 from public.backyrd_spot_accepted_facts_v1 where proposal_id=(result->>'proposalId')::uuid),'Research proposal cannot directly write accepted fact');
end $$;
reset role;

set local role authenticated;
select pg_temp.actor(pg_temp.gold_uuid('owner-pro'));
do $$
declare source_id uuid;result jsonb;
begin
 source_id:=public.backyrd_gold_create_source_v1(pg_temp.gold_uuid('pro-spot'),'OWNER_CLAIM',null,'owner:rain-conflict','Owner conflict',null,now(),null,'NOT_REQUIRED');
 result:=public.backyrd_gold_submit_proposal_v1(pg_temp.gold_uuid('pro-spot'),'suitability.rain','"NOT_SUITABLE"',source_id,'pro-rain-conflict',null,null);
 perform pg_temp.assert(result->>'status'='CONFLICT','conflicting accepted and proposed facts are surfaced, never silently replaced');
end $$;
reset role;

-- Downgrade removes edit capability, never accepted truth or N4.
update public.backyrd_spot_owner_intelligence_entitlements_v1 set tier='FREE',source='SYSTEM_DEFAULT' where spot_id=pg_temp.gold_uuid('pro-spot');
set local role authenticated;
select pg_temp.actor(pg_temp.gold_uuid('owner-pro'));
select pg_temp.assert((public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'actor'->>'capability')='BASIC','downgrade locks Deep authoring');
select pg_temp.assert(exists(select 1 from jsonb_array_elements(public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'acceptedFacts') item where item->>'field_key'='suitability.rain' and item->>'status'='ACTIVE'),'downgrade retains accepted Deep truth');
select pg_temp.assert((public.backyrd_gold_profile_v1(pg_temp.gold_uuid('pro-spot'))->'canonicalN4'->>'snapshotHash') is not null,'downgrade retains canonical N4');

select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_spot_accepted_facts_v1','insert'),'clients cannot write accepted facts');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_gold_submit_research_proposal_v1(uuid,text,jsonb,text,text,timestamptz,text,text,text)','execute'),'Research service API is not client-callable');
reset role;
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'authoring never extends frozen N4 registry');

rollback;
