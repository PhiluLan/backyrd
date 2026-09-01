\set ON_ERROR_STOP on
begin;

create function pg_temp.assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'Mood final Founder closure failed: %',p_message; end if; end$$;

do $$
declare
  s_limit uuid := '77000000-0000-4000-8000-000000000001';
  s_next uuid := '77000000-0000-4000-8000-000000000002';
  u_a uuid := '77000000-0000-4000-8000-000000000011';
  u_b uuid := '77000000-0000-4000-8000-000000000012';
  r_yesterday uuid := '77000000-0000-4000-8000-000000000021';
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',u_a,'authenticated','authenticated','mood-final-a@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',u_b,'authenticated','authenticated','mood-final-b@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(u_a),(u_b) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status,city,data_origin) values
    (s_limit,'Same-day Limit Spot',47.0,7.0,'approved','Basel','LEGACY'),
    (s_next,'Next-day Limit Spot',47.0,7.0,'approved','Basel','LEGACY');

  -- A preserved historical visit plus yesterday's publication reservation
  -- proves that a new local calendar day is a new legitimate visit.
  insert into public.reviews(id,spot_id,user_id,mood_a,text,created_at,data_origin)
  values(r_yesterday,s_next,u_a,'gemütlich','yesterday visit',now()-interval '1 day','REAL');
  insert into public.backyrd_review_daily_publications_v1(
    user_id,spot_id,local_day,review_id,reservation_origin,created_at
  ) values(
    u_a,s_next,((clock_timestamp() at time zone 'Europe/Zurich')::date-1),r_yesterday,
    'HISTORY_RECONCILIATION',now()-interval '1 day'
  );
end$$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','77000000-0000-4000-8000-000000000011','role','authenticated'
)::text,true);
select set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000011',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into public.reviews(spot_id,user_id,mood_a,text)
values(
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000011',
  'gemütlich','first publication today'
);

do $$
declare v_before integer;
begin
  select count(*) into v_before from public.reviews
  where spot_id='77000000-0000-4000-8000-000000000001'
    and user_id='77000000-0000-4000-8000-000000000011';
  begin
    insert into public.reviews(spot_id,user_id,mood_a,text)
    values(
      '77000000-0000-4000-8000-000000000001',
      '77000000-0000-4000-8000-000000000011',
      'urban','must be blocked'
    );
    raise exception 'same-day Review was accepted';
  exception when raise_exception then
    if sqlerrm <> 'REVIEW_SAME_DAY_LIMIT' then raise; end if;
  end;
  perform pg_temp.assert((select count(*)=v_before from public.reviews
    where spot_id='77000000-0000-4000-8000-000000000001'
      and user_id='77000000-0000-4000-8000-000000000011'),
    'blocked publication inserted/overwrote Review history');
end$$;

-- Same user and Spot on a different local day is allowed.
insert into public.reviews(spot_id,user_id,mood_a,text)
values(
  '77000000-0000-4000-8000-000000000002',
  '77000000-0000-4000-8000-000000000011',
  'urban','next local day visit'
);

-- The same Spot/day remains available to a different user.
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','77000000-0000-4000-8000-000000000012','role','authenticated'
)::text,true);
select set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000012',true);
insert into public.reviews(spot_id,user_id,mood_a,text)
values(
  '77000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000012',
  'ruhig','different user today'
);
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','',true);

select pg_temp.assert(
  (select count(*)=1 from pg_constraint
   where conrelid='public.backyrd_review_daily_publications_v1'::regclass
     and contype='p'
     and pg_get_constraintdef(oid)='PRIMARY KEY (user_id, spot_id, local_day)'),
  'database uniqueness does not serialize parallel same-day requests'
);
select pg_temp.assert(
  not has_any_column_privilege('authenticated','public.backyrd_review_daily_publications_v1','select')
  and not has_table_privilege('authenticated','public.backyrd_review_daily_publications_v1','insert,update,delete,truncate,references,trigger')
  and not has_any_column_privilege('anon','public.backyrd_review_daily_publications_v1','select')
  and not has_table_privilege('anon','public.backyrd_review_daily_publications_v1','insert,update,delete,truncate,references,trigger'),
  'anon/authenticated can read or forge publication reservations'
);
select pg_temp.assert(
  not has_function_privilege('anon','public.backyrd_enforce_review_daily_publication_v1()','execute')
  and not has_function_privilege('authenticated','public.backyrd_enforce_review_daily_publication_v1()','execute'),
  'client can invoke the internal publication trigger function'
);

