# Decision vNext Phase 1: Foundation and deterministic evaluation spine

## Classification legend

- **Binding:** architecture invariant for vNext.
- **Phase-1 technical:** reversible implementation for proving the spine.
- **Fixture:** synthetic evaluation value with no product authority.
- **Placeholder:** typed extension point whose domain meaning is not approved.
- **Decision required:** Founder/CTO product decision deferred to a later phase.

## Purpose

The Phase-1 package proves this isolated flow:

```text
DecisionRequest + server DecisionExecutionEnvelope
  -> ContextSnapshot
  -> neutral CandidatePoolSnapshot
  -> central Eligibility
  -> fixture Fit Dimensions
  -> deterministic Baseline Ranking
  -> structural Confidence
  -> Evidence Assembly
  -> Reason Authorization
  -> deterministic Rendering
  -> DecisionResult + EngineManifest
```

It does not make a production recommendation and does not integrate with
`decision-v13`, Supabase, Mobile, Web or learning.

## Package structure and ownership

`packages/decision-vnext-core/src/contracts.ts` owns every public contract.
Each type is inferred from the corresponding runtime schema in the same
declaration. There is no handwritten duplicate JSON Schema or generated type
file. Contract version literals fail closed.

Key modules:

- `schema.ts`: strict schema-first validation primitives.
- `canonical.ts`: canonical serialization, hashes and freezing.
- `contracts.ts`: the 13 required contracts and `EligibleCandidate` brand.
- `sandbox.ts`: deterministic synthetic World/User generation.
- `candidate-pool.ts`: World adapter and neutral candidate snapshot.
- `eligibility.ts`: the sole Phase-1 eligibility authority.
- `baselines.ts`: transparent Baseline A and B fixture rankers.
- `confidence.ts`: uncalibrated structural confidence.
- `evidence.ts` and `explanation.ts`: evidence integrity and authorized copy.
- `pipeline.ts`: orchestration and manifest-bound replay.

## Domain boundaries

| Domain | May contain | Must not contain |
|---|---|---|
| World | synthetic spot facts, provenance, quality | user score or preference |
| User | synthetic user taste/aversion fixtures | spot truth or rank |
| Context | explicit request projection | long-term preference mutation |
| Candidate generation | stable candidates, source, position | recommendation or user model |
| Eligibility | checks and eligible boolean | fit or ranking score |
| Fit/Ranking | fixture dimensions for eligible candidates | eligibility mutation, commercial data |
| Confidence | evidence sufficiency limitations | ranking influence or success probability |
| Explanation | authorized claims and evidence references | new facts, AI output |

The synthetic User domain exists to prove isolation and future extensibility;
neither baseline reads it. Personal retrieval is therefore impossible in this
phase.

## Candidate-pool neutrality

The fixture generator sorts synthetic spot IDs, selects the configured count,
adds a non-personalized `synthetic-neutral-rule-v1` attribution and assigns stable positions. The
same frozen pool is passed to both baselines. Request identity, world version,
candidate facts and order are content-hashed.

Payment status, owner tier and sponsored state exist only on `SyntheticSpot` as
neutrality probes. `toWorldCandidate()` deliberately omits them. Counterfactual
tests flip all three and require byte-identical candidate pools and decisions.

## Eligibility

Ruleset `backyrd-vnext-eligibility-phase1-v1` contains exactly:

1. `distribution-allowed-v1`
2. `explicit-city-match-v1`
3. `explicit-open-now-v1`

When `open_now=true`, open passes, closed fails, and unknown produces an
`unknown` check whose explicit policy is `fail`. Without that explicit request,
the rule records `pass/not-applicable`. Every check cites typed evidence and has
a deterministic result hash.

`EligibleCandidate` has a private unique-symbol brand. Its constructor is kept
inside the contracts module and refuses `eligible !== true`. The compile-time
type test proves that a plain ineligible object cannot be supplied to a ranker;
runtime tests prove rejected IDs never reappear after high fit.

## Baselines and fixture values

Baseline A uses three fixture dimensions:

- known open state: weight `0.50`
- normalized distance: weight `0.35`
- normalized popularity: weight `0.15`, contribution capped at `0.15`

Baseline B uses:

- exact synthetic intent-tag overlap: weight `0.50`
- exact synthetic mood-tag overlap: weight `0.50`

All values are **Fixture**, named `*-fixture-weights-*-unapproved`. They exist
only to prove replaceable dimensions and deterministic ordering. They are not
approved product weights or taxonomies. Stable spot ID is the final tie-break.

## Evidence and explanation integrity

Evidence values use discriminated schemas for distribution, city, open status,
distance, popularity, intent tags, mood tags, data quality and uncertainty.
Every Evidence Item includes a synthetic source, observation time, confidence
and hash.

Reason authorization maps each reason code to allowed evidence kinds. The
renderer receives only authorized reason objects and an evidence set. It emits
fixed copy. Validation fails on missing IDs, wrong evidence kinds, changed
evidence hashes, unknown reason codes or changed rendering.

## Confidence

Confidence is always `uncalibrated-phase1`. Its raw values are evaluation-only:
world coverage, freshness, context completeness, user knowledge, ranking
separation and retrieval agreement. Limitations explicitly include uncalibrated
confidence and the absence of a User Model. Weak data quality adds evidence-
bound `weak-world-evidence`.

## Determinism and replay

Objects are canonically key-sorted; arrays retain order. Optional absent fields
are omitted by schema parsing, while explicit `undefined` fails. Unicode is NFC
normalized and non-finite numbers fail. All IDs and versions use constrained
formats. Hashes are SHA-256 over canonical JSON.

Replay requires the expected manifest hash and expected result hash. A wrong
manifest fails before execution. A complete Phase-1 Decision can therefore be
recomputed byte-identically from request, execution envelope, synthetic world,
baseline and limits.

## Sandbox isolation

Configurations live under
`packages/decision-vnext-core/sandbox/config/`. The smoke profile uses 24 spots
and six users. Two full fixed-seed profiles each use 300 spots and 50 users.
Cities, distances, open/closed/unknown status, place types, fixture intents,
fixture moods, popularity and quality are generated without network or database
access. IDs use `syn-*` namespaces.

The isolation test scans code/config for Supabase imports, credentials, the
Production project ref, network calls and UUID-shaped Production IDs. It also
runs a Decision after replacing global `fetch` with a throwing function.

## Local execution

```bash
npm ci
npm run decision-vnext:typecheck
npm run decision-vnext:test
npm run decision-vnext:smoke
npm run decision-vnext:full
```

The PR Risk Gate classifies `packages/decision-vnext-core/src/` as Decision
semantics and its tests/sandbox as Decision evaluation. The Decision job runs
the vNext typecheck, tests and smoke path before the inherited Decision Lab
checks.

## Deferred product decisions

- canonical intent, mood and fit taxonomies
- production candidate-generation sources and budgets
- constraints beyond distribution, explicit city and explicit open-now
- treatment of unknown facts per future constraint
- approved weights, optimization target and exploration policy
- calibrated confidence model and product presentation
- User Model contract and allowed personal signals
- persistence/retention periods and production replay authorization
- production adapters, API, rollout and fallback behavior
- learning semantics and AI role

Historical Decision documentation remains historical evidence. This document
describes only the independent vNext Phase-1 foundation.
