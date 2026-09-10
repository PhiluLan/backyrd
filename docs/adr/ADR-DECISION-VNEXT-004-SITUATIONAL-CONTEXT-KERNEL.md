# ADR Decision vNext 004 — Situational Context & Constraint Kernel

Status: Phase-3A technical decision; Product semantics not approved.

## Decision

Introduce an additive, schema-first Context kernel inside `@backyrd/decision-vnext-core`. Keep the Phase-1/2 snapshot intact for replay compatibility. The new kernel has five independently hashed authorities: dimension registry, context policy, server authority record, external trust anchor and minimized context snapshot.

Context dimensions use exactly one of `EXPLICIT`, `SERVER_AUTHORIZED`, `DERIVED`, `UNKNOWN`, `NOT_CONFIGURED`, `NOT_AVAILABLE` or `DENIED`. Derived values require an accepted deterministic rule, source hashes and a proof hash. Hard constraints and soft preferences are distinct schemas; only hard constraints can carry a per-rule unknown policy. Context has no World or User write capability and no ranking implementation.

## Why

Phase 2 safely bound a small context shape but could not express provider outages, denied permission, unconfigured semantics, registry governance, rule-level unknown policy, session provenance or pairwise Product evaluation. Extending the old shape in place would invalidate existing replay artifacts and couple Product decisions to a technical closure.

## Security and privacy consequences

- Server authority cannot be constructed from a client request.
- A separately supplied trust anchor prevents a rehashed authority record from self-authorizing.
- Precise coordinates are represented only by an input hash and a server-authorized scope; raw coordinates do not enter the snapshot.
- Companion values are registry references; concrete person identity and free text have no contract channel.
- Weather requires a source hash, authorized scope, observation time and validity.
- Session lists are canonical, deduplicated and server-bound.
- Commercial fields have no schema path and fail strict validation.
- Context explicitly promises no World or User Intelligence writes.

## Rejected alternatives

- Reusing legacy RPC output: it is presentation-oriented and lacks provenance.
- Expanding `decision-v13`: violates the independent-core strategy.
- One global unknown policy: it cannot safely distinguish a casual query from a required accessibility fact.
- Storing raw request/location in the snapshot: unnecessary for technical replay and incompatible with minimization.
- Defining Product taxonomies now: outside Phase 3A authority.

## Follow-up

A later approved adapter may bind the Phase-3A snapshot into the canonical integration execution envelope. Production persistence, client wiring, Product policies and ranking effects require separate approval.
