-- Events V1 Basel pilot.
-- Deterministic source sync only. This schema is intentionally isolated from
-- Decision, Mood, Review, ranking, and Gate-1-7 contracts.

create table public.event_sources_v1 (
  id text primary key,
  display_name text not null,
  adapter_kind text not null check (adapter_kind in ('API', 'OPEN_DATA')),
  ingestion_enabled boolean not null default false,
  rights_status text not null check (
    rights_status in ('PUBLIC_API_TERMS', 'OPEN_DATA_LICENSE', 'CONTRACT_PENDING')
  ),
  image_ingestion_allowed boolean not null default false,
  requires_image_credit boolean not null default true,
  source_url text not null,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.event_sources_v1 (
  id,
  display_name,
  adapter_kind,
  ingestion_enabled,
  rights_status,
  image_ingestion_allowed,
  source_url,
  configuration
) values
  (
    'eventfrog',
    'Eventfrog',
    'API',
    true,
    'PUBLIC_API_TERMS',
    false,
    'https://api.eventfrog.net/public/v1/',
    '{"pilot":"basel","requires_bearer_token":true,"no_html_fallback":true}'::jsonb
  ),
  (
    'progonline',
    'PROZ / ProgOnline',
    'API',
    false,
    'CONTRACT_PENDING',
    false,
    'https://prog.online/',
    '{"activation_requires_contract":true,"no_html_fallback":true}'::jsonb
  ),
  (
    'basel_stadt_ogd',
    'Basel-Stadt Open Data',
    'OPEN_DATA',
    false,
    'OPEN_DATA_LICENSE',
    false,
    'https://data.bs.ch/',
    '{"supplemental_only":true,"no_html_fallback":true}'::jsonb
  ),
  (
    'basellive',
    'BaselLive',
    'API',
    false,
    'CONTRACT_PENDING',
    false,
    'https://basellive.ch/',
    '{"activation_requires_explicit_partnership":true,"no_html_fallback":true}'::jsonb
  );

create table public.event_ingest_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.event_sources_v1(id) on delete restrict,
  mode text not null check (mode in ('INCREMENTAL', 'RECONCILE')),
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'RUNNING' check (
    status in ('RUNNING', 'SUCCEEDED', 'FAILED')
  ),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  source_watermark timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  error_code text,
  error_detail text,
  check (
    (status = 'RUNNING' and completed_at is null)
    or (status in ('SUCCEEDED', 'FAILED') and completed_at is not null)
  )
);

create index event_ingest_runs_v1_source_started_idx
  on public.event_ingest_runs_v1(source_id, started_at desc);

create table public.event_staging_v1 (
  source_id text not null references public.event_sources_v1(id) on delete restrict,
  source_event_id text not null,
  ingest_run_id uuid not null references public.event_ingest_runs_v1(id) on delete restrict,
  payload_hash text not null,
  raw_payload jsonb not null,
  validation_status text not null default 'PENDING' check (
    validation_status in ('PENDING', 'VALID', 'REJECTED')
  ),
  validation_errors text[] not null default '{}',
  observed_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (source_id, source_event_id)
);

create index event_staging_v1_run_idx
  on public.event_staging_v1(ingest_run_id);

create table public.event_venues_v1 (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.event_sources_v1(id) on delete restrict,
  source_venue_id text not null,
  name text not null,
  normalized_name text not null,
  address_line text,
  postal_code text,
  city text,
  country_code text,
  latitude double precision,
  longitude double precision,
  address_fingerprint text,
  matched_spot_id uuid references public.spots(id) on delete set null,
  match_method text not null default 'UNMATCHED' check (
    match_method in ('SOURCE_ID', 'ADDRESS', 'COORDINATES', 'NORMALIZED_NAME', 'UNMATCHED')
  ),
  match_confidence numeric(4,3),
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_venue_id),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check (
    (matched_spot_id is null and match_method = 'UNMATCHED' and match_confidence is null)
    or (matched_spot_id is not null and match_method <> 'UNMATCHED' and match_confidence between 0 and 1)
  )
);

create index event_venues_v1_spot_idx
  on public.event_venues_v1(matched_spot_id)
  where matched_spot_id is not null;
