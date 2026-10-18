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
`decision-vnext-librarian-evaluator@3`; Spot-only evaluation remains @1.

The internal event projection shares the existing offer vocabulary. It never
inherits venue opening hours, atmosphere, accessibility, cuisine or age rules.
Published category MUSIC proves a music event, not live music or Jazz. Explicit
Admin `decision_tags` establish genre/format; `family_friendly=true` supports
family-friendly ranking but never overrides a known minimum age. Other missing
properties remain unknown. Specific activities are stored in `events_v1.decision_activities` (up to 32
human-confirmed labels, 160 characters each). Admin exposes these separately
from broad categories and genre/format tags. The v6 context carries them as
`activities`; they become properties of this occurrence's offer. Arbitrary
activities use exact matching; shared vocabulary maps supported synonyms such
as Pingpong, Tischtennis and table tennis. Event descriptions and titles are
not treated as proof. Existing rows stay empty until an Admin confirms their
activities; this migration does not silently infer or backfill production data.

## Eligibility and ranking

Cancelled, postponed, ended and sold-out occurrences are excluded. Ticket status
is per occurrence, so one cancelled or sold-out date does not remove the series.
Past events do not reappear in undated discovery. For an unknown end, an event is
retained only on its start day or before its start; no arbitrary duration is
invented. An exact requested visit must fit the known interval; coarse windows
may overlap it. Unknown end times stay uncertain. Missing time input imposes no
implicit today/open-now filter; the actual event date remains visible.

A bound, confirmed free entry tariff satisfies a zero budget without inventing
a currency, party size or per-person scope: zero remains zero in each case. A
known positive universal entry fee contradicts a free request. Missing prices
stay unknown, and separately requested cost components (such as equipment)
are not silently covered. Recurring series occupy one visible card, choosing
the best supported occurrence and then its nearest matching date. Distinct
events at one venue remain distinct candidates.

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
migration's read and validation boundaries in an isolated fixture database.
It first checks OFF-state rejection, then obtains a transaction-local lease
through the real operator activation API; ROLLBACK restores the initial state. It checks service-only execution, retained RLS,
unknown/invalid actors, invalid tags/statuses, image rights, publication filtering,
per-occurrence status, consent-neutral output and events without a Spot. The initial schema-only rehearsal used a substituted control function; the
subsequent full 185-migration clean boot and selected Event SQL test use the real
control/activation functions and pass without that substitution. Neither is a
production activation or restore rehearsal. Production release still requires the normal release,
migration-risk and recovery gates. Manual app/device verification remains part
of release acceptance.

Local implementation check: 341 core tests, 19 Mobile contract/Wohin tests,
6 existing Mobile product-contract checks and 54 release/production-plan checks
passed, as did Mobile/Web/Admin type checks and the single-route validator.
The migration and SQL boundary test passed in the isolated synthetic database.
The frontend build blockers were resolved on 2026-10-18: dependencies were
installed from the existing lockfiles inside this worktree, and UI imports now
use the explicit World Knowledge browser entry with a browser-compatible hash
adapter. Web and Admin production builds pass with both Turbopack and Webpack;
373 World Knowledge tests (including browser-boundary/hash parity), 341 Decision
tests and a synthetic Owner editor browser smoke test pass. This is local build
and fixture evidence, not a production release or Event device acceptance.

The Mobile production validator recognizes only the optional boolean Event opt-in;
unknown client authority fields remain rejected. Web/Admin contract suites
(30/85 cases) and Mobile release validation also pass. The generated database
evidence records the independently reproducible schema/ACL fingerprints; it is
not migration-risk approval or permission to deploy.

## Open Court diagnostic (2026-10-18)

The original Spot-only test missed Events. The corrected local replay uses the
current canonical cohort (390 Basel Spots) and 23 published Open Court
occurrences, plus the human's explicit confirmation of `Tischtennis spielen`
applied locally. A real captured Luna interpretation drives the same evaluator
and response builder. Expected result: one confirmed Open Court card for
2026-10-26, 16:00–23:00 Europe/Zurich, with no requested-time gate and no unknown
budget. This diagnostic does not claim the production field has been saved,
that Event integration is deployed, or that authentication/personalization has
been retested. Saving the activity requires the new schema and normal Admin
write path after release.

Activity correction validation: 352 Decision core tests, 373 World tests and
86 Admin contracts pass. The Admin production build passes with local placeholder
public configuration. The full isolated 186-migration database boot, SQL activity
bounds, positive/negative access tests and generated release-evidence validation
pass. The local real-meaning replay returns one confirmed Open Court candidate
at rank 1, with 23 recurring occurrences evaluated before series collapse.
