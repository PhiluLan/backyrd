\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Mood Founder acceptance closure failed: %',p_message; end if; end$$;

select pg_temp.assert((public.backyrd_resolve_mood_input_v2('Schick')->>'conceptKey')='mood.elegant','Schick did not resolve to canonical Elegant');

set local role anon;
select pg_temp.assert(
  (select count(*)>0 from public.backyrd_search_mood_concepts_v1('Gemüt','de',8) where concept_key='mood.cozy'),
  'public canonical autocomplete returned no Gemütlich suggestion'
);
select pg_temp.assert(
  not has_table_privilege('anon','public.backyrd_spot_mood_profile_v1','select'),
  'autocomplete weakened aggregate base ACL'
);
reset role;

do $$
declare
  v_spot uuid := '76000000-0000-4000-8000-000000000001';
  v_user_resolved uuid := '76000000-0000-4000-8000-000000000002';
  v_user_unresolved uuid := '76000000-0000-4000-8000-000000000003';
  v_user_invalid uuid := '76000000-0000-4000-8000-000000000004';
  v_review_resolved uuid := '76000000-0000-4000-8000-000000000005';
  v_review_unresolved uuid := '76000000-0000-4000-8000-000000000006';
  v_review_invalid uuid := '76000000-0000-4000-8000-000000000007';
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',v_user_resolved,'authenticated','authenticated','mood-founder-resolved@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_user_unresolved,'authenticated','authenticated','mood-founder-unresolved@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_user_invalid,'authenticated','authenticated','mood-founder-invalid@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(v_user_resolved),(v_user_unresolved),(v_user_invalid) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status,city,data_origin)
    values(v_spot,'Mood Founder Acceptance Spot',47.0,7.0,'approved','Basel','LEGACY');

  insert into public.reviews(id,spot_id,user_id,mood_a,text) values
    (v_review_resolved,v_spot,v_user_resolved,'Schick','raw/canonical fixture'),
    (v_review_unresolved,v_spot,v_user_unresolved,'Einmalig poetisch','single unresolved fixture'),
    (v_review_invalid,v_spot,v_user_invalid,'Kaffee','invalid non-Mood fixture');

  perform pg_temp.assert((select raw_expression='Schick' and resolution_status='RESOLVED' and concept_key='mood.elegant'
    from public.backyrd_review_mood_expressions_v1 where review_id=v_review_resolved and slot=1),'raw Schick/canonical Elegant separation regressed');
  perform pg_temp.assert((select raw_expression='Einmalig poetisch' and resolution_status='UNRESOLVED'
    from public.backyrd_review_mood_expressions_v1 where review_id=v_review_unresolved and slot=1),'unresolved state was not preserved');
  perform pg_temp.assert((select usage_count=1 from public.backyrd_mood_unresolved_candidates_v1
    where normalized_expression='einmalig poetisch'),'single unresolved expression disappeared from governance');
  perform pg_temp.assert((select raw_expression='Kaffee' and resolution_status='INVALID' and invalid_reason='NOT_A_MOOD'
    from public.backyrd_review_mood_expressions_v1 where review_id=v_review_invalid and slot=1),'invalid non-Mood state was not traceable');
  perform pg_temp.assert((select concept_key='mood.elegant' and evidence_state='EARLY'
    from public.backyrd_spot_mood_profile_v1 where spot_id=v_spot),'resolved Mood did not update canonical profile');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_spot_mood_profile_v1 p
    where p.spot_id=v_spot and p.concept_key in ('einmalig poetisch','kaffee')),'unresolved/invalid evidence entered Community profile');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_self_declared_taste_v1 where user_id in (v_user_resolved,v_user_unresolved,v_user_invalid)),'Mood wrote Taste');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_spot_intelligence_evidence_v1 where spot_id=v_spot),'Mood wrote N4');
  perform pg_temp.assert(not exists(select 1 from public.backyrd_spot_accepted_facts_v1 where spot_id=v_spot),'Mood wrote Gold');
end$$;

rollback;
