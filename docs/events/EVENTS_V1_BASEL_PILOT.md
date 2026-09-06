# Events V1 — Basel pilot

Events V1 is a deterministic source sync and discovery surface. It is isolated
from Decision, Mood, Reviews, ranking, and the Gate-1–7 contracts.

## Active and pending sources

- Manual Admin is the only active Events V1 authoring path during Founder
  acceptance.
- Eventfrog Public API remains explicitly disabled for this phase.
- PROZ / ProgOnline remains disabled until credentials and downstream data and
  image rights are documented.
- BaselLive remains disabled until an explicit partnership permits ingestion.
- Basel-Stadt OGD is registered as a disabled, supplemental-only source.
- HTML fallback is prohibited for every adapter.

External adapters deliberately import no images. Image URLs and credits are
also redacted from staging payloads. A source image can only be stored when
`image_rights_verified` is true and a non-empty credit is present. A Founder
upload is scoped to its manual Event and records `MANUAL_ADMIN` provenance.

## Manual recurrence materialization

`events_v1.recurrence_rule` is the long-lived source of truth. Concrete future
Occurrences are a deterministic rolling projection from today through twelve
months ahead. The daily reconciliation calls
`reconcile_manual_event_occurrences_v1()` to extend that window. Exact replay
updates existing generated rows without changing their IDs.

Past generated Occurrences are retained as history. Rows marked
`is_recurrence_exception` are never deleted or overwritten by regeneration, so
a single cancelled or moved date survives every horizon refresh. The generator
suppresses the corresponding regular Occurrence and never creates a second
Event for a recurring date.

## Pipeline

`source adapter -> staging -> validate/normalize -> venue match -> conservative dedupe -> event/occurrence -> publish`

An Event is the canonical concept. An Occurrence is one concrete time. Venue
matching uses a saved source venue mapping first, then exact address, unique
coordinates within 60 metres, then exact normalized name and city. Ambiguous
or weak matches stay unmatched. Event ingestion never creates or edits a
Backyrd Spot.

Incremental runs use a three-day source modification overlap. Full source
reconciliation and manual horizon reconciliation must run daily. A wider
external-source full sync should run at least every 30 days once an adapter is
approved. The external scheduler is intentionally not activated by this pilot;
production scheduling needs Founder approval together with the production
deployment.

## Local validation

Apply the migration to an isolated Supabase environment, then run:

```bash
npm --workspace @backyrd/events-sync test
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/events_v1_basel_pilot.sql
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/events_v1_manual_recurrence_horizon.sql
```

The SQL proof runs in a transaction and rolls back all test rows. It covers a
multi-occurrence Event, exact replay, cancellation, a moved/postponed
Occurrence, source deletion reconciliation, conservative venue matching, RLS,
and the unauthorized-image invariant.

## Future Eventfrog pilot command

Provide secrets only through the local or deployment secret store:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
EVENTFROG_API_TOKEN=... \
EVENTS_FROM=... \
EVENTS_TO=... \
npm --workspace @backyrd/events-sync run pilot:eventfrog
```

Use `EVENTS_SYNC_MODE=INCREMENTAL` for overlap-based incremental runs. The
default is reconciliation. Do not supply a token or run this command until a
separate Founder approval explicitly activates Eventfrog.
