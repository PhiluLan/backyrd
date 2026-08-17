# BACKYRD DECISION NEXT GEN — WAVE 3C PERSONALIZED DECISION

Status: **FAIL — NOT PROMOTED**

Date: 2026-08-17
Environment: synthetic Decision Lab; Production access `NONE`

## 1. Personalized Fit Architecture

Wave 3C adds a Lab-only, deterministic `backyrd-personalized-fit-v1` layer after the promoted Wave-1 Candidate path:

`Structured Intent → Product Eligibility → Distribution Eligibility → User Hard Constraints → existing Candidate Pool → Personalized Fit → Top 10`

The layer consumes only current Intent, current Context, the frozen Wave-3B.1 Taste Map/Projection, Confidence, observed Spot Intelligence and the already eligible Candidate IDs. It does not retrieve Candidates, decide eligibility or implement a final Utility model. Candidate evidence and every score component are recorded in `decision-flight-recorder-wave3c-v1`.

Authority is fixed as: Product → Distribution → User Hard Constraints → Explicit Current Intent → Current Context → Confidence-weighted History. UNKNOWN Taste is neutral. Maximum historical influence is bounded by maturity and mean Taste Confidence.

## 2. Validation Contract

The Contract was frozen before the official result:

- Contract: `backyrd-wave3c-personalized-decision-validation-v1`
- Contract Hash: `371389933d059646339430f46eb2ac0a718891792f8adb355e6bc70581b2550f`
- Final Freeze Hash: `15d0e1bd4aee8f1697db9b757f898a1a81b703feeb41a3f5354eac890c0bc2b7`
- Taste Engine Freeze: `2a4a9e2f7353ad20d10073a00ccfb235778d64d5730f5e7771a4787f92a2116f`
- Taste Treatment Freeze: `ab2339de028fb5ed04999ea682d6a38d9434e75350993fb4963c518c8af15116`
- D2.2 Treatment Freeze: `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053`

The official sample contains three seeds, 126 Golden Scenarios, 378 ACTUAL/NEUTRAL/OPPOSING executions, nine Context comparisons, nine different-user comparisons and 18 Intent-conflict cases. All mandatory arms have fail-closed coverage.

Two Measurement-Integrity stops occurred before certification:

- `WAVE3C-MI-001`: controlled Context fixtures omitted the complete canonical evaluator Context. Fix: reuse complete generated Context records and change only the declared audience/time/weekday fields. World-runner identity was re-frozen; the run restarted at Seed 1.
- `WAVE3C-MI-002`: aggregation used `Object.groupBy`, unavailable in canonical Node 20. Fix: deterministic `Map` grouping only. Aggregate-runner identity was re-frozen; the run restarted again at Seed 1.

No partial or stopped result was reused.

## 3. ACTUAL vs NEUTRAL vs OPPOSING

All arms used the same latent person, Query, Context, World, Candidate universe, Ground Truth and Fit code. Only observed History differed according to the frozen D2.2 Contract.

| Arm | Mean Top-10 Utility |
|---|---:|
| ACTUAL | 0.398179 |
| NEUTRAL | 0.399063 |
| OPPOSING | 0.399329 |

Opposing History harm rate was 16.67%, inside its isolated safety ceiling. That does not compensate for ACTUAL failing to beat NEUTRAL.

## 4. Personalization Lift

ACTUAL − NEUTRAL mean lift is **−0.000884**. Paired bootstrap interval: **[−0.003980, 0.002389]**. Wins/ties/losses: **14 / 91 / 21**.

NDCG@10 declined `0.548688 → 0.546682`; Precision@10 declined `0.348347 → 0.345172`. The frozen positive-lift gate fails.

## 5. Personalization Harm

Overall Harm is 16.67%, but cohort protection fails because Power Users reach **60%** Harm. Mature Harm is 31.82%. Average lift cannot hide this cohort-level failure.

## 6. Same User / Different Context

Ranking differentiation is **0.1212**, below the frozen `0.20` floor. Context-specific Utility gain is **−0.007823**, below the positive floor.

- Family/Sunday/Afternoon: approximately neutral
- Friends/Friday/Evening: `−0.02347`
- Date/Evening: approximately neutral

The validated Taste Map can create different projections, but this first Fit integration does not convert them into reliably better context-specific Decisions.

## 7. Same Request / Different Users

Observed ranking divergence is **0.0**. The users' Taste states changed candidate scores too weakly or too uniformly to change Top-10 membership. False-personalization rate is 33.33%, above the frozen 30% ceiling.

## 8. Current Intent vs History

Current Intent Robustness is **1.0** and History Override Rate is **0** across all 18 conflict cases. ACTUAL and OPPOSING History never overrode the explicit current request. This authority boundary passes.

