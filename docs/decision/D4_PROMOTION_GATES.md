# D4 — Decision Engine Promotion Gates

## 1. Purpose

These gates define how a candidate Decision Engine earns advancement from offline development to shadow, Closed Beta and eventual Production consideration. They do not modify the D2.1 Constitution, D2.2 Treatment Contract or D3 baseline. Existing frozen thresholds remain authoritative; any new gate must be versioned and frozen before candidate results are inspected.

No compensating composite score exists.

## 2. Reference identities

| Artifact | Identity/hash |
|---|---|
| V13 D3-A baseline | `backyrd-decision-v13-baseline-d3-a-v1` |
| D3 result | `b0701aebb83878ae2ee28c3e0cfe0a17617952aad3bb0a51bc4589689138908c` |
| D2.1 freeze | `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf` |
| D2.2 freeze | `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053` |
| V13 source | `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba` |

Every comparison records Engine and component manifests, repository SHA, data/world/scenario hashes, embedding mode/model/cache hash, evaluator and all treatment identities.

## 3. Non-negotiable hard gates

All applicable returned results must pass across Development, Regression and Locked Holdout for every predeclared seed:

| Gate | Requirement |
|---|---:|
| Product Eligibility | 100% approved |
| Distribution Eligibility | 100% `normal`/`reduced`; zero quarantined/excluded |
| Entity Integrity | 100% |
| Latent Leakage | 0 forbidden evidence |
| Declared city | 100% |
| Hard category | 100% |
| Category exclusion | 100% |
| Open now, when applicable | 100% |
| Duplicate Spot IDs | 0 |
| New P0 / integrity defect | 0 |

`NOT_EVALUATED` is not PASS. Hard failures stop promotion and cannot be traded for NDCG, availability or latency. Empty valid results may fail soft quality but are preferable to invalid recommendations.

## 4. Frozen soft-quality floors

A candidate must meet the existing D2.1 floors wherever evaluable:

| Metric | Floor |
|---|---:|
| NDCG@10 | `≥0.55` |
| Recall@20 | `≥0.65` |
| Precision@10 | `≥0.35` |
| Explanation support | `≥0.95` |
| Fallback eligible rate | `1.0` |
| Context directional rate | `≥0.60` |
| Mature personalization median lift | `≥0` |

Recall@20 requires an executable result contract before it can certify a candidate; it cannot be inferred from V13's missing aggregate. Fallback requires planned exposure fixtures and natural exposure reporting separately.

## 5. Relative improvement and regression protection

Passing a floor is necessary but not always sufficient. Promotion over V13 requires:

- paired multi-seed improvement on the failure classes the wave claims to address;
- no material locked-holdout regression;
- no new material failure class or cohort-specific integrity issue;
- candidate recall and conditional ranking reported separately;
- Development, Regression and Holdout results shown separately;
- D2.2 ACTUAL/NEUTRAL/OPPOSING results by maturity, not aggregate lift alone;
- blinded human review for explanations and high-regret cases;
- confidence intervals using the frozen paired-bootstrap contract where applicable.

V13 itself fails multiple gates; its failures are a baseline, not an allowance for VNext.

## 6. Wave-specific gates

### Wave 1 — Intent and Constraints

- all hard gates 100% across 126+ frozen runs;
- every compiled hard constraint has traceable current-request/Product evidence;
- soft/ambiguous language is not silently promoted to hard;
- missing opening evidence fails according to the declared policy, never false-passes;
- Product/Distribution outputs match their canonical boundaries;
- no Engine component outside the declared Intent/constraint scope changes.

### Wave 2 — Retrieval

- frozen Recall@20 floor `≥0.65` plus source-level Recall@20/50 and marginal recall;
- materially fewer best-eligible-missing records than V13 across all three seeds;
- exact-name/category/sparse/free-text families report separately;
- zero eligibility leakage and complete source/candidate evidence;
- Full-Fidelity semantic evidence before embedding-dependent promotion;
- latency/cost within a pre-registered Lab/shadow budget.

### Wave 3 — Context and Personalization

- counterfactual directional rate `≥0.60` and isolation controls pass;
- Mature personalization median lift `≥0`;
- ACTUAL/NEUTRAL/OPPOSING same-person controls and latent isolation pass;
- cold-start NDCG/Precision do not materially regress;
- opposing/stale history cannot violate explicit current Intent;
- any aggregate gain with concentrated cohort harm requires explicit human review and cannot auto-promote.

