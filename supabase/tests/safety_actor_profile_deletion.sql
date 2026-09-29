\set ON_ERROR_STOP on
begin;

create function pg_temp.deletion_assert(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'direct user deletion: %', message; end if;
end;
$$;

insert into auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('ad291719-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'direct-delete@example.invalid', '{}', '{}', now(), now());

insert into public.safety_content_items(id, content_type, entity_type, entity_id, actor_user_id, text_content)
values ('ad291719-0000-4000-8000-000000000002', 'profile', 'profile',
  'ad291719-0000-4000-8000-000000000001', null, 'Synthetic deletion regression');

select pg_temp.deletion_assert(
  (select actor_user_id = 'ad291719-0000-4000-8000-000000000001'::uuid
   from public.safety_content_items where id = 'ad291719-0000-4000-8000-000000000002'),
  'live profile attribution was not derived');

update public.safety_content_items set actor_user_id = null
where id = 'ad291719-0000-4000-8000-000000000002';
select pg_temp.deletion_assert(
  (select actor_user_id is not null from public.safety_content_items
   where id = 'ad291719-0000-4000-8000-000000000002'),
  'live profile attribution can be silently removed');

-- backyrd:authorization-negative
set local role authenticated;
do $$begin
  begin
    delete from auth.users where id = 'ad291719-0000-4000-8000-000000000001';
    raise exception 'ordinary client deleted an Auth user';
  exception when insufficient_privilege then null;
  end;
end$$;
reset role;

-- backyrd:authorization-positive
-- Supabase Auth's database role, not an application administrator bypass.
set local role supabase_auth_admin;
delete from auth.users where id = 'ad291719-0000-4000-8000-000000000001';
reset role;

select pg_temp.deletion_assert(
  not exists(select 1 from auth.users where id = 'ad291719-0000-4000-8000-000000000001')
  and not exists(select 1 from public.profiles where id = 'ad291719-0000-4000-8000-000000000001'),
  'Auth user or profile survived deletion');
select pg_temp.deletion_assert(
  (select actor_user_id is null and text_content = 'Synthetic deletion regression'
   from public.safety_content_items where id = 'ad291719-0000-4000-8000-000000000002'),
  'Safety evidence was deleted or still references the deleted profile');

update public.safety_content_items set actor_user_id = null
where id = 'ad291719-0000-4000-8000-000000000002';
select pg_temp.deletion_assert(
  (select actor_user_id is null from public.safety_content_items
   where id = 'ad291719-0000-4000-8000-000000000002'),
  'later Safety update restored a deleted profile reference');

rollback;