create index event_venues_v1_address_idx
  on public.event_venues_v1(address_fingerprint)
  where address_fingerprint is not null;

create table public.events_v1 (
  id uuid primary key default gen_random_uuid(),
  primary_source_id text not null references public.event_sources_v1(id) on delete restrict,
  primary_source_event_id text not null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  short_description text,
  category text not null default 'OTHER' check (
    category in (
      'MUSIC', 'NIGHTLIFE', 'ART', 'THEATRE', 'FILM', 'FOOD_DRINK',
      'FAMILY', 'SPORT', 'MARKET', 'WORKSHOP', 'COMMUNITY', 'OTHER'
    )
  ),
  status text not null default 'SCHEDULED' check (
    status in ('SCHEDULED', 'POSTPONED', 'CANCELLED', 'DELETED')
  ),
  is_free boolean,
  price_min numeric(10,2),
  price_currency char(3),
  source_url text not null,
  ticket_url text,
  image_storage_path text,
  image_credit text,
  image_rights_verified boolean not null default false,
  dedupe_key text not null,
  provenance jsonb not null,
  last_seen_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (primary_source_id, primary_source_event_id),
  check (short_description is null or char_length(short_description) <= 600),
  check (price_min is null or price_min >= 0),
  check ((price_min is null) = (price_currency is null)),
  check (not (is_free is true and price_min is not null and price_min > 0)),
  check (
    (image_storage_path is null and image_rights_verified = false)
    or (
      image_storage_path is not null
      and image_rights_verified = true
      and nullif(btrim(image_credit), '') is not null
    )
  )
);

create index events_v1_dedupe_idx on public.events_v1(dedupe_key);
create index events_v1_public_idx
  on public.events_v1(status, published_at)
  where published_at is not null;

