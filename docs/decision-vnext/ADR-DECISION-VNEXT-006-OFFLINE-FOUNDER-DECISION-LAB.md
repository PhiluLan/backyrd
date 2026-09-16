# ADR-006: Offline Founder Decision Lab

Status: Accepted for Phase-3C evaluation only.

## Decision

Provide a deterministic local lab inside `@backyrd/decision-vnext-core` plus a loopback-only German browser UI. Runtime contracts are strict and schema-first. Every release, compatibility record, cohort, interpretation, candidate assessment, oracle, report and result is content-addressed.

The lab loads the accepted Phase-3B Product Context release, consumes World only through `WorldKnowledgeReaderPort`, and consumes User only through `RelevantUserProjection`. Candidate tiers use the accepted Phase-3B per-rule Unknown policy. The Founder-confirmed Phase-3C evaluation rule keeps an unknown age rule as a visibly unconfirmed fallback; this narrowly scoped fixture override is content-addressed, non-production and does not change the Phase-3B Product policy. Registry 1.1 versus 2.0 is represented by an explicit evaluation-only compatibility record; it is not a Product upgrade.

Every candidate is now gated by explicit core-intent coverage. `ELIGIBLE_CONFIRMED` requires `CONFIRMED` coverage from authorized World classification/offering facts through the versioned evaluation-only mapping policy, the matching target location, all hard constraints confirmed and no situational reject. `UNKNOWN`, `NOT_CONFIGURED` and `INCOMPATIBLE` remain distinct. A confirmed age, accessibility or location fact can never confirm the whole Decision on its own. Compatible secondary intent and soft mood remain separately visible and cannot substitute for core-intent evidence.

The resolver is deterministic, local, replaceable and ephemeral. Fixture profiles add only synthetic calibration semantics and are bound to each World snapshot hash. They are not World facts and may not leave the lab as Product claims. A valid Founder cohort is optional; absent input causes an explicit unmixed synthetic fallback.

The Founder handoff is a single evaluation-only file produced by the existing local World authoring export. World binds its server-produced cohort manifest to the unchanged, minimized snapshots already available through the authenticated authoring read boundary. The file excludes precise coordinates, public contacts, payment and every other commercial or private field. Decision validates it recursively, persists an explicitly activated copy atomically outside Git, and reads no database. The active source is always visible and the two sources can never be mixed.

## Rejected alternatives

- Direct spot tables or legacy RPCs: prohibited by the World authority boundary.
- External NLP/AI resolver: unnecessary, non-deterministic and not authorized.
- Treating unknown facts as false: violates the Product Context policy.
- Spot-name or spot-ID mappings: rejected because they would bypass World provenance.
- Treating a situational reject as a failed World constraint: rejected because reject authority is limited to Spot × Decision × Context.
- Reading User event history: violates the minimized projection boundary.
- Silent registry upgrade: would create unreviewed Product semantics.
- A manifest-only Decision import: rejected because snapshot hashes without snapshot contents cannot support an offline evaluation.

## Consequences

The Founder can calibrate interpretation, constraints and explanations locally, but cannot claim recommendation quality or Production readiness. Fixture ordering only groups confirmed, fallback, not-configured and ineligible candidates. A later Production adapter, persistence model, calibrated ranking and real resolver require separate authorization.
