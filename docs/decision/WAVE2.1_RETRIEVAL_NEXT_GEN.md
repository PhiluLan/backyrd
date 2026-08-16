# BACKYRD Decision Next Gen — Wave 2.1 Retrieval Next Gen

Status: **COMPLETE — NOT PROMOTED**
Date: 2026-08-16
Branch: `codex/decision-wave2-1-retrieval-next-gen`
Production access: **NONE**

## 1. Executive Summary

Wave 2.1 tested a decomposed, evidence-preserving retrieval architecture against the frozen Wave 2 FULL_FIDELITY baseline. The candidate architecture improved Good-or-Better Recall@20 from **0.1652 to 0.1706**, improved every seed, and improved the locked holdout. It preserved Product, Distribution, and User Hard-Constraint integrity with **0 violations across 252 measured Decisions**.

It is not promotable. Full-pool recall regressed from **0.5278 to 0.5027**, Best-Available Retrieval regressed from **0.4921 to 0.4841**, and median Lab latency rose from **131.6 ms to 1,012.8 ms** because each request exercised multiple real retrieval projections. The frozen Recall@20 gate of **0.65** was not met.

The root-cause audit also proves that the frozen gate is mathematically unreachable under the present metric and Golden Scenario relevance density: a scenario has **64.29 relevant Spots on average**, so even an Oracle can place at most 20 of them in Top 20. Mean Oracle Recall@20 capacity is **0.4515**; only **31/126** scenarios can individually reach 0.65. The gate and Ground Truth were not changed. This is recorded as evidence for a separate governance decision.

Final outcome: Wave 2.1 provides a durable diagnostic implementation and falsifies the tested architecture as the promoted Next-Gen retrieval stack.

## 2. Canonical Measurement Basis

- D2.1 Freeze: `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf`
- D2.2 Freeze: `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053`
- V13 source: `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba`
- Wave 1 source: `5d65a4db6e8a8baf6bce872d967d5350e55ec5f4470191ff4490540dac0b20b8`
- Wave 2 execution source: `4e73269b48c0c7372962fbd23040e2c06d85fd6e56504c2217d80d9f4881823c`
- Seeds: 3
- Golden Scenarios: 42 per seed
- FAST_SIMULATION Decisions: 126
- FULL_FIDELITY Decisions: 126
- Total Wave 2.1 Decisions: 252
- Semantic model: `text-embedding-3-small`, 1,536 dimensions
- Production connection or mutation: none

The Wave 2 execution source remains the real retrieval executor for all projections. Wave 2.1 changes observed query representation and candidate-union prioritization only. Constitution, Scenario Registry, Ground Truth, Eligibility, V12/V13 code, fusion, and final ranking are unchanged.

## 3. Root Cause of the Wave-2 Retrieval Gap

The audit evaluated every utility >= 0.6 Spot against the Wave 2 Top 20. There were 8,101 relevant Spot/scenario pairs; 775 were retrieved in the tested Top 20 and 7,326 were misses.

| Primary cause | Count | Share of misses | Interpretation |
|---|---:|---:|---|
| Coverage failure | 3,653 | 49.86% | No tested source/projection found the Spot. |
| └ Source gap | 3,533 | 48.23% | Observed evidence existed, but no active source could expose the fit. |
| └ Spot representation | 120 | 1.64% | Observed Spot evidence was too sparse to support retrieval. |
| Source ordering failure | 2,927 | 39.95% | A source found the Spot, but too deeply for Top 20. |
| Query representation failure | 405 | 5.53% | A decomposed projection found a Spot absent from the base query retrieval. |
| Candidate limit failure | 341 | 4.65% | The same-query limit probe found a Spot cut by source limits. |

This answers the Wave 2 gap:

1. The full pool has materially higher recall because many relevant Spots sit below retrieval Top 20.
2. Source ordering and source gaps dominate; candidate limits are not the main problem.
3. Query decomposition recovers useful candidates but is too weak to solve ordering and coverage.
4. The Recall@20 denominator contains far more relevant items than 20 slots can represent. Wave 2's 0.1652 must therefore be interpreted against an Oracle mean capacity of 0.4515, not 1.0. The frozen 0.65 gate nevertheless remains the official pass criterion.

## 4. Tested Retrieval Hypotheses

All ablations use the same FULL_FIDELITY worlds, scenarios, Ground Truth, model, and Eligibility.

