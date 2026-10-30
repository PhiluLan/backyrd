# Mandatory evidence before recommendation

The meaning plan's modality is binding across matching, Product assessment and final ranking. A required programme, atmosphere, accessibility feature, date or exclusion cannot become optional because of its field family. Personalization only orders already eligible candidates.

## Admission

- REQUIRED and EXCLUDED facts in the chosen logical branch must be MET together, using compatible offer/area witnesses. A missing or contradictory mandatory fact prevents admission.
- Unknown duties remain in the librarian's `unresolved` collection with their individual reasons; proven contradictions stay `excluded`. Neither receives a Product recommendation rank.
- Only explicit PREFERRED facts (including preferred logic branches) may influence ranking without blocking admission. CONTEXT and NOT_REQUIRED remain non-duties; this change does not reinterpret the user's original words or repair a model that assigns the wrong modality.
- A required fact in an input-only/context family is UNKNOWN with `REQUEST_PARAMETER_NOT_VERIFIABLE_AS_REQUIREMENT`. It is never silently relabelled CONTEXT. Existing context parameters still participate in budget and eligibility checks.
- Unknown requested visit times remain UNKNOWN, including an undated day phase; they are not turned into harmless context. With no time duty, the engine does not invent a visit now.
- ALL requires the full combination; required ANY accepts one fully proven branch. Shared duties remain binding outside ANY. Unknown conditional truth requires every possible selected conditional plan to be fully supported; one favourable branch cannot conceal the other.
- A positive accessibility or atmosphere fact cannot substitute for an unknown programme. Core confirmation is issued only for a fully supported admissible visit.

The final Product gate independently requires ELIGIBLE_CONFIRMED, hardConstraintState PASS, no unknown or failed hard constraints, confirmed core coverage, and no contextual rejection. Thus a falsely confident upstream core or tier alone cannot manufacture a rank. The existing null-rank response rows remain diagnosis data; both Mobile `wohinModel` and Web transport exclude them from displayed results.

Explicit legacy UI hard controls are binding too. The adapter no longer discards indoor, atmosphere, equipment or non-category exclusion controls by family. Existing scope-aware budget and time compatibility guards remain; source-use authorizations are not broadened.

## Versions and rollout

Matching is `backyrd.decision-vnext.librarian-matching@15`. Spot and event evaluation are `decision-vnext-librarian-evaluator@4` and `@5`. Ranking policy is v7 and evaluation release v14. Request/response schema shapes are unchanged. No database, auth or provider changes are needed.

This implementation does not deploy or activate a new production artifact. Release certification and normal product authority controls still apply. The diagnostic function and deployed consumer are not changed by the local replay.

## Validation

`npm test --workspace @backyrd/decision-vnext-core`: 469 passing tests. These include a modality/state matrix across field families, the 27 combinations of three mandatory facts, unknown and proven Jazz/access fixtures, mandatory vs preferred atmosphere, exact-date unknown availability, group-count uncertainty, exclusions, actual ANY branches and a rehashed inconsistent-assessment test against the final gate. Existing tests that previously required unsafe fallback ranking now inspect unresolved data or assert exclusion instead. Source-use, authentication, age restrictions and client-contract checks continue to run.

The recorded ten real model outputs from 30 October were replayed locally, without new model calls or production writes, against the saved 419-profile/25-event snapshot with neutral personalization and frozen authority time. This is not a new live model test or an identical database rerun. Admitted counts before/after: cafe 91/0; free table tennis 0/0; swimming 3/0; vegan lunch 173/15; date bar 50/0; children outdoors 121/0; escape room 1/0; sauna 8/0; flea market 0/0; Jazz/access 11/0. The eight displayed vegan-lunch results remain. All other unresolved requirements remain visible in the evaluation, without recommendation ranks.

The reduced coverage is intentional under the mandatory-evidence rule, not a claim that the outstanding search problems are solved. Vocabulary alignment, the model's treatment of children and prerequisites, programme evidence, capacity verification and incomplete schedules still require separate work. Never restore silent fallback admission to hide those gaps.
