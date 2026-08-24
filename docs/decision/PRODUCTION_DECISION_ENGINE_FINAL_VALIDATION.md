# Production Decision Engine Final Validation

## Regression fixture

The captured Production failure is permanent test input:

- request: `Regentag mit meiner 4-jährigen Tochter`;
- N3: rain preferred, family with child, child age 4;
- original top ten: five canonical bars consumed positions before exclusion;
- expected operation: hard exclusions before the eligible ten-candidate freeze;
- expected ordering property: strong factual match > honest unknown > explicit factual contradiction;
- expected authority: canonical preferred place type beats retrieval position only after stronger semantic/factual tiers.

Focused canonical/N3/N4/orchestrator/N6 tests: PASS. Full Decision regression: 314/314 PASS. Production Edge bundle build: PASS.

## Production matrix

Production results, trace IDs, candidate funnels, latency and visible reason review are recorded here after the controlled deployment. No exact Spot ranking is predeclared; acceptance requires understood intent, no obvious contradiction above a strong match, honest unknowns, and evidence-bound copy.

| Case | Intent | Funnel | Result/reason | Status |
|---|---|---|---|---|
| Rain + four-year-old child | rain/family/age explicit | 25 fused, 17 eligible/handoff | ELYS; Naturhistorisches Museum; Basler Münster | PASS |
| Outdoors + animals with child | family/outdoor/animals explicit | 25 fused, 17 eligible/handoff | Zoo Basel; Tierpark Lange Erlen; Basler Münster | PASS |
| Active indoors with child | family/indoor explicit | 24 fused, 17 eligible/handoff | ELYS; Naturhistorisches Museum; Tierpark | PASS |
| Cozy date tonight | date/cozy/evening context | 24 fused, 20 eligible/handoff | 1777; Basler Münster; Unternehmen Mitte; all safely UNKNOWN | DATA-LIMITED/PASS |
| Lively with friends | friends/lively semantic intent | 20 fused/eligible/handoff | ELYS; Tierpark; 1777 | PASS |
| Coffee and short sit | café preferred | 24 fused, 20 eligible/handoff | 1777; Unternehmen Mitte; Café Frühling | PASS |
| Only one hour | duration=60 explicit | 21 fused, 20 eligible/handoff | ELYS; Tierpark; Basler Münster; partial/unknown stated honestly | PASS |
| Quiet conversation | quiet + conversation explicit | 22 fused, 20 eligible/handoff | Tierpark; ELYS; 1777 | PASS |
| Broad unknown | no invented constraints | 21 fused, 20 eligible/handoff | 1777; Unternehmen Mitte; Basler Münster | PASS |

## Canonical Production benchmark

`Regentag mit meiner 4-jährigen Tochter` on `decision-v13` v64:

- N3: rain `PREFERRED`, family `FAMILY_WITH_CHILD`, child age `4`; all explicit.
- Retrieval: 20 semantic, 12 personalized, 25 fused, 17 hard-eligible and 17 handed to factual evaluation.
- ELYS: rain, indoor, family and age all MATCH; retrieval position 4; rank 1.
- Naturhistorisches Museum: rain, indoor, family and age all MATCH; retrieval position 12; rank 2.
- Basler Münster: relevant place type with unknown factual support; rank 3.
- Tierpark: retrieved and evaluated, but its explicit rainy-day contradiction no longer outranks strong matches or honest unknowns.
- Visible reasons: direct evidence-bound rainy-day reasons for ELYS and the Museum; no personal claim for the cold fixture user.

The benchmark completed in 2.015 s end-to-end (retrieval 753 ms, Decision runtime 402 ms). Across all nine warm Production cases: p50 1.693 s, observed maximum 2.790 s; retrieval p50 421 ms and Decision p50 385 ms.

N6 was intentionally disabled for this matrix to prove the deterministic fallback independently. Existing real provider canonicalization/validator evidence remains authoritative, and the N6 hierarchy/candidate-authority regression suite passed. No external AI call or cost was added by this closure matrix.

## Curated control set

- Naturhistorisches Museum and ELYS participate as strong indoor/rain/family candidates.
- Zoo Basel leads the outdoor-animals case from three direct factual matches.
- Tierpark remains useful for outdoor/quiet contexts but is demoted for a rainy-day contradiction.
- MUKS is in Riehen and remains outside the existing exact-city Basel contract; no unapproved metro reinterpretation was introduced.

Known non-blocking limitation: date and other contexts with thin accepted Spot facts correctly fall back to retrieval plus `UNKNOWN`; improving these results is a content-enrichment task, not an engine-weight change.

Production remains internal/controlled. Public rollout is not part of this closure.
