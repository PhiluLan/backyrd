# BACKYRD DECISION NEXT GEN — WAVE 3C.1 CONTEXTUAL PERSONALIZED FIT

Status: **FAIL — NOT PROMOTED**

Date: 2026-08-17
Environment: isolated synthetic Decision Lab only; Production access `NONE`

## 1. Wave-3C Failure Decomposition

The immutable Wave-3C baseline showed mean Personalization Lift `-0.000884`, 14 wins / 91 ties / 21 losses, overall Harm `16.67%`, Power-User Harm `60%`, Contextual Differentiation FAIL, 102 Retrieval misses and 21 Personalization misses.

The root causes were in the Fit translation rather than the frozen Taste Engine:

- broad historical Taste dimensions were active even when irrelevant to the current request;
- Global, Place-Type and Context evidence were combined too uniformly;
- negative Taste could not be inspected as a signed candidate-level contribution;
- current Context mood evidence did not select the Taste dimensions relevant to the current moment;
- several weak matches could influence a candidate more than one specific, confident match.

## 2. Power-User Harm Root Cause

The v1 Fit budget grew with maturity and mean confidence while broad observed concepts remained eligible for matching. More History therefore increased both useful and incidental match opportunities. The result was strongest harm in Mature and Power cohorts even though the underlying Taste Map was calibrated.

Wave 3C.1 bounds maturity more conservatively, averages rather than accumulates matched dimensions, preserves negative direction, and activates History only through current Intent, current Context and Place Type. Power Harm falls from `60% → 40%`; Mature Harm remains `45.45%`. The cohort problem is reduced but not resolved.

## 3. Personalized-Fit Architecture

`backyrd-personalized-fit-v1.2` remains a Lab-only layer after the unchanged eligible Candidate path:

`eligible candidates → current relevance dimensions → hierarchical Taste evidence → confidence-aware bounded fit → Top 10`

Runtime inputs remain Structured Intent, Current Context, frozen User Taste Map, Place-Type/Contextual Taste, Confidence and observed Spot Intelligence. Latent Truth, evaluator Utility, Golden labels and future outcomes remain prohibited.

## 4. Taste Hierarchy

For a candidate concept, matching Context evidence is the most specific scope. Its authority grows with calibrated Confidence; sparse Context evidence falls back to matching Place-Type evidence and then Global evidence. The scopes are not added independently, preventing double counting. UNKNOWN remains neutral.

## 5. Context Relevance

History can influence Fit only when a candidate concept is relevant to:

- explicit current Intent;
- observed current Context mood, audience or time;
- the candidate's Place Type.

Other long-term concepts remain known but inactive for that Decision. Observed Context moods are mapped through the same canonical Taste concepts; no evaluator-only Context is consumed.

## 6. Confidence Integration

Personal influence is bounded to a maximum `0.20` and scales with both maturity and mean calibrated Global confidence. Cold/UNKNOWN states receive zero personal weight. Candidate Fit averages signed affinity × confidence across relevant dimensions, so many weak dimensions cannot accumulate without bound.

## 7. Spot ↔ Taste Alignment

Spot concepts are centrally derived from approved observed Spot Intelligence: Place Type, price, moods and narrowly supported description evidence. Missing Spot evidence remains UNKNOWN. User and Spot concepts share the Wave-3A Taste Space; no hidden ad-hoc final score or latent field is introduced.

## 8. Personalization Budget

Personalization replaces part of the base Candidate-order contribution instead of adding an unbounded boost. Explicit Intent and Current Context retain fixed authority. A weak candidate cannot become eligible through Taste, and Taste cannot alter Product, Distribution or User Hard Constraints.

## 9. Tested / Rejected Hypotheses

### Candidate A — rejected

Hierarchical signed Taste with a broad candidate-concept relevance set reduced maximum cohort Harm to `40%`, but mean Lift stayed negative at `-0.001017`. Context Utility was approximately neutral, different-user divergence remained zero and confidence correlation remained negative.

### Candidate B — final measured candidate

Restricting active History to Intent, current Context and Place Type changed mean Lift to positive `+0.000859`, improved Precision, reduced Personalization misses and preserved all authority boundaries. It was frozen before the complete official rerun. The result still misses mandatory Lift, Context, different-user, Confidence and Mature-benefit gates.

No further tuning occurred after the official Locked-Holdout result became visible.

## 10. Personalization Lift Before / After

| Metric | Wave 3C | Wave 3C.1 |
|---|---:|---:|
| Mean ACTUAL − NEUTRAL Lift | -0.000884 | **+0.000859** |
| Bootstrap interval | [-0.003980, 0.002389] | **[-0.002396, 0.004043]** |
| Wins / Ties / Losses | 14 / 91 / 21 | **16 / 91 / 19** |
| ACTUAL Top-10 Utility | 0.398179 | 0.394889 |
| NEUTRAL Top-10 Utility | 0.399063 | 0.394030 |
| ACTUAL Precision@10 | 0.345172 | **0.348309** |
| NEUTRAL Precision@10 | 0.348347 | 0.345134 |

The comparison baseline and candidate path produce different absolute utility levels after current-context relevance changes; the paired ACTUAL − NEUTRAL treatment remains the authoritative causal metric. The frozen `+0.005` Lift floor is not met.

## 11. Personalization Harm Before / After

| Metric | Wave 3C | Wave 3C.1 | Gate |
|---|---:|---:|---|
| Overall Harm | 16.67% | **15.08%** | PASS |
| Maximum cohort Harm | 60% | **45.45%** | PASS |
| Mature Harm | 31.82% | **45.45%** | diagnostic regression |
| Power Harm | 60% | **40%** | improvement |
| Opposing-History Harm | 16.67% | **22.22%** | PASS |