| Hypothesis | Projections | Recall@20 | Pool size | Decision |
|---|---|---:|---:|---|
| H0 | Base evidence re-prioritized with RRF | 0.1679 | 86.66 | Small positive; insufficient alone. |
| H1 | Base + lexical specificity | 0.1659 | 88.94 | Rejected as standalone winner; slightly below H0. |
| H2 | Base + focused semantic concept | 0.1698 | 87.52 | Retained as useful evidence. |
| H3 | Base + vibe projection | 0.1677 | 87.83 | Retained as useful evidence. |
| H4 | All non-oracle projections | **0.1706** | **90.21** | Best tested Top-20 result, but fails promotion. |

The candidate limit probe was diagnostic only and had zero union weight. It cannot improve its own result or distort the candidate pool.

## 5. Candidate Retrieval Architecture Tested

The tested architecture is versioned as `retrieval-next-gen-v1`:

1. Wave 1 Structured Intent and all canonical Eligibility boundaries run unchanged.
2. The request is projected into base, category, lexical specificity, vibe, occasion/context, and focused semantic concept views when evidence exists.
3. Every projection uses the real Wave 2 structured, lexical, and semantic paths. V12 contributes only through the base request; no second personalized engine is created.
4. Candidates are deduplicated by Spot ID.
5. Weighted reciprocal-rank fusion produces retrieval priority, not final Decision utility.
6. Every candidate retains source, projection, source rank, source score, evidence, per-evidence RRF contribution, union score, and union rank.

This architecture remains a **research candidate**. It is not promoted and is not connected to any product surface.

## 6. Query Decomposition

The projections separate distinct retrieval responsibilities:

- `base`: unchanged request representation.
- `category`: required or soft place type labels.
- `lexical_specificity`: explicit non-generic query terms.
- `vibe`: up to two strongest declared scenario moods, represented as observed intent text.
- `occasion_context`: audience, time bucket, weekday, weather, and indoor requirement when present.
- `semantic_concept`: focused union of lexical terms, moods, and categories.
- `base_limit_probe`: identical query with larger source limits, excluded from the final union.

Hard constraints remain Eligibility. No projection can weaken, omit, or compensate for them.

## 7. Semantic Hardening Decision

**Decision: HARDEN.**

Wave 2 proved that semantic retrieval contributes unique useful candidates while producing a 34.8% bad-match rate and near-zero utility/rank correlation. Wave 2.1 shows that focused semantic and vibe projections improve Recall@20 modestly, so semantic evidence should not be removed. It also shows that multiplying semantic calls is not a sufficient architecture: it materially increases latency and does not solve the recall gate or full-pool coverage.

No embedding-model replacement was tested because the current model still demonstrates useful recall and the evidence does not justify a model switch. The proper next semantic experiment is representation and source-role hardening under a corrected, governed retrieval metric—not an unproven provider/model change.

## 8. Spot Representation Decision

**Decision: preserve the current contract; do not expand it in this Wave.**

The frozen Lab world exposes category, name, description/ML document, observed moods, price, location, hours, Product state, and Distribution state. Wave 2.1 did not inject latent occasion, social, indoor, energy, distinctiveness, quality, or utility into retrieval.

The root-cause result is asymmetric:

- only 119 misses were primarily sparse observed Spot representation;
- 3,533 misses had sufficient observed evidence but no capable source;
- 2,927 more were source-ordering failures.

Therefore adding speculative Spot fields would not address the dominant proven failure. Missing fields remain UNKNOWN, never negative evidence. A future Spot Intelligence expansion must be justified by legitimate product data and an isolated causal benchmark.

## 9. Source and Projection Contribution

Evidence occurrences are diagnostic, not unique candidate counts; a candidate may have multiple evidence rows.

| Source | Evidence | Useful evidence | Useful rate |
|---|---:|---:|---:|
| Structured | 19,332 | 5,845 | 30.23% |
| Semantic | 15,581 | 4,501 | 28.89% |
| Lexical | 13,318 | 4,162 | 31.25% |
| V12 | 1,361 | 438 | 32.18% |

| Projection | Evidence | Useful evidence | Useful rate |
|---|---:|---:|---:|
| Base | 16,379 | 4,964 | 30.31% |
| Category | 981 | 261 | 26.61% |
| Lexical specificity | 9,196 | 2,788 | 30.32% |
| Occasion/context | 16,326 | 4,916 | 30.11% |
| Semantic concept | 3,787 | 1,036 | 27.36% |
| Vibe | 2,923 | 981 | 33.56% |

