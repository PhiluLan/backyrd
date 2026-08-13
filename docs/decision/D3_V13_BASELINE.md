# D3-A — V13 Full Diagnostic Baseline

## Executive summary

D3-A measurement completed validly against the unchanged V13 Engine. The result is a diagnosis, not a quality pass: current V13 is **NOT ACCEPTABLE** under the frozen Constitution because hard user constraints fail in `21/126` Decisions. Product and Distribution eligibility remained perfect (`126/126`). Retrieval is the largest measured loss layer; context sensitivity, mature personalization, Remix novelty and explanation alignment are also materially weak.

The semantic query layer used deterministic `FAST_SIMULATION`. Structural behavior and all contract measurements are valid; semantic and aggregate quality are not full-fidelity claims. Nothing in Production was accessed or changed.

## Executive scorecard

| Dimension | V13 result | Frozen requirement | Status |
|---|---:|---:|---|
| Measurement validity | 126/126 + all four diagnostic arms | Complete | PASS |
| Hard correctness | 105/126 Decisions pass | 100% | FAIL |
| Product eligibility | 126/126 | 100% | PASS |
| Distribution eligibility | 126/126 | 100% | PASS |
| NDCG@10 | 0.5274 | ≥ 0.55 | FAIL |
| Precision@10 | 0.3190 | ≥ 0.35 | FAIL |
| Context directional | 5/15 = 33.33% | ≥ 60% | FAIL |
| Mature treatment median | ≤ 0 (mean -0.00247) | ≥ 0 | FAIL / boundary |
| Explanation supported | 59.44% | ≥ 95% | FAIL |
| Fallback eligible | Not applicable (0 exposed) | 100% when exposed | NOT AVAILABLE |

Recall@20 is a frozen floor but the current Scenario result contract only emits Recall@10 for final lists; Candidate stages are preserved, while an equivalent aggregate Recall@20 cannot be claimed post hoc. This is reported as `NOT AVAILABLE`, not zero.

## Split scorecards

| Split | N | Hard failures | NDCG@10 | Recall@10 | Precision@10 |
|---|---:|---:|---:|---:|---:|
| Development | 54 | 8 | 0.5408 | 0.0614 | 0.3222 |
| Regression | 36 | 7 | 0.5385 | 0.0684 | 0.3528 |
| Locked Holdout | 36 | 6 | 0.4963 | 0.0498 | 0.2806 |

The Development-minus-Holdout NDCG@10 gap is `0.0445`. The holdout remained unchanged and received no tuning.

## Candidate sources and fusion

| Final source | Candidates | Top 3 | Mean utility | Bad fit (<0.35) |
|---|---:|---:|---:|---:|
| V12 only | 1,081 | 223 | 0.3787 | 398 |
| V12 + Semantic overlap | 179 | 155 | 0.4586 | 44 |
| Semantic only | 0 | 0 | Not available | 0 |
| Fallback | 0 | 0 | Not available | 0 |

Overlap candidates were stronger and strongly concentrated in Top 3, but Semantic did not add a unique final candidate under this simulated embedding exposure. The average best retrieved candidate exceeded selected Top 1 by `0.2481`; the best eligible Spot exceeded Top 1 by `0.2901`. This localizes most opportunity before or within candidate ranking rather than to unavailable eligible supply.

## Ranking, contexts and cohorts

Overall Top-1 utility was `0.4526`, Top-3 mean `0.3999`, Top-10 mean `0.3901`. Broad query (`NDCG@10 0.6108`), repetition (`0.6989`) and quiet/lively (`0.7054`) were comparatively strong in the simulated worlds. Exact-name (`0.2646`) and category-intent (`0.2833`) were weakest and also carried hard failures.

Cold users (n=26) reached NDCG@10 `0.5277`; mature users (n=22) reached `0.5487`. The separate causal treatments do not show reliable history benefit: overall mean lift `-0.00251`, and Power mean `-0.02133`.

## Context, Taste versus intent, and personalization

Material counterfactual changes produced `95.29%` mean Top-10 overlap and only `33.33%` directionally positive utility response. ACTUAL, NEUTRAL and OPPOSING treatment executions used the same authenticated V13 code and unchanged latent user/world/context. Personalization was harmful in `5/18` treatments. This diagnoses both under-personalization and vulnerability to stale/conflicting history without prescribing a fix.

