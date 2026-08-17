# Backyrd Decision Next Gen — Wave 4 Contextual Utility & Fusion

Status: **COMPLETE — FAIL / NOT PROMOTED**

Date: 2026-08-17

Production: **UNCHANGED**

## 1. Executive Summary

Wave 4 implemented and measured the first deterministic Contextual Utility/Fusion Core authorized by D4.2. The implementation preserved the frozen Candidate Path, Wave-3B.1 Taste Engine, D2.2 treatment semantics, eligibility boundaries and scientific separation. The official three-seed run completed all 126 Golden Scenarios and 378 ACTUAL/NEUTRAL/OPPOSING treatments.

The experiment is valid negative evidence. It reduced Personalization Harm to `2.38%` and preserved Current Intent and every integrity boundary, but it lowered overall Top-10 utility, NDCG and Precision relative to the frozen Wave-3C.1 control. It therefore fails its pre-registered contract and is **not promoted**.

## 2. Utility Contract

Version: `backyrd-contextual-utility-contract-v1`

Fusion: `backyrd-deterministic-hybrid-fusion-v1`

Validation Contract Hash: `bf45fd0294781afd99633707564c887f59dabd43dbfd4133bedd1393348851cb`

Freeze Hash: `cfb89fc8abe3a27307acf278f45e61fbd0d5723edde7846de6643f105b4d34d2`

The Contract keeps five evidence dimensions separate:

| Dimension | Meaning | Missing / UNKNOWN | Confidence |
| --- | --- | --- | --- |
| Request Fit | observed Spot evidence matching explicit current Intent | neutral `0.5` | explicit Intent coverage |
| Context Fit | observed Spot evidence matching current audience/time/mood | neutral `0.5` | observed Context evidence |
| Personalized Fit | Wave-3C.1 decomposed Taste evidence | neutral `0.5` | Taste-map, matched-evidence and relevance confidence |
| Candidate Evidence | calibrated canonical retrieval-union rank | fail closed if absent | canonical union position |
| Spot Evidence | observed Spot Intelligence sufficiency | UNKNOWN is not negative | field coverage |

Latent Truth, Golden labels, evaluation utility, holdout outcomes and future outcomes are prohibited Runtime inputs.

## 3. Authority Hierarchy

The runtime hierarchy is:

`Product Eligibility → Distribution Eligibility → User Hard Constraints → Explicit Current Intent → Contextual Utility`

Utility only receives already eligible candidates. Personalization is bounded to an absolute `0.08` utility delta and cannot redefine explicit Intent. The official run recorded zero Hard, Product or Distribution violations and `100%` Current-Intent robustness.

## 4. Fusion Architecture

The retained experiment is an auditable deterministic hybrid:

1. resolve Request and Context evidence independently against observed Spot concepts;
2. calibrate canonical retrieval union position without combining raw cross-source scores;
3. consume the Wave-3C.1 Personalized-Fit evidence vector with relevance and Confidence gates;
4. compute a bounded personal delta rather than treating Taste as a standalone ranker;
5. emit component evidence, uncertainty, final utility and final rank for every candidate.

No LLM, learned reranker, external API or new retrieval source is involved.

## 5. Evaluated and Rejected Approaches

| Approach | Decision | Reason |
| --- | --- | --- |
| calibrated deterministic hybrid | RETAINED FOR OFFICIAL EXPERIMENT | smallest explainable architecture authorized by D4.2 |
| raw source-score sum | REJECTED | source scales are incomparable and violate the evidence contract |
| standalone Personalized Fit | FROZEN CONTROL / REJECTED AS FINAL RANKER | Wave 3C.1 did not produce robust lift |
| learned fusion | REJECTED FOR WAVE 4 | no unbiased outcome corpus supports scientific training |

No parameters were changed after the official Freeze.

## 6. Overall and Ranking Quality

| Metric | Wave-3C.1 control | Wave 4 | Delta / Gate |
| --- | ---: | ---: | --- |
| Mean Utility@10 | `0.395189` | `0.386761` | `-0.008428` — FAIL |
| NDCG@10 | `0.535489` | `0.527135` | gate `>=0.55` — FAIL |
| Precision@10 | `0.341960` | `0.334023` | gate `>=0.35` — FAIL |
| Utility-lift 95% interval | — | `[-0.014824, -0.001984]` | FAIL |

Wave 4 improved 33 Decisions, tied 36 and worsened 57 against its Wave-3C.1 control. The explicit Fusion did not create a common utility scale that ranked available candidates better.

## 7. ACTUAL / NEUTRAL / OPPOSING and Personalization

