-- Backyrd canonical auth.users lifecycle hook.
-- Apply only after the canonical database migration.
-- This intentionally replaces the two overlapping production hooks with one hook.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_avatar_url text;
  v_email text;
begin
  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), '');
  v_last_name := nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), '');
  v_avatar_url := nullif(trim(coalesce(new.raw_user_meta_data->>'avatar_url', '')), '');
  v_email := nullif(trim(coalesce(new.email, new.raw_user_meta_data->>'email', '')), '');
  v_display_name := nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '');

  insert into public.profiles (
    id, first_name, last_name, display_name, avatar_url, contact_email, created_at, updated_at
  ) values (
    new.id, v_first_name, v_last_name, v_display_name, v_avatar_url, v_email, now(), now()
  )
  on conflict (id) do update set
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    contact_email = coalesce(public.profiles.contact_email, excluded.contact_email),
    updated_at = now();

  if tg_op = 'INSERT' then
    perform public.account_trust_evaluate_identity_user_v1(new.id, now());
  elsif new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform public.account_trust_evaluate_identity_user_v1(new.id, now());
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

-- Keep the historical function for forensic compatibility, but make it non-callable.
revoke all on function public.handle_new_user_profile()
  from public, anon, authenticated, service_role;
comment on function public.handle_new_user_profile() is
  'Deprecated: auth lifecycle is consolidated in public.handle_new_user().';

create trigger on_auth_user_created
after insert or update of email_confirmed_at on auth.users
for each row
execute function public.handle_new_user();