## Remix, memory, diversity and fallback

Across 18 Remix pairs, 112 candidates repeated despite canonical exclusions. Mean new candidates were `1.78`; utility changed by `-0.01373`. No candidate starvation occurred, and fallback never activated. No-result rate was `0/126`, but the absence of fallback exposure prevents a fallback-quality verdict.

## Explanation alignment

Of 1,260 candidate explanations: 13 were aligned, 736 partially aligned, 121 misleading and 390 unsupported. Missing or claim-free explanations are never counted as pass. This yields `59.44%` supported/partial evidence, far below the `95%` frozen floor.

## D0-F-002 impact

D0-F-002 occurred naturally `0/126` because no semantic-only or fallback candidate reached final lists. It remains a known P1 with zero observed exposure, not zero possible impact. The controlled detection fixture remains separate from the natural baseline.

## Performance and reliability

All 126 Golden requests completed without exception, timeout, malformed response or empty-result error. Local full-Decision latency was median `111.28 ms`, p95 `124.53 ms`, max `185.83 ms`. These figures include local canonical SQL and Flight Recorder execution with simulation embeddings and are **NOT PRODUCTION LATENCY**. External calls and external cost were zero.

## Failure decomposition and data sufficiency

Retrieval produced 118 failure records and is the dominant failure layer. Constraint/opening produced 21 hard failures. The missed-opportunity heuristic classifies 74 Decisions primarily Engine, 23 primarily observed-data limitation and 29 both. See [D3_FAILURE_DECOMPOSITION.md](D3_FAILURE_DECOMPOSITION.md) for denominators and caveats.

## Reproducibility and seed robustness

All predeclared seeds completed. Hard-failure rates were 21.43%, 14.29% and 14.29%. NDCG@10 was 0.4476, 0.5675 and 0.5672 (standard deviation 0.0564), demonstrating some seed sensitivity. V12 contains intentional unseeded exploration, so byte-identical ranking/result hashes are not a supported deterministic guarantee; identity, coverage and qualitative failure classes are the reproducibility boundary.

## Twelve blinded case studies

The versioned blinded sample contains twelve deterministic cases selected by Scenario-ID stride across all results. It exposes only persona, maturity, current context/input, Spot IDs, ranks and visible reasons—never latent utility, score or failure labels. It is a future human-reality bridge and cannot alter this frozen baseline.

## Strengths to protect

1. Product eligibility: zero non-approved exposures.
2. Distribution eligibility: zero quarantined/excluded exposures.
3. Complete authenticated V12+Semantic+V13 path ran without errors.
4. No empty-result outcomes in 126 Golden Decisions.
5. Overlap candidates had higher utility than V12-only candidates in this simulation.

## Weaknesses and improvement surfaces

1. Hard category, exclusion and open-now constraints are not guaranteed.
2. Best eligible candidates are usually missed by the first retrieval pool.
3. Relevant context changes produce little directional response.
4. Mature/power personalization has no reliable positive lift.
5. Remix exclusion and explanation alignment are materially unreliable.

These are D4 problem surfaces, not prescribed solutions.

## Synthetic versus real boundary

D3 establishes controlled correctness, relative synthetic utility, causal History treatment response, candidate-source behavior, Remix and explanation evidence under three synthetic Worlds. It does not establish real Basel satisfaction, visits, retention, cultural fit, delight, Production latency/cost or Product-market fit. Calibration hypotheses for future real data include synthetic Top-3 utility ↔ Decision satisfaction, candidate recall ↔ “nothing fits”, treatment lift ↔ returning-user success and fallback ↔ abandonment.

## Final verdicts

**D3 V13 BASELINE MEASUREMENT — PASS**

**V13 DECISION QUALITY — NOT ACCEPTABLE**

**V13 FOR BASEL CLOSED BETA — NOT READY**

**D4 DECISION IMPROVEMENT STRATEGY — READY**

Recommended next direction: **B — V13.5 STRUCTURAL IMPROVEMENT**, because multiple measured subsystems fail while Product/Distribution eligibility and the canonical execution path remain reliable. D4 must decide architecture and promotion gates; D3 makes no fix.
