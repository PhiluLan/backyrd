-- Events V1 was added after Gate 7. Historical Gate 5/6/7 ACL proofs must
-- remove only this exact later grant delta before hashing their prior state.
revoke all privileges on table public.event_discovery_v1 from anon, authenticated, service_role;
revoke all privileges on table public.event_sources_v1 from anon, authenticated, service_role;
revoke all privileges on table public.event_ingest_runs_v1 from anon, authenticated, service_role;
revoke all privileges on table public.event_staging_v1 from anon, authenticated, service_role;
revoke all privileges on table public.event_venues_v1 from anon, authenticated, service_role;
revoke all privileges on table public.events_v1 from anon, authenticated, service_role;
revoke all privileges on table public.event_occurrences_v1 from anon, authenticated, service_role;
revoke all privileges on table public.event_source_records_v1 from anon, authenticated, service_role;

revoke execute on function public.set_events_v1_updated_at() from anon, authenticated, service_role;
revoke execute on function public.ingest_event_record_v1(jsonb,jsonb,uuid,timestamp with time zone) from anon, authenticated, service_role;
revoke execute on function public.reconcile_event_source_v1(text,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone) from anon, authenticated, service_role;
revoke execute on function public.regenerate_manual_event_occurrences_v1(uuid) from anon, authenticated, service_role;
revoke execute on function public.reconcile_manual_event_occurrences_v1() from anon, authenticated, service_role;