do $$
declare
  s uuid := '78000000-0000-4000-8000-000000000001';
  ua uuid := '78000000-0000-4000-8000-000000000011';
  ub uuid := '78000000-0000-4000-8000-000000000012';
  uc uuid := '78000000-0000-4000-8000-000000000013';
  r1 uuid := '78000000-0000-4000-8000-000000000021';
  r2 uuid := '78000000-0000-4000-8000-000000000022';
  r3 uuid := '78000000-0000-4000-8000-000000000023';
  r4 uuid := '78000000-0000-4000-8000-000000000024';
  r5 uuid := '78000000-0000-4000-8000-000000000025';
  taste_before bigint;n4_before bigint;gold_before bigint;history_before bigint;
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','multi-a@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','multi-b@test.invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',uc,'authenticated','authenticated','multi-c@test.invalid','','{}','{}',now(),now());
  insert into public.profiles(id) values(ua),(ub),(uc) on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status,city,data_origin)
  values(s,'Multi-visit Mood Spot',47.0,7.0,'approved','Basel','LEGACY');

  select count(*) into taste_before from public.backyrd_self_declared_taste_v1 where user_id=ua;
  select count(*) into n4_before from public.backyrd_spot_intelligence_evidence_v1 where spot_id=s;
  select count(*) into gold_before from public.backyrd_spot_accepted_facts_v1 where spot_id=s;

  insert into public.reviews(id,spot_id,user_id,mood_a,mood_b,text,created_at) values
    (r1,s,ua,'Gemütlich','Elegant','visit 1',now()-interval '4 days'),
    (r2,s,ua,'Lebendig','Elegant','visit 2',now()-interval '3 days'),
    (r3,s,ua,'Gemütlich','Warm','visit 3',now()-interval '2 days'),
    (r4,s,ua,'Trendy','Elegant','visit 4',now()-interval '1 day');

  perform pg_temp.assert((select eligible_mood_review_count=4
    from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=ua),
    'four eligible Mood-bearing visits were not retained as user evidence');
  perform pg_temp.assert((select concept_review_count=2 and user_mood_score=.5
    from public.backyrd_spot_mood_contribution_concepts_v1 cc
    join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id
    where c.spot_id=s and c.user_id=ua and cc.concept_key='mood.cozy'),
    'repeated cozy consistency is not 2/4');
  perform pg_temp.assert((select concept_review_count=3 and user_mood_score=.75
    from public.backyrd_spot_mood_contribution_concepts_v1 cc
    join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id
    where c.spot_id=s and c.user_id=ua and cc.concept_key='mood.elegant'),
    'repeated elegant consistency is not 3/4');
  perform pg_temp.assert((select user_mood_score=.25
    from public.backyrd_spot_mood_contribution_concepts_v1 cc
    join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id
    where c.spot_id=s and c.user_id=ua and cc.concept_key='mood.warm'),
    'single warm visit is not 1/4');

  -- Moodless plus unresolved/invalid-only Reviews are preserved but never
  -- enter the valid Mood-bearing denominator.
  insert into public.reviews(spot_id,user_id,text,created_at)
  values(s,ua,'moodless visit',now());
  insert into public.reviews(spot_id,user_id,mood_a,mood_b,text,created_at)
  values(s,ua,'poetisch','Kaffee','non-canonical visit',now()+interval '1 minute');
  perform pg_temp.assert((select eligible_mood_review_count=4
    from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=ua),
    'Moodless/unresolved/invalid Review diluted user denominator');
  perform pg_temp.assert(not exists(
    select 1 from public.backyrd_spot_mood_contribution_concepts_v1 cc
    join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id
    where c.spot_id=s and c.user_id=ua and cc.concept_key in ('poetisch','kaffee')
  ),'unresolved/invalid Mood created canonical vote');

  insert into public.reviews(id,spot_id,user_id,mood_a,text,created_at)
  values(r5,s,ub,'cozy','second contributor',now());
  perform pg_temp.assert((select eligible_contributors=2 and concept_contributors=2
      and community_score=1.5 and percentage=75 and evidence_state='EARLY'
    from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),
    'community profile did not average normalized user-level scores');
  perform pg_temp.assert((select eligible_contributors=2 and concept_contributors=1
      and community_score=.75 and percentage=37.5
    from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.elegant'),
    'one frequent visitor amplified as several community users');

  select count(*) into history_before from public.reviews where spot_id=s and user_id=ua;
  update public.safety_content_items set lifecycle_status='removed'
  where entity_type='review' and entity_id=r1;
  perform pg_temp.assert((select eligible_mood_review_count=3
    from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=ua),
    'moderation did not remove one visit from user evidence');
  perform pg_temp.assert((select user_mood_score=(1::numeric/3)::numeric(9,8)
    from public.backyrd_spot_mood_contribution_concepts_v1 cc
    join public.backyrd_spot_mood_contributions_v1 c on c.id=cc.contribution_id
    where c.spot_id=s and c.user_id=ua and cc.concept_key='mood.cozy'),
    'moderation did not rebuild normalized consistency');
  update public.safety_content_items set lifecycle_status='live'
  where entity_type='review' and entity_id=r1;
  perform pg_temp.assert((select eligible_mood_review_count=4
    from public.backyrd_spot_mood_contributions_v1 where spot_id=s and user_id=ua),
    'restoration did not rebuild all visit evidence');
  perform pg_temp.assert((select count(*)=history_before from public.reviews where spot_id=s and user_id=ua),
    'moderation/rebuild rewrote historical Reviews');

  insert into public.reviews(spot_id,user_id,mood_a,text,created_at)
  values(s,uc,'heimelig','third unique contributor',now());
  perform pg_temp.assert((select eligible_contributors=3 and evidence_state='ESTABLISHED'
    from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),
    'low-sample threshold is not based on unique eligible users');
  perform pg_temp.assert((select percentage=83.33
    from public.backyrd_spot_mood_profile_v1 where spot_id=s and concept_key='mood.cozy'),
    'three-user community percentage is incorrect');
  perform pg_temp.assert((select signal_strength between 0 and 1
    from public.backyrd_decision_community_mood_signal_v1(array[s],'heimelig',null,null)),
    'Decision did not consume the rebuilt established canonical profile as bounded signal');

  perform pg_temp.assert((select count(*)=taste_before from public.backyrd_self_declared_taste_v1 where user_id=ua),'Mood wrote Taste');
  perform pg_temp.assert((select count(*)=n4_before from public.backyrd_spot_intelligence_evidence_v1 where spot_id=s),'Mood wrote N4');
  perform pg_temp.assert((select count(*)=gold_before from public.backyrd_spot_accepted_facts_v1 where spot_id=s),'Mood wrote Gold');
end$$;

rollback;
