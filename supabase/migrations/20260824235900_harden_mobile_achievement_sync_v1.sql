begin;

create or replace function public.backyrd_sync_my_achievements_v1()
returns table(
  id uuid,
  code text,
  name text,
  description text,
  icon_url text,
  tier integer,
  type text,
  threshold integer,
  achieved_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_review_count integer;
  v_spot_count integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select count(*)::integer into v_review_count
  from public.reviews r
  where r.user_id = v_user_id;

  select count(*)::integer into v_spot_count
  from public.spots s
  where s.created_by = v_user_id;

  return query
  with eligible as (
    select a.*
    from public.achievements a
    where (a.type = 'review' and v_review_count >= coalesce(a.threshold, 1))
       or (a.type = 'spot' and v_spot_count >= coalesce(a.threshold, 1))
  ), inserted as (
    insert into public.user_achievements(user_id, achievement_id, achieved_at)
    select v_user_id, e.id, now()
    from eligible e
    on conflict (user_id, achievement_id) do nothing
    returning achievement_id, user_achievements.achieved_at
  )
  select e.id, e.code, e.name, e.description, e.icon_url, e.tier,
         e.type, e.threshold, i.achieved_at
  from inserted i
  join eligible e on e.id = i.achievement_id
  order by e.tier nulls last, e.threshold nulls last, e.code;
end;
$$;

revoke all on function public.backyrd_sync_my_achievements_v1() from public, anon;
grant execute on function public.backyrd_sync_my_achievements_v1() to authenticated, service_role;

comment on function public.backyrd_sync_my_achievements_v1() is
  'Idempotently awards the authenticated user existing review/spot achievements; never accepts a client user id.';

commit;
