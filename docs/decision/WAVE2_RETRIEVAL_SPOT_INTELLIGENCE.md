# BACKYRD DECISION NEXT-GEN — WAVE 2

## 1. Executive Summary

Wave 2 adds an additive, Lab-only multi-source retrieval candidate at `decision-wave2`. It preserves the frozen Wave 1 eligibility boundary, keeps the V13 ranking/fusion mathematics unchanged, and unions structured category, lexical, V12 personalized, V13 semantic, and trusted fallback retrieval with per-source evidence.

The controlled comparison covered 504 Golden-Scenario Decisions: 2 fidelity modes × 2 engines × 3 seeds × 42 scenarios. Retrieval improved in every seed and in the locked holdout. In FULL_FIDELITY, Good-or-Better Recall@20 increased from 0.1052 to 0.1652 and Best-Available Retrieval from 0.1667 to 0.4921. The absolute preregistered Recall@20 floor of 0.65 was not met. Wave 2 therefore remains `FAIL`, despite the robust directional improvement.

No Product, Distribution, or user hard-constraint regression occurred. V13 source remained unchanged. Production was neither connected nor mutated.

## 2. Retrieval Architecture

```text
Structured Intent
→ Product Eligibility
→ Distribution Eligibility
→ User Hard-Constraint Eligibility
→ Structured / Lexical / V12 / Semantic / Trusted Fallback Retrieval
→ Candidate Union + Spot-ID Deduplication
→ Preserved Source Evidence
→ unchanged Wave 1 / V13 ranking and fusion
```

Retrieval determines availability, not final merit. A source cannot bypass eligibility, and the union does not manufacture a ranking score. Existing V13 score components consume the eligible union after retrieval.

Candidate source defaults are structured 50, lexical 30, V12 12, and semantic 18. The controlled Wave 2 measurement deliberately exercised semantic 60, structured 50, and lexical 30; all limits are bounded and recorded.

## 3. Active Retrieval Sources

| Source | Purpose | Evidence retained | FULL_FIDELITY candidates | Useful | Unique useful |
|---|---|---|---:|---:|---:|
| `structured_category_v1` | Category/city coverage from canonical Spot facts | category, completeness, source rank/score | 6,006 | 1,806 | 1,076 |
| `lexical_v1` | Exact-name and observable text/token recovery | matched tokens, source rank/score | 3,722 | 1,203 | 227 |
| `personalized_v12` | Existing personalized retrieval | V12 rank, score, matched terms | 1,775 | 571 | 304 |
| `semantic_v13` | Meaning-based retrieval from ML documents | cosine similarity and semantic rank | 6,252 | 1,762 | 855 |
| `distribution_fallback` | Trusted safe fallback when the eligible union is sparse | fallback rank and trusted-catalog evidence | 0 | 0 | 0 |

Fallback remained executable but was not naturally required by the measured FULL_FIDELITY Golden Scenarios. Its lack of contribution is not treated as source failure.

## 4. Spot Intelligence Contract

Version: `spot-intelligence-v1`.

| Field | Classification | Retrieval behavior |
|---|---|---|
| canonical status | REQUIRED FOR ELIGIBILITY | non-approved never enters the catalog |
| Distribution state | REQUIRED FOR ELIGIBILITY | quarantined/excluded never enters the union |
| category/place type | REQUIRED FOR RETRIEVAL | structured retrieval and hard category semantics |
| name | REQUIRED FOR RETRIEVAL | lexical and exact-name retrieval |
| city | REQUIRED FOR RETRIEVAL | canonical universe boundary |
| coordinates | REQUIRED FOR RETRIEVAL | availability is recorded for location-aware retrieval; Wave 2 does not add a new distance policy |
| opening hours | REQUIRED FOR ELIGIBILITY when Open Now is hard | unknown follows the frozen Wave 1/D2.1 fail-safe rule |
| ML document | VALUABLE FOR RETRIEVAL | lexical/semantic evidence; absence is visible, not negative evidence |
| price | VALUABLE FOR RETRIEVAL | available to evidence; no new price policy |
| moods/vibes | DERIVED | present through observed ML-document construction |
| photos/reviews | OPTIONAL | not directly required by Wave 2 retrieval |
| occasion/context fit | UNKNOWN / LOW CONFIDENCE | not invented from missing data |

Every candidate exposes field availability. Completeness improves deterministic structured ordering only as positive evidence; a missing optional/valuable field never becomes an implicit mismatch.

## 5. FULL_FIDELITY Semantic Result

Model: `text-embedding-3-small`, 1,536 dimensions, using the exact synthetic observed ML-document text. Latent truth never entered the embedding input.

