# BACKYRD DECISION NEXT GEN — WAVE 2.4

## RETRIEVAL SHORTLISTING & EVIDENCE ORDERING

Status: **COMPLETE — FAILED / NOT PROMOTED**

Evaluation: 3 seeds × 42 Golden Scenarios = 126 FULL_FIDELITY decisions

Promotion contract: D4.1 `retrieval-quality-contract-v1`, unchanged

Production: **UNCHANGED**

## 1. Executive Summary

Wave 2.4 tested whether a deterministic, pre-ranking evidence layer could materially improve which Wave-2.3 candidates receive the 20 retrieval slots. The strongest admissible hypothesis was tie-safe source calibration. It increased Capacity Capture@20 from `0.5890` to `0.6094`; the paired lift was statistically positive but only `+0.0204`, below the required `+0.03`, with a 95% bootstrap interval of `[+0.0052, +0.0358]`. It improved all three seeds, but did not improve Best Available or Full-Pool Recall and reduced ordering misses by only `1.68%`. The local p95 overhead remained small (`484.1 ms` to `495.1 ms`).

The experiment therefore establishes a boundary: the remaining gap cannot be solved reliably by the tested light evidence ordering alone. Wave 2.4 is **FAIL**, the architecture is **NOT PROMOTED**, and Wave 3 is **NOT READY**. The useful result is diagnostic: Wave-2.3 coverage is preserved exactly, source-score ties and missing query-specific evidence dominate the remaining ordering misses, and naive overlap bonuses or fixed source quotas make the shortlist worse.

## 2. Ordering Root Cause

The analysis considered every eligible Good-or-Better Spot against the Wave-2.3 full pool and Top 20.

| State | Wave 2.3 | Wave 2.4 |
|---|---:|---:|
| Retrieved in Top 20 | 1,273 | 1,323 |
| Present but below Top 20 | 2,980 | 2,930 |
| Absent from full pool | 3,848 | 3,848 |

Of the 2,980 original ordering misses, 389 moved into Top 20, but other relevant candidates moved out; the net reduction was only 50 (`1.68%`). Remaining classified ordering misses:

| Cause | Count | Interpretation |
|---|---:|---|
| Poorly calibrated / tied source scores | 1,070 | Constant or highly tied source scores do not discriminate relevance. |
| Evidence missing in shortlist | 732 | Candidate is present, but has no independent query-specific evidence strong enough to order it. |
| Other source-ordering cause | 567 | Available evidence is insufficient to attribute a narrower deterministic cause. |
| Semantic evidence only | 109 | Semantic recall evidence exists without corroborating directed evidence. |
| Multi-source evidence underestimated | 102 | Several independent families support the candidate but it remains below the cutoff. |
| Strong structured evidence underestimated | 11 | Structured evidence exists but does not overcome other shortlist evidence. |

Additional observations:

- Availability and observed-quality evidence are present on `99.21%` of Top-20 memberships. Their near-universality makes them weak discriminators even when their raw scores look strong.
- Semantic is present on `40.20%` of Top-20 candidates with `44.13%` Good-or-Better density. It remains useful recall evidence, but not a utility truth.
- Vibe evidence has the highest measured source-membership useful density (`56.65%`) but limited coverage (`20.60%` Top-20 presence).
- A fixed per-source budget did not solve source monopolization; offline controlled variants reduced Capacity Capture and were rejected.

## 3. Evidence Model

`retrieval-evidence-v2` uses only pre-ranking, observed evidence:

- source and projection membership;
- source rank and source score;
- source-specific reliability;
- tie-safe, source/projection-local score calibration;
- structured, lexical/entity, vibe, semantic and personalized retrieval evidence;
- availability and observed spot-quality evidence;
- independent source-family count and bounded corroboration diagnostics.

Constant source scores are calibrated to neutral `0.5`, never perfect `1.0`. Evidence is grouped by independent family so repeated projections from one source cannot manufacture corroboration. Latent truth, evaluator labels, ground-truth utility and locked-holdout labels are explicitly prohibited runtime inputs.

## 4. Shortlisting Architecture

The implemented diagnostic path is:

```text
Wave-2.3 eligible Candidate Union
→ source/projection-local tie-safe calibration
→ deterministic evidence aggregation
→ retrieval relevance score
→ stable shortlist ordering
→ Top-20 inclusion/exclusion evidence
→ existing later Decision pipeline
```

The exact Wave-2.3 Candidate IDs are an enforced invariant. Wave 2.4 may reorder them, but cannot add or remove candidates. Each row records evidence, pre-shortlist rank, shortlist score, post-shortlist rank and inclusion/exclusion reason. Ties resolve deterministically by directed evidence, independent-family count and Spot ID.

## 5. Source Calibration

Raw scores are not compared globally. Each `source + projection` group receives a distinct-score percentile, then source reliability bounds its influence. A one-value or tied group receives neutral evidence. This fixes the concrete Wave-2.3 defect where min/max normalization could turn a constant score into maximum confidence.

The improvement was not robust enough for promotion. FULL_FIDELITY Capacity Capture changed by seed:

| Seed | Wave 2.3 | Wave 2.4 | Delta |
|---|---:|---:|---:|
| 1 | 0.5684 | 0.5852 | +0.0168 |
| 2 | 0.6160 | 0.6299 | +0.0139 |
| 3 | 0.5827 | 0.6131 | +0.0304 |