create table public.event_occurrences_v1 (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events_v1(id) on delete cascade,
  venue_id uuid references public.event_venues_v1(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null default 'SCHEDULED' check (
    status in ('SCHEDULED', 'POSTPONED', 'CANCELLED', 'DELETED')
  ),
  source_url text not null,
  ticket_url text,
  dedupe_key text not null unique,
  last_seen_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create index event_occurrences_v1_public_time_idx
  on public.event_occurrences_v1(start_at, status)
  where published_at is not null;
create index event_occurrences_v1_event_idx
  on public.event_occurrences_v1(event_id, start_at);

create table public.event_source_records_v1 (
  source_id text not null references public.event_sources_v1(id) on delete restrict,
  source_event_id text not null,
  source_group_id text,
  source_occurrence_id text not null,
  canonical_event_id uuid not null references public.events_v1(id) on delete restrict,
  canonical_occurrence_id uuid not null references public.event_occurrences_v1(id) on delete restrict,
  source_status text not null check (
    source_status in ('ACTIVE', 'POSTPONED', 'CANCELLED', 'DELETED')
  ),
  payload_hash text not null,
  source_modified_at timestamptz,
  last_seen_at timestamptz not null,
  deleted_at timestamptz,
  ingest_run_id uuid not null references public.event_ingest_runs_v1(id) on delete restrict,
  provenance jsonb not null,
  primary key (source_id, source_event_id),
  unique (source_id, source_occurrence_id),
  check (
    (source_status = 'DELETED' and deleted_at is not null)
    or (source_status <> 'DELETED' and deleted_at is null)
  )
);

create index event_source_records_v1_event_idx
  on public.event_source_records_v1(canonical_event_id);
create index event_source_records_v1_occurrence_idx
  on public.event_source_records_v1(canonical_occurrence_id);
create index event_source_records_v1_reconcile_idx
  on public.event_source_records_v1(source_id, last_seen_at, source_status);

create or replace function public.set_events_v1_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_sources_v1_updated_at
before update on public.event_sources_v1
for each row execute function public.set_events_v1_updated_at();

create trigger event_venues_v1_updated_at
before update on public.event_venues_v1
for each row execute function public.set_events_v1_updated_at();

create trigger events_v1_updated_at
before update on public.events_v1
for each row execute function public.set_events_v1_updated_at();

create trigger event_occurrences_v1_updated_at
before update on public.event_occurrences_v1
for each row execute function public.set_events_v1_updated_at();

alter table public.event_sources_v1 enable row level security;
alter table public.event_ingest_runs_v1 enable row level security;
alter table public.event_staging_v1 enable row level security;
alter table public.event_venues_v1 enable row level security;
alter table public.events_v1 enable row level security;
alter table public.event_occurrences_v1 enable row level security;
alter table public.event_source_records_v1 enable row level security;

create policy events_v1_public_read
on public.events_v1 for select
to anon, authenticated
using (published_at is not null and status <> 'DELETED');

create policy event_occurrences_v1_public_read
on public.event_occurrences_v1 for select
to anon, authenticated
using (published_at is not null and status <> 'DELETED');

create policy event_venues_v1_public_read
on public.event_venues_v1 for select
to anon, authenticated
using (
  exists (
    select 1
    from public.event_occurrences_v1 occurrence
    where occurrence.venue_id = event_venues_v1.id
      and occurrence.published_at is not null
      and occurrence.status <> 'DELETED'
  )
);

create or replace view public.event_discovery_v1
with (security_invoker = true)
as
select
  event.id as event_id,
  occurrence.id as occurrence_id,
  event.primary_source_id as source,
  event.primary_source_event_id as source_event_id,
  event.title,
  event.short_description,
  event.category,
  event.status as event_status,
  occurrence.status as occurrence_status,
  occurrence.start_at,
  occurrence.end_at,
  venue.id as venue_id,
  venue.name as venue_name,
  venue.address_line,
  venue.postal_code,
  venue.city,
  venue.country_code,
  venue.latitude,
  venue.longitude,
  venue.matched_spot_id,
  event.is_free,
  event.price_min,
  event.price_currency,
  coalesce(occurrence.source_url, event.source_url) as source_url,
  coalesce(occurrence.ticket_url, event.ticket_url) as ticket_url,
  event.image_storage_path,
  event.image_credit,
  event.image_rights_verified,
  greatest(event.last_seen_at, occurrence.last_seen_at) as last_seen_at,
  greatest(event.updated_at, occurrence.updated_at) as updated_at
from public.events_v1 event
join public.event_occurrences_v1 occurrence on occurrence.event_id = event.id
left join public.event_venues_v1 venue on venue.id = occurrence.venue_id
where event.published_at is not null
  and occurrence.published_at is not null
  and event.status <> 'DELETED'
  and occurrence.status <> 'DELETED';

revoke all on table
  public.event_sources_v1,
  public.event_ingest_runs_v1,
  public.event_staging_v1,
  public.event_venues_v1,
  public.events_v1,
  public.event_occurrences_v1,
  public.event_source_records_v1
from public, anon, authenticated;

grant select (
  id, name, address_line, postal_code, city, country_code,
  latitude, longitude, matched_spot_id
) on public.event_venues_v1 to anon, authenticated;

grant select (
  id, primary_source_id, primary_source_event_id, title, short_description,
  category, status, is_free, price_min, price_currency, source_url, ticket_url,
  image_storage_path, image_credit, image_rights_verified, last_seen_at,
  published_at, updated_at
) on public.events_v1 to anon, authenticated;

grant select (
  id, event_id, venue_id, start_at, end_at, status, source_url, ticket_url,
  last_seen_at, published_at, updated_at
) on public.event_occurrences_v1 to anon, authenticated;

revoke all on public.event_discovery_v1 from public, anon, authenticated;
grant select on public.event_discovery_v1 to anon, authenticated;

grant all on table
  public.event_sources_v1,
  public.event_ingest_runs_v1,
  public.event_staging_v1,
  public.event_venues_v1,
  public.events_v1,
  public.event_occurrences_v1,
  public.event_source_records_v1
to service_role;

create or replace function public.ingest_event_record_v1(
  p_record jsonb,
  p_venue_match jsonb,
  p_ingest_run_id uuid,
  p_seen_at timestamptz
)
returns table (
  canonical_event_id uuid,
  canonical_occurrence_id uuid,
  created_event boolean,
  created_occurrence boolean,
  duplicate_merged boolean
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_source text := p_record->>'source';
  v_source_event_id text := p_record->>'sourceEventId';
  v_source_occurrence_id text := p_record->>'sourceOccurrenceId';
  v_event_id uuid;
  v_occurrence_id uuid;
  v_venue_id uuid;
  v_previous_event_id uuid;
  v_previous_occurrence_id uuid;
  v_existing_source boolean := false;
  v_created_event boolean := false;
  v_created_occurrence boolean := false;
  v_status text := p_record->>'status';
begin
  if v_source is null or v_source_event_id is null or v_source_occurrence_id is null then
    raise exception 'event_source_identity_required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.event_sources_v1 source
    where source.id = v_source and source.ingestion_enabled
  ) then
    raise exception 'event_source_not_enabled' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.event_ingest_runs_v1 run
    where run.id = p_ingest_run_id and run.source_id = v_source and run.status = 'RUNNING'
  ) then
    raise exception 'event_ingest_run_not_active' using errcode = '22023';
  end if;

  -- Serialize equivalent identities so concurrent sync workers cannot create
  -- duplicate canonical Events for the same conservative dedupe key.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_record->>'eventDedupeKey', ''), 0)
  );

  insert into public.event_staging_v1 (
    source_id, source_event_id, ingest_run_id, payload_hash, raw_payload,
    validation_status, validation_errors, observed_at, processed_at
  ) values (
    v_source,
    v_source_event_id,
    p_ingest_run_id,
    p_record->>'payloadHash',
    p_record->'rawPayload',
    'VALID',
    '{}',
    p_seen_at,
    p_seen_at
  )
  on conflict (source_id, source_event_id) do update set
    ingest_run_id = excluded.ingest_run_id,
    payload_hash = excluded.payload_hash,
    raw_payload = excluded.raw_payload,
    validation_status = excluded.validation_status,
    validation_errors = excluded.validation_errors,
    observed_at = excluded.observed_at,
    processed_at = excluded.processed_at;

  if p_record->'venue' is not null and p_record->'venue' <> 'null'::jsonb then
    insert into public.event_venues_v1 (
      source_id, source_venue_id, name, normalized_name, address_line,
      postal_code, city, country_code, latitude, longitude,
      address_fingerprint, matched_spot_id, match_method, match_confidence,
      last_seen_at
    ) values (
      v_source,
      p_record#>>'{venue,sourceVenueId}',
      p_record#>>'{venue,name}',
      p_record#>>'{venue,normalizedName}',
      nullif(p_record#>>'{venue,addressLine}', ''),
      nullif(p_record#>>'{venue,postalCode}', ''),
      nullif(p_record#>>'{venue,city}', ''),
      nullif(p_record#>>'{venue,countryCode}', ''),
      nullif(p_record#>>'{venue,latitude}', '')::double precision,
      nullif(p_record#>>'{venue,longitude}', '')::double precision,
      nullif(p_record#>>'{venue,addressFingerprint}', ''),
      nullif(p_venue_match->>'spotId', '')::uuid,
      coalesce(p_venue_match->>'method', 'UNMATCHED'),
      nullif(p_venue_match->>'confidence', '')::numeric,
      p_seen_at
    )
    on conflict (source_id, source_venue_id) do update set
      name = excluded.name,
      normalized_name = excluded.normalized_name,
      address_line = excluded.address_line,
      postal_code = excluded.postal_code,
      city = excluded.city,
      country_code = excluded.country_code,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      address_fingerprint = excluded.address_fingerprint,
      matched_spot_id = case
        when public.event_venues_v1.matched_spot_id is not null
          then public.event_venues_v1.matched_spot_id
        else excluded.matched_spot_id
      end,
      match_method = case
        when public.event_venues_v1.matched_spot_id is not null then 'SOURCE_ID'
        else excluded.match_method
      end,
      match_confidence = case
        when public.event_venues_v1.matched_spot_id is not null then 1
        else excluded.match_confidence
      end,
      last_seen_at = excluded.last_seen_at
    returning id into v_venue_id;
  end if;

  select event.id into v_event_id
  from public.events_v1 event
  where event.dedupe_key = p_record->>'eventDedupeKey'
  order by event.created_at, event.id
  limit 1;

  if v_event_id is null then
    insert into public.events_v1 (
      primary_source_id, primary_source_event_id, title, short_description,
      category, status, is_free, price_min, price_currency, source_url,
      ticket_url, image_storage_path, image_credit, image_rights_verified,
      dedupe_key, provenance, last_seen_at, published_at
    ) values (
      v_source,
      v_source_event_id,
      p_record->>'title',
      nullif(p_record->>'shortDescription', ''),
      p_record->>'category',
      v_status,
      nullif(p_record->>'isFree', '')::boolean,
      nullif(p_record->>'priceMin', '')::numeric,
      nullif(p_record->>'priceCurrency', ''),
      p_record->>'sourceUrl',
      nullif(p_record->>'ticketUrl', ''),
      null,
      null,
      false,
      p_record->>'eventDedupeKey',
      p_record->'provenance',
      p_seen_at,
      case when v_status = 'DELETED' then null else p_seen_at end
    ) returning id into v_event_id;
    v_created_event := true;
  else
    update public.events_v1 set
      title = p_record->>'title',
      short_description = nullif(p_record->>'shortDescription', ''),
      category = p_record->>'category',
      status = v_status,
      is_free = nullif(p_record->>'isFree', '')::boolean,
      price_min = nullif(p_record->>'priceMin', '')::numeric,
      price_currency = nullif(p_record->>'priceCurrency', ''),
      source_url = p_record->>'sourceUrl',
      ticket_url = nullif(p_record->>'ticketUrl', ''),
      provenance = p_record->'provenance',
      last_seen_at = p_seen_at,
      published_at = case
        when v_status = 'DELETED' then null
        else coalesce(published_at, p_seen_at)
      end
    where id = v_event_id;
  end if;

  select occurrence.id into v_occurrence_id
  from public.event_occurrences_v1 occurrence
  where occurrence.dedupe_key = p_record->>'occurrenceDedupeKey';

  if v_occurrence_id is null then
    insert into public.event_occurrences_v1 (
      event_id, venue_id, start_at, end_at, status, source_url, ticket_url,
      dedupe_key, last_seen_at, published_at
    ) values (
      v_event_id,
      v_venue_id,
      (p_record->>'startAt')::timestamptz,
      nullif(p_record->>'endAt', '')::timestamptz,
      v_status,
      p_record->>'sourceUrl',
      nullif(p_record->>'ticketUrl', ''),
      p_record->>'occurrenceDedupeKey',
      p_seen_at,
      case when v_status = 'DELETED' then null else p_seen_at end
    ) returning id into v_occurrence_id;
    v_created_occurrence := true;
  else
    update public.event_occurrences_v1 set
      event_id = v_event_id,
      venue_id = v_venue_id,
      start_at = (p_record->>'startAt')::timestamptz,
      end_at = nullif(p_record->>'endAt', '')::timestamptz,
      status = v_status,
      source_url = p_record->>'sourceUrl',
      ticket_url = nullif(p_record->>'ticketUrl', ''),
      last_seen_at = p_seen_at,
      published_at = case
        when v_status = 'DELETED' then null
        else coalesce(published_at, p_seen_at)
      end
    where id = v_occurrence_id;
  end if;

  select source_record.canonical_event_id, source_record.canonical_occurrence_id
  into v_previous_event_id, v_previous_occurrence_id
  from public.event_source_records_v1 source_record
  where source_record.source_id = v_source
    and source_record.source_event_id = v_source_event_id;
  v_existing_source := found;

  insert into public.event_source_records_v1 (
    source_id, source_event_id, source_group_id, source_occurrence_id,
    canonical_event_id, canonical_occurrence_id, source_status, payload_hash,
    source_modified_at, last_seen_at, deleted_at, ingest_run_id, provenance
  ) values (
    v_source,
    v_source_event_id,
    nullif(p_record->>'sourceGroupId', ''),
    v_source_occurrence_id,
    v_event_id,
    v_occurrence_id,
    case v_status
      when 'CANCELLED' then 'CANCELLED'
      when 'POSTPONED' then 'POSTPONED'
      when 'DELETED' then 'DELETED'
      else 'ACTIVE'
    end,
    p_record->>'payloadHash',
    (p_record->>'sourceModifiedAt')::timestamptz,
    p_seen_at,
    case when v_status = 'DELETED' then p_seen_at else null end,
    p_ingest_run_id,
    p_record->'provenance'
  )
  on conflict (source_id, source_event_id) do update set
    source_group_id = excluded.source_group_id,
    source_occurrence_id = excluded.source_occurrence_id,
    canonical_event_id = excluded.canonical_event_id,
    canonical_occurrence_id = excluded.canonical_occurrence_id,
    source_status = excluded.source_status,
    payload_hash = excluded.payload_hash,
    source_modified_at = excluded.source_modified_at,
    last_seen_at = excluded.last_seen_at,
    deleted_at = excluded.deleted_at,
    ingest_run_id = excluded.ingest_run_id,
    provenance = excluded.provenance;

  if v_previous_occurrence_id is not null
    and v_previous_occurrence_id <> v_occurrence_id then
    update public.event_occurrences_v1 occurrence set
      status = case
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_occurrence_id = v_previous_occurrence_id
            and source_record.source_status = 'ACTIVE'
        ) then 'SCHEDULED'
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_occurrence_id = v_previous_occurrence_id
            and source_record.source_status = 'POSTPONED'
        ) then 'POSTPONED'
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_occurrence_id = v_previous_occurrence_id
            and source_record.source_status = 'CANCELLED'
        ) then 'CANCELLED'
        else 'DELETED'
      end,
      published_at = case
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_occurrence_id = v_previous_occurrence_id
            and source_record.source_status <> 'DELETED'
        ) then coalesce(occurrence.published_at, p_seen_at)
        else null
      end,
      last_seen_at = p_seen_at
    where occurrence.id = v_previous_occurrence_id;
  end if;

  -- The canonical Occurrence status is derived from every source record that
  -- supports it, so one source cannot cancel a still-active shared occurrence.
  update public.event_occurrences_v1 occurrence set
    status = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = v_occurrence_id
          and source_record.source_status = 'ACTIVE'
      ) then 'SCHEDULED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = v_occurrence_id
          and source_record.source_status = 'POSTPONED'
      ) then 'POSTPONED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = v_occurrence_id
          and source_record.source_status = 'CANCELLED'
      ) then 'CANCELLED'
      else 'DELETED'
    end,
    published_at = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = v_occurrence_id
          and source_record.source_status <> 'DELETED'
      ) then coalesce(occurrence.published_at, p_seen_at)
      else null
    end,
    last_seen_at = p_seen_at
  where occurrence.id = v_occurrence_id;

  -- Event status is an aggregate of its source-backed occurrences. In particular,
  -- cancelling one performance must not cancel a multi-occurrence event while a
  -- scheduled performance still exists.
  update public.events_v1 event set
    status = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = v_event_id
          and source_record.source_status = 'ACTIVE'
      ) then 'SCHEDULED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = v_event_id
          and source_record.source_status = 'POSTPONED'
      ) then 'POSTPONED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = v_event_id
          and source_record.source_status = 'CANCELLED'
      ) then 'CANCELLED'
      else 'DELETED'
    end,
    published_at = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = v_event_id
          and source_record.source_status <> 'DELETED'
      ) then coalesce(event.published_at, p_seen_at)
      else null
    end,
    last_seen_at = p_seen_at
  where event.id = v_event_id;

  if v_previous_event_id is not null and v_previous_event_id <> v_event_id then
    update public.events_v1 event set
      status = case
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_event_id = v_previous_event_id
            and source_record.source_status = 'ACTIVE'
        ) then 'SCHEDULED'
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_event_id = v_previous_event_id
            and source_record.source_status = 'POSTPONED'
        ) then 'POSTPONED'
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_event_id = v_previous_event_id
            and source_record.source_status = 'CANCELLED'
        ) then 'CANCELLED'
        else 'DELETED'
      end,
      published_at = case
        when exists (
          select 1 from public.event_source_records_v1 source_record
          where source_record.canonical_event_id = v_previous_event_id
            and source_record.source_status <> 'DELETED'
        ) then coalesce(event.published_at, p_seen_at)
        else null
      end,
      last_seen_at = p_seen_at
    where event.id = v_previous_event_id;
  end if;

  return query select
    v_event_id,
    v_occurrence_id,
    v_created_event,
    v_created_occurrence,
    (not v_existing_source and not v_created_occurrence);
