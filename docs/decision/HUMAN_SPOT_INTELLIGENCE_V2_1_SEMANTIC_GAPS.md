# Human Spot Intelligence V2.1 Semantic Gaps

Human V2 deliberately does not extend the frozen N4 or Decision semantics. These are end-to-end capability gaps, not missing checkboxes.

## P0 — structured gastronomy offering and purpose

| Need | Current state | Why it matters | Smallest coherent extension |
|---|---|---|---|
| generic drinks / beer | N3 broadly maps beer to Bar; Spot cannot assert a drink offering | frequent, materially distinguishes gastronomy | typed `offering.drinks` Spot facts in factual Decision package; no Taste concept |
| food / meals | N3 maps food to Restaurant; Spot cannot distinguish full meals, small dishes or snacks | frequent and eligibility-relevant | typed `offering.food_service` and meal-kind facts |
| craft / own-brewed beer | no exact N3↔Spot↔matcher symmetry | primary Brewpub differentiator | drink subtype vocabulary with factual reason authorization |

These are P0 as a single coherent Offering axis. They should not become Taste Concepts automatically; “serves craft beer” is a Spot fact, while a user liking craft beer requires separate evidence semantics.

## P1 — occasion/purpose

| Need | Current state | Proposed capability |
|---|---|---|
| Apéro | composable only from Bar + social + time; no exact semantic identity | typed purpose/occasion suitability |
| Afterwork | N3 gives a Bar hint but the Spot cannot assert afterwork fit | occasion suitability plus colleagues/business context and time |
| breakfast/brunch/lunch/dinner | N3 recognizes some terms as Restaurant; Spot has no meal-period offering | meal-period availability distinct from opening hours |
| dancing | Nightlife place type exists; no clearly bounded activity/offering roundtrip | explicit activity/program semantics with SPOT/PROGRAM guard |

## P2 — useful richness

- numeric group capacity;
- bar/table/terrace seating types;
- equipment and requirements for activities;
- accessibility breadth beyond the existing bounded capability object;
- price semantics tailored by venue type.

## Required architectural guardrails

Any V2.1 extension should keep Offering, Purpose, Vibe and User Taste separate; add factual package fields before ranking weights; prove N3/Spot/matcher/reason symmetry; preserve Unknown and negative facts; version migrations additively; and keep completeness/subscription status out of organic ranking.
