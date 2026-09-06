begin;

create or replace function pg_temp.events_v1_manual_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Events V1 manual recurrence assertion failed: %', p_message;
  end if;
end;
$$;

insert into public.events_v1 (
  id,
  primary_source_id,
  primary_source_event_id,
  title,
  short_description,
  category,
  categories,
  status,
  is_free,
  source_url,
  external_url,
  dedupe_key,
  provenance,
  last_seen_at,
  published_at,
  is_recurring,
  recurrence_rule,
  recurrence_summary
) values (
  '30000000-0000-0000-0000-000000000001'::uuid,
  'manual_admin',
  'manual-recurrence-horizon-test',
  'Open Court recurrence contract test',
  'A transaction-only recurrence fixture.',
  'SPORT',
  array['SPORT', 'ACTIVITY', 'LEISURE'],
  'PUBLISHED',
  true,
  'https://backyrd.com/events/manual-recurrence-horizon-test',
  'https://backyrd.com/events/manual-recurrence-horizon-test',
  'manual-recurrence-horizon-test',
  '{"source":"MANUAL_ADMIN","testOnly":true}'::jsonb,
  now(),
  now(),
  true,
  jsonb_build_object(
    'frequency', 'WEEKLY',
    'interval', 2,
    'startDate', (
      timezone('Europe/Zurich', now())::date
      + ((8 - extract(isodow from timezone('Europe/Zurich', now()))::integer) % 7)
    )::text,
    'startTime', '16:00',
    'endTime', '23:00',
    'weekdays', jsonb_build_array(1)
  ),
  'Alle 2 Wochen, Montag'
);

select public.regenerate_manual_event_occurrences_v1(
  '30000000-0000-0000-0000-000000000001'::uuid
);

select pg_temp.events_v1_manual_assert(
  (
    select count(*) between 26 and 27
      from public.event_occurrences_v1
     where event_id = '30000000-0000-0000-0000-000000000001'::uuid
  ),
  'only the rolling twelve-month window is materialized'
);

select pg_temp.events_v1_manual_assert(
  (
    select max(start_at at time zone 'Europe/Zurich')::date
      <= (timezone('Europe/Zurich', now())::date + interval '12 months')::date
      from public.event_occurrences_v1
     where event_id = '30000000-0000-0000-0000-000000000001'::uuid
  ),
  'no generated occurrence exceeds the horizon'
);

select pg_temp.events_v1_manual_assert(
  (
    select recurrence_rule->>'until' is null
       and recurrence_rule->>'frequency' = 'WEEKLY'
       and recurrence_rule->>'interval' = '2'
      from public.events_v1
     where id = '30000000-0000-0000-0000-000000000001'::uuid
  ),
  'the long-lived canonical recurrence rule remains unchanged'
);

create temporary table manual_occurrence_ids_before as
select recurrence_index, id
  from public.event_occurrences_v1
 where event_id = '30000000-0000-0000-0000-000000000001'::uuid;

select public.regenerate_manual_event_occurrences_v1(
  '30000000-0000-0000-0000-000000000001'::uuid
);

select pg_temp.events_v1_manual_assert(
  (
    select bool_and(current_occurrence.id = before_occurrence.id)
      from public.event_occurrences_v1 current_occurrence
      join manual_occurrence_ids_before before_occurrence using (recurrence_index)
     where current_occurrence.event_id = '30000000-0000-0000-0000-000000000001'::uuid
  ),
  'an exact refresh is idempotent and preserves occurrence identities'
);

create temporary table chosen_manual_exception as
select id, recurrence_index, start_at, end_at
  from public.event_occurrences_v1
 where event_id = '30000000-0000-0000-0000-000000000001'::uuid
 order by start_at
 offset 1
 limit 1;

update public.event_occurrences_v1 occurrence
   set is_recurrence_exception = true,
       status = 'CANCELLED',
       start_at = occurrence.start_at + interval '1 hour',
       end_at = occurrence.end_at + interval '1 hour',
       exception_note = 'Single-occurrence acceptance test'
  from chosen_manual_exception chosen
 where occurrence.id = chosen.id;

select public.reconcile_manual_event_occurrences_v1();

select pg_temp.events_v1_manual_assert(
  (
    select count(*) = 1
       and bool_and(occurrence.id = chosen.id)
       and bool_and(occurrence.status = 'CANCELLED')
       and bool_and(occurrence.start_at = chosen.start_at + interval '1 hour')
      from public.event_occurrences_v1 occurrence
      join chosen_manual_exception chosen using (recurrence_index)
     where occurrence.event_id = '30000000-0000-0000-0000-000000000001'::uuid
  ),
  'single-occurrence cancellation and time exception survive reconciliation'
);

select pg_temp.events_v1_manual_assert(
  (
    select count(*) = count(distinct recurrence_index)
      from public.event_occurrences_v1
     where event_id = '30000000-0000-0000-0000-000000000001'::uuid
  ),
  'no duplicate occurrence exists after exception reconciliation'
);

rollback;
