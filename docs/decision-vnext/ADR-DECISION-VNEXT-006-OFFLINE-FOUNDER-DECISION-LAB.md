# ADR-006: Offline Founder Decision Lab

Status: Accepted for Phase-3C evaluation only.

## Decision

Provide a deterministic local lab inside `@backyrd/decision-vnext-core` plus a loopback-only German browser UI. Runtime contracts are strict and schema-first. Every release, compatibility record, cohort, interpretation, candidate assessment, oracle, report and result is content-addressed.

The lab loads the accepted Phase-3B Product Context release, consumes World only through `WorldKnowledgeReaderPort`, and consumes User only through `RelevantUserProjection`. Candidate tiers use the accepted Phase-3B per-rule Unknown policy. Registry 1.1 versus 2.0 is represented by an explicit evaluation-only compatibility record; it is not a Product upgrade.

The resolver is deterministic, local, replaceable and ephemeral. Fixture profiles add only synthetic calibration semantics and are bound to each World snapshot hash. They are not World facts and may not leave the lab as Product claims. A valid Founder cohort is optional; absent input causes an explicit unmixed synthetic fallback.

## Rejected alternatives

- Direct spot tables or legacy RPCs: prohibited by the World authority boundary.
- External NLP/AI resolver: unnecessary, non-deterministic and not authorized.
- Treating unknown facts as false: violates the Product Context policy.
- Reading User event history: violates the minimized projection boundary.
- Silent registry upgrade: would create unreviewed Product semantics.

## Consequences

The Founder can calibrate interpretation, constraints and explanations locally, but cannot claim recommendation quality or Production readiness. Fixture ordering only groups confirmed, fallback, not-configured and ineligible candidates. A later Production adapter, persistence model, calibrated ranking and real resolver require separate authorization.
