# Wave 3B — Internal User Taste Validation & Red Team

> **Measurement-integrity status: PASS.** `WAVE3B-MI-001`, `WAVE3B-MI-002` and `WAVE3B-MI-003` are resolved. The v1.1 baseline is complete, deterministic and certified against fail-closed mandatory-arm coverage.

## 1. Executive Summary

Wave 3B executed the unchanged Wave-3A Taste Engine against a prospective, versioned validation contract. The certified v1.1 run covered 3 seeds, 10 latent archetypes, 7 lifecycle checkpoints and 210 lifecycle evaluations, plus all 14 mandatory scoped, signal, consent, temporary-behaviour, extreme-behaviour and decomposition arms.

The Engine is **MIXED**. It learns declared preference direction, top preferences, negative direction, place-type differences and contextual direction well. It also accumulates too many false preferences, reports confidence that is badly calibrated, adapts too weakly between contexts, needs too many events for drift, and learns excessive false preference from noisy weak interactions.

No Taste parameter was changed during measurement. Latent Truth was evaluator-only. Production and final Decision ranking were untouched.

## 2. Validation Contract

- Contract: `backyrd-taste-validation-contract-v1.1`
- Contract hash: `52cccacc7942975d1662a8bf88f1472cf259753da172d61d6682079a95de202d`
- Validation freeze hash: `03823e4fc3ba371d4053ffcac2bd3c8d2af069995b5875135c2512780b03833e`
- Parent engine freeze hash: `d349f041c0a62697881a159d3b1be8bfabfa633a1afa47a6b84dd9eb83009df3`
- Parent engine source hash: `7899dff378f608120b48efae738f5d4f422c89ed4356c9b4b7abaa0d4068d0d3`
- Baseline result hash: `cde2ea2440116aacb644a220797f1ab937b39f02ed6e8bf27438e3a8bb3cdec2`
- Cohorts: New, Early, Developing, Mature, Long-term
- Checkpoints: 0, 5, 10, 25, 50, 100, 200 informative events
- Promotion: every mandatory gate must pass; no composite compensation

Thresholds were frozen before the certified run. The Locked/Evaluation Truth never became an Engine feature.

## 3. Overall Taste Accuracy

| Metric | Overall | Mature | Gate | Result |
|---|---:|---:|---:|---|
| Direction Accuracy | 0.9056 | 1.0000 | overall ≥ 0.75; mature ≥ 0.80 | PASS |
| Affinity Accuracy | 0.8502 | 0.9432 | overall ≥ 0.72 | PASS |
| Rank Correlation | 0.7528 | 0.7367 | mature ≥ 0.55 | PASS |
| Top-Preference Recall | 0.9019 | 0.9722 | mature ≥ 0.70 | PASS |
| False Preference Rate | 0.3911 | 0.5294 | ≤ 0.12 | **FAIL** |
| Negative Direction Accuracy | 0.8889 | 1.0000 | ≥ 0.75 | PASS |
| False Negative Preference Rate | 0.0000 | 0.0000 | ≤ 0.08 | PASS |

Backyrd usually learns which declared tastes point positive or negative, but also attaches positive meaning to too many neutral concepts encountered through noisy spot evidence. More history currently increases this over-learning instead of resolving it.

## 4. Learning Curve

| Events | Direction | Affinity | Top Recall | False Preference |
|---:|---:|---:|---:|---:|
| 0 | 0.0000 | 0.6093* | 0.0000 | 0.0000 |
| 5 | 0.5300 | 0.6785 | 0.7222 | 0.2128 |
| 10 | 0.9033 | 0.7423 | 0.7556 | 0.2821 |
| 25 | 1.0000 | 0.8560 | 1.0000 | 0.3942 |
| 50 | 1.0000 | 0.9382 | 0.9889 | 0.3989 |
| 100 | 1.0000 | 0.9568 | 0.9778 | 0.4773 |
| 200 | 1.0000 | 0.9297 | 0.9667 | 0.5815 |

`*` At zero events, missing learned affinity is evaluated as zero against signed truth. It is not treated as learned knowledge; Direction and Recall remain zero.

Backyrd knows the main direction meaningfully after roughly 10 events and strongly after 25. Sample efficiency for true concepts is good, while false-preference accumulation is the dominant lifecycle failure.

## 5. Confidence Calibration

- ECE: **0.4494** versus maximum 0.18 — FAIL
- Accuracy for confidence ≥ 0.60: 1.0000 — PASS submetric
- Lowest-confidence bin: mean confidence 0.0816 versus observed direction accuracy 0.7358

