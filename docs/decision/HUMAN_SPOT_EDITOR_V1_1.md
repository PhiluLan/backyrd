# Human Spot Editor V1.1

V1.1 closes the authoring loop without changing the frozen Decision Engine. Founder and Admin can save a valid, source-bound, general Spot answer once. The server creates the audit proposal, accepts the fact, qualifies it, rebuilds canonical N4 and returns refreshed Human Readiness in one transaction.

## Authority and review

- Founder/Admin direct acceptance is limited to valid `SPOT` facts from `ADMIN_VERIFIED`, `OFFICIAL_WEBSITE` or `OFFICIAL_DOCUMENT` sources, with no existing conflict.
- Owner, Research, event, program, temporary, unresolved-scope, conflicting, place-type and opening-status corrections remain review-only.
- Owner Basic/Pro capabilities are unchanged. Subscription controls authoring access only and never enters eligibility, N4, ranking or reason authorization.
- `audience.basic` is retained only as historical/display data. New Basic and Deep authoring share `social.suitability` through the single question “Für wen eignet sich der Ort?”.

## Human correction model

Historical issues show the claimed value, source, reason and canonical alternative where available. Founder/Admin can confirm general Spot scope where safe, enter a correction as a new sourced fact, mark supported enum facts unknown, or stop using the old fact. History is never deleted.

Manual answers to “Wann passt der Ort besonders gut?” are marked `HUMAN_QUALITATIVE`. Opening schedules remain availability data and cannot silently create qualitative daypart suitability.

## Editor-to-engine coverage

| Human information | Canonical target | N4 | Decision | Matching / reasons |
|---|---|---:|---:|---|
| Activity | `activity.types` | fact | yes | existing factual match/reason |
| Indoor/outdoor, rain, family, age | existing suitability facts | fact/concept | yes | existing factual match/reason |
| Social suitability | `social.suitability` | fact | yes | existing factual matching |
| Atmosphere | `atmosphere.descriptors` | existing frozen concept when mapped | yes | existing N4 semantic matching; no new reason code |
| Noise | `character.noise` | existing fact/concept where explicitly mapped | yes | factual context; no new weight/reason |
| Conversation | `suitability.conversation` | existing fact/concept | yes | existing semantic/factual context |
| Planning | `reservation.character` + `reservation.recommended` | one structured frozen fact | yes | available as facts; no new ranking rule |
| Duration | `duration.character` + `duration.approximate` | one structured frozen fact | yes | available as facts; no new ranking rule |
| Accessibility, price, qualitative daypart | existing facts | fact | yes | existing bounded matching/reasons where authorized |
| Signature characteristics | display/product metadata unless an existing frozen mapping applies | no forced mapping | no | display-only |

Decision-visible does not automatically mean reason-authorized. V1.1 adds no reason codes, ranking weights, Taste concepts or N4 dimensions.

## Compatibility

The migration is additive and preserves historical facts, proposals and snapshots. Frozen registries remain 45 Taste concepts and 60 N4 dimensions. Public Owner V2 remains disabled.
