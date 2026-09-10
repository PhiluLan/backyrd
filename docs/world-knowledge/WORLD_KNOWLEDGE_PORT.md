# WorldKnowledgePort reference

Contract version: `backyrd.world-knowledge.port@1.0`

The port contains registry and rule identities, resolution time, Spot identity/location/classification/public contact, resolved facts, operational rules, valid Current States, supported capabilities, all derived-rule evaluations, conflicts, explicit unknowns, freshness counts, per-use-case readiness, exclusions, and a canonical snapshot hash.

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

## Compatibility ports

`WorldKnowledgeReaderPort` prepares future snapshot retrieval without storage assumptions. `CapabilityIntentRelationReaderPort` prepares a separate relation registry without defining mappings or weights. Unknown contract, registry, or rule versions fail closed.
