-- Bound manual recurrence materialization to a rolling twelve-month window.
-- The recurrence_rule remains canonical; generated rows are a disposable
-- projection. Explicit occurrence exceptions are never deleted or replaced.

create or replace function public.regenerate_manual_event_occurrences_v1(p_event_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_event public.events_v1%rowtype;
  v_frequency text;
  v_interval integer;
  v_rule_start date;
  v_rule_until date;
  v_horizon_start date := timezone('Europe/Zurich', now())::date;
  v_horizon_end date := (timezone('Europe/Zurich', now())::date + interval '12 months')::date;
  v_count_limit integer;
  v_date date;
  v_start_time time;
  v_end_time time;
  v_start timestamptz;
  v_end timestamptz;
  v_materialized integer := 0;
  v_series_index integer := 0;
  v_scanned_days integer := 0;
  v_is_occurrence boolean;
  v_weekdays integer[];
  v_desired_indices integer[] := array[]::integer[];
begin
  select *
    into v_event
    from public.events_v1
   where id = p_event_id
     and primary_source_id = 'manual_admin';

  if not found then
    raise exception 'manual_event_not_found';
  end if;

  if v_event.recurrence_rule is null then
    raise exception 'manual_event_recurrence_rule_missing';
  end if;

  v_frequency := upper(coalesce(v_event.recurrence_rule->>'frequency', 'ONCE'));
  if v_frequency not in ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY') then
    raise exception 'manual_event_recurrence_frequency_invalid';
  end if;

  v_interval := greatest(1, coalesce((v_event.recurrence_rule->>'interval')::integer, 1));
  v_rule_start := (v_event.recurrence_rule->>'startDate')::date;
  v_rule_until := nullif(v_event.recurrence_rule->>'until', '')::date;
  v_count_limit := nullif(v_event.recurrence_rule->>'count', '')::integer;
  v_start_time := (v_event.recurrence_rule->>'startTime')::time;
  v_end_time := (v_event.recurrence_rule->>'endTime')::time;

  if v_count_limit is not null and v_count_limit < 1 then
    raise exception 'manual_event_recurrence_count_invalid';
  end if;

  select coalesce(array_agg(value::integer), array[]::integer[])
    into v_weekdays
    from jsonb_array_elements_text(coalesce(v_event.recurrence_rule->'weekdays', '[]'::jsonb));

  if v_frequency = 'WEEKLY' and cardinality(v_weekdays) = 0 then
    v_weekdays := array[extract(isodow from v_rule_start)::integer];
  end if;

  update public.event_occurrences_v1
     set status = 'ENDED',
         updated_at = now()
   where event_id = p_event_id
     and status = 'SCHEDULED'
     and end_at < now();

  v_date := v_rule_start;

  while v_date <= v_horizon_end
    and (v_rule_until is null or v_date <= v_rule_until)
    and (v_count_limit is null or v_series_index < v_count_limit)
  loop
    v_scanned_days := v_scanned_days + 1;
    if v_scanned_days > 36600 then
      raise exception 'manual_event_recurrence_range_too_large';
    end if;

    v_is_occurrence :=
      v_frequency = 'ONCE'
      or v_frequency = 'DAILY'
      or (
        v_frequency = 'WEEKLY'
        and extract(isodow from v_date)::integer = any(v_weekdays)
        and ((v_date - v_rule_start) / 7) % v_interval = 0
      )
      or (
        v_frequency = 'MONTHLY'
        and extract(day from v_date) = extract(day from v_rule_start)
        and (
          extract(year from v_date)::integer * 12
          + extract(month from v_date)::integer
          - extract(year from v_rule_start)::integer * 12
          - extract(month from v_rule_start)::integer
        ) % v_interval = 0
      );

    if v_is_occurrence then
      if v_date >= v_horizon_start then
        v_start := (v_date + v_start_time) at time zone 'Europe/Zurich';
        v_end := (
          (case when v_end_time < v_start_time then v_date + 1 else v_date end) + v_end_time
        ) at time zone 'Europe/Zurich';

        if not exists (
          select 1
            from public.event_occurrences_v1 exception_occurrence
           where exception_occurrence.event_id = p_event_id
             and exception_occurrence.is_recurrence_exception
             and (
               exception_occurrence.recurrence_index = v_series_index
               or exception_occurrence.original_start_at = v_start
             )
        ) then
          v_desired_indices := array_append(v_desired_indices, v_series_index);

          insert into public.event_occurrences_v1 (
            event_id,
            venue_id,
            start_at,
            end_at,
            status,
            source_url,
            ticket_url,
            dedupe_key,
            last_seen_at,
            published_at,
            recurrence_index,
            original_start_at
          ) values (
            v_event.id,
            v_event.primary_venue_id,
            v_start,
            v_end,
            case when v_event.status = 'CANCELLED' then 'CANCELLED' else 'SCHEDULED' end,
            coalesce(v_event.external_url, v_event.source_url),
            null,
            md5(v_event.id::text || ':' || v_start::text),
            now(),
            case when v_event.status in ('PUBLISHED', 'SCHEDULED', 'CANCELLED') then now() else null end,
            v_series_index,
            v_start
          )
          on conflict (event_id, recurrence_index)
            where recurrence_index is not null and not is_recurrence_exception
          do update set
            venue_id = excluded.venue_id,
            start_at = excluded.start_at,
            end_at = excluded.end_at,
            status = excluded.status,
            source_url = excluded.source_url,
            ticket_url = excluded.ticket_url,
            dedupe_key = excluded.dedupe_key,
            last_seen_at = excluded.last_seen_at,
            published_at = excluded.published_at,
            original_start_at = excluded.original_start_at,
            updated_at = now();

          v_materialized := v_materialized + 1;
        end if;
      end if;

      v_series_index := v_series_index + 1;
      if v_frequency = 'ONCE' then
        exit;
      end if;
    end if;

    v_date := v_date + 1;
  end loop;

  -- Remove only generated projection rows that are no longer part of the
  -- current rolling window. Historical rows and every exception survive.
  delete from public.event_occurrences_v1
   where event_id = p_event_id
     and recurrence_index is not null
     and not is_recurrence_exception
     and start_at >= (v_horizon_start::timestamp at time zone 'Europe/Zurich')
     and not (recurrence_index = any(v_desired_indices));

  return v_materialized;
end;
$$;

revoke all on function public.regenerate_manual_event_occurrences_v1(uuid) from public, anon;
grant execute on function public.regenerate_manual_event_occurrences_v1(uuid) to authenticated, service_role;

create or replace function public.reconcile_manual_event_occurrences_v1()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_event record;
  v_refreshed integer := 0;
begin
  for v_event in
    select id
      from public.events_v1
     where primary_source_id = 'manual_admin'
       and recurrence_rule is not null
       and status not in ('ENDED', 'DELETED')
     order by id
  loop
    perform public.regenerate_manual_event_occurrences_v1(v_event.id);
    v_refreshed := v_refreshed + 1;
  end loop;

  return v_refreshed;
end;
$$;

revoke all on function public.reconcile_manual_event_occurrences_v1() from public, anon;
grant execute on function public.reconcile_manual_event_occurrences_v1() to authenticated, service_role;
