\set ON_ERROR_STOP on
begin;
-- Full canonical schema; synthetic fixtures only and all writes roll back.
create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'two-person Mood display: %',p_message; end if; end $$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',pg_temp.id('two-person-user-'||n),'authenticated','authenticated','two-person-'||n||'@test.invalid','','{}','{}',now(),now() from generate_series(1,3) n;
insert into public.profiles(id) select pg_temp.id('two-person-user-'||n) from generate_series(1,3) n on conflict do nothing;
insert into public.spots(id,name,lat,lng,status,city,data_origin) values(pg_temp.id('two-person-spot'),'Isolated two-person Mood test',47.55,7.59,'approved','Basel','REAL');
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot')),'empty Spot fabricated a Mood');
insert into public.reviews(id,spot_id,user_id,mood_a,created_at) values
 (pg_temp.id('two-person-review-1'),pg_temp.id('two-person-spot'),pg_temp.id('two-person-user-1'),'gemütlich',now()-interval '3 days'),
 (pg_temp.id('two-person-review-2'),pg_temp.id('two-person-spot'),pg_temp.id('two-person-user-1'),'heimelig',now()-interval '2 days');
-- One person posting twice must remain masked.
select pg_temp.assert((select evidence_state='EARLY' and concept_contributors is null and eligible_contributors is null and percentage is null from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'repeat visits unlocked one-person display');
insert into public.reviews(id,spot_id,user_id,mood_a,mood_b,created_at) values
 (pg_temp.id('two-person-review-3'),pg_temp.id('two-person-spot'),pg_temp.id('two-person-user-2'),'cozy','urban',now()-interval '1 day');
select pg_temp.assert((select evidence_state='EARLY' and eligible_contributors=2 from public.backyrd_spot_mood_profile_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'internal Decision evidence threshold changed');
select pg_temp.assert(not exists(select 1 from public.backyrd_decision_community_mood_signal_v1(array[pg_temp.id('two-person-spot')],'gemütlich',null,null)),'display change activated two-person Decision evidence');
-- backyrd:authorization-positive
set local role anon;
select pg_temp.assert((select evidence_state='ESTABLISHED' and eligible_contributors=2 and concept_contributors=2 and percentage=100 from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'anonymous two-person display missing or duplicated authors');
select pg_temp.assert((select evidence_state='ESTABLISHED' and concept_contributors=1 from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.urban'),'display threshold was incorrectly applied per concept');
-- backyrd:authorization-negative
select pg_temp.assert(not has_table_privilege('anon','public.backyrd_spot_mood_profile_v1','select'),'anonymous access to aggregate base table expanded');
select pg_temp.assert(not has_table_privilege('anon','public.backyrd_spot_mood_profile_public_v1','insert'),'anonymous write access expanded');
select pg_temp.assert(not has_function_privilege('anon','public.backyrd_decision_community_mood_signal_v1(uuid[],text,text,text)','execute'),'anonymous Decision access expanded');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('two-person-user-1'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('two-person-user-1')::text,true);
select pg_temp.assert((select concept_contributors=2 from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'authenticated display unavailable');
select pg_temp.assert(not exists(select 1 from public.backyrd_spot_mood_profile_v1 where spot_id=pg_temp.id('two-person-spot')),'aggregate base RLS weakened');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_rebuild_spot_mood_profile_v1(uuid)','execute'),'aggregate rebuild exposed');
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- Real moderation must demote a two-person public profile to masked one-person evidence.
update public.safety_content_items set lifecycle_status='removed' where entity_type='review' and entity_id=pg_temp.id('two-person-review-3');
select pg_temp.assert((select evidence_state='EARLY' and concept_contributors is null and percentage is null from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'moderation failed to re-mask one-person evidence');
update public.safety_content_items set lifecycle_status='live' where entity_type='review' and entity_id=pg_temp.id('two-person-review-3');
select pg_temp.assert((select evidence_state='ESTABLISHED' and concept_contributors=2 from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'restoration did not restore two-person display');
insert into public.reviews(spot_id,user_id,mood_a,created_at) values(pg_temp.id('two-person-spot'),pg_temp.id('two-person-user-3'),'heimelig',now());
select pg_temp.assert((select evidence_state='ESTABLISHED' and eligible_contributors=3 from public.backyrd_spot_mood_profile_v1 where spot_id=pg_temp.id('two-person-spot') and concept_key='mood.cozy'),'three-person internal evidence regressed');
select pg_temp.assert(exists(select 1 from public.backyrd_decision_community_mood_signal_v1(array[pg_temp.id('two-person-spot')],'gemütlich',null,null)),'existing three-person Decision evidence regressed');
select 'public two-person Mood display: PASS';
rollback;
