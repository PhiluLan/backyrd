begin;

-- The external adapter remains disabled in product. This transaction-only
-- enablement exercises the ingest contract without connecting to Eventfrog.
update public.event_sources_v1
   set ingestion_enabled = true
 where id = 'eventfrog';

create or replace function pg_temp.events_v1_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Events V1 assertion failed: %', p_message;
  end if;
end;
$$;

insert into public.spots (
  id, name, address, city, country, lat, lng, status
) values (
  '10000000-0000-0000-0000-000000000001'::uuid,
  'Kaserne Basel',
  'Klybeckstrasse 1b, 4057 Basel, Schweiz',
  'Basel',
  'CH',
  47.568,
  7.591,
  'approved'
);

insert into public.event_ingest_runs_v1 (
  id, source_id, mode, scope, started_at
) values (
  '20000000-0000-0000-0000-000000000001'::uuid,
  'eventfrog',
  'RECONCILE',
  '{"city":"Basel"}'::jsonb,
  '2026-09-05T09:00:00Z'
);

select * from public.ingest_event_record_v1(
  '{
    "source":"eventfrog",
    "sourceEventId":"event-1",
    "sourceGroupId":"group-1",
    "sourceOccurrenceId":"event-1",
    "sourceModifiedAt":"2026-09-05T08:00:00Z",
    "title":"Konzert am Rhein",
    "shortDescription":"Ein Basler Konzert.",
    "category":"MUSIC",
    "status":"SCHEDULED",
    "startAt":"2026-09-12T18:00:00Z",
    "endAt":"2026-09-12T20:00:00Z",
    "venue":{"sourceVenueId":"venue-1","name":"Kaserne Basel","normalizedName":"kaserne basel","addressLine":"Klybeckstrasse 1b","postalCode":"4057","city":"Basel","countryCode":"CH","latitude":47.568,"longitude":7.591,"addressFingerprint":"klybeckstrasse 1b|4057|basel"},
    "isFree":true,
    "priceMin":0,
    "priceCurrency":"CHF",
    "sourceUrl":"https://eventfrog.ch/test-event",
    "ticketUrl":null,
    "eventDedupeKey":"event-key-1",
    "occurrenceDedupeKey":"occurrence-key-1",
    "payloadHash":"payload-1",
    "rawPayload":{"id":"event-1"},
    "provenance":{"source":"eventfrog","imageImported":false}
  }'::jsonb,
  '{"spotId":"10000000-0000-0000-0000-000000000001","method":"ADDRESS","confidence":1}'::jsonb,
  '20000000-0000-0000-0000-000000000001'::uuid,
  '2026-09-05T09:01:00Z'
);

-- A second source event in the same Eventfrog group is a second Occurrence,
-- not another canonical Event.
select * from public.ingest_event_record_v1(
  '{
    "source":"eventfrog",
    "sourceEventId":"event-2",
    "sourceGroupId":"group-1",
    "sourceOccurrenceId":"event-2",
    "sourceModifiedAt":"2026-09-05T08:00:00Z",
    "title":"Konzert am Rhein",
    "shortDescription":"Ein Basler Konzert.",
    "category":"MUSIC",
    "status":"SCHEDULED",
    "startAt":"2026-09-13T18:00:00Z",
    "endAt":"2026-09-13T20:00:00Z",
    "venue":{"sourceVenueId":"venue-1","name":"Kaserne Basel","normalizedName":"kaserne basel","addressLine":"Klybeckstrasse 1b","postalCode":"4057","city":"Basel","countryCode":"CH","latitude":47.568,"longitude":7.591,"addressFingerprint":"klybeckstrasse 1b|4057|basel"},
    "isFree":true,
    "priceMin":0,
    "priceCurrency":"CHF",
    "sourceUrl":"https://eventfrog.ch/test-event-2",
    "ticketUrl":null,
    "eventDedupeKey":"event-key-1",
    "occurrenceDedupeKey":"occurrence-key-2",
    "payloadHash":"payload-event-2",
    "rawPayload":{"id":"event-2"},
    "provenance":{"source":"eventfrog","imageImported":false}
  }'::jsonb,
  '{"spotId":"10000000-0000-0000-0000-000000000001","method":"SOURCE_ID","confidence":1}'::jsonb,
  '20000000-0000-0000-0000-000000000001'::uuid,
  '2026-09-05T09:01:00Z'
);

