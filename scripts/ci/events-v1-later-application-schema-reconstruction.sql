-- Events V1 was added after Gate 7. Historical application-schema proofs
-- remove only these exact later public objects inside their proof transaction.
drop view public.event_discovery_v1;
drop function public.reconcile_manual_event_occurrences_v1();
drop function public.regenerate_manual_event_occurrences_v1(uuid);
drop function public.reconcile_event_source_v1(text,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone);
drop function public.ingest_event_record_v1(jsonb,jsonb,uuid,timestamp with time zone);
drop policy event_venues_v1_public_read on public.event_venues_v1;
drop table public.event_source_records_v1;
drop table public.event_occurrences_v1;
drop table public.events_v1;
drop table public.event_venues_v1;
drop table public.event_staging_v1;
drop table public.event_ingest_runs_v1;
drop table public.event_sources_v1;
drop function public.set_events_v1_updated_at();