No tested source or projection is sufficiently precise to become a singular retrieval authority.

## 10. Before/After Metrics

| Metric | V13 Legacy | Wave 1 | Wave 2 | Wave 2.1 |
|---|---:|---:|---:|---:|
| Good+ Recall@20 | not separately captured | 0.1052 | 0.1652 | **0.1706** |
| Good+ full-pool recall | not separately captured | 0.2151 | **0.5278** | 0.5027 |
| Best-Available Retrieval | not separately captured | 0.1667 | **0.4921** | 0.4841 |
| Candidate Pool | not separately captured | 36.53 | 97.56 | 90.21 |
| NDCG@10 | 0.5274 | 0.5393 | 0.5455 | 0.5437 |
| Precision@10 | 0.3190 | 0.3328 | 0.3040 | 0.3024 |
| No Result | 0/126 | 1/126 | 1/126 | 1/126 |
| Top-10 starvation | not captured | 2/126 | 1/126 | 1/126 |
| Hard violations | 21/126 | 0/126 | 0/126 | 0/126 |

NDCG and Precision are secondary observations. Final ranking was not tuned and the Wave 2.1 retrieval union was not promoted into product ranking.

## 11. Promotion Gate

| Gate | Result |
|---|---|
| Good+ Recall@20 >= 0.65 | **FAIL** — 0.1706 |
| Oracle capacity supports 0.65 | **FAIL** — mean ceiling 0.4515 |
| Improvement on all 3 seeds | PASS |
| Locked holdout improves | PASS |
| Full-pool recall does not regress | **FAIL** — 0.5278 to 0.5027 |
| Product/Distribution/User constraints | PASS — 0 violations |
| Candidate pool operational | PASS — <= 100, mean 90.21 |
| External cost below cap | PASS — 0.00117456 USD < 3 USD |

Because multiple hard promotion conditions fail, the architecture is **NOT PROMOTED**.

## 12. Remaining Retrieval Misses

The remaining work is not “increase every limit”:

- 49.86% of misses are coverage/source-capability failures.
- 39.95% are source ordering failures.
- 5.53% are query representation failures.
- 4.65% are candidate-limit failures.
- The current metric/gate pair has an Oracle feasibility conflict that must be governed outside this experiment.
- Existing sources expose only about 29–34% useful evidence, indicating weak discrimination before final ranking.

## 13. Latency and Cost

FULL_FIDELITY Wave 2.1 Lab latency:

- median: 1,012.8 ms
- p95: 2,094.3 ms
- max: 2,663.7 ms

The maximum is an external-call Lab outlier, not Production performance. The median increase is structural: multiple sequential real projection calls were intentionally used for causal measurement. A promoted implementation would require batched embedding and retrieval calls, but latency optimization was not justified after the quality gate failed.

External usage:

- Spot-document prompt tokens: 41,802
- Query prompt tokens: 16,926
- Estimated total cost: 0.00117456 USD
- Configured cap: 3 USD
- Key source: environment only; no secret persisted

## 14. Scientific Validity and Non-Regression

- Latent Truth is evaluation-only and never enters a retrieval query or engine state.
- Query projections read only the current request and validated Structured Intent. A pre-certification review caught and rejected an earlier diagnostic draft that referenced hidden scenario preferences; that result was discarded, the dependency was removed, an adversarial isolation test was added, and all 252 Decisions were rerun.
- Scenario Registry, Ground Truth, D2.1, and D2.2 are unchanged.
- V13, V12, Wave 1 Eligibility, Wave 2 execution source, fusion, and ranking are unchanged.
- Product Eligibility failures: 0.
- Distribution Eligibility failures: 0.
- User Hard-Constraint failures: 0.
- Production access: none.
- Reproducibility: same deterministic seeds and versioned projection/union contract.

Two Lab-only infrastructure defects were found and repaired during execution:

1. synthetic JWT `iat` now has a 30-second local-container clock-skew allowance;
2. cached successful embedding responses are returned through a fresh Response body.

Neither changes Engine or scientific treatment semantics.

## 15. New Findings

### W2.1-F-001 — Frozen Recall@20 gate is infeasible under current relevance density

