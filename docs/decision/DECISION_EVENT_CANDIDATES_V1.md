# Decision event candidates v1

Implementation prepared on 2026-10-18. This document does not certify a production
release. Apply the migration, deploy the Decision worker, then deploy Web/Admin
and the compatible mobile OTA; older clients retain context v5 and Spot-only
responses. A rollback can switch clients to `includeEvents: false` without
removing stored events or rewriting any existing migration.

## Source and identity

New clients send `includeEvents: true`. Service-only context v6 checks the active
release, authenticated actor and canonical consent before returning published
`manual_admin` occurrences in the authorized city, within 366 days. Up to 1,000
canonical Spot bindings and 500 event occurrences are evaluated in one request.
Overflow fails explicitly rather than silently truncating valid candidates.
There is no extra model request, source crawler or external ingestion activation.
An empty Spot cohort is allowed when published events exist.

Each occurrence has candidate ID `event:<occurrence UUID>`, separate `eventBindings`
provenance, and `presentation.event` metadata. The legacy field name `spotId`
remains a transport compatibility detail; an event ID is never written into the
World ledger or canonical Spot learning. Event evaluation is versioned as
`decision-vnext-librarian-evaluator@2`; Spot-only evaluation remains @1.

The internal event projection shares the existing offer vocabulary. It never
inherits venue opening hours, atmosphere, accessibility, cuisine or age rules.
Published category MUSIC proves a music event, not live music or Jazz. Explicit
Admin `decision_tags` establish genre/format; `family_friendly=true` supports
family-friendly ranking but never overrides a known minimum age. Other missing
properties remain unknown. Additional activity subtypes need explicit structured
support; event descriptions and titles are not treated as proof of those facts.

## Eligibility and ranking

Cancelled, postponed, ended and sold-out occurrences are excluded. Ticket status
is per occurrence, so one cancelled or sold-out date does not remove the series.
Past events do not reappear in undated discovery. For an unknown end, an event is
retained only on its start day or before its start; no arbitrary duration is
invented. An exact requested visit must fit the known interval; coarse windows
may overlap it. Unknown end times stay uncertain. Missing time input imposes no
implicit today/open-now filter; the actual event date remains visible.

Known minimum ages and entry prices participate in the existing deterministic
eligibility rules. Unknown ticket stock, accessibility, atmosphere and ancillary
properties do not fabricate certainty or automatic exclusions. A ticket link
never proves stock or a reservation. Every event includes a reminder to check
participation/tickets. A confirmed event replaces its linked venue in the visible
ranked window; other applicable Spots remain eligible.

Consent-bound affinity for the linked venue may influence ranking only. Event
impressions, opens and rejections do not produce Spot learning. Dedicated event
learning and genre-level taste personalization are intentionally not introduced
in this version.

## Surfaces and operations

Mobile/Web show the event date and venue and navigate to the exact occurrence.
Images use existing event storage and rights checks, never a Google Spot fallback
for an unlinked venue. Admin exposes explicit format/genre and per-date ticket
status through the existing authenticated event authoring path and RLS.

No recurring task, provider credentials, new public write grant, consent rule or
production setting is changed. Existing manual recurrence reconciliation keeps
occurrence IDs and per-occurrence ticket status on unchanged dates.

## Verification

Run core `npm test --workspace @backyrd/decision-vnext-core`, Mobile contract and
Wohin model tests, and type/build checks for the affected clients. Focused cases
cover real HTTP composition, both client validators, occurrence navigation,
calendar/overnight matching, cancellation, stock, age, budgets, explicit genre,
family suitability and venue deduplication.

`supabase/tests/decision_manual_event_candidates_v1.sql` exercises the new
migration's read and validation boundaries in an isolated fixture database with
release-control fixtures. It checks service-only execution, retained RLS,
unknown/invalid actors, invalid tags/statuses, image rights, publication filtering,
per-occurrence status, consent-neutral output and events without a Spot. The
local schema-only rehearsal substitutes the release-control function and seeds
one synthetic auth user; it does not certify the production activation gate or
a restore rehearsal. Production release still requires the normal release,
migration-risk and recovery gates. Manual app/device verification remains part
of release acceptance.

Local implementation check: 341 core tests, 18 Mobile contract/Wohin tests,
6 existing Mobile product-contract checks and 54 release/production-plan checks
passed, as did Mobile/Web/Admin type checks and the single-route validator.
The migration and SQL boundary test passed in the isolated synthetic database.
Full frontend builds are **not certified**: this worktree resolves dependencies
through links outside the Turbopack root; an attempted Webpack fallback reaches
an existing `node:crypto` import through World authoring UI. A normal installed
dependency build and manual device acceptance remain required before release.
