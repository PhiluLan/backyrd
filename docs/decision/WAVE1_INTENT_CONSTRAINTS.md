# Backyrd Decision Next-Gen — Wave 1: Structured Intent & Hard Constraints

## 1. Executive Summary

Wave 1 introduces a candidate-only Decision Engine boundary that distinguishes hard requirements, explicit exclusions and soft category preferences before ranking. It preserves the frozen V13 implementation and reuses its Product and Distribution eligibility paths. The new User Hard-Constraint boundary is applied to the complete distributed candidate union before score calculation, sorting or diversity.

The controlled three-seed comparison executed all 42 frozen Golden Scenarios per seed (`126` Decisions). D3-F-001 fell from `21/126` failing Decisions on V13 to `0/126` on Wave 1. Product and Distribution eligibility remained `126/126` correct. Wave 1 is not connected to Mobile or Production and is not deployed.

## 2. Identities and scope

| Artifact | Identity |
|---|---|
| Intent Contract | `decision-intent-v1` |
| User eligibility | `user-hard-constraint-eligibility-v1` |
| Candidate Engine | `decision-wave1-intent-constraints-v1` |
| Candidate source SHA-256 | `5d65a4db6e8a8baf6bce872d967d5350e55ec5f4470191ff4490540dac0b20b8` |
| Parent V13 source | `a3618a4254a884a53b45cf185c630444239d3da8e04f78d86ece6a65cda507ba` |
| D2.1 freeze | `6488f3031bb63df482dbff2b2e2c011c1a82781862e1fe532ffdd1c968fffacf` |
| D2.2 freeze | `9b4691de75bead63ad798700ada0b818ba6d29ad92d24804dcb2d3eeecfc1053` |
| Comparison result | `974f06207941b1b47fcc511fe574e416dd9f2fce5ec40f28af5c4f572235465a` |

The candidate is additive. V11, V12, V13, semantic retrieval, personalization, fusion weights, diversity and Product/Distribution rules are unchanged. The only Product-Engine source added is `decision-wave1`; no client invokes it.

## 3. Structured Intent Contract

`StructuredDecisionIntentV1` contains three separate groups:

- `hardConstraints.requiredPlaceTypes`: guided strict category or a supported explicit phrase such as `nur ein Café`;
- `hardConstraints.excludedPlaceTypes`: guided exclusions and supported explicit negations such as `keine Bar`;
- `hardConstraints.openNow`: explicit guided `openNow`/`requireOpenNow` or supported `jetzt geöffnet` language;
- `softPreferences.placeTypes`: non-strict guided preferences and explicit preference phrases such as `am liebsten ein Café`;
- `extraction`: parser version, confidence, unknowns and field-level evidence with `guided` or `free_text` provenance.

Wave 1 uses bounded deterministic extraction for the high-confidence cases required by the frozen Wave-1 scenarios. It does not introduce an LLM. Unrecognized language does not become a hard constraint. The existing raw query remains available to unchanged lexical/semantic behavior.

## 4. Hard versus soft rules

| Input | Structured meaning | Candidate effect |
|---|---|---|
| `nur ein Café` | required category `cafe` | all non-cafés ineligible |
| strict guided Café | required category `cafe` | all non-cafés ineligible |
| `keine Bar` | excluded category `bar` | bars ineligible |
| `jetzt geöffnet` | `openNow=true` | closed or unknown ineligible |
| `am liebsten ein Café` | soft category `cafe` | other categories remain eligible |
| ambiguous/unrecognized phrase | no invented hard constraint | unchanged ranking path |

If contradictory required and excluded categories are supplied, exclusions take precedence during compilation; an excluded category is never retained as a requirement or soft preference.

## 5. Eligibility architecture

The effective candidate flow is:

`Product Eligibility → Distribution Eligibility → fallback under the same two boundaries → canonical candidate union → User Hard-Constraint Eligibility → scoring/fusion → diversity → result`

The User boundary operates on candidate identity, canonical category/place type and opening evidence. A candidate is removed, not penalized. Removed candidates never enter score calculation, sorting or diversity, so semantic similarity, Taste, source bonus, fusion and memory cannot compensate for a violation. Fallback candidates pass the same boundary and cannot reintroduce an excluded Spot.

## 6. Opening-hours semantics

Wave 1 resolves the Spot's canonical `spot_hours` at a captured `decisionAt`. It supports normal intervals and cross-midnight intervals. The comparison uses a fixed UTC instant per frozen time bucket for reproducibility.

Under the D2.1/D4 hard-gate rule, an explicit open-now requirement has fail-closed semantics:

- clearly open: eligible;
- clearly closed: ineligible;
- missing or indeterminate hours: ineligible with `evidenceStatus=UNKNOWN`.

Unknown is recorded and is never treated as PASS. Without an open-now requirement, opening evidence does not create a new hard filter.

