# ADR: Decision vNext Phase-1 Foundation

- Status: superseded for World/User integration by ADR-DECISION-VNEXT-002; retained as historical Phase-1 rationale
- Date: 2026-09-09
- Canonical base: `964ed9abe15d1385d7967a7ab24e0012c4f15eed`
- Scope: local and CI-only foundation; no production integration

## Context

Decision vNext must evolve independently of `decision-v13`. Phase 1 needs one
runtime-validatable contract source, deterministic replay, central eligibility,
evidence-bound explanations and an isolated synthetic evaluation path. It must
not freeze legacy taxonomies, weights or scores as product truth.

## Binding architecture decisions

1. `@backyrd/decision-vnext-core` is a new core with no imports from Decision
   Lab, `decision-v13`, Supabase, Mobile or Web.
2. Runtime schemas are the canonical contract source. TypeScript types are
   inferred from those schema objects. Strict objects reject unknown fields.
3. Client `DecisionRequest` and server `DecisionExecutionEnvelope` are separate
   schemas. `DecisionRequest` has no `userId`; the authenticated actor exists
   only in the execution envelope.
4. Candidate generation produces a frozen neutral pool before eligibility and
   ranking. It receives no user model.
5. Only the eligibility module can construct the branded `EligibleCandidate`.
   Rankers accept only this branded type.
6. Evidence assembly, reason authorization and rendering are separate.
   Rendering is deterministic and cannot add claim types or evidence IDs.
7. Canonical JSON sorts object keys, preserves all array order, normalizes
   strings to Unicode NFC, maps negative zero to zero and rejects undefined,
   non-finite numbers and unsupported values.
8. All dates crossing a Phase-1 contract are canonical UTC strings with
   millisecond precision (`YYYY-MM-DDTHH:mm:ss.sssZ`).
9. Phase-1 fixture arrays are ordered unless their producer explicitly sorts
   them before contract construction. Candidate and recommendation order is
   always semantically relevant.
10. Commercial probe fields are outside the synthetic engine input and strict
    Decision contracts reject them.
11. World Knowledge concepts are opaque, versioned registry references. Phase
    1 fixes no canonical World vocabulary.
12. Intent, Capability, direct Situation Fit and derived Situation Fit are
    separate structures. Facts and relations are content-addressed and retain
    provenance, verification, time, confidence and Evidence references.
13. A real World source may enter vNext only through `WorldKnowledgePort`.
    Phase 1 contains no Production implementation of that port.
14. Events and Temporary Places remain separate entity kinds referenced by
    relations; they are not collapsed into Spot facts.

## Technical Phase-1 choices

- A dependency-free schema DSL is used because the repository has no existing
  shared runtime-schema dependency. Adding a library can be reconsidered if
  contract complexity materially outgrows the small DSL.
- SHA-256 over canonical UTF-8 JSON supplies content identity.
- Candidate retrieval is a stable ID-order fixture. It intentionally does not
  claim product retrieval quality.
- Baseline scores are internal, transparent fixture computations. They are not
  exposed as a long-term Decision Result score contract.
- Confidence contains uncalibrated evaluation components and limitations. It
  is not a probability and does not affect rank.
- The synthetic registry vocabulary is an unapproved fixture used only to
  exercise generic registry, fact and relation contracts.

## Rejected alternatives

- Extending `decision-v13`: violates independent-core scope.
- Maintaining TypeScript interfaces and JSON Schema separately: permits drift.
- Calling Supabase or Production from the sandbox: violates isolation.
- Treating the existing Decision Lab latent utility weights as product truth:
  historical evaluation assumptions are not approved vNext semantics.
- Letting all structurally compatible objects reach ranking: would weaken the
  central eligibility invariant.

## Consequences

The package is intentionally narrow. A future production adapter must translate
existing World, User and Context sources into these contracts without exposing
their internal schemas. Learning, persistence, client rollout, AI and production
activation remain outside Phase 1.
