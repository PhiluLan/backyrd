\set ON_ERROR_STOP on
begin;

create function pg_temp.gate5_uuid(p_value text) returns uuid language sql immutable as $$
  select (substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||'-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12))::uuid
$$;
create function pg_temp.gate5_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'Gate 5 core journeys failed: %', p_message; end if;
end
$$;
create function pg_temp.gate5_actor(p_user uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.role', p_role, true);
end
$$;

select pg_temp.gate5_assert(
  not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='user_achievements'
      and policyname='Allow all read during dev'
  ),
  'development achievement policy still exists'
);
select pg_temp.gate5_assert(
  not has_table_privilege('anon','public.user_achievements','select'),
  'anonymous role can read user achievement assignments'
);
select pg_temp.gate5_assert(
  has_table_privilege('authenticated','public.user_achievements','select'),
  'authenticated owner cannot read achievement assignments'
);
select pg_temp.gate5_assert(
  not has_table_privilege('authenticated','public.user_achievements','insert')
  and not has_table_privilege('authenticated','public.user_achievements','update')
  and not has_table_privilege('authenticated','public.user_achievements','delete'),
  'client can mutate achievement assignments directly'
);

do $$
declare
  v_a uuid := pg_temp.gate5_uuid('gate5-achievement-a');
  v_b uuid := pg_temp.gate5_uuid('gate5-achievement-b');
  v_achievement uuid := pg_temp.gate5_uuid('gate5-achievement');
begin
  insert into auth.users(instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    ('00000000-0000-0000-0000-000000000000',v_a,'authenticated','authenticated','gate5-a@invalid','','{}','{}',now(),now()),
    ('00000000-0000-0000-0000-000000000000',v_b,'authenticated','authenticated','gate5-b@invalid','','{}','{}',now(),now());
  insert into public.achievements(id,code,name,type,threshold)
  values(v_achievement,'gate5-private-assignment','Gate 5','review',1);
  insert into public.user_achievements(user_id,achievement_id)
  values(v_b,v_achievement);
end
$$;

set local role authenticated;
select pg_temp.gate5_actor(pg_temp.gate5_uuid('gate5-achievement-a'),'authenticated');
select pg_temp.gate5_assert(
  not exists (
    select 1 from public.user_achievements
    where user_id=pg_temp.gate5_uuid('gate5-achievement-b')
  ),
  'user A can read user B achievement assignment'
);

select pg_temp.gate5_actor(pg_temp.gate5_uuid('gate5-achievement-b'),'authenticated');
select pg_temp.gate5_assert(
  exists (
    select 1 from public.user_achievements
    where user_id=pg_temp.gate5_uuid('gate5-achievement-b')
      and achievement_id=pg_temp.gate5_uuid('gate5-achievement')
  ),
  'owner cannot read own achievement assignment'
);
reset role;

select pg_temp.gate5_assert(
  has_function_privilege('authenticated','public.set_my_profile_privacy_v1(boolean)','execute'),
  'authenticated user cannot execute the existing profile privacy RPC'
);

rollback;
