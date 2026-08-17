# BACKYRD DECISION NEXT GEN — WAVE 3B.1 TASTE LEARNING CALIBRATION

Status: **PASS**
Date: 2026-08-17
Environment: synthetic Decision Lab only; Production access `NONE`

## 1. Baseline Failures

Wave 3B is the immutable comparison baseline:

- Validation Contract: `backyrd-taste-validation-contract-v1.1`
- Contract Hash: `52cccacc7942975d1662a8bf88f1472cf259753da172d61d6682079a95de202d`
- Validation Freeze: `03823e4fc3ba371d4053ffcac2bd3c8d2af069995b5875135c2512780b03833e`
- Baseline Result: `cde2ea2440116aacb644a220797f1ab937b39f02ed6e8bf27438e3a8bb3cdec2`

The baseline failed False Preference, Confidence Calibration, Contextual Adaptation, Drift Adaptation and Noise Resistance. Place-Type Taste, Current Intent Authority, negative learning, consent, idempotency and scientific isolation passed.

## 2. Root Causes

1. A multi-concept Product event assigned full strength independently to every concept. Incidental or neutral Spot concepts could therefore become durable preferences after too little corroboration.
2. Weak interaction evidence accumulated linearly even when repeated on one Spot or in one session.
3. Affinity regularization allowed a single strong outcome, or two weak events, to cross the Contract's `0.15` false-preference boundary.
4. Confidence primarily represented accumulated support. It materially underestimated the empirically observed correctness of a learned direction.
5. Context contribution `0.50` was just below the minimum observable adaptation while retaining correct direction.
6. Stable evidence retained a 365-day half-life, delaying a sustained contrary preference until 60 events.

## 3. Tested Hypotheses

| Experiment | Hypothesis | Result | Decision |
|---|---|---|---|
| Baseline | Wave-3A v1 under the frozen v1.1 Contract | 5 failed gates | Reference |
| Evidence reliability v1.1 | Weaker interaction tiers, stronger affinity regularization, single-event/uncorroborated-interaction caps, 300-day stable decay and Context weight `0.65` reduce false learning while preserving established strengths | False Preference, Context, Drift and Noise passed; Confidence ECE `0.1855` narrowly failed | Keep all causally targeted changes |
| Confidence candidate `0.55 + 0.45r` | Confidence floor plus evidence reliability aligns direction certainty | ECE `0.1855` versus maximum `0.18` | Reject |
| Confidence candidate `0.57 + 0.43r` | Minimal two-point calibration corrects the remaining under-confidence without changing affinity | ECE `0.1751`, High-Confidence Accuracy `1.0`; all gates passed | Keep |

No Locked Holdout, Ground Truth label or evaluation utility was used as an Engine input. Thresholds were not changed.

## 4. Rejected Changes

The `0.55 + 0.45r` confidence candidate was rejected because it remained outside the pre-frozen ECE gate. No LLM, learned model, new Taste Concept, new negative inference, ranking integration or broad weight search was introduced.

## 5. Final Engine Changes

Taste Engine v1.1 changes only the calibrated learning mechanics:

- weak interaction strengths: tap `0.08 → 0.05`, search-open `0.10 → 0.07`, Spot-open `0.14 → 0.10`;
- affinity regularizer: `support + 0.75 → support + 1.0`;
- single-event affinity is bounded below the false-preference boundary;
- interaction-only Taste remains bounded until three independent Spots and sessions corroborate it;
- confidence estimates direction reliability as `0.57 + 0.43 × evidenceReliability`, while onboarding remains capped at `0.35`;
- stable half-life: `365 → 300` days;
- contextual projection weight: `0.50 → 0.65`.

Taste Space semantics are unchanged. Negative evidence remains explicit and separate. `not_there`, exposure and missing behavior remain non-preference events.

## 6. False Preferences Before / After

| Metric | Wave 3B | Wave 3B.1 | Gate |
|---|---:|---:|---|
| Overall False Preference Rate | 0.3911 | **0.0744** | ≤ 0.12 PASS |
| Mature False Preference Rate | 0.5294 | 0.1712 | diagnostic |
| One-off absolute affinity | 0.0748 | 0.0365 | ≤ 0.35 PASS |

The mandatory mass-same-category fixture remains bounded at affinity `0.0622`. A single strong outcome is capped below `0.15`; independently corroborated strong evidence can exceed it.

## 7. Confidence Before / After

| Metric | Wave 3B | Wave 3B.1 | Gate |
|---|---:|---:|---|
| ECE | 0.4494 | **0.1751** | ≤ 0.18 PASS |
| High-confidence direction accuracy | 1.0 | **1.0** | ≥ 0.82 PASS |

Incomplete History remains distinguishable: two strong events produce less confidence than eight independent events. Repeated same-Spot/same-session evidence remains less confident than independent evidence.

## 8. Contextual Taste Before / After

| Metric | Wave 3B | Wave 3B.1 | Gate |
|---|---:|---:|---|
| Context direction accuracy | 1.0 | **1.0** | ≥ 0.75 PASS |
| Context adaptation | 0.1495 | **0.2670** | ≥ 0.15 PASS |
| Global retention | 1.0 | **1.0** | ≥ 0.70 PASS |

The hierarchy remains Global + matching Place Type + matching Context. Sparse Context falls back to existing broader scopes. Explicit current Intent remains authoritative.

## 9. Drift Before / After