| Metric | FAST_SIMULATION Wave 2 | FULL_FIDELITY Wave 2 |
|---|---:|---:|
| Semantic Good-or-Better Recall@20 | 0.1738 | 0.1515 |
| Semantic Good-or-Better Recall@50 | 0.3138 | 0.2938 |
| Bad semantic match rate | 0.3511 | 0.3480 |
| Mean similarity | 0.1263 | 0.6454 |
| Utility/rank correlation | -0.0269 | -0.0294 |
| Useful / candidates | — | 1,762 / 6,252 |
| Unique useful | — | 855 |

Classification: **HARDEN**.

Semantic contributes material unique recall and must not be removed. Its 34.8% bad-match rate and near-zero negative utility/rank correlation show that it cannot be treated as a sufficient relevance signal. The evidence does not justify `KEEP` unchanged, nor `REPLACE`.

## 6. Candidate Union

The canonical union is keyed by Spot ID. It:

- deduplicates deterministically;
- retains every source, source rank, source score, and evidence row;
- orders only for stable candidate transport, not as a replacement ranker;
- reapplies the Wave 1 hard-constraint invariant before fusion;
- cannot reintroduce Product- or Distribution-ineligible Spots.

FULL_FIDELITY average pool size increased from 36.53 to 97.56. This materially raises the retrieval ceiling but also confirms that later ranking work must handle a much broader pool.

## 7. Source Contribution

Structured retrieval produced the most unique useful candidates (1,076), followed by semantic (855), V12 (304), and lexical (227). This supports the D4 multi-source hypothesis: no single existing source covers the candidate opportunity.

Overlap is retained per candidate, so downstream diagnostics can separate source discovery from final ranking influence. Source failure is degraded independently; an empty source cannot erase another source's candidates.

## 8. Wave 1 vs Wave 2 Retrieval Metrics

FULL_FIDELITY, 126 Decisions per engine:

| Metric | Wave 1 | Wave 2 | Change |
|---|---:|---:|---:|
| Good-or-Better Recall, full pool | 0.2151 | 0.5278 | +0.3127 |
| Good-or-Better Recall@20 | 0.1052 | 0.1652 | +0.0600 |
| Good-or-Better Recall@50 | 0.2151 | 0.3432 | +0.1281 |
| Best-Available Retrieval | 0.1667 | 0.4921 | +0.3254 |
| Retrieval ceiling | 0.6996 | 0.7226 | +0.0231 |
| Candidate pool | 36.53 | 97.56 | +61.03 |
| NDCG@10, secondary | 0.5393 | 0.5455 | +0.0062 |
| Precision@10, secondary | 0.3328 | 0.3040 | -0.0288 |

Recall@20 improved for every FULL_FIDELITY seed: 0.1592, 0.1587, and 0.1778. Locked-holdout Recall@20 reached 0.2024 and improved over Wave 1. This rules out a Development-only gain, but does not satisfy the 0.65 absolute promotion floor.

Final precision is explicitly secondary in Wave 2. Its decline shows the unchanged V13 ranker does not yet exploit the broader pool consistently; no Wave 4 work was pulled into this change.

## 9. Missed Opportunity Analysis

The FULL_FIDELITY Wave 2 miss inventory contains 2,006 good-or-better missed opportunities:

| Classification | Count |
|---|---:|
| ENGINE / RETRIEVAL FAILURE | 1,441 |
| SPOT DATA LIMITATION | 62 |
| BOTH | 503 |
| UNKNOWN | 0 |

Engine retrieval remains the primary miss class. Data quality is nevertheless material in 565 misses and must not be hidden by broader retrieval limits.

## 10. Engine vs Spot-Data Failures

The Basel Spot Intelligence gap list is stored in the sealed baseline artifact with scenario, seed, split, Spot, category, density, utility, observed evidence count, and classification. For reliable retrieval, Basel Spots need at minimum canonical public status, Distribution state, category, name, city/location, and usable conditional opening-hours evidence. Descriptions/ML documents, price, and mood/vibe evidence materially improve recovery and attribution.

Wave 2 does not infer absent mood, price, hours, or occasion attributes. A sparse Spot can remain eligible and retrievable where mandatory evidence permits it; uncertainty remains visible.

## 11. Candidate Starvation / No-Result

FULL_FIDELITY no-result rate remained 0.00794 (1/126) for both Wave 1 and Wave 2. Top-10 starvation improved from 0.01587 (2/126) to 0.00794 (1/126). The larger union therefore did not create harmful availability regression.

Hard constraints were never relaxed to avoid an empty or short result.

## 12. Hard-Constraint Regression

Across both fidelity modes, Wave 2 produced:

- Product Eligibility failures: 0
- Distribution Eligibility failures: 0
- Hard Category / Category Exclusion / Open Now failures: 0
- total Wave 2 Decisions checked: 252

No source can compensate for or bypass an eligibility failure.

## 13. Product/Distribution Regression

Product Eligibility and Distribution Eligibility remain separate canonical gates ahead of retrieval. The Spot Intelligence catalog requires `status = approved`; the complete catalog is evaluated through `distribution_trust_filter_entities_v1`; the trusted fallback continues to use the canonical Distribution catalog. No RLS, grants, database schema, or migration changed.