ACTUAL versus NEUTRAL produced mean lift `+0.000906` with interval `[-0.000058, +0.002334]`: 7 wins, 116 ties and 3 losses. Harm was low (`2.38%`, maximum cohort `4.55%`) but the pre-registered causal lift floor was not met.

This is an important boundary result: confidence bounding made personalization safer, but also left it too weak and too rarely relevant to create measurable product value. More weight is not an authorized conclusion; the mapping and conditional utility contract require another architecture review.

## 8. Context, Users and Maturity

- Same User / Different Context divergence: `0.18337`, below the `0.20` gate.
- Context utility gain versus Wave-3C.1: `+0.00639`, positive but insufficient because divergence failed.
- Same Request / Different Users ranking divergence: `0.0`, FAIL.
- Current Intent robustness: `1.0`; History override rate: `0.0`, PASS.
- Cold utility delta versus Wave-3C.1: `-0.01818`, FAIL.
- Mature/Power personalization benefit remained below its required floor.
- Power-user Personalization Harm was `0`, but Power overall utility regressed `-0.010922` against Wave-3C.1.

The model reacts to Context more safely than the standalone Fit control, but it does not differentiate users or preserve Cold quality.

## 9. Failure Attribution

| Class | Count |
| --- | ---: |
| Retrieval Miss | `102 / 126` |
| Utility/Fusion Miss | `106 / 126` |
| Personalization Miss | `3 / 126` |

Retrieval remains a known inherited ceiling and retains its historical `NOT PROMOTED` verdict. The new evidence additionally proves that the present deterministic fusion itself creates substantial conditional-ordering loss; this cannot be attributed only to missing candidates.

## 10. Promotion Gate Matrix

PASS: Coverage, Personalization Harm, Current Intent Authority, Hard Constraints, Product Eligibility, Distribution Eligibility, Latency/Cost.

FAIL: Overall Decision Quality, Utility/Fusion Lift, Personalization Value, Contextual Decision Intelligence, Different Users, Cold Start, Mature Benefit, Multi-Seed/Holdout lift.

No composite score compensates for a failed mandatory gate.

## 11. Efficiency

The official run evaluated `12,225` candidate-treatment combinations. Utility-only Lab latency was median `1.064ms`, p95 `2.145ms`, and maximum `3.967ms`. External calls and external cost were both zero. Efficiency passed and was not the limiting factor.

## 12. Scientific Validity and Integrity

- three canonical seeds and 126 Golden Scenarios completed;
- all mandatory coverage arms completed fail-closed;
- Ground Truth was evaluator-only;
- no Locked-Holdout tuning;
- Candidate Universe identical across ACTUAL/NEUTRAL/OPPOSING;
- Retrieval mutation: NONE;
- Taste Engine mutation: NONE;
- Production access: NONE;
- Product, Distribution and Hard Constraint violations: zero.

Scientific Validity: **PASS**.

## 13. Flight Recorder

Each candidate records eligibility state, canonical retrieval rank, Request Fit, Context Fit, Personalized Fit and its relevant Taste evidence, Spot evidence sufficiency, confidence, Fusion weights, bounded personal delta, final utility, rank and inclusion. Raw incomparable source scores are not fused.

## 14. Remaining Limitations and Next-Wave Readiness

The deterministic hybrid proved too dependent on coarse observed concept overlap and retrieval position. It degraded Cold users, failed user differentiation and did not raise conditional ranking quality. Retrieval remains incomplete, while Utility/Fusion has independently failed even when useful candidates were present.

The next implementation wave is **NOT READY** under the frozen contract. A new architecture decision must determine how request/context evidence should be represented and calibrated without tuning against synthetic holdout truth or simply increasing Personalization weight.

## 15. Tests and Production

The permanent suite covers Contract identity, forbidden inputs, Intent authority, eligibility fail-closed behavior, Cold/UNKNOWN behavior, complete Flight Recorder evidence, Freeze integrity, sealed result identity, fail-closed coverage and negative-verdict preservation.

No database migration, Production connection, `db push`, Product switch or Production mutation occurred.

## Final Verdicts

- **WAVE 4 CONTEXTUAL UTILITY & FUSION — FAIL**
- **OVERALL DECISION QUALITY — FAIL**
- **UTILITY & FUSION LIFT — FAIL**
- **PERSONALIZATION VALUE — FAIL**
- **CONTEXTUAL DECISION INTELLIGENCE — FAIL**
- **CURRENT INTENT AUTHORITY — PASS**
- **DECISION NEXT-GEN CORE — NOT PROMOTED**
- **SCIENTIFIC VALIDITY — PASS**
- **NEXT WAVE — NOT READY**
- **PRODUCTION — UNCHANGED**