The formal Harm gate now passes, but Mature benefit remains negative and therefore blocks promotion.

## 12. Contextual Differentiation Before / After

| Metric | Wave 3C | Wave 3C.1 | Gate |
|---|---:|---:|---|
| Ranking differentiation | 0.1212 | **0.1549** | ≥ 0.20 FAIL |
| Context Utility gain | -0.007823 | **-0.006998** | ≥ 0.005 FAIL |

Family/Sunday is approximately neutral; Friends/Friday is neutral; Date/Evening remains harmful at `-0.021003`. Context-aware activation is observable but not reliably beneficial.

## 13. Same User / Different Context

The three controlled Contexts create different projections and a higher ranking divergence than Wave 3C, but do not cross the frozen quality gate. Different results alone are not treated as success.

## 14. Same Request / Different Users

False Personalization improves from `33.33% → 0%`, but Top-10 membership divergence remains `0`, below the frozen `0.20` requirement. The current eligible Candidate pools and bounded Fit mostly change order inside an unchanged Top-10 set.

## 15. Current Intent Authority

Current Intent Robustness remains `1.0`; History Override Rate remains `0` across all 18 conflict cases. Explicit current Intent is never redefined by ACTUAL or OPPOSING History.

## 16. Personalization vs Retrieval Misses

- Retrieval misses: `102/126` (unchanged boundary)
- Personalization misses: `21 → 19`

Retrieval remains the dominant ceiling. The 19 paired ACTUAL losses prove a separate unresolved Fit limitation within the available Candidate pool.

## 17. Wave-3C Gate Matrix

PASS:

- coverage;
- Personalization Harm;
- Opposing History;
- Current Intent Authority;
- Cold Start;
- Hard Constraints;
- Product Eligibility;
- Distribution Eligibility.

FAIL:

- Personalization Lift;
- Contextual Decision;
- Different Users;
- Confidence-aware Personalization;
- Mature Benefit.

No composite score compensates a failed mandatory gate.

## 18. Scientific Validity

Scientific Validity remains PASS:

- Wave-3C Validation Contract hash remains `371389933d059646339430f46eb2ac0a718891792f8adb355e6bc70581b2550f`;
- Taste Engine freeze remains `2a4a9e2f7353ad20d10073a00ccfb235778d64d5730f5e7771a4787f92a2116f`;
- D2.2 and Taste treatment freezes remain unchanged;
- Retrieval, Ground Truth, scenarios and thresholds are unchanged;
- all three arms use the same Candidate universe;
- Latent Truth remains evaluator-only;
- the official run restarted from Seed 1 after the Measurement-Integrity repair;
- no tuning occurred after Locked Holdout was observed.

Final Fit source hash: `6eebe086999b4f0ddccf0896191a82b5b199537c88109b3828a2747c5f9e87b1`

Final Wave-3C freeze hash: `2883837fef33a607e9b36cd4a566b0e658e917c943627ae8c50cd2cc7b1576f0`
Official result hash: `27b502363a8250aae46c5b12a420b3dca78c9bf2dd1ac35e5808b24ab2a34dab`

### WAVE3C1-MI-001 — resolved

The isolated local API could lag the host clock by more than the existing 30-second synthetic JWT allowance after a database reset. Seed 2 rejected a Lab JWT with `PGRST303: JWT issued at future`. The authorized repair changes only synthetic Lab authentication: JWT `iat` is backdated five minutes while subject, role and one-hour lifetime remain unchanged. The canonical adapter source is now explicitly covered by the Wave-3C freeze. The complete run then passed 42/42 scenarios on each of all three seeds.

## 19. Tests / CI

Focused tests cover Intent authority, UNKNOWN neutrality, signed negative Taste, observed Context mood activation, Candidate preservation, Product/Distribution fail-closed behavior, scientific input boundaries and synthetic JWT clock skew. The isolated official run completed 126 Golden Scenarios and 378 treatment executions with full mandatory-arm coverage.

Repository-wide CI evidence is recorded separately on the Draft PR; no failing check may be weakened.

## 20. Git / Draft PR

Branch: `codex/decision-wave3c-1-contextual-fit`. The Draft PR is created only after local acceptance. No merge is part of Wave 3C.1.

## 21. Wave-4 Readiness

Wave 4 remains NOT READY. Personalized Fit has moved from negative to slightly positive causal lift and now passes Harm, but it still fails five mandatory gates. Building final Utility/Fusion on this unpromoted treatment would hide rather than resolve the remaining integration problem.

## 22. Production Statement

Production is unchanged. No Production connection, mutation, deployment, `db push`, migration repair, synthetic Production data or Product rollout occurred.

## Final Verdicts

- **WAVE 3C.1 CONTEXTUAL PERSONALIZED FIT — FAIL**
- **PERSONALIZATION LIFT — FAIL**
- **PERSONALIZATION HARM — PASS**
- **CONTEXTUAL DECISION INTELLIGENCE — FAIL**
- **CURRENT INTENT AUTHORITY — PASS**
- **CONFIDENCE-AWARE PERSONALIZATION — FAIL**
- **USER TASTE ENGINE INTEGRATION — NOT PROMOTED**
- **SCIENTIFIC VALIDITY — PASS**
- **WAVE 4 UTILITY & FUSION — NOT READY**
- **PRODUCTION — UNCHANGED**