## 14. Latency / External Cost

The fair, network-free FAST_SIMULATION lab comparison measured:

| Latency | Wave 1 | Wave 2 |
|---|---:|---:|
| median | 113.75 ms | 130.30 ms |
| p95 | 129.68 ms | 148.74 ms |
| max | 189.86 ms | 211.47 ms |

FULL_FIDELITY absolute latency is recorded in the baseline, but the cross-engine comparison is cache-order-confounded because identical query embeddings were deliberately reused. It must not be read as a Wave 2 latency win.

Actual counted embedding input was 41,802 Spot-document tokens plus 6,727 query tokens. At the configured $0.02 / 1M-token price, estimated external cost was $0.00097058, below the $1 per-seed and $3 aggregate caps. No key or response cache was persisted in the repository.

## 15. New Findings

### W2-F-001 — Absolute retrieval floor not met (P1, OPEN)

FULL_FIDELITY Good-or-Better Recall@20 is 0.1652 versus the preregistered 0.65 floor. Directional improvement is robust, but Wave 2 cannot be promoted.

### W2-F-002 — Semantic retrieval needs hardening (P2, OPEN)

Semantic uniquely contributes 855 useful candidates, while 34.8% of its candidates are bad matches and utility/rank correlation is -0.0294. Classification: `HARDEN`.

### W2-F-003 — Spot data contributes to 565 retrieval misses (P2, OPEN)

62 misses are data-limited and 503 combine data and retrieval limitations. Missing observed evidence must be addressed separately from retrieval logic.

### W2-F-004 — Existing ranking does not fully exploit the larger pool (P2, OPEN)

NDCG@10 improves slightly, while Precision@10 falls from 0.3328 to 0.3040. This is downstream evidence, not a Wave 2 ranking-fix authorization.

### W2-F-005 — FULL_FIDELITY latency comparison is cache-order-confounded (P3, OPEN)

The shared query cache provides scientific embedding identity and bounded cost, but makes Wave 1 versus Wave 2 absolute FULL_FIDELITY latency unequal. FAST_SIMULATION is the fair local compute comparison.

No new P0 was found.

## 16. Remaining Limitations

- The synthetic world has 300 Spots and cannot establish real Basel semantic quality or production latency.
- The 500-row catalog bound is safe for the current Lab but requires measured pagination/capacity evidence before any production rollout.
- FULL_FIDELITY validates the canonical embedding model against synthetic observed documents; it does not validate current Production embedding freshness.
- Excellent-fit averages include scenarios without an excellent candidate and are not used as the promotion gate.
- Final ranking remains the existing Wave 1/V13 layer; Wave 2 does not claim final-result quality completion.

## 17. Wave 3 Readiness

**NOT READY.** Retrieval improved robustly, but the required absolute Recall@20 floor failed. Wave 3 must not treat the current candidate layer as promoted. The evidence is sufficient to prioritize hardening, Spot-data remediation, and candidate-limit experiments, but this Wave does not authorize those changes or Context/Personalization work.

## 18. Tests / CI

Durable coverage includes each retrieval source, deterministic lexical evidence, candidate union/deduplication, source evidence preservation, source degradation, candidate limits, sparse Spot data, Product/Distribution protection, Wave 1 hard constraints, baseline sealing, frozen identities, FULL_FIDELITY completeness, cost cap, and honest failed promotion.

The complete benchmark successfully performed canonical database boot/reset in a disposable local Supabase environment for every arm. Repository-wide validation results are recorded in the PR and final handoff; existing unrelated lint debt is not weakened or modified.

## 19. Files Changed

- additive `supabase/functions/decision-wave2/index.ts`
- Wave 2 Lab configuration, runner, aggregation, FULL_FIDELITY embedding adapter, and tests
- sealed `decision-lab/baselines/wave2-retrieval-spot-intelligence-v1.json`
- minimal Flight Recorder/canonical adapter instrumentation
- this canonical report

## 20. Branch / Commit / Draft PR

Branch: `codex/decision-wave2-retrieval-spot-intelligence`.

Commit and Draft PR are added after final validation. No automatic merge is authorized.

## 21. Production Statement

**PRODUCTION — UNCHANGED.** No Production connection, deployment, migration, `db push`, synthetic Production data, or application engine switch occurred. `decision-wave2` is an additive candidate and is not wired to Mobile, Web, or Production routing.

## Final Verdicts

- **WAVE 2 MULTI-SOURCE RETRIEVAL — FAIL**
- **RETRIEVAL QUALITY — IMPROVED**
- **SEMANTIC RETRIEVAL — HARDEN**
- **SPOT INTELLIGENCE CONTRACT — PASS**
- **WAVE 1 STRENGTH REGRESSION — NONE**
- **WAVE 3 CONTEXT & PERSONALIZATION — NOT READY**
- **PRODUCTION — UNCHANGED**
