-- Gate 3: bind existing, human-maintained spot_hours to deterministic
-- availability. Missing schedules remain UNKNOWN; no opening fact is inferred.

create index if not exists spot_hours_spot_id_idx on public.spot_hours(spot_id);

create or replace function public.backyrd_spot_is_open_at_v1(
  p_spot_id uuid,
  p_at timestamptz
) returns boolean
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_time time := (p_at at time zone 'Europe/Zurich')::time;
  v_day integer := extract(isodow from p_at at time zone 'Europe/Zurich')::integer;
  v_previous_day integer := case when extract(isodow from p_at at time zone 'Europe/Zurich')::integer=1 then 7 else extract(isodow from p_at at time zone 'Europe/Zurich')::integer-1 end;
begin
  if p_spot_id is null or p_at is null then return null; end if;
  if not exists(select 1 from public.spot_hours h where h.spot_id=p_spot_id) then return null; end if;

  return exists(
    select 1
    from public.spot_hours h
    where h.spot_id=p_spot_id
      and h.open_time is not null
      and h.close_time is not null
      and (
        (
          case lower(trim(h.day_of_week))
            when 'montag' then 1 when 'monday' then 1
            when 'dienstag' then 2 when 'tuesday' then 2
            when 'mittwoch' then 3 when 'wednesday' then 3
            when 'donnerstag' then 4 when 'thursday' then 4
            when 'freitag' then 5 when 'friday' then 5
            when 'samstag' then 6 when 'saturday' then 6
            when 'sonntag' then 7 when 'sunday' then 7
            else 0
          end=v_day
          and (
            (h.close_time>h.open_time and v_time>=h.open_time and v_time<h.close_time)
            or (h.close_time<=h.open_time and v_time>=h.open_time)
          )
        )
        or (
          case lower(trim(h.day_of_week))
            when 'montag' then 1 when 'monday' then 1
            when 'dienstag' then 2 when 'tuesday' then 2
            when 'mittwoch' then 3 when 'wednesday' then 3
            when 'donnerstag' then 4 when 'thursday' then 4
            when 'freitag' then 5 when 'friday' then 5
            when 'samstag' then 6 when 'saturday' then 6
            when 'sonntag' then 7 when 'sunday' then 7
            else 0
          end=v_previous_day
          and h.close_time<=h.open_time
          and v_time<h.close_time
        )
      )
  );
end
$$;

create or replace function public.spot_is_open_now_safe_v1(p_spot_id uuid)
returns boolean
language sql
stable
security invoker
set search_path=''
as $$
  select public.backyrd_spot_is_open_at_v1(p_spot_id,now())
$$;

revoke all on function public.backyrd_spot_is_open_at_v1(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.backyrd_spot_is_open_at_v1(uuid,timestamptz) to service_role;
grant execute on function public.spot_is_open_now_safe_v1(uuid) to anon,authenticated,service_role;

comment on function public.backyrd_spot_is_open_at_v1(uuid,timestamptz) is
  'Gate-3 deterministic Europe/Zurich evaluation of existing spot_hours. Missing schedules return NULL; no opening evidence is fabricated.';
comment on function public.spot_is_open_now_safe_v1(uuid) is
  'Current availability from existing spot_hours. TRUE/FALSE only with a schedule; missing hours remain UNKNOWN.';