The model is predominantly under-confident, not recklessly over-confident, in this synthetic evaluation. Confidence therefore does not represent actual knowledge quality closely enough for downstream weighting.

## 6. Archetype Differentiation

Ten archetypes covered hidden-gem exploration, cozy/quiet, lively/social, premium/design, budget/casual, family, mainstream/convenience, novelty, familiarity and mixed taste. Aggregate mature Direction Accuracy of 1.0, Top-Preference Recall of 0.9722 and Rank Correlation of 0.7367 show that their principal declared tastes are distinguishable. Neutral-concept contamination prevents a clean full-map distinction.

## 7. Place-Type Taste

- Place-Type Direction Accuracy: **1.0000** — PASS
- Café, bar and restaurant evidence remained separately projectable.
- Sparse-state hierarchy remained global + place type rather than separate user identities.

## 8. Contextual Taste

- Contextual Direction Accuracy: **1.0000** — PASS
- Contextual Adaptation magnitude: **0.1495** versus minimum 0.15 — **FAIL**
- Global Retention: **1.0000** versus minimum 0.70 — PASS

The Engine points contextual concepts in the correct direction, but modulation between Family/Sunday and Friends/Friday projections is fractionally below the prospectively frozen minimum. The failure is retained even though the margin is small.

## 9. Same User / Different Context

The same observed user produced distinct Family and Friends projection hashes. Global direction was retained completely. Context therefore does not overwrite identity, but adaptation strength is insufficient under the frozen contract.

## 10. Current Intent Authority

Explicit current Intent overrode contradictory quiet/cozy History in both positive and negative directions. Authority rate was 1.0 and the gate passed. Hard constraints remain outside Taste and authoritative.

## 11. Negative Learning

- Negative Direction Accuracy: 0.8889 overall, 1.0 mature — PASS
- False Negative Preference Rate: 0.0 — PASS
- `not_there` and missing interaction produced no negative Taste.
- One negative/positive conflict remained bounded by the existing confidence logic.

This is a material strength: the Engine did not manufacture dislikes from absence or correction events in the tested worlds.

## 12. Noise Resistance

Fifty random weak taps/opens learned 27 global rows. False Preference Rate reached **0.1852** versus maximum 0.12 — FAIL. Maximum affinity remained bounded at 0.3149, so the failure is breadth of false learning rather than unbounded magnitude.

Exposure alone created zero rows, a single tap remained at affinity 0.0748, identical replay was idempotent, and exact duplicate IDs did not amplify Taste.

## 13. Onboarding Correction

Incorrect premium onboarding was corrected by observed casual/budget behavior within 5 informative events, under the maximum of 25. Residual affinity error was 0.0098. Onboarding is not a permanent prison in this fixture.

## 14. Drift Adaptation

- Final drift direction: 1.0
- Final drift affinity accuracy: 0.8581
- Adaptation point: **60 events** versus maximum 50 — FAIL

The Engine eventually learns sustained change without immediately erasing old history, but does so too slowly under the frozen gate.

## 15. Temporary Interest

A two-week morning/brunch phase produced affinity 0.7175 immediately and 0.3966 after one simulated year. Decay distinguishes a temporary phase from permanent certainty, although Wave 3B does not claim this single fixture fully calibrates every Taste timescale.

## 16. Adversarial User Pairs

Two users visiting the same five spots for different latent reasons were indistinguishable before reason-specific evidence. After exact mood feedback, their maps diverged. This is classified as `OBSERVABILITY_LIMIT`, not Engine certainty: identical product evidence cannot reveal why behavior occurred.

## 17. Consent / Privacy

- Missing personalization consent failed closed.
- Missing consent created neither suspicion nor negative Taste.
- Latent Truth was absent from every Engine input.
- No external tracking, demographic inference, Production access or final ranking integration occurred.
- Existing Wave-3A RLS/service-boundary tests remain authoritative and are rerun in CI.

## 18. Failure Decomposition

| Class | Count | Failed gate | Severity | Root-cause confidence |
|---|---:|---|---|---|
| SIGNAL_WEIGHT | 2 | False Preference; Noise Resistance | P1 | HIGH |
| CONFIDENCE | 1 | Confidence Calibration | P1 | HIGH |
| CONTEXT | 1 | Contextual Adaptation | P1 | HIGH |
| DRIFT | 1 | Drift Adaptation | P1 | HIGH |
| OBSERVABILITY_LIMIT | 1 | Adversarial same-behavior pair | limitation | HIGH |

No `OTHER_UNKNOWN` failure remained. Failures affect Early through Long-term cohorts; the False Preference problem worsens with history depth.

## 19. Biggest Strengths

