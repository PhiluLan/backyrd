# BACKYRD Decision Next Gen — Wave 2.2 Retrieval Breakthrough

Status: **FAIL — NOT PROMOTED**

Measurement date: 2026-08-17

Environment: disposable local Supabase, synthetic Decision Lab data only

Production: **UNCHANGED**

## 1. Executive Summary

Wave 2.2 tested whether an eligibility-safe observed-attribute catalog source, source-rank calibration, independent-source overlap, and a fixed 80-candidate budget could close the two dominant Wave 2.1 retrieval gaps. They did not.

The final experimental arm achieved 0.3610 Top-20 Capacity Capture, 0.4365 Best-Available Retrieval, and 0.4412 Full-Pool Recall. Relative to the same-run Wave 2.1 control, paired Capacity Capture changed by -0.0040 with a 95% bootstrap interval of [-0.0257, 0.0165]. The result is neither positive nor statistically robust. It also missed the 750 ms FULL_FIDELITY Lab latency gate at 1,055.5 ms p95.

All four hypotheses were evaluated on 3 seeds x 42 Golden Scenarios under FULL_FIDELITY `text-embedding-3-small`. No Product, Distribution, user-hard-constraint, entity, scientific-validity, or Production-safety violation occurred. The negative quality verdict is therefore valid evidence, not a framework stop.

No experimental component is promoted. Backyrd must not advance to Wave 3 on this retrieval foundation.

Canonical artifact: `decision-lab/baselines/wave2.2-retrieval-breakthrough-v1.json`

Result hash: `c821f129ef83fcf9a2bb2aaec3921f188a16f11ca04734c0cea4fa231df76251`

## 2. Coverage-Gap Clusters

The final H3 pool was checked against every eligible Good-or-Better Spot in all 126 decisions:

| Disposition | Count | Share of all relevant opportunities |
|---|---:|---:|
| Missing from the 80-candidate pool | 5,238 | 64.66% |
| Present below rank 20 | 2,086 | 25.75% |
| Retrieved at rank 20 or better | 777 | 9.59% |

Among unresolved opportunities, 71.52% are coverage gaps and 28.48% are source-ordering gaps. The largest scenario-family miss clusters are Product Eligibility fixtures (775), broad queries (727), negation (641), quiet/lively intent (487), semantic-only intent (478), mature personalization (515), and Distribution fixtures (451). These are evaluation families, not evidence that eligibility itself failed.

The catalog source contributed observed category, name/document terms, moods, price fit, and availability completeness. It found useful candidates, but its selected pool still had a 68.87% bad-match rate. The evidence available in the current Spot contract does not discriminate latent Good-or-Better fit sufficiently to close the coverage gap.

## 3. Source-Ordering Root Cause

Wave 2.1 already showed that repeated query projections can find candidates without placing them in the scarce Top-20 slots. Wave 2.2 tested two targeted responses:

1. source-local rank calibration, so incomparable raw source scores were not treated as one scale;
2. light evidence aggregation, capping repeated projections from the same source and rewarding agreement across independent sources.

Neither response produced a robust lift. The final Top-20 capture was lower than the same-run control, while the number of missing candidates grew because the 80-candidate budget displaced candidates previously present in the 100-candidate control. The apparent reduction in deep-ranked misses is therefore a transfer into coverage misses, not a material ordering breakthrough.

## 4. Tested Hypotheses

| Arm | Hypothesis | Capacity Capture@20 | Full-Pool Recall | Best Available | Mean pool | Decision |
|---|---|---:|---:|---:|---:|---|
| H0 | Wave 2.1 control | 0.3650 | 0.5009 | 0.4762 | 90.21 | CONTROL |
| H1 | Observed catalog attributes close source gaps | 0.3510 | 0.4282 | 0.4683 | 73.34 | REJECT |
| H2 | Calibrated existing sources improve slot use | 0.3594 | 0.4401 | 0.4206 | 73.33 | REJECT |
| H3 | Catalog plus independent-source aggregation | 0.3610 | 0.4412 | 0.4365 | 73.34 | REJECT |

The experiment sequence kept each hypothesis separately measurable. No LLM reranker, final utility model, new personalization, or final-ranking change was introduced.

## 5. Rejected Experiments

- **H1 Catalog coverage:** useful observed-attribute evidence exists, but the source alone reduced Capacity Capture and Full-Pool Recall.
- **H2 Calibrated existing sources:** improved score comparability did not improve Top-20 capture or best-available retrieval robustly.
- **H3 Evidence aggregation:** development movement did not generalize into a positive overall paired lift; mandatory absolute, robustness, non-regression, and latency gates failed.
- **Brute-force expansion:** deliberately not attempted. D4.1 requires quality per candidate and caps mean/p95 pool size.
- **Embedding-model replacement:** not attempted without evidence. The canonical model still contributes unique useful candidates.
- **Oracle/latent reranking:** prohibited. Latent utility remained evaluation-only.

