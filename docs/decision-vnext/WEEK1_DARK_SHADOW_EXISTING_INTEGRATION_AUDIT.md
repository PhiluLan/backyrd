# Decision vNext Week 1 — Existing Integration Audit

Canonical audit base: `4dd76c6149e425f191586e904d21b851fc1995c5` (tree `66f2d1dfea59c41bb762eee19a4ddfea2842c479`). This audit is repository-only. It used no Production data, credentials, RPC calls or shadow traffic.

## Classification

| Existing component | Classification | Week-1 decision |
|---|---|---|
| Phase-3C Founder Decision Lab result and recursive integrity | KEEP | The accepted offline result is the canonical baseline and supplies the smallest complete World/User/Context/candidate binding. |
| `WorldKnowledgeReaderPort` and founder cohort handoff | KEEP | Consume only the canonical read projection and hashes; never read spot tables or World ledgers directly. |
| `RelevantUserProjection` | KEEP | Consume only its canonical minimized projection identity. Raw events, reviews, searches, memory and evidence chains remain prohibited. |
| Phase-3B/3C Context interpretation and policy | KEEP | Bind the accepted interpretation and policy; do not create an alternative Context contract. |
| Neutral candidate set and Phase-3C candidate assessments | KEEP | Freeze the same ordered candidate IDs for canonical and shadow evaluation. |
| Phase-3C replay and content hashing primitives | EXTEND | Reuse canonical serialization and add a shadow envelope/report identity. |
| Decision CI sharding and Risk Gate routing | EXTEND | Add one targeted Week-1 group and include the new security test in the existing core shard. |
| Phase-3C local Founder UI | ADAPT LATER | Useful as offline evidence; it is not a Production request adapter. No UI wiring is added in Week 1. |
| `packages/n6-shadow-runtime` | PROHIBITED FOR VNEXT WIRING | Historical Decision-v13 comparator/runtime with Supabase RPC behavior. It is evidence only and cannot become the vNext adapter. |
| Active Decision-v13 RPCs and Edge Functions | PROHIBITED | No calls, edits, wrapping, or behavior changes. |
| Direct `spots`, N4, Suitability, raw User-event or memory reads | PROHIBITED | These bypass canonical World/User boundaries. |
| Product ranking and calibrated confidence | UNKNOWN / NEEDS PRODUCT DECISION | Contracts expose `NOT_CONFIGURED`; Week 1 grants no authority or weights. |
| Production sampling, retention and operational ownership | UNKNOWN / NEEDS PRODUCT/PRIVACY/OPS DECISION | Required before real shadow traffic; deliberately absent from this release. |

## Phase-3C gaps closed by this slice

Phase 3C proved offline semantics but did not define a disabled Production-shaped execution boundary, a closed shadow oracle set, or a technical comparison report. Week 1 adds those three pieces without adding any Production adapter:

1. a server-authority-shaped envelope that binds the accepted source/tree artifact, World cohort, minimized User projection, Context, candidate set, Phase-3C release and policy;
2. a fail-closed control whose only valid state is disabled with an engaged kill switch and zero sampling;
3. deterministic structural metrics for interpretation, hard-constraint, tier, UNKNOWN/fallback, false-confirmation, false-exclusion and replay parity.

The implementation is intentionally incapable of changing the visible result, eligibility authority, ranking authority, confidence authority, World state or User state.

## Current Product truth

The ten scenarios in the Week-1 catalog are accepted Founder semantics used as structural regression evidence. They are not ranking or confidence oracles. Both remain `NOT_CONFIGURED`; every artifact carries `productionAuthorized:false` and `productQualityClaim:false`.

