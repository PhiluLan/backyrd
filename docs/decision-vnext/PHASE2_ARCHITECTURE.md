# Decision vNext Phase 2 — Integration Architecture

## Plain-language summary

The harness asks the three canonical domains for the minimum Decision input, freezes one neutral list of spots, removes every spot that violates a hard rule, and then lets four transparent test engines order only the remaining spots. It records exactly which versions and evidence were used. This proves integration and measurement; it does not decide the eventual Product ranking.

```text
strict client request                    server authority
          |                                     |
          +--------> Situational Context <-------+
                             |
WorldKnowledgeReaderPort --->+<--- RelevantUserProjection port
          |                  |
          +--> neutral CandidatePoolSnapshot
                       |
                central Eligibility
                       |
               EligibleCandidate[]
                       |
      +----------------+----------------+
      |                |                |
 Baseline A       Baseline B     Legacy fixture / vNext fixture
      +----------------+----------------+
                       |
       confidence + evidence + templates
                       |
       deterministic EvaluationReport + replay
```

## Canonical execution envelope

`CanonicalIntegrationExecutionEnvelopeSchema` is server constructed and strict. It binds Decision/session/idempotency identities, actor binding, request hash, server time and location authority, Context snapshot, accepted World identities and every snapshot hash, the canonical minimized User projection value plus an exactly derived binding, frozen pool, four engine manifests, eligibility/unknown/ranking/confidence/evidence/explanation/degradation versions, and the no-commercial/no-write invariants.

An `EvaluationAuthorityRecord` additionally binds the complete semantic fixture execution: Scenario ID, seed, `SyntheticWorldConfig`, generated World hash/version, pool origin and exact engine registry. Its source SHA, Git tree and artifact identity are accepted only when they match a separately supplied `EvaluationAuthorityTrustAnchor`. This prevents the report, envelope or engine manifests from self-authorizing their provenance. The built-in trust-anchor constructor is named and restricted as a synthetic local/CI helper; a later Production runner requires an independent deployment-attestation design.

The client has no schema channel for actor identity, snapshots, policies, pool, eligibility, engine, weights, confidence, evidence or commercial influence.

## World, User and Context

- World is read only through `WorldKnowledgeReaderPort`. Snapshot parsing revalidates Registry, Rule Registry, source-policy authorization, trust, freshness, conflicts, readiness and snapshot hash. Public contact and non-knowledge/commercial context never enter a candidate.
- User is read only through `DecisionVNextUserProjectionPort`. The adapter accepts only the canonical minimized `RelevantUserProjection`; it rejects boundary flags, subject mismatch and snapshot mismatch. Raw events, review text, location and private social data have no input channel.
- Context preserves explicit placeholders (including budget, available time, weather and exploration), server-bound authority, `UNKNOWN` versus `NOT_CONFIGURED`, and a no-write invariant.

## Candidate pool and eligibility

Candidates are ordered by stable synthetic spot ID and read through the World port. Retrieval is explicitly non-personalized. Pool identity includes source, position, candidate hashes and World snapshot identities. The three existing Phase-1 rules remain the sole hard rules: distribution, authorized city and explicit open-now. The report retains every content-addressed rule check and Eligibility result, including its World evidence references. Only branded eligible candidates reach any ranker.

## Engine registry

All entries are fixture-only and bind `productWeightsConfigured:false`:

1. Baseline A — open, distance and capped synthetic popularity.
2. Baseline B — synthetic mood/intent match.
3. Legacy comparison — frozen local retrieval-position fixture; no v13 runtime call or parity claim.
4. vNext fixture — synthetic context match plus strictly separated minimized taste/direct-spot signals. Practical preferences remain present but are not interpreted without Product semantics.

## Confidence, evidence and explanation

Confidence has seven components and the overall component is `NOT_CONFIGURED`. No probability or Product threshold is produced. Evidence retains its source domain and content hash. Explanations use deterministic fixture templates and must reference registered evidence; validation replays them.

## Evaluation and replay

`npm run decision-vnext:phase2:evaluate` derives the checked-out Git commit and tree, creates an explicitly synthetic authority/trust pair, and emits canonical JSON for the smoke seed. `npm run decision-vnext:phase2:full` runs both 300-spot/50-user seeds. Replay reconstructs Scenario, seed, World and pool origin from the authoritative envelope rather than trusting report labels.

Product-quality metrics remain `NOT_CONFIGURED` without Scenario Oracles. Two separately named technical integrity measurements are deterministic: eligible-output membership (no ranked hard-constraint violation) and explanation-reference integrity (all rendered reasons resolve to authorized evidence). Neither claims Product relevance or linguistic explanation quality.

Recursive integrity validation requires exactly the registered four unique engines, a single externally accepted source identity, exact envelope/result manifests, exact Top-1/Top-3 derivation, and unique candidate, ranking, evidence and explanation references. Fixture-only and `productWeightsConfigured:false` are part of the replayed manifest semantics; the frozen Legacy comparator remains `legacy-v13-frozen-fixture` and explicitly makes no v13 parity claim.

## Degradation summary

| Condition | Deterministic action |
|---|---|
| Missing location authority | reject request |
| Missing/unknown World snapshot, Registry or unaccepted policy | fail closed run |
| Insufficient candidate World readiness/conflict/opening state | exclude candidate where a hard rule requires it |
| No consent, missing/cold User projection or kill switch | neutral personalization |
| Missing Context/Product policy | result limitation / `NOT_CONFIGURED` |
| Empty pool | valid empty result with limitation |
| Unknown engine or incomplete explanation evidence | fail closed engine/run |
| Unavailable Legacy comparator | skip comparator with explicit limitation |

The normative mapping is `backyrd-vnext-degradation-policy-v1` in `degradation.ts`.

## Deferred Product decisions

Capability→Intent registry, final Context taxonomy, additional hard rules, personalized retrieval, Product ranking/weights, exploration, calibrated confidence, Scenario Oracles/targets, embeddings, social intelligence, persistence, shadow traffic and rollout remain unconfigured.
