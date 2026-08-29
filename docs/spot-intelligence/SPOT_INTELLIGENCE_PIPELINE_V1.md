# City Bootstrap & Spot Intelligence Pipeline V1

Status: implemented and locally accepted; Production pilots remain bounded and Basel scale-up is gated on a successful independent Pilot plus Human Review.

## Purpose and boundary

The pipeline discovers a bounded city universe, classifies Product relevance, reconciles identity, acquires evidence through the existing Research Agent, and publishes only eligible Spot identity records. It does not rank Spots, change Decision Engine semantics, create Accepted Facts directly, write N4 dimensions, infer User Learning, or create synthetic social state.

The pipeline is deliberately split into three truth zones:

1. **Operational discovery:** city runs, source queries, candidates, normalized evidence, external identities, jobs, cost events, checkpoints, and review cases.
2. **Canonical evidence and authoring:** the existing `backyrd_spot_sources_v1`, `backyrd_spot_fact_proposals_v1`, and Admin acceptance flow.
3. **Product truth:** existing `spots`, Accepted Facts, Offering/Purpose, derived N4, embeddings, and Distribution contracts.

Only the service-role publication RPC crosses from zone 1 into a minimal Spot identity write. All richer truth continues through the existing proposal and human-authoring boundary.

## Flow

```text
City config
  -> bounded OSM administrative-area discovery
  -> optional ephemeral Google Places coverage/Place-ID linkage
  -> deterministic normalization and relevance classification
  -> multi-signal identity reconciliation
  -> SHADOW candidate manifest
  -> representative PILOT selection
  -> existing two-pass official-domain Research Agent
  -> deterministic entity, subentity, durability, and concrete-instance scope validation
  -> strict structured-output validation and fact proposals
  -> Admin review/acceptance for canonical facts
  -> fail-closed identity publication RPC
  -> existing embedding/distribution triggers
  -> incremental refresh by source fingerprint and freshness
```

Hard eligibility runs before enrichment or publication. Unknown and ambiguous inputs remain unknown or enter review. Candidate priority controls work order only and never enters `final_score`.

## Implemented components

- `packages/city-bootstrap-runtime`: reusable Basel/Zürich configuration, grid planning, OSM and Google adapters, normalization, relevance mapping, identity reconciliation, cohort selection, refresh decisions, SSRF-safe official-source fetch, circuit breakers, and Supabase repository.
- `scripts/spot-intelligence/city-bootstrap.mjs`: `config-validate`, `plan`, `dry-run`, `pilot-manifest`, `select`, `stage`, `status`, and explicitly confirmed `publish-batch` operations.
- `20260829092530_create_city_bootstrap_spot_intelligence_v1.sql`: nine service-only operational tables, four RPCs, RLS/grants, leases/retries, review deduplication, and race-safe publication.
- `supabase/tests/city_bootstrap_spot_intelligence_v1.sql`: database acceptance for RLS, grants, idempotency, duplicate prevention, provenance, review deduplication, job leases, fixture isolation, and the unchanged 60-dimension N4 registry.

## Identity rules

Google Place ID is exact identity evidence, not Product truth. Strong identity may also come from an exact official website, phone, or name + address + proximity composite. Name alone never merges. Co-located businesses, rename/move cases, multiple matches, and weak new identities fail closed into review.

Database publication takes a transaction-scoped advisory lock and has a unique partial index for non-empty Google Place IDs. It checks Google identity first, then an exact normalized name/address fallback. A replay marks the same candidate without creating a second Spot.

Research policy v2.6 treats host ownership and venue-instance attribution as separate checks. When an official URL is path/query scoped for a branch, house, or other concrete venue, evidence and proposed website values must retain that instance scope; a generic brand homepage or sibling location cannot speak for it. `EVENT`, `PROGRAM`, `TEMPORARY`, `SUBVENUE`, `TENANT`, `SERVICE`, `OFFERING`, `PERSON`, `OTHER`, and `AMBIGUOUS` evidence remains auditable but cannot create a Spot-level proposal. These are Research guard terms, not a new Product ontology.

## Reliability

Jobs have explicit states, lease tokens, bounded attempts, exponential retry, resumable idempotency keys, and circuit-breaker failure classes. Provider, schema, review-rate, duplicate, fixture, and unauthorized-write anomalies pause the run. The server-side `STAGE_REFRESH` action compares stable source identities and fingerprints before provider work: unchanged sources complete with a durable zero-call checkpoint, while new identities and changed known identities route to existing identity/move-or-rename review semantics without canonical mutation. Later refresh stages reprocess staleness, prior failures, manual review requests, or relevant pipeline-version changes.

## Scale model

The 1,081-candidate Basel shadow universe fits the current paginated REST repository and bounded worker model. A 1,700-candidate run is operationally credible with batches and leases. A 5,000-candidate city remains credible but should use dedicated workers and aggregated status queries. A 20,000-candidate deployment has a plausible schema path, but throughput and cost are not tested and must not be described as proven.

## Current limit

Production credentials are available only at the intended server boundary. Pilot runs may publish bounded real identity records, while Research remains proposal-only. A systemic Research attribution finding pauses the run and requires a new policy version, regression, canonical merge, additive migration, deployment, independent cohort, and Human Review before Scale can begin.
