\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'canonical product mood failed: %',p_message; end if; end$$;
create function pg_temp.id(p text) returns uuid language sql immutable as $$
select (substr(md5(p),1,8)||'-'||substr(md5(p),9,4)||'-4'||substr(md5(p),14,3)||'-8'||substr(md5(p),18,3)||'-'||substr(md5(p),21,12))::uuid$$;

select pg_temp.assert((public.backyrd_resolve_mood_input_v2('Gemütlich')->>'conceptKey')='mood.cozy','canonical label failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('GEMÜTLICH')->>'conceptKey')='mood.cozy','case normalization failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('gemuetlich')->>'conceptKey')='mood.cozy','umlaut alias failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('heimelig')->>'conceptKey')='mood.cozy','governed alias failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('cozy')->>'conceptKey')='mood.cozy','multilingual alias failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('laut')->>'conceptKey')='mood.loud','loud resolution failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('lebendig')->>'conceptKey')='mood.lively','lively resolution failed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('laut')->>'conceptKey')<>(public.backyrd_resolve_mood_input_v2('lebendig')->>'conceptKey'),'related concepts collapsed');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('Kaffee')->>'status')='INVALID','offering became Mood');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('Basel')->>'status')='INVALID','location became Mood');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('poetisch')->>'status')='UNRESOLVED','novel expression was forced or discarded');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2('https://spam.invalid')->>'status')='INVALID','URL was accepted');
select pg_temp.assert((public.backyrd_resolve_mood_input_v2(repeat('x',41))->>'reason')='TOO_LONG','length bound failed');
select pg_temp.assert((select concept_key='mood.cozy' from public.backyrd_resolve_decision_mood_query_v1('etwas heimeliges',null,null) limit 1),'Decision alias did not resolve canonically');
select pg_temp.assert((select array_agg(concept_key order by concept_key)=array['mood.cozy','mood.urban'] from public.backyrd_resolve_decision_mood_query_v1('gemütlicher und urbaner Ort zum Kaffee trinken',null,null)),'Decision query did not separate Mood from Offering/Purpose');
select pg_temp.assert(not exists(select 1 from public.backyrd_resolve_decision_mood_query_v1('Kaffee in Basel für CHF 20',null,null)),'Decision non-Mood became canonical Mood');
select pg_temp.assert(not exists(select 1 from public.backyrd_resolve_decision_mood_query_v1('nicht laut',null,null)),'negated Mood became a positive Decision signal');

select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_spot_mood_profile_v1','insert'),'authenticated can forge aggregate');
select pg_temp.assert(not has_table_privilege('authenticated','public.backyrd_mood_concepts_v1','insert'),'authenticated can create concepts');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_rebuild_spot_mood_profile_v1(uuid)','execute'),'authenticated can invoke internal spot rebuild');
select pg_temp.assert(not has_function_privilege('authenticated','public.backyrd_decision_community_mood_signal_v1(uuid[],text,text,text)','execute'),'authenticated can invoke Decision Mood signal RPC');