- Severity: P1 scientific promotion risk
- Evidence: mean 64.29 relevant Spots; Oracle mean Recall@20 capacity 0.4515; 31/126 scenarios individually support 0.65.
- Impact: no retrieval architecture can meet the aggregate 0.65 gate without changing metric denominator, K, relevance definition, scenario distribution, or eligibility universe.
- Status: OPEN — governance decision required; no threshold changed in Wave 2.1.

### W2.1-F-002 — Multi-projection retrieval improves Top-20 recall but regresses full-pool recall

- Severity: P2 retrieval limitation
- Evidence: Recall@20 0.1652 to 0.1706; full pool 0.5278 to 0.5027; Best-Available 0.4921 to 0.4841.
- Impact: tested RRF prioritization/cap trades coverage for modest Top-20 gain.
- Status: OPEN — architecture not promoted.

### W2.1-F-003 — Multi-call query decomposition is operationally too expensive in latency

- Severity: P2 architecture limitation
- Evidence: median 131.6 ms to 1,012.8 ms; p95 2,094.3 ms.
- Impact: sequential decomposition cannot be the product execution design.
- Status: OPEN — no optimization undertaken after failed quality gate.

## 16. Tests and CI

Durable coverage includes:

- projection separation and latent-isolation checks;
- deterministic RRF union, deduplication, and evidence preservation;
- Oracle capacity calculation;
- root-cause attribution for query, source ordering, limits, coverage, and Spot representation;
- sealed baseline identity and honest promotion assertions;
- existing Wave 2, D3.1, and Scientific Validity regressions;
- disposable local Supabase execution for 3 seeds x 42 scenarios in FAST_SIMULATION and FULL_FIDELITY.

Local acceptance completed with 86/86 Decision Lab tests, D2 acceptance, D2.1 re-certification, D2.2 validation, D3.1 preflight, D3-A baseline validation, D2 protected-scope guard, repository sanity, canonical SQL secret scan, Web typecheck/build, Admin typecheck/build, Mobile lint, and Shared typecheck passing. Web/Admin lint retain inherited advisory findings and no affected file is in this change.

Draft PR #35 is intentionally stacked on the still-open Wave 2 PR #34. GitHub's Quality, Database, and Security workflows are configured only for pull requests targeting `main`, so they do not trigger for the stacked PR. PR #34's complete GitHub suite, including Gitleaks, is green; PR #35's Web and Intelligence previews are green. After #34 merges, #35 must be retargeted to `main` and the full required GitHub suite must pass before any merge decision.

## 17. Files and Reproducibility

Primary artifacts:

- `decision-lab/config/wave2.1-retrieval-next-gen-v1.json`
- `decision-lab/src/wave2.1-retrieval-next-gen.mjs`
- `decision-lab/src/wave2.1-world-cli.mjs`
- `decision-lab/src/wave2.1-aggregate.mjs`
- `decision-lab/baselines/wave2.1-retrieval-next-gen-v1.json`
- `scripts/decision/run-wave2-1-comparison.sh`
- `decision-lab/test/wave2.1-retrieval-next-gen.test.mjs`
- `decision-lab/test/wave2.1-baseline.test.mjs`

Reproduction command:

```bash
DECISION_LAB_OPENAI_API_KEY=... bash scripts/decision/run-wave2-1-comparison.sh
```

Only synthetic Lab data is used. The disposable database is destroyed at the end.

Git:

- branch: `codex/decision-wave2-1-retrieval-next-gen`
- Draft PR: [#35](https://github.com/PhiluLan/backyrd/pull/35), stacked on Wave 2 PR #34
- merge: not performed

## 18. Wave 3 Readiness

**NOT READY.**

Wave 3 must not build Context and Personalization on an unpromoted retrieval architecture. Before Wave 3, Backyrd needs a deliberate governance decision on W2.1-F-001 and a revised retrieval experiment focused on the dominant source-gap and source-ordering failures. That decision must not be made by silently changing the frozen gate inside an implementation Wave.

## 19. Final Verdicts

**WAVE 2.1 RETRIEVAL NEXT GEN — FAIL**

**GOOD-OR-BETTER RECALL@20 GATE — FAIL**

**RETRIEVAL NEXT-GEN ARCHITECTURE — NOT PROMOTED**

**SEMANTIC RETRIEVAL — HARDEN**

**WAVE 1 STRENGTH REGRESSION — NONE**

**WAVE 3 CONTEXT & PERSONALIZATION — NOT READY**

**PRODUCTION — UNCHANGED**