## 6. Retrieval Architecture Evaluated

The experimental, non-promoted stack was:

`Structured Intent -> Product Eligibility -> Distribution Eligibility -> User Hard Constraints -> projection-specific structured/lexical/V12/semantic retrieval + observed catalog attributes -> source-local rank calibration -> independent-source evidence aggregation -> deduplicated 80-candidate union`

The Flight Recorder preserves projection, source, source rank, source score, evidence, calibrated rank, overlap, union rank, budget, and eligibility. The Lab adapter now consumes the engine's already eligible Spot Intelligence catalog; it cannot reintroduce a raw catalog row after an eligibility boundary.

Because every quality candidate failed the frozen contract, this architecture remains research evidence only. The active promoted Next-Gen capability remains Wave 1; no Wave 2.x retrieval stack is promoted.

## 7. Semantic-Hardening Result

Semantic remains **HARDEN**.

Within the final candidate evidence it contributed 1,409 useful memberships and 123 useful candidates found only by Semantic among the selected source memberships. Its useful density was 29.03%, corresponding to a 70.97% bad-match rate in this selected evidence view. Semantic therefore has clear recall value but insufficient precision or utility calibration to act as a final relevance truth.

The model remained `text-embedding-3-small`, 1,536 dimensions. No model switch was justified or made.

## 8. Retrieval-Evidence Aggregation

The aggregation is deliberately light and diagnosable:

- normalize rank within each source/projection;
- retain only the strongest projection contribution per source for a Spot;
- weight source roles explicitly;
- add bounded evidence for independent-source overlap;
- keep Semantic as recall evidence rather than final utility;
- apply deterministic Spot-ID tie-breaking;
- cap the union at 80.

This design passed deterministic unit tests but failed the product-quality contract. Passing implementation tests is not evidence for promotion.

## 9. Source Contribution

The following counts are memberships in the final H3 pools across 126 decisions. “Unique useful” means the candidate had no other source represented in its retained evidence.

| Source | Candidate memberships | Useful | Unique useful | Useful density | Bad-match rate |
|---|---:|---:|---:|---:|---:|
| Observed catalog attributes | 6,951 | 2,164 | 114 | 31.13% | 68.87% |
| Lexical | 4,061 | 1,252 | 45 | 30.83% | 69.17% |
| V12 personalized | 1,192 | 407 | 75 | 34.14% | 65.86% |
| Semantic | 4,853 | 1,409 | 123 | 29.03% | 70.97% |
| Structured category | 5,651 | 1,743 | 28 | 30.84% | 69.16% |

Overall useful-candidate density was 30.98%. Every source adds some unique value, but none currently supplies the missing quality separation.

## 10. Historical and Wave 2.2 Metrics

Historical rows retain their original certified artifacts; the Wave 2.2 row is the current experiment.

| Engine | Capacity Capture@20 | Full-Pool Recall | Best Available | Mean pool | Hard violations |
|---|---:|---:|---:|---:|---:|
| V13 Legacy | 0.2969 | 0.2154 | 0.1667 | 36.55 | 27 |
| Wave 1 | 0.2973 | 0.2154 | 0.1667 | 36.52 | 0 |
| Wave 2 | 0.3568 | 0.5282 | 0.4921 | 97.59 | 0 |
| Wave 2.1 | 0.3686 | 0.5022 | 0.4841 | 90.21 | 0 |
| Wave 2.2 H3 | 0.3610 | 0.4412 | 0.4365 | 73.34 | 0 |

Diagnostic H3 Capacity Capture was 0.3368 at K=10, 0.3610 at K=20, and 0.4327 at K=50.

## 11. D4.1 Promotion Gate Matrix