- Strong mature Direction Accuracy, Affinity Accuracy and Top-Preference Recall.
- Accurate Place-Type and contextual direction.
- Conservative negative learning with zero measured false negative preference.
- Explicit Intent authority, idempotency, consent boundary and exposure neutrality all hold.
- Incorrect onboarding is corrected quickly.

## 20. Biggest Weaknesses

- False preferences accumulate as more weak/noisy spot concepts are observed.
- Confidence is strongly under-calibrated relative to actual direction correctness.
- Context changes direction correctly but not strongly enough.
- Sustained preference drift requires 60 rather than at most 50 informative events.
- Same behavior remains inherently ambiguous without reason-specific evidence.

## 21. Remaining Unknowns

- External validity with real, consented product behavior is not established by synthetic evidence.
- Concept mapping quality depends on Spot Intelligence and event-to-concept attribution, which Wave 3B holds fixed.
- The validation evaluates Taste truth, not recommendation quality or causal product lift.
- Long-term decay is deterministic simulation, not elapsed Production observation.

## 22. Measurement-Integrity History

`WAVE3B-MI-001` is resolved: a local runner result variable shadowed the Failure-Decomposition function. The authorized fix renamed only that local variable and changed only the runner identity.

`WAVE3B-MI-002` is resolved: the evaluator originally omitted enforcement for Global Retention, Contextual Adaptation and False-Negative Preference. The authorized repair implemented those already-frozen measurements and gates without altering semantics or thresholds. Adversarial tests prove that each can independently reject promotion. The uncertified artifact was overwritten by a complete from-zero rerun.

## 23. Tests / CI

Focused validation includes Engine freeze, Validation freeze, latent isolation, deterministic replay, lifecycle coverage, scoped projections, noise, consent, idempotency, each previously omitted gate, and sealed baseline verification.

Final local acceptance after the clean v1.1 rerun:

- Wave-3B freeze validation and official baseline replay: PASS; identical result hash.
- Mandatory Wave-3B coverage: 14/14 executable arms, 100%, no missing or invalid arm.
- Decision Lab: 140/140 tests PASS; focused Wave-3B suite: 23/23 PASS.
- D2 acceptance/re-certification, D2.2 validation, D3.1 preflight and bounded diagnostic coverage, D3-A baseline validation, and D2 scope guard: PASS.
- Canonical database boot, all canonical SQL acceptance suites, Decision Product Eligibility regression, Wave-3A RLS/service-boundary regression, and reviewed DB lint baseline: PASS in a disposable local environment.
- Repository sanity and canonical secret guard: PASS.
- Web and Admin TypeScript/build, Mobile lint, and Shared TypeScript: PASS. Existing advisory lint/type debt remains outside this change.

### WAVE3B-MI-003 — resolved

Root cause: the v1 Contract lacked explicit executable coverage requirements for several mandatory Red-Team arms, allowing an incomplete run to appear structurally complete.

Fix: Validation Contract v1.1 declares 14 mandatory arm IDs and requires at least one executable measurement for each. Missing, zero-measurement or non-executable arms fail `diagnosticCoverage` and set promotion to FAIL. Adversarial tests exercise every arm in all three failure states.

Certified coverage is 14/14 (100%): standalone `ONBOARDING_ONLY`; reservation; review/mood; repeated behaviour; consent withdrawal; incomplete history; tourist week; festival weekend; business trip; temporary category phase; mass same-category; weak-versus-strong evidence; Failure Decomposition by 6 cohorts; and Failure Decomposition across 42 observed/affected concepts.

The v1.1 runner started from event zero and did not read the prior uncertified baseline. Parent Wave-3A source and Engine freeze remained unchanged. New freeze identity: `03823e4fc3ba371d4053ffcac2bd3c8d2af069995b5875135c2512780b03833e`.

## 24. Production Statement

Production is unchanged. No connection, deployment, `db push`, migration repair, synthetic Production data or Product integration occurred.

## 25. Wave-3C Readiness

Wave 3C is **NOT READY**. Five mandatory gates fail. This report makes no final Decision-quality claim and proposes no tuning inside the measured run.

## Final Verdicts

- **WAVE 3B INTERNAL TASTE VALIDATION — FAIL**
- **USER TASTE LEARNING — MIXED**
- **CONFIDENCE CALIBRATION — FAIL**
- **CONTEXTUAL TASTE — FAIL**
- **PLACE-TYPE TASTE — PASS**
- **DRIFT & NOISE RESILIENCE — FAIL**
- **SCIENTIFIC VALIDITY — PASS**
- **WAVE 3C PERSONALIZED DECISION INTEGRATION — NOT READY**
- **PRODUCTION — UNCHANGED**