## 6. Candidate Budget

The candidate budget remains the pre-registered maximum of 80 and the promotion boundary remains K=20. Mean pool size is unchanged at `73.34`; p95 is `80`. No source quota is applied. Controlled fixed quotas were rejected because they displaced useful candidates and reduced Capacity Capture. Duplicate candidates remain zero.

## 7. Tested and Rejected Hypotheses

| Hypothesis | Result | Decision |
|---|---|---|
| H0 — Wave-2.3 ordering | Canonical control | CONTROL |
| H1 — tie-safe source calibration | +0.0104 Capacity Capture; not robust; latency regression | DIAGNOSTIC WIN, NOT PROMOTED |
| H2 — independent-family corroboration bonus | Capacity Capture `0.5811`, below H0 and H1 | REJECT |
| Fixed per-source quotas | Lower Capacity Capture in controlled offline variants | REJECT |
| Semantic score as utility | Scientifically unsupported by prior FULL_FIDELITY evidence | PROHIBITED |

Hypotheses were selected on development evidence. Locked Holdout was not used to tune weights, thresholds or source reliability.

## 8. Wave 2.3 vs Wave 2.4

| Metric | Wave 2.3 | Wave 2.4 | Gate |
|---|---:|---:|---:|
| Capacity Capture@20 | 0.5890 | 0.6094 | ≥ 0.70 |
| Capacity Capture@10 | 0.5484 | 0.5831 | diagnostic |
| Capacity Capture@50 | 0.6362 | 0.6506 | diagnostic |
| Best Available | 0.6905 | 0.6905 | ≥ 0.80 |
| Full-Pool Recall | 0.6421 | 0.6421 | ≥ 0.70 |
| Mean candidate pool | 73.34 | 73.34 | ≤ 80 |
| Top-20 useful density | — | 0.5250 | diagnostic |
| No Result | 1/126 | 1/126 | ≤ 1% |
| Starvation | 1/126 | 1/126 | ≤ 2% |
| p50 lab latency | 378.3 ms | 387.4 ms | diagnostic |
| p95 lab latency | 484.1 ms | 495.1 ms | ≤ 750 ms |
| External embedding cost / decision | — | $0.00000269 | ≤ $0.01 |

The Wave-2.3 value was re-executed in the same run; small differences from the sealed prior artifact are normal runtime timing/numerical evidence variation and do not change its historical verdict.

## 9. D4.1 Promotion Gate Matrix

Passed: every-seed improvement, locked-holdout non-regression, Full-Pool non-regression, Best-Available non-regression, candidate pool mean/p95, latency, cost, No Result, starvation, hard integrity, duplicate integrity and evaluability.

Failed:

- overall Capacity Capture;
- every-seed Capacity Capture;
- every-split Capacity Capture;
- overall and every-split Best Available;
- overall and every-split Full-Pool Recall;
- paired robust lift (`+0.0204`, below the required `+0.03`, despite a positive confidence interval).

No composite score compensates for these failures.

## 10. Coverage Preservation

Coverage is preserved exactly:

- Full-Pool Recall: `0.6421444647` before and after;
- coverage misses: `3,848` before and after;
- mean/p95/max pool: `73.34 / 80 / 80` before and after;
- Wave-2.3 Candidate identity invariant: PASS.

The Wave-2.3 coverage gain therefore did not regress.

## 11. Integrity and Scientific Validity

- Hard-constraint failures: 0
- Product-eligibility failures: 0
- Distribution-eligibility failures: 0
- Duplicate candidates: 0
- Scientific Validity: PASS
- Latent truth in engine input: false
- D4.1 contract mutation: none
- Engine mutation: none
- Production access: none

The frozen D2.1, D2.2 and D4.1 identities were verified before execution. The evaluated engine source hash is sealed in the baseline artifact.

## 12. Remaining Misses and Boundary

Wave 2.4 demonstrates that the remaining deficit is not primarily solvable by a small deterministic reshuffle of currently observed retrieval evidence. Tied/low-information source scores and missing query-specific evidence explain most residual ordering misses. A more powerful change would cross into a richer relevance model, new evidence generation, context/personalization, or final utility ranking. Those belong to later explicitly scoped work and were not introduced here.

## 13. Reproducible Artifacts

- `decision-lab/src/wave2.4-retrieval-shortlisting.mjs`
- `decision-lab/src/wave2.4-world-cli.mjs`
- `decision-lab/src/wave2.4-aggregate.mjs`
- `decision-lab/baselines/wave2.4-retrieval-shortlisting-v1.json`
- `decision-lab/test/wave2.4-retrieval-shortlisting.test.mjs`
- `decision-lab/test/wave2.4-baseline.test.mjs`
- `scripts/decision/run-wave2-4-comparison.sh`

## 14. Verdicts

**WAVE 2.4 RETRIEVAL SHORTLISTING — FAIL**

**D4.1 RETRIEVAL PROMOTION CONTRACT — FAIL**

**RETRIEVAL NEXT GEN — NOT PROMOTED**

**SOURCE ORDERING GAP — NOT MATERIALLY REDUCED**

**WAVE 2.3 COVERAGE GAIN — PRESERVED**

**WAVE 1 STRENGTH REGRESSION — NONE**

**WAVE 3 CONTEXT & PERSONALIZATION — NOT READY**

**PRODUCTION — UNCHANGED**
