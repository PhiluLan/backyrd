-- Public Google photo reads are deliberately isolated from Product truth. Keys
-- are salted hashes created in the Edge Function; raw IP addresses are never
-- stored here. Rows are short-lived operational counters only.
create table if not exists public.backyrd_public_spot_photo_rate_limits_v1 (
  scope text not null,
  bucket_key text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, bucket_key)
);

alter table public.backyrd_public_spot_photo_rate_limits_v1 enable row level security;
revoke all on table public.backyrd_public_spot_photo_rate_limits_v1 from public, anon, authenticated;
grant select, insert, update, delete on table public.backyrd_public_spot_photo_rate_limits_v1 to service_role;

create or replace function public.backyrd_consume_public_spot_photo_rate_limit_v1(
  p_scope text,
  p_bucket_key text,
  p_window_seconds integer,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_now timestamptz := now();
begin
  if nullif(btrim(p_scope), '') is null
    or nullif(btrim(p_bucket_key), '') is null
    or p_window_seconds not between 1 and 86400
    or p_limit not between 1 and 100000 then
    raise exception 'invalid_public_spot_photo_rate_limit_input' using errcode = '22023';
  end if;

  insert into public.backyrd_public_spot_photo_rate_limits_v1(
    scope, bucket_key, window_started_at, request_count, updated_at
  ) values (
    p_scope, p_bucket_key, v_now, 1, v_now
  )
  on conflict (scope, bucket_key) do update
    set window_started_at = case
          when public.backyrd_public_spot_photo_rate_limits_v1.window_started_at
            <= v_now - make_interval(secs => p_window_seconds)
          then v_now
          else public.backyrd_public_spot_photo_rate_limits_v1.window_started_at
        end,
        request_count = case
          when public.backyrd_public_spot_photo_rate_limits_v1.window_started_at
            <= v_now - make_interval(secs => p_window_seconds)
          then 1
          else public.backyrd_public_spot_photo_rate_limits_v1.request_count + 1
        end,
        updated_at = v_now
  where public.backyrd_public_spot_photo_rate_limits_v1.window_started_at
      <= v_now - make_interval(secs => p_window_seconds)
    or public.backyrd_public_spot_photo_rate_limits_v1.request_count < p_limit;

  if random() < 0.01 then
    delete from public.backyrd_public_spot_photo_rate_limits_v1
    where updated_at < v_now - interval '48 hours';
  end if;

  return found;
end;
$$;

revoke all on function public.backyrd_consume_public_spot_photo_rate_limit_v1(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.backyrd_consume_public_spot_photo_rate_limit_v1(text, text, integer, integer) to service_role;

comment on table public.backyrd_public_spot_photo_rate_limits_v1 is
  'Operational, salted-hash rate limits for the public Google Places photo read path. Not Product data.';
