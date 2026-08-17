# BACKYRD Decision Next Gen — Wave 2.5 Query ↔ Candidate Retrieval Relevance

Status: **FAIL — NOT PROMOTED**

Evidence artifact: `decision-lab/baselines/wave2.5-retrieval-relevance-v1.json`

Evaluation: 3 seeds × 42 Golden Scenarios, FULL_FIDELITY, D4.1 unchanged

Production: **UNCHANGED**

## 1. Root Cause

Wave 2.4 left 2,930 ordering misses and 3,848 coverage misses. Its largest ordering classes were tied or poorly calibrated source scores (1,070) and missing query-specific evidence (732). The Wave 2.5 hypothesis was that an explicit, non-personalized query-to-candidate relevance layer could supply that missing evidence.

The experiment disproved the hypothesis for the currently observable contract. The available query and Spot fields are often too generic, sparse, or weakly calibrated to replace Wave 2.4 ordering safely. For example, frozen diagnostic queries such as `exact name`, `trusted places`, or `why this place fits` do not identify the latent fit dimensions used by evaluation. A deterministic relevance function therefore creates apparent precision without enough runtime evidence.

This is not a hard-constraint, Product Eligibility, Distribution, candidate-limit, or semantic-fidelity defect. Candidate identity was preserved exactly and the result reproduced in FAST_SIMULATION and FULL_FIDELITY.

## 2. Tested Relevance Approaches

### A — Deterministic structured relevance

Implemented as `H1_DETERMINISTIC_STRUCTURED`. It evaluates only current request and Structured Intent against eligible observed Spot Intelligence:

- required/preferred category;
- lexical query terms against name, category, place type, and ML document;
- explicit mood/vibe terms;
- audience-derived and occasion-derived mood evidence;
- explicit cheap/price intent;
- observed review moods;
- UNKNOWN Spot data as neutral `0.5`, never negative.

The score uses active-signal normalization. It does not use user history, personalization, latent truth, utility, Golden Scenario labels, holdout labels, or future outcomes.

Result: **REJECTED**. Capacity Capture@20 fell from 0.6076 to 0.5241.

### A2 — Deterministic relevance plus bounded retrieval evidence

Implemented as `H2_STRUCTURED_PLUS_RETRIEVAL`. It retains 86% deterministic relevance and adds 14% bounded source evidence. Semantic evidence is explicitly discounted and never treated as final utility.

Result: **REJECTED**. Capacity Capture@20 fell further to 0.5129. Mixing source evidence back into the score did not repair the missing query semantics.

### B — Lightweight learned relevance

Status: **NOT SCIENTIFICALLY EXECUTABLE** under the frozen Lab contract. The repository has Development, Regression, and Locked Holdout partitions, but no independent training partition. Training on Development and then using it as both model-fitting and architecture-selection evidence would invalidate the requested split discipline. No model was trained; no holdout label was inspected for tuning.

### C — AI/LLM-assisted relevance

Status: **NOT OPERATIONALLY OR SCIENTIFICALLY JUSTIFIED**. There is no frozen query-candidate relevance label/prompt contract against which an LLM output can be reproducibly evaluated. Candidate-scale calls would also introduce material latency, cost, and nondeterminism before deterministic runtime evidence has shown predictive value. No LLM relevance call was made.

## 3. Winner / Rejected Approaches

There is **no Wave 2.5 winner**. Both executable variants are rejected. Wave 2.4 remains the retained control; Wave 2.5 is diagnostic code and sealed negative evidence, not an active or promoted Retrieval architecture.

## 4. Final Relevance Architecture

The implemented experimental boundary is:

```text
Wave 2.4 Candidate Union
→ query/Structured-Intent evidence extraction
→ observed Spot evidence extraction
→ deterministic relevance signals
→ auditable relevance score and before/after rank
→ experimental Top-20 shortlist
```

Every candidate records method, query evidence, Spot evidence, retrieval evidence, relevance score, pre/post rank, inclusion decision, and UNKNOWN handling. The boundary preserves the exact Wave 2.4 candidate set and cannot override Product, Distribution, or user hard constraints.

Because the experiment failed, the architecture is **not selected for product use**.

## 5. Input / Evidence Contract

Allowed runtime inputs:

- current query, Structured Intent, audience, occasion;
- eligible Spot category, place type, name, document, price, availability;
- observed review moods;
- source membership, source rank, and calibrated retrieval evidence.

Prohibited runtime inputs:

- user history or personalization state;
- latent user/Spot truth;
- evaluator utility or Golden Scenario labels;
- Locked Holdout labels;
- future outcomes.

Hard constraints remain authoritative outside this layer. Missing Spot information is neutral rather than negative.

## 6. Coverage Rest Gap

Wave 2.5 intentionally preserved candidate identity while testing ordering. Consequently:

- coverage misses: 3,845 → 3,845;
- Full-Pool Recall: 0.6426 → 0.6426;
- Best-Available Retrieval: 0.6905 → 0.6905.

Largest evaluation-only coverage clusters by scenario family were Product Eligibility (474), broad query (414), negation (344), mature personalization (307), quiet/lively (296), semantic-only (277), price (220), Distribution (216), repetition (214), and cold start (209). No single common observed-data blind spot justified adding another speculative Source inside this ordering-focused Wave. Coverage remains a separate blocking problem.

## 7. Wave 2.4 vs Wave 2.5 Metrics

