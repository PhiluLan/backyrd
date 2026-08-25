# Canonical Offering + Purpose V2.1

## Boundary

V2.1 adds two typed Spot-fact axes beside N4:

- `offering.availability`: what a guest can obtain or consume.
- `purpose.occasions`: why guests typically visit.

Both use the existing Accepted Fact, provenance, scope, supersession and Founder/Admin save path. They are not N4 dimensions, Taste Concepts, User Card inputs or completeness boosts. Place type selects authoring questions but never asserts an Offering.

The frozen registries remain 45 Taste Concepts and 60 N4 dimensions. Historical `signature.characteristics` values remain display facts and are not migrated or reinterpreted.

Existing V2 gastronomy display values are classified `NEEDS_HUMAN_RECONFIRMATION`: their old labels are suggestive, but their historical payload did not carry the typed availability/unknown contract. They remain preserved as display truth and never become Offering automatically. There is no `SAFE_EXACT_MIGRATION` population in this release.

## Offering contract

States are `AVAILABLE`, `NOT_AVAILABLE`, `UNKNOWN`. Supported values are drinks, beer, craft beer, own-brewed beer, wine, cocktails, coffee, non-alcoholic drinks, food, snacks, small plates, full meals, breakfast, brunch, lunch and dinner.

Only safe parent implications exist: craft/own-brewed beer imply beer and drinks; concrete drink types imply drinks; concrete food types imply food. Parent truth never fabricates a child. Opening hours never fabricate meal service.

Purpose states are `SUITABLE`, `NOT_SUITABLE`, `UNKNOWN` for drink, eat, quick bite, Afterwork, Apéro and long evening. Afterwork and Apéro do not imply a drink type, vibe or audience.

## Runtime chain

1. Canonical N3 extracts explicit Offering/Purpose requirements with provenance.
2. Confirmed positive facts enter the existing semantic search document; the existing embedding queue refreshes automatically.
3. A bounded exact Offering retrieval RPC improves recall without a custom score.
4. The Decision package serializes a separate, hashed Candidate Offering snapshot.
5. Existing factual tiers evaluate every requested requirement independently as match, unknown or contradiction.
6. Reasons are authorized only for candidate-specific confirmed matches.
7. Decision-time Offering snapshots are immutable audit records keyed by Decision and Spot. They do not enter User Evidence.

## Human authoring

Founder/Admin sees `Verfügbar / Nicht verfügbar / Unbekannt` and `Typischer Grund / Eher nicht / Unbekannt`. The browser submits stable question/option IDs; the server whitelist maps them to Accepted Facts. Save remains atomic, idempotent and server-confirmed. Public Owner V2 remains off.

## Operations

An Offering save refreshes the deterministic human summary, the canonical search document and the existing embedding job in the same transaction. Embedding completion remains asynchronous; no manual reindex is required.

## Frozen-contract validation

The N4 and N6A freeze guards remain valid, and the focused temporal/User-Intelligence suites are unchanged and green. The historical D2 engine-source freeze reports the expected source-hash mismatch because its manifest predates this explicitly authorized versioned factual extension; it is not rewritten or silently recertified. The factual tuple architecture and weights are unchanged, while the package/reason versions identify V2.1 explicitly.
