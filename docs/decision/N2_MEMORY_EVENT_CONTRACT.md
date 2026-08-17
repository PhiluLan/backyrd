# N2 Canonical Memory Event Contract

Status: **IMPLEMENTED — LAB/CODE VALIDATED, NOT PRODUCT-WIRED**

Version: `backyrd-memory-event-contract-v1`

Parent: `backyrd-decision-system-contracts-v1`

## 1. Boundary

Memory records **what happened**. It never stores “the User likes X” as historical fact. That interpretation belongs to versioned User Intelligence and is rebuildable from active, eligible Memory Evidence.

Memory is immutable. A correction appends an Event with `supersedesEventId`; it does not rewrite the original. Exact replay is idempotent. A conflicting reuse of an Event ID or idempotency key fails closed.

## 2. Envelope

Every Event carries:

- Event ID, User ID and stable idempotency key;
- Event type/class and contract version;
- occurred, observed and ingested timestamps;
- Decision/session and Spot references when applicable;
- a minimized Moment signature;
- the contemporaneous Spot-concept evidence needed by learning;
- source, source Event ID and source version;
- personalization consent purpose and granted-state snapshot;
- exposure rank/propensity where available;
- correction/supersession reference;
- retention class, expiry and deterministic Event hash.

Forbidden fields include Latent Truth, evaluation utility, oracle labels, fingerprints, contacts/Wi-Fi identifiers, private Trust/moderation evidence and advertising identifiers.

## 3. Event classes and learning meaning

| Class | Canonical examples | Learning boundary |
|---|---|---|
| Request | Decision request, structured Intent, minimized Moment | temporary Moment evidence; no automatic durable Taste |
| Exposure | Decision results/candidate shown | neutral; used for attribution and debiasing |
| Weak interaction | tap/open | weak, bounded positive evidence |
| Deliberate intent | save, navigation, reservation intent | stronger intent, not proof of satisfaction |
| Outcome | verified visit | strong behavior, still Context-dependent |
| Explicit feedback | mood/review/positive/negative post-visit | strongest declared evidence within scope |
| Onboarding | declared initial preference | bounded and correctable |
| Correction | not there, append-only correction | neutral unless an explicit negative event exists |

`not there`, missing interaction and missing consent are never dislikes. Repeated same-Spot or same-session events do not create independent support.

## 4. Minimized Moment signature

Allowed fields are `audience`, `daypart`, `calendar`, `occasion`, `placeType`, `friction` and `distanceWillingness`. Raw request text, precise location trails and arbitrary Context bags are not persisted. City may be source provenance, but is not part of global User truth or a Behavioral Pattern identity.

N3 will own the full temporary `CurrentMoment`. Only this minimized post-Decision signature crosses into N2.

## 5. Retention contract v1

| Class | Maximum raw retention | Purpose |
|---|---:|---|
| Request minimized | 30 days | short-lived Context reconstruction |
| Exposure | 90 days | attribution/position-bias context |
| Weak interaction | 180 days | bounded weak behavior |
| Deliberate intent | 365 days | purposeful Product actions |
| Outcome | 730 days | durable high-value behavior |
| Explicit feedback | 730 days | declared experience Evidence |
| Onboarding | 730 days | correctable cold-start Evidence |
| Correction | 730 days | reconstruction of supersession chains |

Retention expiry deletes raw Events and invalidates affected derived state for rebuild. Consent withdrawal and account erasure delete raw Memory, Patterns, Intelligence state and Memory-derived Taste state immediately. No scheduler or Production retention job is enabled by N2.

## 6. Existing source adapters

The migration registers source mappings but performs no backfill:

- `decision_sessions` and `decision_impressions` are supported through minimized adapters;
- `favorites` and semantically matching `backyrd_ml_events_v1` Events are supported;
- Review/mood rows require explicit direction/concept qualification;
- `spot_detail_view` must not be migrated as a verified visit;
- legacy `user_taste_events_v2` lacks the complete provenance/consent/Context envelope and remains ambiguous;
- existing Wave-3A Taste Evidence is integrated as existing learning state and is not duplicated into fabricated historical Memory.

Ambiguous history is documented, not guessed.

## 7. Security

Raw Memory is service-only, RLS-enabled and not granted to `anon` or `authenticated`. Validated server ingestion derives class, retention and hash from registries and rejects unsupported, stale, future, malformed, non-consented or privacy-forbidden input. Own-user Product access is limited to bounded summaries and a minimized timeline RPC.

No Production connection, migration execution or Product wiring occurred in N2.
