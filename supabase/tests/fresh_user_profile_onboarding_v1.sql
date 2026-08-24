\set ON_ERROR_STOP on
begin;

create function pg_temp.onboarding_uuid(p_value text) returns uuid language sql immutable as $$
  select (substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||'-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12))::uuid
$$;
create function pg_temp.onboarding_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'fresh user onboarding failed: %', p_message; end if;
end
$$;
create function pg_temp.onboarding_actor(p_user uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end
$$;

do $$
declare
  v_user uuid := pg_temp.onboarding_uuid('profile-user');
  v_other uuid := pg_temp.onboarding_uuid('profile-other');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','profile-user@invalid','','{}','{"first_name":"Initial"}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_other,'authenticated','authenticated','profile-other@invalid','','{}','{"first_name":"Other"}',now(),now());

  perform pg_temp.onboarding_assert(
    exists(select 1 from public.profiles where id = v_user),
    'auth signup did not create the profile row'
  );
  update public.profiles set username = 'reserved.name' where id = v_other;
end
$$;

select pg_temp.onboarding_assert(
  has_function_privilege('authenticated','public.complete_profile_onboarding_v2(text,text,integer,text,text)','execute'),
  'authenticated cannot execute Profile Basics RPC'
);
select pg_temp.onboarding_assert(
  not has_function_privilege('anon','public.complete_profile_onboarding_v2(text,text,integer,text,text)','execute'),
  'anonymous can execute Profile Basics RPC'
);
select pg_temp.onboarding_assert(
  (select array_agg(a order by a) = array['p_age','p_city','p_country','p_display_name','p_username']::text[]
   from unnest((select proargnames from pg_proc where oid='public.complete_profile_onboarding_v2(text,text,integer,text,text)'::regprocedure)) a),
  'Profile Basics RPC exposes a non-whitelisted argument'
);

set local role authenticated;
select pg_temp.onboarding_actor(pg_temp.onboarding_uuid('profile-user'), 'authenticated');

-- Exact old failure shape: PostgREST upsert includes id in the conflict UPDATE.
do $$begin
  begin
    insert into public.profiles(id,display_name,username,city,country)
    values(pg_temp.onboarding_uuid('profile-user'),'Unsafe direct path','unsafe','Basel','Schweiz')
    on conflict(id) do update set id=excluded.id,display_name=excluded.display_name,username=excluded.username,city=excluded.city,country=excluded.country;
    raise exception 'direct profile upsert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end$$;

select pg_temp.onboarding_assert(
  (public.complete_profile_onboarding_v2(' Buddy  Test ','buddy.test',31,' Basel ',' Schweiz ')->>'ok')::boolean,
  'own Profile Basics save failed'
);
select pg_temp.onboarding_assert(
  exists(
    select 1 from public.profiles p
    where p.id=pg_temp.onboarding_uuid('profile-user')
      and p.display_name='Buddy Test'
      and p.first_name='Buddy Test'
      and p.username='buddy.test'
      and p.city='Basel'
      and p.home_city='Basel'
      and p.country='Schweiz'
      and p.contact_email='profile-user@invalid'
      and p.birthdate is not null
      and p.profile_onboarding_completed_at is not null
      and p.decision_onboarding_completed_at is null
  ),
  'Profile Basics values or checkpoint were not persisted'
);
reset role;
select pg_temp.onboarding_assert(
  not exists(select 1 from public.user_consents where user_id=pg_temp.onboarding_uuid('profile-user'))
  and not exists(select 1 from public.backyrd_self_declared_taste_v1 where user_id=pg_temp.onboarding_uuid('profile-user'))
  and not exists(select 1 from public.backyrd_memory_events_v1 where user_id=pg_temp.onboarding_uuid('profile-user'))
  and not exists(select 1 from public.backyrd_user_intelligence_latest_v1 where user_id=pg_temp.onboarding_uuid('profile-user')),
  'Profile Basics created consent, Taste, N2, or a User Card'
);

set local role authenticated;
select pg_temp.onboarding_actor(pg_temp.onboarding_uuid('profile-user'), 'authenticated');
do $$declare v_completed timestamptz;begin
  select profile_onboarding_completed_at into v_completed from public.profiles where id=pg_temp.onboarding_uuid('profile-user');
  perform public.complete_profile_onboarding_v2('Buddy Test','buddy.test',31,'Basel','Schweiz');
  perform pg_temp.onboarding_assert(
    (select profile_onboarding_completed_at=v_completed from public.profiles where id=pg_temp.onboarding_uuid('profile-user')),
    'response-loss retry changed the lifecycle checkpoint'
  );
end$$;

do $$begin
  begin
    perform public.complete_profile_onboarding_v2('Buddy Test','reserved.name',31,'Basel','Schweiz');
    raise exception 'username collision accepted';
  exception when unique_violation then null;
  end;
  perform pg_temp.onboarding_assert(
    (select username='buddy.test' from public.profiles where id=pg_temp.onboarding_uuid('profile-user')),
    'username collision overwrote the current profile'
  );
end$$;

do $$begin
  begin
    update public.profiles set is_admin=true where id=pg_temp.onboarding_uuid('profile-user');
    raise exception 'authenticated user changed is_admin';
  exception when insufficient_privilege then null;
  end;
end$$;

select pg_temp.onboarding_actor(pg_temp.onboarding_uuid('profile-other'), 'authenticated');
select public.complete_profile_onboarding_v2('Other User','other.user',29,'Riehen','Schweiz');
reset role;
select pg_temp.onboarding_assert(
  (select username='buddy.test' and city='Basel' from public.profiles where id=pg_temp.onboarding_uuid('profile-user')),
  'other user changed the target profile'
);

-- Decision Taste onboarding must fail before writes without explicit consent.
set local role authenticated;
select pg_temp.onboarding_actor(pg_temp.onboarding_uuid('profile-user'), 'authenticated');
do $$begin
  begin
    perform public.complete_decision_onboarding_v2('Basel',array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]);
    raise exception 'Taste onboarding accepted without personalization consent';
  exception when insufficient_privilege then null;
  end;
end$$;
select pg_temp.onboarding_assert(
  not exists(select 1 from public.backyrd_self_declared_taste_v1 where user_id=pg_temp.onboarding_uuid('profile-user'))
  and not exists(select 1 from public.backyrd_memory_events_v1 where user_id=pg_temp.onboarding_uuid('profile-user'))
  and (select decision_onboarding_completed_at is null from public.profiles where id=pg_temp.onboarding_uuid('profile-user')),
  'failed Taste onboarding left partial learning state'
);
reset role;

select pg_temp.onboarding_actor(null, 'anon');
set local role anon;
do $$begin
  begin
    perform public.complete_profile_onboarding_v2('Anon User','anon.user',31,'Basel','Schweiz');
    raise exception 'anonymous Profile Basics save succeeded';
  exception when insufficient_privilege or invalid_authorization_specification then null;
  end;
end$$;
reset role;

rollback;
