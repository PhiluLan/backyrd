begin;

create table if not exists public.spot_google_backfill_rejections (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  google_place_id text not null,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz not null default now(),
  reason text,
  unique (spot_id, google_place_id)
);

create index if not exists spot_google_backfill_rejections_spot_idx
  on public.spot_google_backfill_rejections (spot_id, rejected_at desc);

alter table public.spot_google_backfill_rejections enable row level security;

drop policy if exists "Admins can read google backfill rejections"
  on public.spot_google_backfill_rejections;

create policy "Admins can read google backfill rejections"
  on public.spot_google_backfill_rejections
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_admin, false) = true
    )
  );

commit;