## 7. Observability / Flight Recorder

The candidate response and Lab Flight Recorder include:

- the complete structured Intent;
- hard and soft fields plus evidence provenance;
- candidate counts before and after User eligibility;
- every excluded Spot ID, violated constraint, expected/observed value and known/unknown evidence state;
- aggregate excluded and unknown counts.

Across the comparison, all `126` Decisions emitted eligibility reports. The mean union size moved from `36.405` before the boundary to `32.294` afterward; `518` candidate occurrences were excluded. The frozen run had zero unknown opening-evidence exclusions.

## 8. D3-F-001 regression

| Gate | V13 failing Decisions | Wave 1 applicable checks | Wave 1 failures |
|---|---:|---:|---:|
| Hard category | `13/18` | `18` | `0` |
| Category exclusion | `3/9` | `9` | `0` |
| Open now | `5/6` | `6` | `0` |
| Any Wave-1 D3-F-001 violation | `21/126` | `126` Decisions | `0` |

Adversarial unit fixtures also give violating candidates extreme scores. They remain absent, proving this is an eligibility boundary rather than a score hack.

## 9. Product and Distribution non-regression

| Gate | Applicable Decisions | Fail | Not evaluated |
|---|---:|---:|---:|
| Product Eligibility | `126` | `0` | `0` |
| Distribution Eligibility | `126` | `0` | `0` |

The existing server/database boundaries are reused rather than duplicated. Wave 1 adds no grants, RLS policies, schema changes or migration.

## 10. Frozen V13 versus Wave 1

The comparison used identical D2 worlds, three seeds, 42 scenarios per seed, evaluator, Ground Truth and treatment identities. The semantic mode was `FAST_SIMULATION`; therefore the run certifies mechanics and structural comparison, not real semantic quality.

| Metric | Frozen V13 | Wave 1 |
|---|---:|---:|
| Hard-violation rate | `0.1667` | `0.0000` |
| NDCG@10 | `0.5274` | `0.5589` |
| Recall@10 | `0.0601` | `0.0710` |
| Precision@10 | `0.3190` | `0.3274` |
| No-result rate | `0.0000` | `0.0079` |

The soft-quality values are descriptive, not a claim that semantic quality improved. Wave 1 did not alter retrieval or ranking; metric changes are a consequence of removing invalid candidates.

## 11. Candidate starvation and safe fallback

Wave 1 produced one empty result (`1/126`, `0.79%`) and three results below Top 10 (`3/126`, `2.38%`). It did not meet the predeclared harmful-collapse condition (Recall below half of V13 or No-Result above 25%). Empty valid output is preferable to restoring a hard-invalid candidate.

This is a known availability consequence, not permission to relax constraints. Wave 2 must improve eligible retrieval while retaining this boundary.

## 12. Scientific validity and security

- D1/D2/D2.1/D2.2 preflight: PASS.
- Same worlds, seeds, scenarios and Ground Truth: preserved.
- Latent truth: not added to Engine requests. Synthetic opening truth is materialized only as ordinary observed `spot_hours`; the Engine sees no latent fields.
- Parent V13 source hash: unchanged.
- Production access: none.
- No service-role/client workaround, new grant, RLS change or migration.
- No Mobile switch, deployment, `db push` or migration repair.

## 13. Findings and remaining limits

No new P0 was found.

- Wave 1 recognizes a deliberately bounded, high-confidence phrase set. Unsupported or ambiguous free text remains non-hard rather than risking false exclusions.
- Opening-hours correctness is limited by the current canonical data model and evidence freshness. Unknown is safely exposed and fails closed for a hard open-now request.
- The comparison is structurally valid under `FAST_SIMULATION`; it cannot certify real embedding relevance.
- The candidate is not yet a serving Engine and has no rollout, latency or Full-Fidelity evidence.
- Candidate starvation exists at low frequency and becomes a Wave-2 eligible-retrieval concern; hard constraints must not be relaxed to hide it.

## 14. Promotion and Wave-2 readiness

Wave 1 satisfies its offline candidate gate: every applicable hard constraint passed, every compiled constraint has traceable evidence, soft preference language remained soft, Product/Distribution did not regress, V13 remained byte-identical, and the comparison showed no harmful retrieval collapse.

Wave 2 may start against this candidate boundary to implement multi-source eligible retrieval. This is not authorization for shadow, Closed Beta or Production rollout.

## 15. Verdicts

**WAVE 1 STRUCTURED INTENT — PASS**

**HARD CONSTRAINT INTEGRITY — PASS**

**D3-F-001 — RESOLVED**

**V13 STRENGTH REGRESSION — NONE DETECTED**

**WAVE 2 MULTI-SOURCE RETRIEVAL — READY**

**PRODUCTION — UNCHANGED**