### Wave 4 — Utility/Fusion/Slate

- NDCG@10 `≥0.55`, Precision@10 `≥0.35`;
- conditional ranking improves on frozen candidate pools as well as end-to-end;
- D0-F-002 controlled fixture passes for every candidate source;
- source calibration and score version are reproducible;
- exploration remains hard-valid and within a pre-registered utility/rank quota;
- holdout and long-tail/category slices do not materially regress.

### Wave 5 — Remix/Confidence/Explanation/Outcome

- zero returned excluded Remix Spot IDs;
- zero hard-gate/fallback leakage;
- explanation support `≥0.95`; missing explanations are not PASS;
- fallback eligible rate `1.0` under planned exposure;
- novelty and utility-loss bounds are frozen before measurement;
- displayed Top-K and evidence are reconstructable from one Decision identity;
- shadow/non-exposed candidates create no learning events.

## 7. Stage gates

### Offline candidate

Requires valid freezes, all relevant tests, multi-seed Development/Regression, unchanged holdout process, no Production access and a complete component manifest.

### Shadow candidate

Requires all offline gates for the wave, full rollback, privacy/security review, bounded capacity/cost, no user-visible output and proof that shadow results cannot write user learning/outcomes. V13 remains serving Engine.

### Basel Closed Beta

Requires:

- every non-negotiable hard gate at 100%; no open P0;
- all frozen applicable floors met across multi-seed and locked holdout;
- Full-Fidelity semantic benchmark for the promoted semantic path;
- shadow reliability/latency/cost budget met with no safety incident;
- Basel required-data coverage gate by category/scenario family;
- deterministic rollback to the last approved Engine;
- evidence-backed explanations and complete Decision/outcome linkage;
- human approval of blinded cases and known residual P1/P2 risk;
- consent/privacy and Trust boundaries reviewed.

### Production promotion

Not authorized by D4. It additionally requires Closed-Beta calibration, real-outcome review, operational SLOs, release approval and a separate rollout plan.

## 8. Regression budget

Hard/integrity metrics have zero regression budget. For soft metrics, a small local regression may be considered only when:

1. the trade-off rule and affected slice were pre-registered;
2. the aggregate and user-segment benefit is substantially larger and statistically supported;
3. no safety, Trust, accessibility or underserved-cohort harm is introduced;
4. the locked holdout does not materially regress overall;
5. blinded human review supports the trade;
6. an accountable reviewer explicitly approves it.

No automatic promotion occurs from a composite score. Metric weighting cannot conceal a failed dimension.

## 9. Semantic fidelity gate

`FAST_SIMULATION` can certify mechanics, coverage and scientific separation, but cannot certify semantic or aggregate Product quality. Any wave whose claimed improvement materially depends on embeddings must run the predeclared Full-Fidelity benchmark with frozen model, dimensions, document/query versions, corpus/scenarios, cache and cost. Full-Fidelity results are compared to FAST_SIMULATION and reported as a distinct baseline.

## 10. Cost, latency and resilience gate

Before shadow, declare:

- p50/p95/max stage and total latency budgets;
- external calls, tokens and currency budget per Decision and per monthly cohort;
- cache-hit assumptions and worst-case miss behavior;
- timeouts/circuit breakers and degraded-path tests;
- maximum error/empty/clarification rates;
- observability without secrets or unnecessary personal data.

D3 local latency is not a Production SLO. Budget failures cannot be hidden in average quality.

## 11. Decision record

Every promotion decision records:

- candidate and baseline identities;
- changed components and intended failure classes;
- all gate tables, splits, cohorts and confidence intervals;
- Full-Fidelity status;
- blinded-case review;
- known regressions/unknowns and accountable approvers;
- rollback target and verified procedure;
- verdict: `REJECT`, `ITERATE`, `SHADOW`, `CLOSED_BETA_CANDIDATE` or later `PROMOTE`.

## 12. Gate readiness

The gates preserve the D2/D3 scientific baseline, protect V13's proven Product/Distribution integrity and define prospective requirements without inspecting future VNext results.

**DECISION IMPROVEMENT PROGRAM — READY**

**FIRST IMPLEMENTATION WAVE — READY**
