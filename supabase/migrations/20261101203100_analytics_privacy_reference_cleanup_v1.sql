begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
set local search_path=pg_catalog,public;

-- Consent still gates new/changed analytics. Removing only an identifying
-- reference must remain possible, including an FK's ON DELETE SET NULL.
create or replace function public.enforce_optional_analytics_consent_v1()
returns trigger language plpgsql security definer
set search_path=public,pg_catalog
as $$
declare v_user_id uuid;
begin
  if tg_op='UPDATE' and old.user_id is not null and new.user_id is null
    and (to_jsonb(new)-'user_id')=(to_jsonb(old)-'user_id') then
    return new;
  end if;
  v_user_id:=coalesce(new.user_id,auth.uid());
  if not public.user_has_active_consent_v1(v_user_id,'optional_product_analytics') then
    if tg_op='UPDATE' then return old; end if;
    return null;
  end if;
  return new;
end;
$$;

-- A new installation has no legacy rows. Production correction is pinned to
-- the exact 37 July events of one absent profile AND absent Auth account.
-- No account is created, no event is deleted and no payload is rewritten.
lock table public.profiles in share mode;
lock table public.analytics_events in share row exclusive mode;
do $$
declare
  orphan_count integer; target_count integer; changed_count integer;
  target_hash text; target_ids bigint[]; payload_hash text; after_hash text;
begin
  select count(*) into orphan_count from public.analytics_events e
  where e.user_id is not null and not exists(select 1 from public.profiles p where p.id=e.user_id);
  if orphan_count=0 then return; end if;
  select count(*),array_agg(e.id order by e.id),
    encode(sha256(convert_to(string_agg(e.id::text||':'||e.user_id::text,',' order by e.id),'UTF8')),'hex'),
    encode(sha256(convert_to(string_agg((to_jsonb(e)-'user_id')::text,',' order by e.id),'UTF8')),'hex')
  into target_count,target_ids,target_hash,payload_hash
  from public.analytics_events e where e.user_id is not null
    and not exists(select 1 from public.profiles p where p.id=e.user_id)
    and not exists(select 1 from auth.users u where u.id=e.user_id);
  if orphan_count<>37 or target_count<>37
    or target_hash is distinct from '730c655d436e4fc61091046078e58e6769982c5fb486a85cf5285b1aec320cf6' then
    raise exception 'analytics_reference_repair_scope_changed';
  end if;
  update public.analytics_events set user_id=null where id=any(target_ids);
  get diagnostics changed_count=row_count;
  select encode(sha256(convert_to(string_agg((to_jsonb(e)-'user_id')::text,',' order by e.id),'UTF8')),'hex')
    into after_hash from public.analytics_events e where id=any(target_ids);
  if changed_count<>37 or after_hash is distinct from payload_hash
    or (select count(*) from public.analytics_events e where id=any(target_ids) and user_id is null)<>37
    or exists(select 1 from public.analytics_events e where e.user_id is not null
      and not exists(select 1 from public.profiles p where p.id=e.user_id)) then
    raise exception 'analytics_reference_repair_verification_failed';
  end if;
end;
$$;
commit;
