begin;
create table if not exists public.spot_google_enrichment_events (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  applied_by uuid references auth.users(id) on delete set null,
  applied_fields text[] not null default '{}',
  skipped_fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists spot_google_enrichment_events_spot_idx on public.spot_google_enrichment_events (spot_id, created_at desc);
alter table public.spot_google_enrichment_events enable row level security;
drop policy if exists "Admins can read google enrichment events" on public.spot_google_enrichment_events;
create policy "Admins can read google enrichment events" on public.spot_google_enrichment_events for select to authenticated using (
  exists (select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_admin,false)=true)
);
commit;
