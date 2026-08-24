\set ON_ERROR_STOP on
begin;

create function pg_temp.gating_uuid(p_value text) returns uuid language sql immutable as $$
  select (substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||'-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12))::uuid
$$;
create function pg_temp.gating_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'fresh user gating failed: %', p_message; end if;
end
$$;
create function pg_temp.gating_actor(p_user uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end
$$;

do $$
declare
  v_user uuid := pg_temp.gating_uuid('user');
  v_admin uuid := pg_temp.gating_uuid('admin');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','gating@invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_admin,'authenticated','authenticated','gating-admin@invalid','','{}','{}',now(),now());
  update public.profiles set is_admin = true where id = v_admin;
  insert into public.consent_purposes(key,title_de,description_de,category,legal_basis,requires_consent,is_required,default_enabled,sort_order,is_active)
  values('personalized_recommendations','P','P','personalization','consent',true,false,false,1,true)
  on conflict do nothing;
  insert into public.spots(id,name,lat,lng,status,city,data_origin) values
    (pg_temp.gating_uuid('real'),'Real Basel Spot',47.5,7.5,'approved','Basel','REAL'),
    (pg_temp.gating_uuid('fixture'),'S4 Fixture',47.5,7.5,'approved','Basel','FIXTURE'),
    (pg_temp.gating_uuid('test'),'S4 Test',47.5,7.5,'approved','Basel','TEST'),
    (pg_temp.gating_uuid('archived'),'Archived Real',47.5,7.5,'archived','Basel','REAL');
end
$$;

select pg_temp.gating_assert(
  has_function_privilege('authenticated','public.get_my_product_entry_status_v1()','execute'),
  'authenticated cannot read canonical Product-entry status'
);
select pg_temp.gating_assert(
  not has_function_privilege('anon','public.get_my_product_entry_status_v1()','execute'),
  'anonymous can read authenticated Product-entry status'
);

set local role authenticated;
select pg_temp.gating_actor(pg_temp.gating_uuid('user'), 'authenticated');
select pg_temp.gating_assert(
  (public.get_my_product_entry_status_v1()->>'needsProfileOnboarding')::boolean
  and not (public.get_my_product_entry_status_v1()->>'needsDecisionOnboarding')::boolean,
  'fresh account did not route to Profile Basics'
);

reset role;
update public.profiles
set profile_onboarding_completed_at = now(), onboarding_version = 'profile-onboarding-v2'
where id = pg_temp.gating_uuid('user');
set local role authenticated;
select pg_temp.gating_actor(pg_temp.gating_uuid('user'), 'authenticated');
select pg_temp.gating_assert(
  not (public.get_my_product_entry_status_v1()->>'needsProfileOnboarding')::boolean
  and (public.get_my_product_entry_status_v1()->>'needsDecisionOnboarding')::boolean
  and not (public.get_my_product_entry_status_v1()->>'canEnterDecision')::boolean,
  'Profile-only account did not route to Taste onboarding'
);

reset role;
update public.profiles
set decision_onboarding_completed_at = now(), onboarding_version = 'canonical-semantics-v1'
where id = pg_temp.gating_uuid('user');
insert into public.user_consents(user_id,purpose_key,status,granted_at,source)
values(pg_temp.gating_uuid('user'),'personalized_recommendations','granted',now(),'system_migration');
set local role authenticated;
select pg_temp.gating_actor(pg_temp.gating_uuid('user'), 'authenticated');
select pg_temp.gating_assert(
  (public.get_my_product_entry_status_v1()->>'tasteOnboardingComplete')::boolean
  and (public.get_my_product_entry_status_v1()->>'personalizationConsentValid')::boolean
  and (public.get_my_product_entry_status_v1()->>'canEnterDecision')::boolean
  and public.get_my_product_entry_status_v1()->>'nextRoute' = '/(tabs)',
  'completed canonical onboarding did not enter Decision'
);

reset role;
do $$
declare
  v_before_declared integer;
  v_before_memory integer;
  v_result jsonb;
begin
  select count(*) into v_before_declared from public.backyrd_self_declared_taste_v1 where user_id = pg_temp.gating_uuid('user');
  select count(*) into v_before_memory from public.backyrd_memory_events_v1 where user_id = pg_temp.gating_uuid('user');
  v_result := public.complete_decision_onboarding_v2(
    'Basel',
    array[pg_temp.gating_uuid('fixture'),pg_temp.gating_uuid('test'),gen_random_uuid()]
  );
  perform pg_temp.gating_assert((v_result->>'alreadyCompleted')::boolean, 'response-loss retry was not treated as completed');
  perform pg_temp.gating_assert(
    (select count(*) = v_before_declared from public.backyrd_self_declared_taste_v1 where user_id = pg_temp.gating_uuid('user'))
    and (select count(*) = v_before_memory from public.backyrd_memory_events_v1 where user_id = pg_temp.gating_uuid('user')),
    'repeat navigation created duplicate onboarding Evidence'
  );
end
$$;

set local role authenticated;
select pg_temp.gating_actor(pg_temp.gating_uuid('user'), 'authenticated');
select pg_temp.gating_assert(
  (select count(*) = 1 from public.spots where city = 'Basel' and id in (
    pg_temp.gating_uuid('real'),pg_temp.gating_uuid('fixture'),pg_temp.gating_uuid('test'),pg_temp.gating_uuid('archived')
  )),
  'normal authenticated Product read exposed a fixture, test, or archived Spot'
);
reset role;

set local role anon;
select pg_temp.gating_actor(null, 'anon');
select pg_temp.gating_assert(
  (select count(*) = 1 from public.spots where city = 'Basel' and id in (
    pg_temp.gating_uuid('real'),pg_temp.gating_uuid('fixture'),pg_temp.gating_uuid('test'),pg_temp.gating_uuid('archived')
  )),
  'anonymous Product read exposed a fixture, test, or archived Spot'
);
reset role;

set local role authenticated;
select pg_temp.gating_actor(pg_temp.gating_uuid('admin'), 'authenticated');
select pg_temp.gating_assert(
  (select count(*) = 3 from public.spots where id in (
    pg_temp.gating_uuid('real'),pg_temp.gating_uuid('fixture'),pg_temp.gating_uuid('test')
  )),
  'Founder/Admin internal fixture access was not preserved'
);
reset role;

select pg_temp.gating_assert(
  (select not eligible from public.distribution_trust_filter_entities_v1(
    'spot', array[pg_temp.gating_uuid('fixture')], 'decision'
  )),
  'Decision surface still admits fixture Spots'
);
select pg_temp.gating_assert(
  (select eligible from public.distribution_trust_filter_entities_v1(
    'spot', array[pg_temp.gating_uuid('fixture')], 'internal'
  )),
  'internal Decision-Lab fixture access was not preserved'
);
select pg_temp.gating_assert(
  position('data_origin' in lower(pg_get_functiondef('public.get_mobile_spot_taxonomy_v1(uuid,text)'::regprocedure))) > 0
  and position('fixture' in lower(pg_get_functiondef('public.get_mobile_spot_taxonomy_v1(uuid,text)'::regprocedure))) > 0
  and position('test' in lower(pg_get_functiondef('public.get_mobile_spot_taxonomy_v1(uuid,text)'::regprocedure))) > 0,
  'mobile taxonomy detail lacks Product fixture boundary'
);
select pg_temp.gating_assert(
  position('data_origin' in lower(pg_get_functiondef('public.search_mobile_taxonomy_spots_v1(text,text,integer)'::regprocedure))) > 0
  and position('fixture' in lower(pg_get_functiondef('public.search_mobile_taxonomy_spots_v1(text,text,integer)'::regprocedure))) > 0
  and position('test' in lower(pg_get_functiondef('public.search_mobile_taxonomy_spots_v1(text,text,integer)'::regprocedure))) > 0,
  'mobile taxonomy search lacks Product fixture boundary'
);

rollback;
