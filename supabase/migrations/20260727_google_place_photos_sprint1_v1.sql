begin;

alter table public.spots
  add column if not exists google_place_id text,
  add column if not exists google_photo_enabled boolean not null default true;

create index if not exists spots_google_place_id_idx
  on public.spots (google_place_id)
  where google_place_id is not null;

comment on column public.spots.google_place_id is
  'Google Places place ID used to request fresh Google Places photo metadata.';

comment on column public.spots.google_photo_enabled is
  'Whether Google Places photos may be used as fallback when no Backyrd photo exists.';

commit;
