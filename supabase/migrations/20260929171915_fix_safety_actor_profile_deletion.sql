-- Keep Safety attribution for live authors, but never resurrect a profile
-- reference cleared by ON DELETE SET NULL during Auth account deletion.
-- Existing RLS, grants, FK actions and Safety evidence remain unchanged.
create or replace function public.safety_sync_content_actor_v2()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_actor_user_id uuid;
begin
  if new.entity_id is null then
    return new;
  end if;

  if new.entity_type = 'review' then
    select user_id into v_actor_user_id from public.reviews where id = new.entity_id;
  elsif new.entity_type = 'social_post' then
    select user_id into v_actor_user_id from public.social_posts where id = new.entity_id;
  elsif new.entity_type = 'social_comment' then
    select user_id into v_actor_user_id from public.social_comments where id = new.entity_id;
  elsif new.entity_type = 'profile' then
    v_actor_user_id := new.entity_id;
  end if;

  if v_actor_user_id is not null then
    -- During a cascading deletion the profile has already disappeared from
    -- this transaction, even if an entity still carries its former UUID.
    select p.id into new.actor_user_id
    from public.profiles p where p.id = v_actor_user_id;
  end if;

  return new;
end;
$$;