end;
$$;

create or replace function public.reconcile_event_source_v1(
  p_source_id text,
  p_ingest_run_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_reconciled_at timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_started_at timestamptz;
  v_deleted integer := 0;
begin
  select run.started_at into v_started_at
  from public.event_ingest_runs_v1 run
  where run.id = p_ingest_run_id
    and run.source_id = p_source_id
    and run.mode = 'RECONCILE'
    and run.status = 'RUNNING';

  if v_started_at is null then
    raise exception 'event_reconcile_run_not_active' using errcode = '22023';
  end if;

  with missing as (
    select source_record.source_id, source_record.source_event_id
    from public.event_source_records_v1 source_record
    join public.event_occurrences_v1 occurrence
      on occurrence.id = source_record.canonical_occurrence_id
    where source_record.source_id = p_source_id
      and source_record.source_status <> 'DELETED'
      and source_record.last_seen_at < v_started_at
      and occurrence.start_at >= p_from
      and occurrence.start_at < p_to
  ), updated as (
    update public.event_source_records_v1 source_record set
      source_status = 'DELETED',
      deleted_at = p_reconciled_at,
      ingest_run_id = p_ingest_run_id
    from missing
    where source_record.source_id = missing.source_id
      and source_record.source_event_id = missing.source_event_id
    returning source_record.canonical_occurrence_id
  )
  select count(*)::integer into v_deleted from updated;

  update public.event_occurrences_v1 occurrence set
    status = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = occurrence.id
          and source_record.source_status = 'ACTIVE'
      ) then 'SCHEDULED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = occurrence.id
          and source_record.source_status = 'POSTPONED'
      ) then 'POSTPONED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = occurrence.id
          and source_record.source_status = 'CANCELLED'
      ) then 'CANCELLED'
      else 'DELETED'
    end,
    published_at = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_occurrence_id = occurrence.id
          and source_record.source_status <> 'DELETED'
      ) then coalesce(occurrence.published_at, p_reconciled_at)
      else null
    end,
    last_seen_at = p_reconciled_at
  where occurrence.start_at >= p_from
    and occurrence.start_at < p_to;

  update public.events_v1 event set
    status = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = event.id
          and source_record.source_status = 'ACTIVE'
      ) then 'SCHEDULED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = event.id
          and source_record.source_status = 'POSTPONED'
      ) then 'POSTPONED'
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = event.id
          and source_record.source_status = 'CANCELLED'
      ) then 'CANCELLED'
      else 'DELETED'
    end,
    published_at = case
      when exists (
        select 1 from public.event_source_records_v1 source_record
        where source_record.canonical_event_id = event.id
          and source_record.source_status <> 'DELETED'
      ) then coalesce(event.published_at, p_reconciled_at)
      else null
    end,
    last_seen_at = p_reconciled_at
  where exists (
    select 1 from public.event_occurrences_v1 occurrence
    where occurrence.event_id = event.id
      and occurrence.start_at >= p_from
      and occurrence.start_at < p_to
  );

  return v_deleted;
end;
$$;

revoke all on function public.set_events_v1_updated_at()
from public, anon, authenticated;
grant execute on function public.set_events_v1_updated_at() to service_role;
revoke all on function public.ingest_event_record_v1(jsonb, jsonb, uuid, timestamptz)
from public, anon, authenticated;
revoke all on function public.reconcile_event_source_v1(text, uuid, timestamptz, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.ingest_event_record_v1(jsonb, jsonb, uuid, timestamptz)
to service_role;
grant execute on function public.reconcile_event_source_v1(text, uuid, timestamptz, timestamptz, timestamptz)
to service_role;

comment on table public.events_v1 is
  'Canonical Events V1 entities. Separate from occurrences and all Decision/Gate semantics.';
comment on table public.event_occurrences_v1 is
  'Concrete Events V1 performances/times. One canonical event may have many occurrences.';
comment on table public.event_staging_v1 is
  'Service-only source staging. Never exposed to consumers.';
comment on view public.event_discovery_v1 is
  'Read-only public Events V1 projection with licensed image fields only.';
