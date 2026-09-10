# WorldKnowledgePort reference

Contract version: `backyrd.world-knowledge.port@1.0`

The port contains registry and rule identities, resolution time, Spot identity/location/classification/public contact, resolved facts, operational rules, valid Current States, supported capabilities, all derived-rule evaluations, conflicts, explicit unknowns, freshness counts, per-use-case readiness, exclusions, and a canonical snapshot hash. Structural fields are validated through the same registry definitions as ordinary entries.

## Sanitization

The builder accepts an optional non-knowledge context only to prove removal. These values never appear in the snapshot:

- user intents and taste
- Owner tier, subscription, and payment
- advertising and sponsorship
- Admin notes
- private source URLs
- raw AI output
- direct subjective fits as authorized facts

Expired Current States, Current States without expiry, and asserted-only opening hours are also excluded from current engine truth. Exclusion output contains only reason codes and counts, never the excluded payload.

## Readiness

There is no global percentage. The port returns `READY`, `PARTIAL`, or `NOT_READY` plus stable reason codes for:

- base profile
- classification
- discovery
- opening-hours eligibility
- price
- hard constraints
- accessibility
- intent matching
- trust/freshness

Intent matching is deliberately `NOT_READY` with `CAPABILITY_INTENT_REGISTRY_NOT_CONFIGURED` until a separate, versioned relation registry exists.

No fact-type-specific Source policy is approved in Slice 1. Discovery, opening-hours eligibility, price, hard constraints, accessibility, and trust/freshness therefore cannot become `READY`; they emit `SOURCE_POLICY_NOT_CONFIGURED` and remain `PARTIAL` or `NOT_READY`. A bound reference is preserved as trust metadata but is not treated as a universal readiness authorization.

Every emitted capability carries its basis Resolution hashes, Claim hashes, basis Trust and Freshness states, weakest Trust, limiting Freshness, oldest observation, constraints, and missing-prerequisite list. Capability records must exactly match a registered derived result.

The deterministic Philipps Casa acceptance fixture is pinned to Resolution hash `ae2e192185876fbdcb611cd200581edcb87c1ba141e4bf9a3c7e4cc1e96f481d` and Snapshot hash `b85a1d96b0c778476edc9f7f5c4383329efc13665c29d5597981f2abfae4c48e`.

## Compatibility ports

`WorldKnowledgeReaderPort` prepares future snapshot retrieval without storage assumptions. `CapabilityIntentRelationReaderPort` prepares a separate relation registry without defining mappings or weights. Unknown contract, registry, key, enum value, rule output, or self-hashed but semantically invalid payloads fail closed.