## 9. Maturity / Learning Benefit

| Cohort | N | Lift | Harm |
|---|---:|---:|---:|
| Cold | 26 | 0.000000 | 0% |
| Onboarding | 15 | +0.000621 | 6.67% |
| Sparse | 25 | −0.001388 | 16% |
| Developing | 33 | +0.003221 | 18.18% |
| Mature | 22 | −0.004969 | 31.82% |
| Power | 5 | −0.016598 | 60% |

Cold Start correctly remains neutral. Benefit does not grow with maturity; Mature/Power evidence is specifically harmful in this integration.

## 10. Confidence-aware Personalization

Confidence-to-lift correlation is **−0.0092**. The implementation bounds influence by Confidence, but higher Confidence does not predict greater realized Decision benefit. This gate fails. The known mature false-preference diagnostic from Wave 3B.1 remains relevant.

## 11. Retrieval vs Personalization Failures

- Retrieval misses: **102/126**
- Personalization misses with the available pool: **21/126**

Retrieval remains the dominant ceiling, consistent with Wave 2.x. Nevertheless, 21 cases prove an independent Personalization-layer problem: the available Candidate set was held constant and ACTUAL still underperformed NEUTRAL.

## 12. Hard / Product / Distribution Regression

- Hard Constraint violations: **0**
- Product Eligibility violations: **0**
- Distribution Eligibility violations: **0**
- Candidate universe equality across treatment arms: **100%**

Taste never participates in Eligibility and cannot reintroduce excluded Candidates.

## 13. Biggest Strengths

- explicit Intent remains authoritative even under opposing History;
- Cold Start is neutral rather than fabricated;
- every score and movement is traceable;
- no Eligibility or Scientific-Validity regression;
- retrieval and personalization failures are now independently attributable.

## 14. Biggest Weaknesses

- ACTUAL History produces no positive aggregate lift;
- Mature and Power cohorts are harmed most;
- Context projections do not yield context-quality gains;
- different learned users receive the same Top-10 membership;
- calibrated Taste Confidence is not calibrated to Decision lift;
- sparse observed Spot concepts limit useful Taste-to-Spot matching.

## 15. Tests / CI

Permanent tests cover Intent authority, Cold neutrality, deterministic replay, Spot representation, Candidate preservation, Product/Distribution fail-closed behavior, scientific input boundaries, freeze validation, mandatory coverage and preservation of the negative official verdict. Local acceptance passed: 151 Decision-Lab tests, D2/D2.1/D2.2, D3.1, D3-A, Wave-3A/Wave-3B.1 freezes, Repository Sanity, canonical SQL Secret Guard, Web/Admin typecheck and production builds, Mobile lint (0 errors; inherited warnings), Shared typecheck, and the isolated canonical database boot plus DB lint. GitHub's Quality, Database and Security workflows, including Gitleaks, remain the authoritative PR checks.

## 16. Scientific Validity

Scientific Validity is **PASS**. Latent Truth and evaluator Utility never enter Runtime Fit inputs. D2.2 controls are unchanged; Ground Truth, Golden Scenarios, thresholds, Wave-3B.1 Engine and Retrieval are unchanged. Locked Holdout was not used for tuning. The official run began from zero after each Measurement-Integrity fix.

Official Result Hash: `aa9e2c7c455df48eb746025877b804c8ac5471d9d7fceec3b2a59e7eae15de7a`.

## 17. Git / Draft PR

Branch: `codex/decision-wave3c-personalized-decision`. The Draft PR contains Lab code, versioned contracts/freezes, tests, this report and the sealed result. No merge is part of Wave 3C.

## 18. Production Statement

Production is unchanged. No Production connection, mutation, deployment, `db push`, migration repair, synthetic Production data or Product rollout occurred.

## 19. Wave-4 Readiness

Wave 4 is **NOT READY** under this integration. A final Utility/Fusion layer must not be built on a Personalized Fit treatment that fails lift, cohort harm, Context, user differentiation and Confidence gates. The result identifies the exact integration weaknesses for a separate reviewed calibration/architecture phase.

## Final Verdicts

- **WAVE 3C PERSONALIZED DECISION INTEGRATION — FAIL**
- **PERSONALIZATION LIFT — FAIL**
- **PERSONALIZATION HARM — FAIL**
- **CONTEXTUAL DECISION INTELLIGENCE — FAIL**
- **CURRENT INTENT AUTHORITY — PASS**
- **CONFIDENCE-AWARE PERSONALIZATION — FAIL**
- **USER TASTE ENGINE INTEGRATION — NOT PROMOTED**
- **SCIENTIFIC VALIDITY — PASS**
- **WAVE 4 UTILITY & FUSION — NOT READY**
- **PRODUCTION — UNCHANGED**
