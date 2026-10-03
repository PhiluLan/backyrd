# Product Decision query relevance

Status: active Product-v1 behavior; this note does not grant release authority.

Decision interprets a natural-language request into a bounded plan before World retrieval and ranking. The plan has one primary intent, at most one secondary intent, an indoor requirement when clearly requested, and canonical World facets. Each facet is one of:

- `REQUIRED`: an essential property; alternatives in one group are OR, distinct groups are AND.
- `PREFERRED`: confirmed evidence improves ranking but absence cannot exclude a spot.
- `EXCLUDED`: a confirmed matching property rejects the spot; unknown evidence cannot prove the exclusion.

The model never supplies a spot fact. It can select only authorized World keys and values. The server validates every key/value pair, bounds the model's evidence text, normalizes harmless grouping/duplicate output and validates the request boundary; it does not require a semantic inference to repeat the user's exact words. Contradictory required/excluded facets for the same value are discarded. The evaluator checks against conflict-free, resolved World facts. Opening, location, legal age rules and consent remain deterministic. The model cannot override those controls. A broad intent such as `ACTIVITY_EXPERIENCE` does not by itself prove suitability for a more specific moment.

Do not turn all contextual suggestions into hard filters. A read-only Production observation on 2026-10-03 found current World pointers for 410 approved spots, but only 19 known `context.visit_situations` facts and 14 known `context.atmosphere` facts. Core category and purpose were known for 403 spots each. In Basel, 47 approved spots had a known category in culture, play or entertainment, and 26 of those had a clearly indoor place type. These counts are coverage, not proof that each spot suits a four-year-old. A family outing can use confirmed experience classifications to avoid a generic gym, with confirmed family context as extra evidence; it must not claim age suitability where World has not established it.

Quality evaluation must separately inspect (1) interpretation, including required/preferred/excluded roles, (2) candidate eligibility and World evidence, (3) ranking and diversity, and (4) user-facing reasons. Synthetic World tests prove the deterministic evaluator, not model comprehension or Production result quality. Before calling a release a relevance success, run representative everyday, multilingual, ambiguous and negative requests through the real model and current Production World in an authorized, read-only pilot. Record empty-result rate, false-positive categories, inappropriate age/access claims, provider errors and concrete user-visible candidates. An unverified or empty result is not a successful recommendation.

The 12 requestable enum fields are a deliberate projection of the larger World registry, not a claim that every user constraint is understood. Some constraints (e.g. opening, location, access) have separate deterministic paths; other requests may require extending the canonical query contract and World coverage. Do not compensate for a missing field or evidence by inventing a match.
