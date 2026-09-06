-- Manual Admin acceptance remains the only active Events V1 path.
-- External adapters are deliberately kept disconnected until a later approval.

update public.event_sources_v1
   set ingestion_enabled = false,
       configuration = configuration || '{"manual_admin_pilot_hold":true}'::jsonb,
       updated_at = now()
 where id in ('eventfrog', 'progonline', 'basel_stadt_ogd', 'basellive');
