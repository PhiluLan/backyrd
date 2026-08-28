# Temporal User-Evidence Attribution

## Contract

Canonical learning-capable Product actions are interpreted against the immutable Decision moment and Spot Intelligence that existed when the action occurred. Worker rebuilds never query current N4 to reinterpret a historical event.

The bounded envelope stores references and structured context only:

- Decision, event, session, user and Spot identities
- semantic contract version, Decision package hash and moment hash
- requested audience/daypart/place type plus bounded current-intent concepts and city
- ambient observed daypart separately from requested daypart
- candidate N4 snapshot hash/identity, availability and frozen 45-registry Taste concepts
- suitability facts used by the Decision
- processing disposition and envelope hash

Raw query text is not copied into User Intelligence. The Decision package and its hash remain unchanged; the envelope is an adjacent historical-attribution record.

## Authority rules

- Explicit requested daypart is authoritative. Ambient execution daypart is audit metadata only.
- `Passt` remains a current-moment outcome. It is not Visit, Satisfaction, Favorite or an automatic global like.
- N4 `UNKNOWN` at event time remains unattributed even after later enrichment.
- Known event-time concepts remain fixed even if N4, place type, city or Gold facts later change.
- Concepts outside the frozen 45 Taste registry never enter Taste evidence.
- Existing unpinned events fail closed and are never joined to current N4. No historical provenance is fabricated.
- SELF_DECLARED evidence remains direct canonical evidence under the existing frozen policy.

## Event matrix

| Product event | Event-time N4 | Moment | Taste authority |
|---|---:|---:|---|
| Passt | exact Decision candidate package | exact Decision moment | existing frozen explicit moment-outcome policy |
| Nicht passend | exact Decision candidate package | exact Decision moment | correction only; never durable dislike |
| Open | pinned at capture; Decision package when bound | Decision moment when bound | existing bounded attention policy |
| Save | pinned at capture; Decision package when bound | Decision moment when bound | existing interest policy |
| Route / reservation intent | pinned at capture; Decision package when bound | Decision moment when bound | intent/action, not satisfaction |
| Verified visit | pinned at capture | bound moment when available | experience, not satisfaction |
| Standard/Smart Review and moods | pinned at review capture | journey context when available | existing frozen review/mood contract |
| Exposure / Decision request | not copied | identity only | no Taste |

## Historical policy

Events are classified as `PINNED`, `RECONSTRUCTABLE_FROM_IMMUTABLE_DECISION_PACKAGE`, or `UNPINNED`. New canonical events are pinned prospectively. Old unpinned events are retained as N2 history but omitted from concept-level Taste input with `UNPINNED_HISTORICAL_FAIL_CLOSED`.

The clean backyrdBuddy event `5683abec-5e16-4d8b-8e38-19655d6c1c13` predates the envelope. Its immutable Decision trace proves Decision-time N4 was `UNKNOWN`; it remains a valid current-moment outcome with no Spot-concept Taste attribution. The later KaBar N4 is not attached.

## Spot-open audit

The three post-Passt opens form a B1 Rooftop Bar → nearby Puro → B1 sequence. Mobile emits generic `spot_opened` only when the Spot Detail route mounts, and nearby `spot_opened` only inside the pressed nearby-card handler. No render, image prefetch or card preload emission path was found. No Mobile change was justified.

## Security and retention

Envelope and processing tables are service-only with RLS enabled. Client roles cannot read or write them. Existing user consent, withdrawal purge, cross-user isolation and service-only User Card writes remain unchanged. Spot and Decision foreign keys retain the current referential-integrity and deletion behavior.

