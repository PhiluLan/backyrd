# ADR Decision vNext 004 — Situational Context & Constraint Kernel

Status: Phase-3A technical decision; Product semantics not approved.

## Decision

Introduce an additive, schema-first Context kernel inside `@backyrd/decision-vnext-core`. Keep the Phase-1/2 snapshot intact for replay compatibility. The new kernel has five independently hashed authorities: dimension registry, context policy, server authority record, external trust anchor and minimized context snapshot.

Context dimensions use exactly one of `EXPLICIT`, `SERVER_AUTHORIZED`, `DERIVED`, `UNKNOWN`, `NOT_CONFIGURED`, `NOT_AVAILABLE` or `DENIED`. Derived values require an accepted deterministic rule, source hashes and a proof hash. Hard constraints and soft preferences are distinct schemas; only hard constraints can carry a per-rule unknown policy. Context has no World or User write capability and no ranking implementation.

Consumer access is capability-based. A caller first recursively verifies the complete execution envelope against the external Context trust anchor, registry, policy and original client input. Only the resulting process-local, non-forgeable `VerifiedContextSnapshot` can be projected. A raw snapshot, schema parse, object spread, structured clone or TypeScript cast cannot create that capability. Projection then emits a hashed decision for every dimension (`AUTHORIZED`, a precise withheld state, or `EVALUATION_ONLY`) instead of treating registry visibility as Product authorization. The fixture policy grants no Ranking or Explanation authorization.

Structural Oracles consume a pre-released Authority Catalog and a separately released Trust-Anchor Catalog. A review-pinned synthetic release record binds both catalog hashes, the exact 15-scenario allowlist, and the fixture workbench version before a run starts. The Oracle contains only an authority binding, never its own trust root. The authority binds scenario, base/flip contexts and envelopes, exact allowed input and dimension changes, hard/soft set changes, eligibility expectation, validity and approval class. Reports bind all release hashes, are rebuilt from verified contexts, and must match those sets exactly.

Authority/Anchor provisioning is fixture tooling and is not exported from the runtime package API. A workbench run can validate and consume an accepted release but cannot generate or trust an arbitrary Authority. Any expectation change requires a reviewed catalog/release hash change.

## Why

Phase 2 safely bound a small context shape but could not express provider outages, denied permission, unconfigured semantics, registry governance, rule-level unknown policy, session provenance or pairwise Product evaluation. Extending the old shape in place would invalidate existing replay artifacts and couple Product decisions to a technical closure.

## Security and privacy consequences

- Server authority cannot be constructed from a client request.
- Separate, independently hashed Authority and Trust-Anchor catalogs plus a pinned release identity prevent a rehashed authority record and matching attacker-created anchor from self-authorizing.
- Precise coordinates are represented only by an input hash and a server-authorized scope; raw coordinates do not enter the snapshot.
- Companion values are registry references; concrete person identity and free text have no contract channel.
- Weather requires a source hash, authorized scope, observation time and validity.
- Session lists are canonical, deduplicated and server-bound.
- Commercial fields have no schema path and fail strict validation.
- Context explicitly promises no World or User Intelligence writes.
- Fixture registries and `DRAFT`/`NOT_CONFIGURED` dimensions cannot be relabelled as Product Ranking inputs.
- Soft preferences never enter Eligibility; hard constraints remain subject to the central rule-wise policy.
- Oracle self-authorization and partially matching flip reports fail closed, even after outer hashes are recomputed.
- Verified Context and accepted-catalog capabilities are process-local, non-serializable authorities. Full verification is required again after any process, worker, queue, or service boundary.

## Rejected alternatives

- Reusing legacy RPC output: it is presentation-oriented and lacks provenance.
- Expanding `decision-v13`: violates the independent-core strategy.
- One global unknown policy: it cannot safely distinguish a casual query from a required accessibility fact.
- Storing raw request/location in the snapshot: unnecessary for technical replay and incompatible with minimization.
- Defining Product taxonomies now: outside Phase 3A authority.

## Follow-up

A later approved adapter may bind the Phase-3A snapshot into the canonical integration execution envelope. Production persistence, client wiring, Product policies and ranking effects require separate approval.
