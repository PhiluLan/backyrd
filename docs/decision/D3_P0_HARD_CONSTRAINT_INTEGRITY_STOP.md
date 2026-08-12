# D3 P0 Hard Constraint Integrity Stop

## Finding ID

`D3-F-001 — Public Decision treats declared hard user constraints as soft ranking signals`

## Status

**CONFIRMED P0 — D3 stopped; no baseline certified**

Detected during the first official D3 world after the D2.1/v1.1 preflight passed. This document records the mandatory stop. It is not a quality optimization or a fix proposal.

## Preflight evidence

The run used only the re-certified D2.1 freeze:

- Freeze Manifest: `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf`
- Constitution: `cf0df61e94db56a480a1334b701fe1725d563c989225bdfd5158ba16e0a5fca1`
- Scenario Registry: `4f3e4294c385e29c35ea7911557bfc5bc014115b28cb6f58a1a856706c971bef`
- Evaluator: `c60fdb75dc6e7550bc106dfbc1fd648e4f39227eb6901ebc2775ef62a9feae76`
- Hard-Gate Registry: `2925d28d4eee37580fe3b6ddc6cb9c6adeb772c033122b63d749bab49f1230dc`
- Framework Acceptance: `a1280e3f9314d04f673c8590653506d3954eb005d127e5c3ebfcbaad8be3f3ba`
- V13 Source: `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba`
- Hard-Gate coverage: 9/9
- Scientific Validity: PASS
- Engine mutation: NONE
- Run-plan hash: `592a90a6a248631cb179756d0e79a2da6f2cac6be5bc2c25cba23519042cd808`

## Environment and execution path

- disposable local Supabase stack;
- synthetic Decision Lab world only;
- 500 synthetic users, 300 synthetic Spots, 3,600 reviews, 30,000 interactions;
- canonical V12 SQL and current Product/Distribution SQL;
- canonical V13 Edge source loaded with behaviour-neutral Flight Recorder instrumentation;
- semantic query embeddings: FAST_SIMULATION, therefore semantic quality is not certified;
- no Production read, write, deployment or linked project;
- first planned seed only: `backyrd-d1-basel-v1-2026`;
- World hash: `38e55874545898803cb6ab1748d9c43929f9d61dabe0ccb8d743dbe3c7a1a720`.

The P0 is independent of semantic-quality claims: affected final results include V12-only and overlap candidates, and the failure is direct deterministic candidate-attribute evidence.

## Expected behavior

For scenarios whose frozen contract declares a hard category, category exclusion or open-now requirement, every public returned Spot must satisfy that requirement across the full returned result set. Soft score quality cannot compensate for a violation.

## Actual behavior

The first world produced 42 Decisions. Nine failed at least one hard gate:

| Gate | Applicable scenarios | Failed scenarios | Failure rate |
|---|---:|---:|---:|
| Hard Category | 5 | 5 | 100% |
| Category Exclusion / Negation | 3 | 3 | 100% |
| Open Now | 2 | 1 | 50% |
| Any hard gate | 42 | 9 | 21.43% |

Split distribution:

| Split | Hard failures |
|---|---:|
| Development | 3 |
| Regression | 3 |
| Locked Holdout | 3 |

Examples:

- Regression negation scenario `f09aa665-859c-4b8a-b5c7-636802a37e4e` requested `keine Bar`; a Bar was returned at rank 1 and another at rank 10.
- Development negation scenario `324b52ef-d387-466d-ba59-f31ff8d4f2bc` returned a Bar at rank 3.
- Locked-Holdout negation scenario `b2892da6-9fcb-4da9-8448-1857456f0c53` returned a Bar at rank 1 and another at rank 10.
- Regression open-now scenario `dd51efcf-134f-4d6c-b636-862969324e44` returned three Spots that are closed in the declared morning time bucket, including one at rank 3.
- Every one of the five hard-category scenarios returned at least one wrong-category Spot. In the Locked-Holdout category-intent case `56c8e0de-c174-4aed-b892-9efefa86729e`, all ten returned Spots violated the declared hard category.

All violating candidates remained Product-approved and Distribution-eligible. No D0-F-001 regression occurred in the measured world.

## Root cause

Current V13 intent parsing recognizes explicit categories and exclusions, but `fuseCandidates()` applies them through `intent_boost`, `category_fit_component` and `category_mismatch_penalty`. These are bounded score terms, not a pre-ranking eligibility boundary. The same architectural pattern leaves declared open-now truth without a canonical V13 full-result hard filter.

The D2.1 evaluator is not the cause: it correctly resolved immutable candidate attributes from the synthetic World and failed the relevant gates. This is precisely the false-PASS class that D2.1 was built to prevent.

## User impact

A public Decision may recommend a place that directly contradicts an explicit user constraint—for example a Bar after “keine Bar,” a wrong category under strict guided intent, or a closed Spot under an open-now requirement. Because violations can appear at rank 1, they can determine the user's visible Decision rather than merely degrade lower-ranked alternatives.

## Stop disposition

- D3 heavy run stopped immediately after classification of seed 1.
- Seeds 2 and 3 were not evaluated.
- No aggregate, split, holdout, quality, Closed-Beta or D0-F-002 baseline is certified.
- The diagnostic run must not be used as an official V13 baseline.
- V13, Constitution, Scenario Registry, Evaluator and Ground Truth were not changed.
- No fix was implemented.

## Recommended next action

Create a dedicated Product/Decision integrity repair reviewed as a P0. Preserve hard-constraint semantics at a canonical server-side eligibility boundary and add permanent exact-category, negation/exclusion and open-now full-result regressions. Only after that repair is merged and re-certified may D3 restart from seed 1 against the same D2.1/v1.1 freeze or an explicitly versioned successor if the Constitution itself changes.

## Verdict

**D3 V13 BASELINE MEASUREMENT — FAIL (STOPPED; NO BASELINE CERTIFIED)**

**V13 DECISION QUALITY — NOT EVALUATED**

**V13 FOR BASEL CLOSED BETA — NOT READY (Decision integrity blocker)**

**D4 DECISION IMPROVEMENT STRATEGY — NOT READY**