do $$
declare
  s uuid:=pg_temp.id('mood-spot'); u1 uuid:=pg_temp.id('mood-user-1');
  u2 uuid:=pg_temp.id('mood-user-2');u3 uuid:=pg_temp.id('mood-user-3');
  r1 uuid:=pg_temp.id('mood-review-1');r2 uuid:=pg_temp.id('mood-review-2');
  r3 uuid:=pg_temp.id('mood-review-3');r4 uuid:=pg_temp.id('mood-review-4');
  taste_before bigint;n4_before bigint;accepted_fact_before bigint;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','mood1@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','mood2@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',u3,'authenticated','authenticated','mood3@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(u1),(u2),(u3) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status,city,data_origin) values(s,'Mood Contract Spot',47.0,7.0,'approved','Basel','LEGACY');

  select count(*) into taste_before from public.backyrd_self_declared_taste_v1 where user_id=u1;
  select count(*) into n4_before from public.backyrd_spot_intelligence_evidence_v1 where spot_id=s;
  select count(*) into accepted_fact_before from public.backyrd_spot_accepted_facts_v1 where spot_id=s;

  insert into public.reviews(id,spot_id,user_id,mood_a,mood_b,text,created_at) values
    (r1,s,u1,'heimelig','gemütlich','first',clock_timestamp()-interval '2 minutes');
  perform pg_temp.assert((select raw_expression='heimelig' and concept_key='mood.cozy' from public.backyrd_review_mood_expressions_v1 where review_id=r1 and slot=1),'raw expression/canonical layer not preserved');
  perform pg_temp.assert((select resolution_status='INVALID' and invalid_reason='DUPLICATE_CONCEPT' from public.backyrd_review_mood_expressions_v1 where review_id=r1 and slot=2),'same concept occupied both slots');
  perform pg_temp.assert((select count(*)=1 from public.backyrd_spot_mood_contribution_concepts_v1 cc join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id where c.source_review_id=r1),'duplicate canonical vote counted');
  perform pg_temp.assert((select evidence_state='EARLY' and eligible_contributors=1 and percentage=100 from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),'low-sample evidence state/math failed');
  perform pg_temp.assert((select evidence_state='EARLY' and eligible_contributors is null and concept_contributors is null and percentage is null from public.backyrd_spot_mood_profile_public_v1 where spot_id=s and concept_key='mood.cozy'),'public low-sample evidence was not privacy-safe');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_decision_community_mood_signal_v1(array[s],'heimelig',null,null)),'low evidence produced Decision signal');

  insert into public.reviews(id,spot_id,user_id,mood_a,mood_b,text,created_at) values
    (r2,s,u1,'gemütlich','lebendig','updated',clock_timestamp()-interval '1 minute');
  perform pg_temp.assert((select source_review_id=r2 from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=u1),'latest eligible lineage anchor not current');
  perform pg_temp.assert((select eligible_mood_review_count=2 from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=u1),'multi-visit user evidence did not retain both Mood-bearing Reviews');
  perform pg_temp.assert((select concept_contributors=1 and community_score=1 from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),'one user was amplified as multiple contributors');
  perform pg_temp.assert((select count(*)=2 from public.backyrd_spot_mood_contribution_concepts_v1 cc join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id where c.spot_id=s and c.user_id=u1),'two distinct Moods not equally retained');

  insert into public.reviews(spot_id,user_id,text,created_at) values(s,u1,'newer review without mood',clock_timestamp());
  perform pg_temp.assert((select source_review_id=r2 from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=u1),'Mood-empty review erased prior perception');
  insert into public.reviews(id,spot_id,user_id,mood_a,mood_b,created_at) values
    (r3,s,u2,'cozy','urban',clock_timestamp()),(r4,s,u3,'heimelig','poetisch',clock_timestamp());
  perform pg_temp.assert((select count(*)=3 from public.backyrd_spot_mood_contributions_v1 where spot_id=s),'denominator is not unique current contributors');
  perform pg_temp.assert((select eligible_contributors=3 and concept_contributors=3 and percentage=100 and evidence_state='ESTABLISHED' from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),'established percentage denominator failed');
  perform pg_temp.assert((select eligible_contributors=3 and concept_contributors=1 and community_score=.5 and percentage=16.67 from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.lively'),'normalized multi-visit Mood score was not averaged across unique users');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='poetisch'),'unresolved expression influenced profile');
  perform pg_temp.assert((select signal_strength=1 and eligible_contributors=3 and matched_concepts->0->>'conceptKey'='mood.cozy' from public.backyrd_decision_community_mood_signal_v1(array[s],'etwas heimeliges',null,null)),'established canonical Mood did not produce bounded Decision signal');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_decision_community_mood_signal_v1(array[pg_temp.id('no-mood-spot')],'gemütlich',null,null)),'missing Mood evidence was not neutral');

  update public.safety_content_items set lifecycle_status='removed' where entity_type='review' and entity_id=r3;
  perform pg_temp.assert((select count(*)=2 from public.backyrd_spot_mood_contributions_v1 where spot_id=s),'removed review still contributes');
  perform pg_temp.assert((select eligible_contributors=2 and evidence_state='EARLY' from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),'moderation did not rebuild profile');
  update public.safety_content_items set lifecycle_status='live' where entity_type='review' and entity_id=r3;
  perform pg_temp.assert((select count(*)=3 from public.backyrd_spot_mood_contributions_v1 where spot_id=s),'restored review did not re-enter profile');

  perform public.backyrd_rebuild_spot_mood_profile_v1(s);
  perform pg_temp.assert((select eligible_contributors=3 and concept_contributors=3 and percentage=100 from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),'deterministic rebuild changed result');
  perform pg_temp.assert((select count(*)=taste_before from public.backyrd_self_declared_taste_v1 where user_id=u1),'Review Mood mutated persistent Taste');
  perform pg_temp.assert((select count(*)=n4_before from public.backyrd_spot_intelligence_evidence_v1 where spot_id=s),'Review Mood wrote N4 evidence');
  perform pg_temp.assert((select count(*)=accepted_fact_before from public.backyrd_spot_accepted_facts_v1 where spot_id=s),'Review Mood wrote accepted/Gold truth');
end$$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id('mood-user-1'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',pg_temp.id('mood-user-1')::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$begin
  perform pg_temp.assert((select count(*)=0 from public.backyrd_spot_mood_profile_v1 where spot_id=pg_temp.id('mood-spot')),'normal user can enumerate canonical aggregate base rows');
  perform pg_temp.assert((select count(*)>0 from public.backyrd_spot_mood_profile_public_v1 where spot_id=pg_temp.id('mood-spot')),'privacy-safe public Mood projection is unavailable');
  begin
    insert into public.reviews(spot_id,user_id,mood_a) values(pg_temp.id('mood-spot'),pg_temp.id('mood-user-2'),'ruhig');
    raise exception 'foreign user review insert succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.backyrd_admin_resolve_mood_candidate_v1('poetisch','MAP_ALIAS','mood.creative',null,null,'unauthorized test');
    raise exception 'normal user resolved taxonomy';
  exception when insufficient_privilege then null; end;
end$$;
reset role;

rollback;
