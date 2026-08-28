# Canonical Offering + Purpose V2.1 — Validation

## Contract coverage

| Need | N3 | Spot fact | Retrieval | Factual match | Reason |
|---|---|---|---|---|---|
| Beer / Craft Beer / own beer | exact | yes | yes | exact/unknown/contradicted | yes |
| Wine / cocktails / coffee | exact | yes | yes | exact/unknown/contradicted | yes |
| Food / snacks / small plates / meals | exact | yes | yes | exact/unknown/contradicted | yes |
| Breakfast / brunch / lunch / dinner | exact | yes | yes | exact/unknown/contradicted | yes |
| Apéro / Afterwork | exact purpose | yes | yes | exact/unknown/contradicted | yes |
| Food + drink combinations | independent requirements | yes | yes | all requirements retained | per confirmed match |

## Automated proof

- German N3 fixtures cover all supported values plus compound requests.
- Hierarchy tests prove parent-only truth cannot fabricate Craft Beer or a meal period.
- Runtime tests prove exact match ranks above honest unknown and explicit contradiction.
- Multi-requirement tests prove Craft Beer and Food remain two observations.
- Completeness regression proves many unrelated facts cannot outrank an exact match.
- Candidate Offering is outside N4 and carries `userTaste:false`.
- An all-UNKNOWN map remains UNKNOWN and cannot authorize a reason.
- Safe hierarchy contradictions (for example Craft Beer available while Beer is explicitly unavailable) fail server validation.
- Existing Decision Input, envelope, funnel and deterministic orchestrator suites remain green in the focused run.
- Admin TypeScript passes. Repository-wide Admin lint remains blocked by pre-existing unrelated violations.
- Local Supabase replay was unavailable because the local Docker daemon returned HTTP 500. The linked dry-run proved that `20260825230000` is the only pending migration; Production application remains gated on transactional migration success.

## Controlled benchmark expectations

With a Volta-like controlled fixture confirming Craft Beer, Beer, Food, friends, cozy, indoor/outdoor and relevant purposes:

- “Gemütlich Craft Beer mit Freunden trinken”: Offering + Vibe + Audience are independently traceable.
- “Ein Bier und etwas essen”: Beer and Food are separate required facts.
- “Afterwork mit Kollegen”: Afterwork remains Purpose; colleagues remain Audience.
- “Ruhig zu zweit ein Glas Wein”: Wine, quiet and Date are separate axes.
- “Bei Regen gemütlich ein Bier trinken”: Beer and rain suitability are separate facts.
- “Craft Beer, etwas essen und draußen sitzen”: two Offering requirements plus Environment.

No real Volta, KaBar, Museum, Zoo or ELYS content is part of this fixture.

## Intentional limitations

- Brand, brewery, menu-item and cuisine semantics are not introduced.
- Afterwork and Apéro are purpose primitives but do not imply time, company, drink or vibe.
- Offering is not a durable user preference. A future separate, evidence-backed User Intelligence contract would be required for that.