| Metric | Wave 3B | Wave 3B.1 | Gate |
|---|---:|---:|---|
| Adaptation events | 60 | **50** | ≤ 50 PASS |
| Final direction accuracy | 1.0 | **1.0** | ≥ 0.70 PASS |
| Final affinity accuracy | 0.8581 | **0.8819** | diagnostic |

## 10. Noise Resistance Before / After

| Metric | Wave 3B | Wave 3B.1 | Gate |
|---|---:|---:|---|
| Noise false-preference rate | 0.1852 | **0.0296** | ≤ 0.12 PASS |
| Noise maximum affinity | 0.3149 | 0.1976 | diagnostic |

Tourist Week, Festival Weekend, Business Trip and a temporary category phase all decay. Temporary morning interest falls from `0.5763` to `0.2604` after one simulated year.

## 11. Place-Type Non-Regression

Place-Type direction accuracy remains **1.0**. No Place-Type semantics, source mapping or hierarchy was changed.

## 12. Learning Curves / Sample Efficiency

Direction accuracy remains `0.53` at 5 events, `0.9033` at 10 and `1.0` from 25 events. Overall affinity accuracy changes from `0.8502` to `0.8298`, remaining above the `0.72` gate; mature affinity improves from `0.9432` to `0.9496`. Top-preference recall and rank correlation remain passing.

False Preference is `0` at 5 and 10 events, `0.0367` at 25, `0.0672` at 50, `0.1530` at 100 and `0.1893` at 200. The long-term rise is a remaining diagnostic weakness, although the Contract's full-cohort aggregate passes.

## 13. Wave-3B Gate Matrix

All 21 mandatory gates pass: diagnostic coverage, Direction, Affinity, Rank Correlation, Top Preference, False Preference, negative learning, false-negative control, Confidence, Context direction, Context adaptation, Global retention, Place Type, Intent authority, Drift, Noise, one-off bound, onboarding correction, consent, idempotency and exposure neutrality.

All 14 mandatory measurement arms are executable with 100% fail-closed coverage across three frozen seeds and all frozen cohorts.

## 14. Scientific Validity

- Contract, Ground Truth, thresholds, validation runtime and official runner hashes are unchanged.
- Historical Wave-3B baseline and freezes remain preserved.
- A treatment freeze binds the unchanged measurement identities to Taste Engine v1.1.
- Latent Truth remains evaluator-only and never enters the Engine.
- The official run began from event zero; no partial experimental result was reused.
- Deterministic replay produced the identical result hash.
- No final Decision Ranking or Product integration occurred.

Version identities:

- Taste Engine Freeze: `2a4a9e2f7353ad20d10073a00ccfb235778d64d5730f5e7771a4787f92a2116f`
- Validation Treatment Freeze: `ab2339de028fb5ed04999ea682d6a38d9434e75350993fb4963c518c8af15116`
- Official Result: `fe3d9968b716ef15f34940d6bf00be4c83a479a7b14f3a363b8cddbbcc550c1a`

## 15. Remaining Weaknesses

- Mature/long-term neutral concepts still accumulate: mature False Preference is `0.1712` although the frozen overall gate passes.
- Synthetic behavior cannot establish external validity with real consented users.
- Confidence is calibrated for direction correctness, not satisfaction probability or preference magnitude.
- Context combinations remain hierarchical projections, not independently learned profiles for every combination.

## 16. Tests / CI

Focused tests cover corroboration, weak-event repetition, independent evidence, negative learning, decay, Context, Intent authority, consent, idempotency, historical baseline preservation, new Engine/validation freezes and the sealed calibrated artifact. The following local acceptance is green:

- focused Taste tests: 29/29;
- full Decision Lab, deterministic replay and all 14 mandatory Wave-3B arms;
- D2, D2.1, D2.2, D3.1, D3-A, Wave-1 and D4.1 guards;
- Scientific Validity, frozen-measurement scope guard, Repository Sanity and canonical Secret Guard;
- fresh canonical database boot, Decision Product Eligibility, Wave-3A Consent/RLS and reviewed DB Lint;
- Web and Admin typecheck/build, Mobile lint (0 errors; 80 pre-existing warnings), and Shared typecheck.

The local `gitleaks` binary is unavailable; the repository's GitHub Security workflow remains authoritative for Gitleaks and Secret Guard. GitHub workflow results are recorded on the Draft PR and must be green before review completion.

## 17. Files / Migration

No migration. Changes are limited to the canonical Lab Taste Engine, versioned freeze artifacts, deterministic baseline, tests, package command and this report.

## 18. Git / Draft PR

Branch: `codex/decision-wave3b-1-taste-calibration`. Draft PR is created after complete local acceptance. No merge is part of Wave 3B.1.

## 19. Wave-3C Readiness

The unchanged Contract returns **READY**. This authorizes a separate Wave-3C integration phase; it does not integrate Taste into ranking in this change.

## 20. Production Statement

Production is unchanged. No Production connection, mutation, deployment, `db push`, migration repair, synthetic Production data or Product rollout occurred.

## Final Verdicts

- **WAVE 3B.1 TASTE LEARNING CALIBRATION — PASS**
- **USER TASTE LEARNING — STRONG**
- **FALSE PREFERENCE CONTROL — PASS**
- **CONFIDENCE CALIBRATION — PASS**
- **CONTEXTUAL TASTE — PASS**
- **PLACE-TYPE TASTE — PASS**
- **DRIFT & NOISE RESILIENCE — PASS**
- **SCIENTIFIC VALIDITY — PASS**
- **WAVE 3C PERSONALIZED DECISION INTEGRATION — READY**
- **PRODUCTION — UNCHANGED**
