# Decision vNext Phase 3A — Situational Context & Constraint Kernel

## Executive architecture

In plain language, the kernel turns “what matters right now?” into a sealed technical snapshot. It records which statements came from the user, which came from an authorized server source, which were deterministically derived, and which are unknown, unavailable, denied or not yet defined by Product. It does not choose a spot.

```text
strict Client Context Input
        +
externally trusted Server Context Authority
        +
versioned Dimension Registry + Context Policy
        +
optional authorized Weather Provider
        ↓
minimized Context Snapshot
        ↓
consumer-specific read projection
  Eligibility | Ranking | Explanation | Evaluation
```

There is no write edge to World Knowledge or User Intelligence. “Ranking” in the registry means only that a future approved adapter may read that dimension; it grants neither weights nor ranking authority.

## Contract ownership

- `context-kernel-contracts.ts`: sole schema/type source for Phase-3A contracts.
- `context-kernel.ts`: deterministic resolution, registry/policy/authority validation, minimization and recursive integrity.
- `context-degradation.ts`: explicit technical action matrix; no silent fallback.
- `context-oracle.ts`: structural oracle and replay rules.
- `context-flip-harness.ts`: fifteen pairwise synthetic context scenarios.
- `context-fixtures.ts`: small, visibly non-canonical fixture vocabulary and local-only authorities.

## Authority and request boundary

The client supplies only the canonical `DecisionRequest`, explicit typed dimensions and constraint/preference declarations. Strict runtime schemas reject user identity, server time, registry/policy selection, unknown policy, evidence, confidence and commercial fields.

The server authority binds actor subject, decision/session, server clock, IANA timezone, authorized location scope, permission/source, registry/policy, World/User/Pool hashes, Eligibility/Degradation policy identities and canonical session state. The authority is accepted only when a separate trust anchor matches it. Both authority and trust anchor are explicitly synthetic and `productionCapable:false` in this slice.

## Dimension registry

Every definition declares data type, allowed authority, privacy class, persistence, maximum precision, validity, allowed consumers, eligibility/ranking/explanation relevance, learning policy, unknown-policy requirement and lifecycle status. The included vocabulary is a technical fixture, has `productTaxonomyConfigured:false`, and does not define final intent, mood, companion, occasion, budget, weather or exploration semantics.

## Time and location

- UTC server time is authoritative.
- Local date/time/weekday are deterministically derived through an IANA timezone and carry rule/source proof.
- Clock policy distinguishes current, late/offline-with-limitation, too old and implausibly future requests.
- Existing opening-hours evaluation remains World-owned and already tests local time, DST, overnight intervals and special days.
- City/radius scope is server-authorized. A coordinate request is hash-bound but becomes `PRECISE_COORDINATE_MINIMIZED`; raw coordinates never enter the snapshot.
- Permission denial and technical unavailability remain distinct.

## Constraints

Hard constraints have a rule identity, source dimension, policy identity and one of five technical unknown treatments. Soft preferences explicitly have `eligibilityAuthority:false`. Unconfigured constraints remain `NOT_CONFIGURED`; they never silently pass or exclude.

The only Phase-3A policies are synthetic fixtures for the already-established `openNow` rule and an accessibility safety scenario. Both say `productApproved:false`. They demonstrate structure, not Product policy.

## Context snapshot and integrity

The snapshot binds registry, policy, server authority, request hash, decision/session/subject, World/User/Pool identities, local/UTC time, minimized location, dimensions, constraints, session state, limitations and privacy promises. Recursive validation checks every dimension, derived proof, constraint, session hash and explicit client claim against the authoritative sources. Recalculating outer hashes cannot legitimize changed inner semantics.

## Degradation

The versioned matrix distinguishes `FAIL_CLOSED`, `REQUEST_REJECTED`, `USER_CLARIFICATION_REQUIRED`, `DIMENSION_IGNORED_WITH_LIMITATION`, `CANDIDATE_EXCLUDED`, `NEUTRAL_DEFAULT` and `EVALUATION_NOT_CONFIGURED`. Missing Product policy never becomes an implicit default.

## Context-flip and Oracle workbench

The local command `npm run decision-vnext:phase3a:context` evaluates fifteen deterministic pairs: companion, time, available time, distance willingness, weather, budget, exploration, accessibility constraint, location permission, weather availability, unknown/not-configured, alternative request, rejection history, authorized location and timezone.

Each report contains changed and unchanged dimensions, decision identities, hard/soft-set changes and a structural Oracle. Product ranking direction is always `NOT_CONFIGURED`; `rankingQualityClaim` is always false. Only `STRUCTURAL_INVARIANT` is asserted without Founder approval.

## Privacy and retention

The synthetic snapshot is run-scoped. If an equivalent snapshot is later persisted, it is exportable and deletable. Long-term storage should prefer hashes, registry/policy identities, reason codes and minimized scopes. Raw coordinates, free text, companion identities, private social data, review text, User raw events/evidence chains and complete user history are excluded. Any later Context-to-learning path requires a separate authorized User event and User Intelligence policy.

## Phase-3B readiness

The kernel is ready for a separately approved integration adapter once Product has selected the necessary taxonomies and rule policies. The adapter can consume a minimized snapshot through consumer projections without changing the registry or creating a second Context truth.

## Run locally

```bash
npm run decision-vnext:typecheck
npm run decision-vnext:test
npm run decision-vnext:phase3a:context
```

Phase-2 smoke/full, World, User, Decision Lab and the repository risk gate remain required regressions before review.