| Mandatory gate | Threshold | Observed | Result |
|---|---:|---:|---|
| Capacity Capture overall | >= 0.70 | 0.3610 | FAIL |
| Capacity Capture every seed | >= 0.65 | below | FAIL |
| Capacity Capture every split | >= 0.65 | below | FAIL |
| Best Available overall | >= 0.80 | 0.4365 | FAIL |
| Best Available every split | >= 0.70 | below | FAIL |
| Full-Pool Recall overall | >= 0.70 | 0.4412 | FAIL |
| Full-Pool Recall every split | >= 0.65 | below | FAIL |
| Paired robust lift | >= 0.03 and lower CI > 0 | -0.0040; CI [-0.0257, 0.0165] | FAIL |
| Every seed improves | required | no | FAIL |
| Locked holdout non-regression | required | met | PASS |
| Full-pool non-regression | required | no | FAIL |
| Best-available non-regression | required | no | FAIL |
| Mean / p95 pool | <= 80 / <= 100 | 73.34 / 80 | PASS |
| FULL_FIDELITY Lab p95 latency | <= 750 ms | 1,055.5 ms | FAIL |
| External cost / decision | <= $0.01 | $0.00000269 | PASS |
| No-result / starvation | protected | 1/126 / 1/126 | PASS |
| Hard / duplicate integrity | zero | zero | PASS |

No composite score can compensate for these failed gates. Verdict: **REJECT**.

## 12. Remaining Retrieval Misses

The remaining evidence indicates a deeper representation problem rather than a candidate-limit problem alone:

- observed category, lexical, mood, price, and document evidence has low useful density;
- source ordering does not separate Good-or-Better Spots sufficiently;
- reducing the pool to the operational budget exposes large coverage loss;
- Semantic has unique recall but poor match precision;
- current observed Spot Intelligence does not express enough occasion-, vibe-, or context-fit detail to recover latent quality without leakage.

No Ground Truth, Golden Scenario, threshold, or holdout data was changed to make the experiment pass.

## 13. Candidate Pool, Latency, and Cost

- Mean pool: 73.34 candidates; p95/max: 80/80.
- Useful-candidate density: 30.98%.
- FULL_FIDELITY Lab p95: 1,055.5 ms. This is a disposable local Lab number, not Production latency.
- External embedding cost per decision: approximately $0.00000269.
- Query prompt tokens: 16,926; Spot-document prompt tokens: 41,802 across the three isolated seed worlds.

Pool and cost gates passed. Latency did not.

## 14. Integrity Regression

Across all 126 decisions:

- Product Eligibility failures: 0
- Distribution Eligibility failures: 0
- User hard-constraint failures in retrieval candidates: 0
- Unresolved entities: 0
- Duplicate candidates: 0
- Scientific Validity: PASS
- Latent Truth in engine input: false
- D4.1 contract mutation: none
- Decision Engine mutation: none
- Production access: none

The V13/Wave 2 execution source was read from the repository and instrumented behavior-neutrally for Lab tracing. No product engine source, ranking weights, Constitution, Scenario Registry, Ground Truth, Treatment Contract, migration, or Production state changed.

## 15. Tests and CI

Permanent tests cover observed-only attribute retrieval, latent-isolation, independent-source overlap, projection capping, deterministic ordering, the 80-candidate budget, baseline sealing, all frozen identities, integrity, and honest rejection.

Local and GitHub CI evidence is recorded in the pull request. The full repository suite includes Decision Lab, D2/D2.1/D2.2, D3.1/D3-A validation, D4.1 freeze validation, Wave 1, database boot/regressions, repository/security guards, and Mobile/Web/Admin/Shared checks.

## 16. Files, Git, and Pull Request

Branch: `codex/decision-wave2-2-retrieval-breakthrough`

Draft PR: [#37](https://github.com/PhiluLan/backyrd/pull/37); the pull request is the final CI source of truth.

Durable additions are limited to the Lab retrieval experiment, behavior-neutral trace evidence, runner/aggregator, sealed baseline, tests, package command, and this report.

## 17. Wave 3 Readiness

**NOT READY.**

Wave 3 must not be built on an unpromoted retrieval stack. The next retrieval research should begin from the measured information bottleneck: improve legitimately observed Spot fit representation and source-specific relevance, then test a new candidate against the unchanged D4.1 contract. It must not use latent utility as an engine feature or relax the contract.

## 18. Production Statement

Production is unchanged. No Production connection, deployment, data mutation, `db push`, migration repair, migration, or app routing change occurred.

## Final Verdicts

**WAVE 2.2 RETRIEVAL BREAKTHROUGH — FAIL**

**D4.1 RETRIEVAL PROMOTION CONTRACT — FAIL**

**RETRIEVAL NEXT GEN — NOT PROMOTED**

**COVERAGE GAP — NOT MATERIALLY REDUCED**

**SOURCE ORDERING GAP — NOT MATERIALLY REDUCED**

**SEMANTIC RETRIEVAL — HARDEN**

**WAVE 1 STRENGTH REGRESSION — NONE**

**WAVE 3 CONTEXT & PERSONALIZATION — NOT READY**

**PRODUCTION — UNCHANGED**
