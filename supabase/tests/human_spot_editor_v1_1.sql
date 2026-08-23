\set ON_ERROR_STOP on
begin;

create function pg_temp.v11_uuid(p text) returns uuid language sql immutable as $$
 select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid
$$;
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'human editor v1.1 failed: %',p_message; end if; end $$;
create function pg_temp.actor(p_user uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
end $$;
create function pg_temp.proposal_status(p_id uuid) returns text language sql security definer set search_path=public,pg_catalog as $$
 select status from public.backyrd_spot_fact_proposals_v1 where id=p_id
$$;
create function pg_temp.fact_count(p_spot uuid,p_key text) returns bigint language sql security definer set search_path=public,pg_catalog as $$
 select count(*) from public.backyrd_spot_accepted_facts_v1 where spot_id=p_spot and field_key=p_key
$$;
create function pg_temp.mark_schedule_derived(p_proposal uuid) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_fact uuid;
begin
 update public.backyrd_spot_fact_proposals_v1 set interpretation_basis='SCHEDULE_DERIVED' where id=p_proposal;
 select id into v_fact from public.backyrd_spot_accepted_facts_v1 where proposal_id=p_proposal;
 if v_fact is not null then update public.backyrd_spot_accepted_facts_v1 set interpretation_basis='SCHEDULE_DERIVED' where id=v_fact; end if;
 return v_fact;
end $$;
create function pg_temp.decision_view(p_spot uuid) returns jsonb language sql security definer set search_path=public,pg_catalog as $$
 select jsonb_build_object('placeType',d.place_type,'facts',d.suitability_facts) from public.backyrd_read_n4_for_decision_v2(array[p_spot]) d
$$;
create function pg_temp.inject_event_family(p_spot uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_source uuid;v_fact uuid;
begin
 insert into public.backyrd_spot_sources_v1(spot_id,source_type,source_reference,title,retrieved_at,last_checked_at,legal_use_status,created_by_type,created_by_id)
 values(p_spot,'ADMIN_VERIFIED','historical-event-only','Historical event source',now(),now(),'NOT_REQUIRED','ADMIN',p_actor) returning id into v_source;
 insert into public.backyrd_spot_accepted_facts_v1(spot_id,field_key,value,source_id,status,confidence_policy_result,accepted_by,evidence_scope,semantic_contract_version)
 values(p_spot,'suitability.family_kids','"SUITABLE"',v_source,'ACTIVE',.9,p_actor,'EVENT','backyrd-canonical-semantics-v1') returning id into v_fact;
 return v_fact;
end $$;

do $$
declare founder uuid:=pg_temp.v11_uuid('v11-founder');owner_id uuid:=pg_temp.v11_uuid('v11-owner');category_id uuid:=pg_temp.v11_uuid('v11-category');spot_id uuid:=pg_temp.v11_uuid('v11-spot');
begin
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('00000000-0000-0000-0000-000000000000',founder,'authenticated','authenticated','founder-v11@invalid','','{}','{}',now(),now()),
 ('00000000-0000-0000-0000-000000000000',owner_id,'authenticated','authenticated','owner-v11@invalid','','{}','{}',now(),now());
 update public.profiles set is_admin=true where id=founder;
 insert into public.admin_users(user_id,role) values(founder,'super_admin');
 insert into public.categories(id,name) values(category_id,'Museum');
 insert into public.spots(id,name,lat,lng,status,city,category_id,data_origin,owner_id) values(spot_id,'Human V1.1 Museum',47.55,7.59,'approved','Basel',category_id,'REAL',owner_id);
 insert into public.backyrd_spot_owner_intelligence_entitlements_v1(spot_id,owner_id,tier,source) values(spot_id,owner_id,'PREMIUM','TEST_FIXTURE');
 insert into public.backyrd_gold_authoring_owner_allowlist_v1(user_id,reason) values(owner_id,'v1.1 test');
end $$;

select pg_temp.assert((select count(*)=45 from public.backyrd_taste_concepts_v1),'frozen Taste registry changed');
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'frozen N4 registry changed');
select pg_temp.assert((select not owner_editable and engine_role='DISPLAY_ONLY' from public.backyrd_spot_fact_catalog_v1 where field_key='audience.basic'),'legacy basic audience remains a non-authoritative historical value');
select pg_temp.assert((select owner_editable and capability='BASIC' from public.backyrd_spot_fact_catalog_v1 where field_key='social.suitability'),'one social suitability question is the BASIC canonical target');
select pg_temp.assert(public.backyrd_gold_validate_fact_value_v1('social.suitability','{"solo":"SUITABLE","date":"UNKNOWN","friends":"SUITABLE","family":"SUITABLE","groups":"UNKNOWN","work":"NOT_SUITABLE"}'),'valid social suitability rejected');
select pg_temp.assert(not public.backyrd_gold_validate_fact_value_v1('social.suitability','{"friends":"BOOSTED"}'),'invalid social value did not fail closed');
select pg_temp.assert(not public.backyrd_gold_validate_fact_value_v1('duration.approximate','{"min":120,"max":60}'),'invalid duration range did not fail closed');

set local role authenticated;
select pg_temp.actor(pg_temp.v11_uuid('v11-founder'));
do $$
declare v_spot_id uuid:=pg_temp.v11_uuid('v11-spot');result jsonb;fact_count bigint;proposal_id uuid;fact_id uuid;decision_row jsonb;
begin
 perform pg_temp.inject_event_family(v_spot_id,pg_temp.v11_uuid('v11-founder'));
 result:=public.backyrd_gold_save_human_fact_v1(v_spot_id,'social.suitability','{"solo":"SUITABLE","date":"UNKNOWN","friends":"SUITABLE","family":"SUITABLE","groups":"UNKNOWN","work":"NOT_SUITABLE"}','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-social');
 perform pg_temp.assert((result->>'accepted')::boolean and not (result->>'reviewRequired')::boolean,'Founder safe SPOT save was not accepted in one action');
 perform pg_temp.assert(pg_temp.proposal_status((result->>'proposalId')::uuid)='ACCEPTED','one-click left a Founder self-review card');
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(public.backyrd_gold_profile_v1(v_spot_id)->'acceptedFacts') f where (f->>'proposal_id')::uuid=(result->>'proposalId')::uuid and f->>'status'='ACTIVE'),'one-click did not create accepted truth');
 perform pg_temp.assert(result->'readiness' is not null,'one-click did not refresh readiness in the same response');
 perform pg_temp.assert(not ((public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'->'concepts') ? 'occasion.kids_friendly'),'EVENT evidence contaminated general N4');
 perform pg_temp.assert(not (pg_temp.decision_view(v_spot_id)->'facts' ? 'suitability.family_kids'),'EVENT evidence contaminated Decision facts');

 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'atmosphere.descriptors','["COZY","RELAXED","INSPIRING"]','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-atmosphere');
 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'character.noise','"MODERATE"','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-noise');
 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'reservation.character','"WALK_IN"','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-access-mode');
 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'reservation.recommended','"YES"','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-reservation-recommended');
 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'duration.character','"MEDIUM"','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-duration-character');
 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'duration.approximate','{"min":60,"max":120}','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-duration-range');
 perform public.backyrd_gold_save_human_fact_v1(v_spot_id,'time.dayparts','["MORNING","AFTERNOON","WEEKEND"]','ADMIN_VERIFIED',null,'founder observed','SPOT','v11-dayparts');
 perform pg_temp.assert(not exists(select 1 from jsonb_array_elements(public.backyrd_gold_review_issues_v1(v_spot_id)) issue where issue->>'code' like 'DAYPART_REVIEW:%'),'manual qualitative daypart still receives schedule warning');

 perform pg_temp.assert((public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'->'concepts') ? 'vibe.cozy','supported atmosphere did not reach frozen N4');
 perform pg_temp.assert((public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'->'concepts') ? 'vibe.relaxed','supported relaxed atmosphere did not reach frozen N4');
 perform pg_temp.assert(public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'->>'placeType'='culture','Museum category did not use canonical culture place type');
 perform pg_temp.assert(public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'#>>'{facts,reservation_character,accessMode}'='WALK_IN','planning access mode did not reach frozen fact dimension');
 perform pg_temp.assert(public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'#>>'{facts,reservation_character,recommended}'='YES','reservation recommendation was lost or conflated');
 perform pg_temp.assert(public.backyrd_gold_profile_v1(v_spot_id)->'canonicalN4'->'intelligence'#>>'{facts,duration_character,rangeMinutes,min}'='60','duration range did not reach frozen fact dimension');

 decision_row:=pg_temp.decision_view(v_spot_id);
 perform pg_temp.assert(decision_row->>'placeType'='culture','Decision serialization place type diverged from category adapter');
 perform pg_temp.assert(decision_row->'facts' ? 'character.noise','factual noise is absent from Decision package');
 perform pg_temp.assert(decision_row->'facts' ? 'reservation.character' and decision_row->'facts' ? 'reservation.recommended','planning facts are absent from Decision package');
 perform pg_temp.assert(decision_row->'facts' ? 'duration.character' and decision_row->'facts' ? 'duration.approximate','duration facts are absent from Decision package');

 fact_count:=pg_temp.fact_count(v_spot_id,'suitability.rain');
 result:=public.backyrd_gold_save_human_fact_v1(v_spot_id,'suitability.rain','"SUITABLE"','ADMIN_VERIFIED',null,'temporary event','EVENT','v11-event-rain');
 perform pg_temp.assert((result->>'reviewRequired')::boolean and not (result->>'accepted')::boolean,'EVENT evidence bypassed restricted review boundary');
 perform pg_temp.assert(pg_temp.fact_count(v_spot_id,'suitability.rain')=fact_count,'EVENT evidence wrote general truth');

 perform pg_temp.assert((select not owner_editable from public.backyrd_spot_fact_catalog_v1 where field_key='opening.status'),'opening-status correction became a normal direct-authoring field');
 perform pg_temp.assert((select not owner_editable from public.backyrd_spot_fact_catalog_v1 where field_key='place_type'),'place-type correction became a normal direct-authoring field');

 result:=public.backyrd_gold_submit_human_proposal_v1(v_spot_id,'time.dayparts','["EVENING"]','ADMIN_VERIFIED',null,'schedule derived','SPOT','v11-schedule-daypart');
 proposal_id:=(result->>'proposalId')::uuid;
  perform public.backyrd_gold_review_proposal_v1(proposal_id,'ACCEPT','test schedule-derived legacy condition');
 fact_id:=pg_temp.mark_schedule_derived(proposal_id);
 perform pg_temp.assert(exists(select 1 from jsonb_array_elements(public.backyrd_gold_review_issues_v1(v_spot_id)) issue where issue->>'code'=('DAYPART_REVIEW:'||fact_id)),'schedule-derived daypart is not reviewable');
end $$;

select pg_temp.actor(pg_temp.v11_uuid('v11-owner'));
do $$ begin
 begin
  perform public.backyrd_gold_save_human_fact_v1(pg_temp.v11_uuid('v11-spot'),'suitability.environment','"INDOOR"','OWNER_CLAIM',null,'owner','SPOT','v11-owner-attack');
  raise exception 'Owner gained direct Founder acceptance';
 exception when insufficient_privilege then perform pg_temp.assert(sqlerrm='admin_or_founder_direct_accept_required','Owner direct acceptance did not fail at server boundary'); end;
end $$;

reset role;
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_intelligence_dimensions_v1 where dimension_key like '%subscription%' or dimension_key like '%owner%'),'commercial entitlement entered N4 registry');
select pg_temp.assert((select count(*)=60 from public.backyrd_spot_intelligence_dimensions_v1),'V1.1 extended frozen N4 registry');
rollback;
