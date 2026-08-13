# D4 — Backyrd Decision Improvement Program

## 1. Program objective

Move from V13 to the structured hybrid architecture in independently measurable waves. Each wave compares one declared candidate Engine against the frozen D3-A V13 baseline. No wave may weaken Product Eligibility, Distribution Eligibility, scientific validity or hard correctness to gain a soft score.

The program is a build sequence, not authorization to implement or deploy. Every implementation wave requires its own reviewed scope, version identity and PR.

## 2. Architecture option decision

| Option | Quality ceiling | Complexity/risk | Decision |
|---|---|---|---|
| Patch deterministic V13 | low-to-moderate; fast P0 relief | low initial, high accumulated brittleness | use only as migration adapter, not target |
| Structured hybrid retrieval + calibrated utility | high, incremental and explainable | moderate | **selected target** |
| LLM/end-to-end learned Decision | unknown without real labels; potentially high | high cost, latency, opacity and data risk | research later, not target |

The selected architecture directly addresses all measured layers without requiring real outcome volume on day one.

## 3. Wave plan

### Wave 1 — Decision Intent and Constraint Integrity

| Field | Contract |
|---|---|
| Objective | Make explicit hard User requirements non-compensable while preserving current Product/Distribution boundaries |
| Problems | D3-F-001; D0-F-006; part of weak counterfactual response |
| Scope | `DecisionIntent v1`, evidence/span/confidence, Constraint Compiler, canonical User Eligibility ledger, hard category/exclusion/open-now enforcement, Flight Recorder extensions |
| Code areas | new shared Decision contracts; server/Edge orchestration adapter; canonical availability read path; Decision Lab adapters/tests |
| Data contracts | Intent, constraint evidence, availability evidence/status, eligibility reason |
| Dependencies | current D2.1 gates and existing Product/Distribution RPCs |
| Tests | all 42×3 scenarios, adversarial negation/category/open-now, ambiguity/missing evidence, exact-name, cross-surface contract, fail-closed and no-latent-leak tests |
| Promotion gate | 100% all frozen hard gates across all seeds/splits; zero Product/Distribution regression; no soft-metric promotion required but diagnostics remain valid |
| Risk | over-classifying soft language as hard; stale opening evidence; candidate starvation |
| Rollback | server-side Engine/constraint version selector returns to unchanged V13; retain trace-only shadow |
| Definition of Done | D3-F-001 fixtures pass, every hard decision has evidence, unknown is never PASS, no Product Engine rollout without separate approval |

This is the first implementation wave because it removes the only open P0, has a precise frozen evaluator and protects users before any ranking improvement.

### Wave 2 — Multi-Source Candidate Recall and Spot Intelligence Gate

| Field | Contract |
|---|---|
| Objective | Raise the ceiling by finding high-utility eligible Spots and separating source/data failures |
| Problems | D3-F-002, V11/V12 limitations, exact-name/category weakness, data insufficiency, D3 coverage gap |
| Scope | structured/category + lexical retrieval, source-evidence union, V12 and semantic shadow sources, source calibration, recall/sufficiency telemetry, Basel data report |
| Dependencies | Wave 1 eligible universe; Full-Fidelity semantic baseline before semantic replacement |
| Tests | Recall@20/50, marginal recall, exact-name, sparse/free text, source ablations, missing/stale documents, candidate-limit saturation, latency |
| Promotion gate | frozen Recall@20 floor `≥0.65`; statistically robust recall/regret gain on multi-seed and holdout; zero hard leakage; bounded latency/cost |
| Risk | larger pools raise latency and ranking burden; duplicate evidence; data gaps masked as source weakness |
| Rollback | disable new sources independently; preserve V12/Semantic adapters |
| Definition of Done | every candidate has a canonical envelope; retrieval failure rate materially reduced; data versus source attribution available |

### Wave 3 — Current Context and Confidence-Aware Personalization

| Field | Contract |
|---|---|
| Objective | Make the same request respond to the moment and add safe personal lift for informative histories |
| Problems | D3-F-003, D3-F-004, Taste-vs-Intent conflict, negative preference and drift |
| Scope | `DecisionContext v1`, `UserPreferenceState v1`, evidence confidence/recency/scope, authority contract, negative preferences, memory role separation |
| Dependencies | stable Intent and candidate union; D2.2 treatments |
| Tests | counterfactual isolation/direction, ACTUAL/NEUTRAL/OPPOSING by maturity, cold-start parity, stale/opposing history, negative evidence and decay |
| Promotion gate | context directional rate at least frozen `0.60`; Mature median lift `≥0`; no unacceptable cohort harm under pre-registered paired review; cold quality non-regression |
| Risk | history overwhelms request, sparse-signal certainty, privacy/consent leakage |
| Rollback | per-component version flags; neutral/cold utility path remains available |
| Definition of Done | explicit Intent has authority, every preference has provenance/confidence, treatment effects are attributable |

