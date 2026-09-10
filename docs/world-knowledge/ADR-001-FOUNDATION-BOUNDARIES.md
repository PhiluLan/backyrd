# ADR-001: World Knowledge foundation boundaries

Status: Proposed for CTO review

## Context

Current Spot, canonical-semantics, N4, and prototype contracts contain useful but overlapping representations of category, offering, suitability, evidence, and confidence. Directly extending one would preserve semantic mixing and couple World Truth to an existing consumer.

## Decision

Create an independent `@backyrd/world-knowledge-core` package with:

- one primary category and no Secondary Categories in Slice 1
- exactly 16 Founder categories, ending with neutral `OTHER` (`Sonstiges` / `Other`)
- separated Cuisine, Food Speciality, Offering, service model, and service format
- append-only source-bound claims
- independent resolution, freshness, and qualitative trust dimensions
- deterministic SHA-256 registry, claim, resolution, rule, and snapshot identities
- component-level accessibility
- separate durable facts, operational rules, Current State, capabilities, and explanation-only research
- a sanitized versioned consumer port
- fail-closed runtime parsing at every public domain construction boundary
- no trust-dependent `READY` result before a fact-type-specific Source policy exists
- no final Capability→Intent registry

## Consequences

Existing Production consumers remain stable. Future integration needs explicit adapters and cannot silently reuse numerical N4 confidence. Storage, authorization, moderation, and migration remain unresolved. This is intentional: the foundation can be reviewed without granting write authority or changing ranking.

## Rejected alternatives

- Import the prototype catalog: rejected because its 741 definitions are research material with duplicates and mixed domains.
- Extend N4 as World Truth: rejected because N4 is a current consumer snapshot with numerical confidence and taste/suitability semantics.
- Put World contracts in User Intelligence: rejected because a Spot's facts must not depend on user-memory ownership.
- Create a database schema first: rejected because resolution and trust semantics must be stable before storage design.