select pg_temp.events_v1_assert((select count(*) = 1 from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'one canonical event created');
select pg_temp.events_v1_assert((select count(*) = 2 from public.event_occurrences_v1 occurrence join public.events_v1 event on event.id = occurrence.event_id where event.primary_source_id = 'eventfrog' and event.dedupe_key = 'event-key-1'), 'two grouped occurrences created');
select pg_temp.events_v1_assert((select matched_spot_id is not null from public.event_venues_v1 where source_venue_id = 'venue-1'), 'venue matched to existing spot');
select pg_temp.events_v1_assert((select image_storage_path is null and not image_rights_verified from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'no event image stored without rights');

-- Exact replay must not create another Event or Occurrence.
select * from public.ingest_event_record_v1(
  '{
    "source":"eventfrog","sourceEventId":"event-1","sourceGroupId":"group-1","sourceOccurrenceId":"event-1","sourceModifiedAt":"2026-09-05T08:00:00Z","title":"Konzert am Rhein","shortDescription":"Ein Basler Konzert.","category":"MUSIC","status":"SCHEDULED","startAt":"2026-09-12T18:00:00Z","endAt":"2026-09-12T20:00:00Z","venue":{"sourceVenueId":"venue-1","name":"Kaserne Basel","normalizedName":"kaserne basel","addressLine":"Klybeckstrasse 1b","postalCode":"4057","city":"Basel","countryCode":"CH","latitude":47.568,"longitude":7.591,"addressFingerprint":"klybeckstrasse 1b|4057|basel"},"isFree":true,"priceMin":0,"priceCurrency":"CHF","sourceUrl":"https://eventfrog.ch/test-event","ticketUrl":null,"eventDedupeKey":"event-key-1","occurrenceDedupeKey":"occurrence-key-1","payloadHash":"payload-1","rawPayload":{"id":"event-1"},"provenance":{"source":"eventfrog","imageImported":false}
  }'::jsonb,
  '{"spotId":"10000000-0000-0000-0000-000000000001","method":"SOURCE_ID","confidence":1}'::jsonb,
  '20000000-0000-0000-0000-000000000001'::uuid,
  '2026-09-05T09:02:00Z'
);

select pg_temp.events_v1_assert((select count(*) = 1 from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'idempotent Event replay');
select pg_temp.events_v1_assert((select count(*) = 2 from public.event_occurrences_v1 occurrence join public.events_v1 event on event.id = occurrence.event_id where event.primary_source_id = 'eventfrog' and event.dedupe_key = 'event-key-1'), 'idempotent Occurrence replay');
select pg_temp.events_v1_assert((select count(*) = 2 from public.event_source_records_v1 where source_id = 'eventfrog' and source_event_id in ('event-1', 'event-2')), 'idempotent source record replay');

set local role anon;
select pg_temp.events_v1_assert(
  (select count(*) = 2 from public.event_discovery_v1 where source = 'eventfrog' and source_event_id = 'event-1'),
  'anon can read only the published discovery projection'
);
reset role;

-- A source cancellation updates the existing canonical rows.
select * from public.ingest_event_record_v1(
  '{
    "source":"eventfrog","sourceEventId":"event-1","sourceGroupId":"group-1","sourceOccurrenceId":"event-1","sourceModifiedAt":"2026-09-05T10:00:00Z","title":"Konzert am Rhein","shortDescription":"Ein Basler Konzert.","category":"MUSIC","status":"CANCELLED","startAt":"2026-09-12T18:00:00Z","endAt":"2026-09-12T20:00:00Z","venue":{"sourceVenueId":"venue-1","name":"Kaserne Basel","normalizedName":"kaserne basel","addressLine":"Klybeckstrasse 1b","postalCode":"4057","city":"Basel","countryCode":"CH","latitude":47.568,"longitude":7.591,"addressFingerprint":"klybeckstrasse 1b|4057|basel"},"isFree":true,"priceMin":0,"priceCurrency":"CHF","sourceUrl":"https://eventfrog.ch/test-event","ticketUrl":null,"eventDedupeKey":"event-key-1","occurrenceDedupeKey":"occurrence-key-1","payloadHash":"payload-2","rawPayload":{"id":"event-1","cancelled":true},"provenance":{"source":"eventfrog","imageImported":false}
  }'::jsonb,
  '{"spotId":"10000000-0000-0000-0000-000000000001","method":"SOURCE_ID","confidence":1}'::jsonb,
  '20000000-0000-0000-0000-000000000001'::uuid,
  '2026-09-05T10:01:00Z'
);

select pg_temp.events_v1_assert((select status = 'SCHEDULED' from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'one cancellation does not cancel a grouped event');
select pg_temp.events_v1_assert((select status = 'CANCELLED' from public.event_occurrences_v1 where dedupe_key = 'occurrence-key-1'), 'cancelled occurrence updated');
select pg_temp.events_v1_assert((select status = 'SCHEDULED' from public.event_occurrences_v1 where dedupe_key = 'occurrence-key-2'), 'other occurrence remains scheduled');

-- A moved/postponed source event creates the new occurrence identity and
-- tombstones the previous one immediately; it does not wait for reconciliation.
select * from public.ingest_event_record_v1(
  '{
    "source":"eventfrog","sourceEventId":"event-2","sourceGroupId":"group-1","sourceOccurrenceId":"event-2","sourceModifiedAt":"2026-09-05T11:00:00Z","title":"Konzert am Rhein","shortDescription":"Ein Basler Konzert.","category":"MUSIC","status":"POSTPONED","startAt":"2026-09-20T18:00:00Z","endAt":"2026-09-20T20:00:00Z","venue":{"sourceVenueId":"venue-1","name":"Kaserne Basel","normalizedName":"kaserne basel","addressLine":"Klybeckstrasse 1b","postalCode":"4057","city":"Basel","countryCode":"CH","latitude":47.568,"longitude":7.591,"addressFingerprint":"klybeckstrasse 1b|4057|basel"},"isFree":true,"priceMin":0,"priceCurrency":"CHF","sourceUrl":"https://eventfrog.ch/test-event-2","ticketUrl":null,"eventDedupeKey":"event-key-1","occurrenceDedupeKey":"occurrence-key-3","payloadHash":"payload-event-2-moved","rawPayload":{"id":"event-2","moved":true},"provenance":{"source":"eventfrog","imageImported":false}
  }'::jsonb,
  '{"spotId":"10000000-0000-0000-0000-000000000001","method":"SOURCE_ID","confidence":1}'::jsonb,
  '20000000-0000-0000-0000-000000000001'::uuid,
  '2026-09-05T11:01:00Z'
);

select pg_temp.events_v1_assert((select count(*) = 1 from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'moved occurrence keeps canonical event');
select pg_temp.events_v1_assert((select status = 'DELETED' and published_at is null from public.event_occurrences_v1 where dedupe_key = 'occurrence-key-2'), 'previous occurrence tombstoned immediately');
select pg_temp.events_v1_assert((select status = 'POSTPONED' from public.event_occurrences_v1 where dedupe_key = 'occurrence-key-3'), 'new occurrence is postponed');
select pg_temp.events_v1_assert((select status = 'POSTPONED' from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'event aggregates remaining postponed status');

-- A successful later full reconciliation removes a source record that vanished.
insert into public.event_ingest_runs_v1 (
  id, source_id, mode, scope, started_at
) values (
  '20000000-0000-0000-0000-000000000002'::uuid,
  'eventfrog',
  'RECONCILE',
  '{"city":"Basel"}'::jsonb,
  '2026-09-06T09:00:00Z'
);

select pg_temp.events_v1_assert(
  public.reconcile_event_source_v1(
    'eventfrog',
    '20000000-0000-0000-0000-000000000002'::uuid,
    '2026-09-01T00:00:00Z',
    '2026-10-01T00:00:00Z',
    '2026-09-06T09:01:00Z'
  ) = 2,
  'two vanished source records deleted'
);
select pg_temp.events_v1_assert((select count(*) = 2 from public.event_source_records_v1 where source_id = 'eventfrog' and source_event_id in ('event-1', 'event-2') and source_status = 'DELETED'), 'source deletions retained as tombstones');
select pg_temp.events_v1_assert((select count(*) = 3 from public.event_occurrences_v1 occurrence join public.events_v1 event on event.id = occurrence.event_id where event.primary_source_id = 'eventfrog' and event.dedupe_key = 'event-key-1' and occurrence.status = 'DELETED' and occurrence.published_at is null), 'deleted occurrences unpublished');
select pg_temp.events_v1_assert((select status = 'DELETED' and published_at is null from public.events_v1 where primary_source_id = 'eventfrog' and dedupe_key = 'event-key-1'), 'orphan event unpublished');

select pg_temp.events_v1_assert(not has_table_privilege('anon', 'public.events_v1', 'insert,update,delete'), 'anon cannot write events');
select pg_temp.events_v1_assert(has_table_privilege('authenticated', 'public.events_v1', 'insert,update,delete'), 'authenticated admin role has the grants required for manual authoring');
select pg_temp.events_v1_assert(not has_table_privilege('anon', 'public.event_staging_v1', 'select'), 'raw staging is not public');
select pg_temp.events_v1_assert((select count(*) = 0 from public.events_v1 where image_storage_path is not null and not image_rights_verified), 'unauthorized image invariant');

create or replace function pg_temp.events_v1_non_admin_update_count()
returns integer
language plpgsql
security invoker
as $$
declare
  v_updated integer;
begin
  update public.events_v1
     set title = title
   where dedupe_key = 'event-key-1';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

set local role authenticated;
select pg_temp.events_v1_assert(
  pg_temp.events_v1_non_admin_update_count() = 0,
  'RLS denies event writes to a non-admin authenticated session'
);
reset role;

rollback;