### Wave 4 — Calibrated Utility, Fusion and Slate

| Field | Contract |
|---|---|
| Objective | Order valid recalled candidates using calibrated evidence and produce useful diverse slates |
| Problems | V13 saturation/mixed fusion, D0-F-002, conditional ranking loss, repetition |
| Scope | per-source calibrators, deterministic hybrid utility, candidate evidence vector, conditional reranking, bounded diversity/exploration, unified Distribution envelope |
| Dependencies | Waves 1–3; source and feature version stability |
| Tests | frozen-candidate conditional ranking, NDCG/Precision/regret, calibration, semantic-only Distribution fixture, source ablations, gaming and tie determinism |
| Promotion gate | NDCG@10 `≥0.55`, Precision@10 `≥0.35` and statistically supported improvement over V13; locked holdout non-regression; all hard gates 100% |
| Risk | synthetic utility overfit, source-scale drift, exploration harms Top-K |
| Rollback | utility manifest switch; individual source/calibrator disablement |
| Definition of Done | no raw incomparable source-score addition; D0-F-002 impossible by candidate schema; utility components reproducible |

### Wave 5 — Remix, Confidence, Explanation and Outcome Foundation

| Field | Contract |
|---|---|
| Objective | Make alternatives genuinely new, uncertainty honest, reasons causal and future learning measurable |
| Problems | D3-F-005, D3-F-006, fallback unknown, incomplete outcome truth |
| Scope | canonical Remix exclusions, safe fallback ladder, calibrated confidence, `ExplanationEvidence v1`, end-to-end Decision/outcome identity, exposure/propensity logging |
| Dependencies | stable candidate evidence and utility; Product consent/legal review for learning |
| Tests | zero Remix repeats, scarcity/starvation, utility retention, fallback hard eligibility, claim alignment, missing evidence, outcome joins and position-bias fields |
| Promotion gate | Explanation support `≥0.95`; fallback eligible `1.0` when exposed; zero excluded Remix IDs; pre-registered novelty/utility bounds; no shadow learning contamination |
| Risk | UX complexity, conservative no-result, telemetry privacy, premature outcome inference |
| Rollback | deterministic explanation and strict primary result; disable learning consumption independently |
| Definition of Done | displayed deck fully reconstructable; explanations derive only from evidence; outcomes are attributable but do not train until separately promoted |

## 4. D3 failure dispositions

| Finding/class | Disposition | Wave |
|---|---|---:|
| D3-F-001 hard constraints | eliminate via User Eligibility, not weights | 1 |
| D3-F-002 retrieval | multi-source recall + data attribution | 2 |
| D3-F-003 current Intent | structured Intent/Context and causal tests | 1, 3 |
| D3-F-004 personalization | confidence/scoped preference model; D2.2 gates | 3 |
| D3-F-005 Remix | canonical cross-source exclusions | 5 |
| D3-F-006 explanations | evidence-backed claim contract | 5 |
| semantic/fallback coverage gap | Full-Fidelity and targeted exposure before verdict | pre-Wave 2 / Wave 5 |
| D0-F-002 | regression immediately; obsoleted by canonical candidate envelope | 4 |
| persistence/outcome gaps | single Decision identity and outcome linkage | 5 |

D0-F-002 remains protected but is not prioritized ahead of the exposed P0 and 118 retrieval records. A narrow production fix would require separate approval if exposure risk changes before Wave 4.

## 5. Basel data requirements

### Required for eligibility

- approved Product status and canonical Distribution state;
- canonical category and city/location;
- reliable opening-hours evidence for open-at use, including freshness/error state;
- any future hard attribute only after evidence completeness is launch-gated.

### Required for good retrieval

- canonical name/aliases, category, effective description;
- structured moods/activities/occasion evidence;
- versioned lexical and semantic documents with source hashes;
- complete coordinates for location-scoped retrieval.

### Required for ranking/context

- price evidence, energy/noise, audience/occasion fit, indoor/outdoor and distinctiveness;
- confidence, source and freshness on derived values;
- sufficient distribution across Basel categories/contexts, not only aggregate coverage.

### Required for personalization/explanation

- stable shared feature taxonomy with observed User evidence;
- human-readable source evidence for every explanation claim;
- no field whose primary source is payment or unverified Owner assertion.

Before Closed Beta, publish coverage by category and scenario family, not only overall percentage. Missing required hard evidence must have an explicit safe behavior.

