# Restaurant Information V1 – Canonical Mapping

Audit basis: `origin/main` at `ade8ed0040153a21d94d59c6ad4ba550db2a968e`, canonical migrations through 2026-09-06, and a read-only Production inventory on 2026-09-07.

Restaurant Information V1 extends the existing `backyrd_spot_fact_catalog_v1` → source → accepted-fact → audit chain. It does not introduce a Restaurant table or a second Spot truth.

| Desired field | Canonical storage | Supported now? | V1 action |
|---|---|---:|---|
| Name | `spots.name` / `identity.name` projection | Yes | Reuse identity editor; no duplicate |
| Address | `spots.address` / `location.address` projection | Yes | Reuse identity editor; no duplicate |
| Neighborhood | Accepted Fact `location.neighborhood` | No | Add evidence-backed text fact |
| Website | `spots.website` / `contact.website` projection | Yes | Reuse; normalize in existing Spot form |
| Phone | `spots.phone` / `contact.phone` projection | Yes | Reuse existing Spot form |
| Instagram, Facebook, LinkedIn, TikTok | One Accepted Fact per channel | No | Add URL-validated, nullable facts; no scraping |
| Distinctive factual profile | Accepted Fact `profile.distinctive_fact` | Partial (`signature.characteristics` is list-based) | Add short factual text, display-only; no AI copy |
| Price level | `spots.price_level` / `price.level` | Yes | Reuse integer 1–5; null remains unknown |
| Regular hours | `spot_hours` / `opening.regular` projection | Yes | Reuse existing structured editor |
| Special hours | Accepted Fact `opening.special_overrides` | No | Add dated, validated display contract. It does not alter live opening/eligibility logic in V1 |
| Take-away | Accepted Fact `restaurant.takeaway` | No | Add `YES | NO | UNKNOWN` |
| Cuisine types | Accepted Fact `restaurant.cuisines` | No complete taxonomy | Add controlled V1 vocabulary. Existing taxonomy has only `vegan-restaurant`/`vegan-options`, not a cuisine taxonomy |
| Payment methods | Accepted Fact `restaurant.payment_methods` | No | Add per-method `AVAILABLE | NOT_AVAILABLE | UNKNOWN` map |
| Capacity total/inside/outside | Accepted Fact `restaurant.capacity` | No | Add nullable non-negative integers; no inferred totals |
| Indoor/outdoor/terrace/garden | Accepted Fact `restaurant.areas` | Partial (`suitability.environment` is high-level Decision evidence) | Add display-only per-area tri-state facts; do not change Decision semantics |
| Reservation | Accepted Fact `restaurant.reservation_policy` | Partial (`reservation.character` is existing Decision evidence) | Add one display-only Restaurant policy with `NOT_AVAILABLE | OPTIONAL | RECOMMENDED | REQUIRED | UNKNOWN`; Restaurant Admin UI does not create a second boolean |
| Service type | Accepted Fact `restaurant.service_types` | No | Add controlled multi-select, explicit `UNKNOWN` |
| Drinks | `offering.availability` | Yes | Reuse canonical beverage offering map |
| Food | `offering.availability` + `purpose.occasions` | Mostly | Reuse Snacks/Breakfast/Brunch and APERO; add only meal format (`MENU`, `A_LA_CARTE`) as display metadata |
| Audience | `social.suitability` | Yes | Reuse per-context tri-state map; `work` covers Business/work |
| Spontaneity | `reservation.character` | Yes | Reuse for Decision evidence; Restaurant display policy is authoritative for consumer wording when present |
| Visit time | `time.dayparts` | Mostly | Reuse existing Morning/Afternoon/Evening/Night/Weekday/Weekend. Add display-only `MIDDAY`/`HOLIDAY` supplement without changing N4 |
| Typical duration | `duration.approximate` | Yes | Reuse existing coarse ranges; `UNKNOWN` is accepted-fact status, not zero minutes |
| Atmosphere | `atmosphere.descriptors` → canonical Mood concepts | Yes | Reuse only existing concepts; no new Mood vocabulary or semantics |
| Family suitability | `suitability.family_kids` | Yes | Reuse `SUITABLE | NOT_SUITABLE | UNKNOWN` |
| Noise | `character.noise` | Yes | Reuse `QUIET | MODERATE | LOUD | VARIABLE | UNKNOWN` |
| Accessibility | `accessibility.capabilities` | Yes | Reuse step-free, wheelchair-accessible areas and accessible toilet as separate tri-state evidence |

## Boundaries

- New Restaurant facts are `DISPLAY_ONLY` or `RAW_FACT`; none are added to N3–N6, ranking, eligibility, search, Taste or User Learning.
- Existing Mood, Offering, Purpose, Reservation and Accessibility contracts stay intact.
- `UNKNOWN` is explicit for enums/maps. Missing means not yet authored. Consumer display hides both unless an evaluation mode is explicitly enabled.
- Sources, timestamps, actor, evidence scope and accepted-fact history remain attributable through the existing canonical tables.
- Special hours are informational in V1. Making them authoritative for “open now” is a separate product/operational change and is intentionally out of scope.
