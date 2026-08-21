# Backyrd Canonical Semantics V1

`@backyrd/canonical-semantics` is the Product/Engine source of truth for `backyrd-canonical-semantics-v1`.

The contract keeps three layers separate:

1. **Observed/raw** — an attributed action, request, selection or source claim.
2. **Canonical semantics** — a normalized, versioned concept, fact, context or event with provenance.
3. **Derived intelligence** — N4 interpretations, User Card nodes, confidence, N5 projection, ranking and authorized reasons.

## Registry

- 45 frozen Taste Concepts, unchanged.
- 60 frozen N4 dimensions (8 facts + 45 concepts + 7 frozen extensions), unchanged.
- 20 canonical Product fact definitions. Facts remain facts; age/rain are not Taste Concepts.
- 14 live category mappings. An unknown category returns explicit `UNKNOWN`, never implicit `other`.
- 12 Product moods: 8 qualifying and 4 display-only. Explicit aliases normalize at ingestion; test and unmapped values cannot qualify.
- Review origin adapter: `SMART_REVIEW` ↔ `smart_review_v1`. Historical origin is never guessed.
- Factual WHY_NOW vocabulary: `RAIN_SUITABLE`, `INDOOR_MATCH`, `CHILD_AGE_MATCH`, `FAMILY_SUITABLE`, `ACTIVITY_MATCH`, `ACCESSIBILITY_MATCH`.

The runtime registry lives in [index.mjs](../../packages/canonical-semantics/src/index.mjs). The database migration asserts registry counts before adding contracts.

## Producer rules

- Open/save remain Interest, visit remains Experience, and none imply Satisfaction.
- Smart Review supplies Experience plus only qualified mood/text evidence.
- Profile and onboarding selections create `SELF_DECLARED` weak-prior evidence. They are not behavioral proof and cannot directly become HIGH.
- Decision Moment V2 records rain, child age and family context with `EXPLICIT | INFERRED | OBSERVED | UNKNOWN` provenance and `durablePreference=false`.
- Admin/Owner author canonical Facts/Proposals through the Gold contract. N4 remains derived/read-only.
- Community Moments remain social content and do not become N3 or durable Taste automatically.

## Legacy boundary

Legacy profiles, `user_taste_events_v2`, `mood_concepts`, `spot_mood_concepts`, `spot_moods`, free Spot intelligence, and Mobile AI profile helpers are not canonical inputs. They may remain for compatibility/display. Canonical N4 reads accept only REAL/IMPORT evidence and explicitly exclude legacy source families. Historical rows are retained and are not reinterpreted.

## Decision flow

Accepted Gold Fact → provenance-bound N4/suitability read → Decision Package → discrete factual match → candidate-specific authorized reason. Unknown facts are neutral unless an existing explicit hard constraint says otherwise. Current intent remains above historical Taste.

Owner subscription data is not present in the registry, N4, N5, ranking, or reasons.