## 6. Full-Fidelity semantic work package

The benchmark defined in `D4_NEXT_GENERATION_ARCHITECTURE.md` is a pre-Wave-2 decision gate. Its sequence is:

1. dry-run corpus/query token accounting and approve a hard USD budget;
2. freeze then-current canonical embedding model/dimensions and content/query hashes;
3. run all 126 Golden Decisions' unique query/document embeddings through a dedicated Lab credential and cache;
4. compare `FAST_SIMULATION` and Full-Fidelity source recall, marginal union recall, raw/saturated similarities and end-to-end impact;
5. only then run predeclared document, query representation and candidate-limit arms;
6. decide KEEP/HARDEN/REPLACE for Semantic in a reviewed ADR.

No Production data or credential is required. Semantic quality claims remain conditional until this package passes.

## 7. Cold and Mature strategy

Cold Start is the primary quality baseline: current Intent, Context, location and Spot evidence must satisfy all hard gates and provide strong relevance without history. Onboarding may add explicit evidence but cannot be required.

Mature quality equals Cold quality plus beneficial contextual personal evidence. Promotion requires the D2.2 same-person treatments. ACTUAL must improve or match NEUTRAL at the frozen cohort floor; OPPOSING must not overpower explicit current Intent. Cohort harm is reviewed even if aggregate lift is positive.

## 8. Feedback-loop protection

- persist every exposure, rank and selection propensity;
- distinguish recommendation, interaction, visit and satisfaction;
- correct or stratify learning/evaluation for position and exposure;
- reserve bounded eligible exploration with explicit propensity;
- keep popularity separate from User utility;
- never treat non-click as dislike without exposure/context evidence;
- evaluate long-tail, new-Spot and cohort exposure distributions;
- prohibit shadow/non-exposed candidates from learning.

## 9. Real-world calibration plan

After offline/shadow gates, a small consented Basel calibration cohort receives only a gate-qualified Engine. Collect Decision-linked Spot opens, saves, navigation/reservation intent, visit signal where legitimately available, explicit “War's ein Treffer?” feedback, Moments/reviews and repeat Decision. Do not label engagement as satisfaction.

Calibrate predeclared relationships:

| Synthetic metric | Real hypothesis |
|---|---|
| Top-3 latent utility / NDCG | explicit Decision success and qualified next action |
| Candidate recall/regret | “nothing fits”, rapid Remix or abandonment |
| ACTUAL–NEUTRAL lift | returning-user success difference |
| confidence | empirical success rate and clarification/no-result behavior |
| Remix novelty/utility | alternative acceptance without dissatisfaction |
| explanation alignment | user trust/comprehension, not click-through alone |

Use staged sample-size and privacy review. Real calibration can adjust a future evaluation version prospectively; it cannot rewrite the frozen D3 baseline.

## 10. Basel Closed-Beta gate

Closed Beta requires all `D4_PROMOTION_GATES.md` hard/integrity gates, frozen soft floors, multi-seed and locked-holdout acceptance, Full-Fidelity semantic evidence for the promoted path, shadow latency/reliability/cost within a predeclared budget, complete rollback, and no open P0. It additionally requires minimum Basel Spot-data coverage by scenario family, Decision-linked outcome telemetry that does not contaminate learning, and human review of blinded cases/explanations.

“VNext implemented” is not a launch criterion.

## 11. Governance and review cadence

For each wave:

1. freeze hypothesis, changed components and expected failure classes;
2. build only the scoped version behind an internal selector;
3. run Development while preserving Regression and Locked Holdout rules;
4. run all frozen gates/metrics across at least the D3 three seeds;
5. compare paired results to V13 and previous promoted candidate;
6. human-review blinded cases and any cohort/local regressions;
7. record decision: reject, revise, shadow or promote;
8. retain immediate rollback and immutable manifests.

Composite scores never override hard failures or conceal segment harm.

## 12. Risks and remaining limitations

- D3 synthetic utility may not predict real delight; calibration is mandatory.
- Full-Fidelity Semantic could materially change the apparent retrieval opportunity map.
- opening-hours evidence and Basel data coverage may block Wave 1/2 despite correct code.
- dual-running V13/VNext increases operational complexity; sunset criteria are required.
- learned personalization is premature until outcome and exposure evidence are adequate.
- current locked holdout is process-isolated rather than genuinely secret.

## 13. Program readiness

The five waves are sequential, measurable and reversible. Wave 1 has a confirmed P0, an executable evaluator and minimal dependency on unproven semantic quality.

**DECISION IMPROVEMENT PROGRAM — READY**

**FIRST IMPLEMENTATION WAVE — READY**
