# Product v1: World Knowledge → Wohin

This is a focused change to the existing `decision-v13` Product transport and
Decision vNext evaluator, not a second engine or a mobile route change. The
database migration adds a Product-only, manifest-derived view. It does not
rewrite the immutable shadow projection in already sealed manifests.

| Input / boundary | Before | Candidate after this PR |
| --- | --- | --- |
| Primary visit purpose, onsite offerings, visit situation, atmosphere, typical daypart | Filtered out of the Product resolver payload | Included only from a validated canonical World snapshot; `UNKNOWN` and conflicts remain explicit |
| Contacts, private provenance, payment | Not Product ranking authority | Excluded from the Product payload; never used to rank |
| Main purpose vs. ancillary offer | Specific verified category/type determines core intent | Same rule, now with visible primary-purpose evidence; coffee in an ancillary offering cannot turn a pub into a café |
| Context | Presence of a context fact could appear as a match | Only a matching, condition-applicable visit/atmosphere/daypart contributes to context ranking and a specific reason |
| `AREA_CLOSED` | Not treated as closed | A manifest-bound, claim-validated current state closes the venue within its validity interval; expired state is not asserted as current |
| Price level / numeric budget | Stored qualitative level did not satisfy numeric limit | Qualitative low-price preference can match `LOW`/`VERY_LOW`; a CHF ceiling remains unknown without a confirmed numeric price range |
| Bounded candidate retrieval | COFFEE verified facts preferred, other intents relied on legacy catalog order | Verified core category/type preferred for each intent before the 48-row limit; no ancillary-offer or name-based priority |

Read-only Production observation on 2026-09-20, before this PR is deployed:

| Real spot | Canonical World evidence observed | Local candidate replay, not an installed-app result |
| --- | --- | --- |
| Volta Bräu | Manifest `72f2fbfbd02334d94a409fa33fdb04154dfe9a236923b7b70d53898330a4ad69`; `EAT_DRINK`, `EAT`, `PUB`, onsite unknown, `AREA_CLOSED`/`VENUE` claim valid until 2026-12-23 15:31 UTC, price `MEDIUM` | Drinks core confirmed by `PUB`, but current closure makes it ineligible. Coffee core incompatible even if coffee is listed among offers. Numeric CHF budget stays unknown. A synthetic, non-personal subject hash put it at position 51/54 among Basel legacy Bars before retrieval priority; the new verified-PUB priority addresses this counterexample. |
| Consum Weinbar | `EAT_DRINK`, `DRINKS`, `WINE_BAR`, confirmed `QUIET` and `COZY`, date visit, evening daypart, price `HIGH` | Drinks core confirmed; a date/evening/quiet request receives those matching context reasons. `HIGH` is not translated into an invented CHF value. |
| ¡Che, que lomo! | Primary purpose and category are `UNKNOWN` in its current World snapshot | Core intent remains unconfirmed; no name inference promotes it to a verified restaurant. |

The local SQL acceptance test checks the Product-only projection, service-only
context RPC, preservation of explicit unknowns, and exclusion of contacts. The
Decision tests replay the public, non-personal fact shapes above through the
Product binding/evaluator. Existing Admin/World authoring tests cover the
append-only Claim → rebuild → canonical manifest path; this PR does **not**
perform a Production Admin write or change any spot fact. Thus it does not
claim that an installed iPhone has consumed this new candidate. After review,
merge, migration, and backend deployment, a separate live smoke must verify
Admin save → manifest rebuild → `Wohin` output on the installed app.
