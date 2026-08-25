# Human Spot Intelligence V2 Validation

## Reference compatibility

Production reference data was inspected read-only before implementation.

| Spot | Derived V2 authoring | First useful question families | Regression expectation |
|---|---|---|---|
| Volta Bräu | Bar initially; Founder may set Brewpub | audience, time, atmosphere, environment, conversation, duration, planning | no Museum/Bouldering/Tiere activity wall |
| Naturhistorisches Museum Basel | Museum | exhibitions/culture/history, rain, family/age, duration, accessibility | existing Museum/Culture/Indoor/Rain facts remain representable |
| Zoo Basel | Zoo | animals, walking, playground, outdoor/weather, family/age, duration | outing and family truth remains representable |
| ELYS Boulderloft | Boulder/Climbing from accepted activity | bouldering, climbing, sport, indoor/rain, social, family/age, planning | no gastronomy form |
| KaBar | Bar | audience, time, atmosphere, noise/conversation, planning | no generic activity wall |
| Brewpub + Restaurant + Bar | primary + secondary archetypes | one deduplicated core form | no repeated audience/atmosphere questions |

No reference Spot content is changed by the migration or UI deployment.

## Semantic roundtrip

The SQL acceptance fixture validates:

- frozen 45/60 registries;
- exactly one audience question;
- all canonical questions reference an existing Accepted Fact key;
- Brewpub suppresses the mixed activity catalog while retaining common core;
- hidden and forged options fail closed;
- two answers save atomically, create exactly two facts and trigger one N4 rebuild;
- retry replays the original result;
- deterministic summary;
- Owner public setting remains false;
- Admin authoring emits no User Taste event.

The existing V1.1 canonical tests continue to cover Accepted Fact → N4 → Decision package, negative weather matching, Unknown handling, qualitative daypart separation and SPOT/EVENT scope safety.

## End-to-end semantic matrix

| User need | N3 | Spot fact/N4 | Matcher/reason | Coverage |
|---|---|---|---|---|
| gemütlich | yes | atmosphere → `vibe.cozy` | yes | strong |
| lebendig | yes | atmosphere → `vibe.lively` | yes | strong |
| mit Freunden | yes | social suitability | factual/context use | strong |
| mit Familie/Kind | yes | family + age | eligibility/factual reason | strong |
| drinnen | yes | environment | eligibility/factual reason | strong |
| draußen | yes | environment | eligibility/factual reason | strong |
| bei Regen | yes | rain suitability | eligibility/mismatch/reason | strong |
| ruhig / Gespräch | yes | noise + conversation | factual/reason | strong |
| abends | yes | qualitative daypart | factual/reason | strong |
| spontan | partial | reservation character | factual/reason | partial |
| Museum/Ausstellung | yes | place type + activity | yes | strong |
| Tiere/Zoo | yes | place type + activity | yes | strong |
| Bouldern/Klettern | yes | activity | yes | strong |
| Spaziergang | yes | activity/place type | yes | strong |
| Date | yes | social suitability + vibe | yes | strong |
| Gruppe | partial | social suitability | factual | partial; no numeric capacity |
| Bier | bar hint | no offering fact | no specific reason | partial |
| Craft Beer | no exact canonical axis | none | none | unsupported |
| Essen und Trinken | restaurant/bar hints | no structured combined offering | broad place type only | partial |
| Afterwork | bar hint | no occasion/offering fact | broad composition only | partial |

## Responsive and accessibility acceptance

- Desktop uses a compact sticky section index and dense question cards.
- Mobile replaces clipped horizontal tabs with a full-width section selector.
- Controls are at least 42–44 px, selected state has `aria-pressed`/`aria-checked`, and no selection relies on color alone.
- The dirty-state dock sits above the Admin bottom navigation and safe area.
- Sections render only relevant controls; 320 px collapses long chips and tri-state rows to one column.
- Drafts survive route work within the browser session. Success appears only after the server returns persisted count and refreshed canonical profile.

## Security and non-regression

The boundary derives actor, role and Spot access server-side. Unknown questions/options, source forgery, non-Founder direct acceptance and cross-Spot access fail closed. Existing RLS remains mandatory. Public Owner V2 is not enabled. No Decision score, N6 path, User Intelligence formula, Taste concept or N4 dimension changes in this implementation.

Production write validation must use a disposable TEST/FIXTURE transaction only. Production smoke for Volta, Museum, Zoo, ELYS and KaBar is read-only.