| Metric | Wave 2.4 control | H1 deterministic | H2 hybrid |
|---|---:|---:|---:|
| Capacity Capture@20 | 0.6076 | 0.5241 | 0.5129 |
| Full-Pool Recall | 0.6426 | 0.6426 | 0.6426 |
| Best Available | 0.6905 | 0.6905 | 0.6905 |
| Candidate Pool mean / p95 | 73.34 / 80 | 73.34 / 80 | 73.34 / 80 |
| p50 / p95 Lab latency | 386.95 / 506.74 ms | 395.25 / 514.63 ms | 395.25 / 514.63 ms |
| No Result / Starvation | 1/126 / 1/126 | 1/126 / 1/126 | 1/126 / 1/126 |
| Hard violations | 0 | 0 | 0 |

H1 paired Capacity Capture delta versus the same-run control: **−0.0836**, 95% bootstrap interval **[−0.1159, −0.0530]**, 31 wins / 23 ties / 72 losses.

The same-run Wave 2.4 control differs slightly from its historical sealed run because FULL_FIDELITY embeddings were freshly generated. Promotion and paired inference use only the same-run control.

## 8. D4.1 Gate Matrix

| Required gate | Result |
|---|---|
| Capacity Capture overall ≥ 0.70 | FAIL — 0.5241 |
| every seed ≥ 0.65 | FAIL |
| every split ≥ 0.65 | FAIL |
| Best Available ≥ 0.80 | FAIL — 0.6905 |
| Full-Pool Recall ≥ 0.70 | FAIL — 0.6426 |
| robust paired lift ≥ 0.03 | FAIL — negative lift |
| Product / Distribution / Hard integrity | PASS — 0 violations |
| candidate pool | PASS |
| latency | PASS |
| external cost | PASS |
| No Result / starvation | PASS |

No composite score compensates for a failed mandatory gate. D4.1 was not changed.

## 9. Ordering Misses Before / After

- Retrieved at Top 20: 1,319 → 1,176
- Ordering misses: 2,937 → 3,080
- Relative ordering change: **+4.87% misses**
- Coverage misses: unchanged at 3,845

All 3,080 remaining ordering misses had some syntactically present relevance signal, but that evidence was insufficiently aligned with evaluation relevance. This distinction matters: the problem is not merely absent fields; observed evidence and actual fit are poorly calibrated.

## 10. Coverage Misses Before / After

Coverage was intentionally invariant. Candidate identities were byte-for-byte equivalent as sets for H0/H1/H2 in all 126 decisions. No Source or projection was added because the cluster analysis did not establish one common, legitimate runtime blind spot with a defensible isolated hypothesis.

## 11. Latency / Cost

- Relevance overhead at p95: approximately 7.9 ms over the same-run control.
- Relevance API calls: 0.
- Query embedding tokens: 16,926.
- Spot document tokens: 41,802.
- Estimated existing embedding cost per decision: USD 0.00000269 at the configured reference price.
- Candidate pool: unchanged, mean 73.34 / p95 80.

These are controlled Lab values, not Production performance claims.

## 12. Scientific Validity / Leakage

- D2.1 and D2.2 identities preserved.
- D4.1 freeze preserved: `6c6421d61e2e4cb6ccdbc8ce4a8c807392bfdc7742797b8cb2d3734564ae3947`.
- V13/Wave-1 execution source unchanged.
- Ground Truth, Golden Scenarios, Evaluator, thresholds, and Treatment Contract unchanged.
- Latent truth used only after execution for evaluation.
- No personalization input entered relevance.
- No learned model or holdout training occurred.
- Development-only diagnostics were used before the sealed aggregate.
- 3 seeds × 42 scenarios completed in FULL_FIDELITY.
- Production access: none.

Scientific Validity: **PASS**.

## 13. Remaining Misses

Two blockers remain:

1. Full-pool coverage is below 0.70 and cannot be repaired by reordering an unchanged union.
2. Current observable query/Spot evidence is not sufficiently calibrated to define relevance deterministically; applying it globally harms ordering.

A learned approach requires a separately frozen training partition and leakage contract. An AI-assisted approach requires a versioned relevance-label/prompt/evaluation contract and bounded candidate strategy before it can be tested scientifically. Neither may be improvised inside Wave 2.5.

## 14. Tests / CI

Durable tests cover query extraction, deterministic relevance, UNKNOWN neutrality, exact candidate identity, reproducibility, Flight Recorder evidence, prohibited inputs, and sealed FULL_FIDELITY evidence. Full repository and GitHub CI status is recorded in the PR.

## 15. Git / Draft PR

Branch: `codex/decision-wave2-5-retrieval-relevance`

Draft PR: created after local validation; no merge requested by this Wave.

## 16. Wave-3 Readiness

**NOT READY.** Retrieval remains below every primary D4.1 quality threshold, and the explicit Relevance hypothesis is insufficient. Context and Personalization must not be used to conceal the unresolved retrieval contract.

## 17. Production Statement

No Production connection, mutation, deployment, database push, migration repair, or product switch occurred.

## Final Verdicts

- **WAVE 2.5 RETRIEVAL RELEVANCE — FAIL**
- **D4.1 RETRIEVAL PROMOTION CONTRACT — FAIL**
- **RETRIEVAL NEXT GEN — NOT PROMOTED**
- **QUERY↔CANDIDATE RELEVANCE — INSUFFICIENT**
- **SOURCE ORDERING GAP — NOT MATERIALLY REDUCED**
- **COVERAGE GAP — NOT MATERIALLY REDUCED**
- **WAVE 1 STRENGTH REGRESSION — NONE**
- **WAVE 3 CONTEXT & PERSONALIZATION — NOT READY**
- **PRODUCTION — UNCHANGED**
