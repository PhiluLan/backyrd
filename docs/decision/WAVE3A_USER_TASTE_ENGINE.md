# BACKYRD DECISION NEXT GEN — WAVE 3A USER TASTE ENGINE FOUNDATION

Status: **PASS — technical foundation only**

Production integration: **NOT STARTED**

Canonical implementation: `decision-lab/src/taste-engine.mjs`
Storage migration: `20260817103000_create_next_gen_user_taste_foundation.sql`

## 1. Executive Summary

Wave 3A introduces a single, deterministic Next-Gen Taste domain engine. It turns validated, consented product evidence into a bounded User Taste Map and can project that map for a current place type and a small set of canonical contexts. Affinity, confidence, positive evidence, negative evidence, recency, diversity, provenance and scope remain separate.

This wave does not connect Product events, Decision retrieval, ranking or UI to the new engine. It does not claim that the v1 learning constants improve recommendation quality. Wave 3B must validate that question internally before any Product integration.

## 2. Taste Space

`backyrd-taste-space-v1` defines 45 controlled concepts shared by Users and Spots. It replaces unbounded free tags with nine families:

| Family | Concepts |
|---|---|
| vibe | cozy, relaxed, romantic, lively, quiet, social, inspiring, playful, elegant, authentic, urban |
| energy | calm, balanced, energetic |
| social_style | solo-, conversation-, group-, family-, romantic-friendly |
| occasion | work-, celebration-, morning-, afternoon-, evening-friendly |
| price | budget, balanced price, premium |
| discovery | mainstream, hidden gem, novel |
| character | design-led, authentic character, distinctive |
| environment | indoor, outdoor |
| place_type | café, bar, restaurant, nightlife, culture, outing, activity, experience, hotel, other |

The same allowlist exists in code and in the database registry. Evidence cannot reference an unknown concept. Adding or changing concepts requires a new version and freeze.

## 3. Event / Evidence Inventory

The inventory distinguishes a supported learning meaning from current Product wiring. No event becomes active merely because it appears here.

| Product signal | Taste meaning | v1 evidence | Product wiring in Wave 3A |
|---|---|---:|---|
| Decision shown | exposure, not preference | 0 | none |
| Spot tap | weak positive | +0.08 | none |
| Search result open | weak positive | +0.10 | none |
| Spot open/detail | weak positive | +0.14 | none |
| Exact mood feedback | explicit positive | +0.22 | none |
| Like | explicit positive | +0.22 | none |
| Explicit dislike | explicit negative | -0.22 | none |
| Save/favorite | commitment | +0.38 | none |
| Remove save | state change, not dislike | 0 | none |
| Navigation intent | commitment | +0.38 | requires a future qualified adapter |
| Reservation intent | strong commitment | +0.48 | requires a future qualified adapter |
| Verified visit / Was Here | outcome | +0.48 | requires verified outcome linkage |
| Positive post-visit feedback | outcome | +0.48 | requires explicit positive semantics |
| Negative post-visit feedback | explicit negative outcome | -0.38 | requires explicit negative semantics |
| Onboarding preference | initial weak evidence | +0.14, confidence capped | none |
| “Not there” | factual correction, not dislike | 0 | none |
| Review/Mood Review/Moment | no automatic polarity | 0 unless explicit qualified feedback exists | none |
| Repeated behaviour | confidence/diversity input, not a separate event | derived | implemented in reduction |

The proven legacy strengths `0.08`, `0.10`, `0.14`, `0.22`, `0.38` and `0.48` anchor the evidence tiers. D4 authority rules determine their meaning. Reviews, Moments, visits, navigation and reservations are deliberately not auto-positive without a proven outcome contract.

## 4. Signal Strength Model

Evidence strength and direction are derived from the versioned event type, never supplied by a client. One event is bounded to `[0,1]`; the derived affinity is bounded to `[-1,1]`. Exposure, missing interaction and missing optional analytics consent are never negative evidence.

Raw events are normalized into concept evidence. An evidence ID is idempotent: replaying identical evidence has no effect; reusing the ID with different content fails closed.

## 5. User Taste Map

Each row is identified by:

`user × concept × scope kind × scope key`

It stores affinity, confidence, separate decayed positive/negative support, positive/negative event counts, distinct Spots, distinct sessions, source families, first/last evidence, decay state and every material model version. Concepts with no evidence remain explicitly discoverable as UNKNOWN in the domain contract; no database row is fabricated.

The database has two responsibilities only:

- `backyrd_taste_evidence_v1`: normalized audit ledger, service-only.
- `backyrd_user_taste_map_v1`: bounded derived map, own-user read only with active personalization consent.

The deterministic reducer remains the single learning implementation. The database does not contain a competing learning formula.

## 6. Positive / Negative Learning

Positive and negative support are accumulated separately after decay. The affinity formula is:

`affinity = (positiveSupport - negativeSupport) / (positiveSupport + negativeSupport + 0.75)`

and is clamped to `[-1,1]`. This prior prevents one action from creating an extreme persistent belief. Only explicit or qualified negative events create negative support. A save removal, non-click, impression or “not there” correction is not a dislike.

## 7. Confidence Model

Confidence is independent of affinity. It combines:

- total decayed evidence strength;
- positive/negative consistency;
- distinct Spots;
- distinct sessions;
- independent source families;
- recency.

Contradictory evidence reduces consistency. Repeating actions on the same Spot in the same session creates less confidence than evidence across independent Spots and sessions. Onboarding-only confidence is capped at `0.35`.

This is a transparent v1 technical prior, not a quality-tuned conclusion. Wave 3B owns empirical calibration.

## 8. Recency / Decay / Drift

The versioned half-life classes are:

| Class | Half-life | Purpose |
|---|---:|---|
| transient | 30 days | taps and short interest |
| contextual | 60 days | situation-specific adjustment |
| onboarding | 120 days | cold-start seed that behavior can replace |
| behavioral | 180 days | explicit/recurring preference |
| stable | 365 days | commitment and qualified outcome evidence |

Each evidence contribution uses exponential half-life decay. Rows are classified CURRENT, AGING or STALE. Preference drift occurs only when newer contradictory qualified evidence outweighs older decayed support; time alone does not invent an opposite preference.

## 9. Place-Type Taste

The engine maintains a global row and may derive a `PLACE_TYPE` row for the same concept. It does not copy a completely separate user profile. A User can therefore express quiet/design-led café taste and lively/hidden-gem bar taste while retaining a global prior.

Place-type scopes are limited to the canonical ten types. Unknown or missing type yields no place-type adjustment, not negative evidence.

## 10. Contextual Taste Foundation

Context avoids Cartesian profile explosion. v1 permits only bounded single-axis slices:

- audience: solo, date, friends, family, work;
- time: morning, afternoon, evening, weekend, weekday.

An event may carry at most one audience and two compatible time axes. State is hierarchical:

`GLOBAL + PLACE_TYPE + matching CONTEXT adjustments`

No arbitrary context string can create a new user profile.

## 11. Current Taste Projection

`backyrd-current-taste-projection-v1` combines active evidence using transparent scope weights:

- Global: `1.00`
- Place type: `0.65`
- Context: `0.50`

Every contribution is attenuated by its confidence. Context therefore modulates rather than replaces global taste. The projection records its evidence, scope, history affinity, final affinity, authority and version hash.

## 12. Current Intent Authority

The frozen authority order is:

1. Product Eligibility
2. Distribution Eligibility
3. User Hard Constraints
4. Explicit Current Intent
5. Current Context
6. Long-term Taste
7. Matching Context History

Hard constraints remain outside Taste. If explicit current intent contradicts history, the projection marks `EXPLICIT_CURRENT_INTENT` and prevents history from reversing its direction. Taste is personalization, never eligibility.

## 13. Onboarding Integration

Onboarding maps to weak evidence, uses its own faster decay class and cannot exceed `0.35` confidence when it is the only source family. Later qualified behavior can outweigh and reverse it. Wave 3A does not connect the existing onboarding RPC; the future adapter must emit the same validated evidence contract rather than directly write derived state.

## 14. Privacy / Consent / Security

- Personalization requires active `personalized_recommendations` consent.
- Missing consent rejects storage; withdrawn consent hides derived state.
- Raw evidence has no anon/authenticated read or write grant.
- Derived state is readable only by its authenticated owner with active consent.
- Normal users have no insert/update/delete permission on derived state.
- Account deletion cascades through both new user tables.
- No fingerprint, external tracking, contacts, Wi-Fi, demographic inference or latent truth exists in the contract.

No Production data or Production connection was used.

## 15. Auditability

Each map row preserves an evidence fingerprint, counts, source families, evidence timestamps, positive/negative support, scope and version identities. The debug surface can explain a belief as evidence summary without returning raw behavioral history. Raw events remain server-only.

## 16. Acceptance Tests

Permanent deterministic tests cover:

- new user UNKNOWN;
- no learning from impression or “not there”;
- one-off bounded learning;
- repeated positive and conservative negative learning;
- conflict handling and evidence diversity;
- decay, recency and drift;
- onboarding correction;
- place-type and family/friends projections;
- explicit current intent authority;
- idempotency and ID conflicts;
- consent, allowlist, scope and user isolation;
- latent-truth leakage guard;
- RLS, ownership and write protection;
- fresh canonical database boot.

Validation result:

| Check | Result |
|---|---|
| Wave 3A focused domain tests | 14/14 PASS |
| Full Decision Lab | 128/128 PASS |
| D2/D2.1/D2.2/D3.1/D3-A freezes and validity | PASS |
| Fresh 30-migration canonical database boot | PASS |
| Wave 3A SQL consent/RLS acceptance | PASS |
| Complete Sprint 8–12 and Decision DB regression suite | PASS |
| DB lint reviewed baseline | PASS |
| Repository sanity / D2 scope guard / canonical secret guard | PASS |
| Shared typecheck | PASS |
| Mobile lint | PASS with 80 inherited warnings, 0 errors |
| Web typecheck/build | PASS |
| Admin typecheck/build | PASS |
| Mobile typecheck | inherited advisory baseline remains failing; no Wave 3A runtime file changed |
| Web/Admin lint | inherited advisory baselines remain failing; no Wave 3A runtime file changed |

GitHub CI is the authoritative clean-environment confirmation on the Draft PR.

## 17. Observability

The Lab can inspect the complete map and current projection including affinity, confidence, support, evidence summary, scope, decay state and versions. Product users can only read their consented derived map through `backyrd_get_my_taste_map_v1`. No raw evidence is exposed.

## 18. Versioning and Freeze

| Artifact | Version / Hash |
|---|---|
| Taste Space | `backyrd-taste-space-v1` / `000853195705c7a63fe45d5f6c3ed390dca4506b9696ba41761357379fa0e28e` |
| Evidence Model | `backyrd-taste-evidence-v1` / `b3a20a14d5731a671047e0499a83b471e572f7c9879f39fd7072bd5364b2376e` |
| Learning Engine | `backyrd-taste-learning-v1` |
| Confidence Model | `backyrd-taste-confidence-v1` |
| Decay Model | `backyrd-taste-decay-v1` |
| Projection | `backyrd-current-taste-projection-v1` |
| Contract | `a13e6293970ad1e003fbd75da5f768bb6884fe6e2216b752df6eec6b1f7e0d5a` |
| Source | `7899dff378f608120b48efae738f5d4f422c89ed4356c9b4b7abaa0d4068d0d3` |

The committed freeze fails on any silent source, contract or version drift.

## 19. Scientific Validity

Latent truth, expected utility, Oracle data and Golden labels are rejected as engine inputs. The engine processes only observed evidence. No Scenario, Ground Truth, D2.1/D2.2 contract, ranking weight or existing Decision Engine source was modified. Wave 3A performs no V13/Next-Gen recommendation-quality benchmark.

## 20. Remaining Limitations

- Product event adapters are intentionally not wired.
- Existing legacy Taste projections are not silently migrated or treated as equivalent.
- Navigation, reservation, verified visit, Review and Moment need qualified outcome contracts before activation.
- Spot Intelligence → Taste Concept mapping is not yet promoted; Wave 3B must validate it without latent leakage.
- Decay and confidence constants are transparent starting hypotheses and require Wave 3B validation.
- Consent withdrawal hides state; any future Production rollout must explicitly integrate purpose-specific erasure/export policy before launch.
- No personalized ranking consumes this map yet.

## 21. Files / Migration

- `decision-lab/src/taste-engine.mjs`
- `decision-lab/src/taste-engine-freeze.mjs`
- `decision-lab/config/taste-engine-v1.freeze.json`
- `decision-lab/test/taste-engine.test.mjs`
- `supabase/migrations/20260817103000_create_next_gen_user_taste_foundation.sql`
- `supabase/tests/decision_wave3a_taste_foundation.sql`
- `scripts/ci/validate-supabase-local.sh`
- `package.json`
- this document

## 22. Production Statement

Production is unchanged. No db push, migration repair, Product switch, Production connection or Production mutation occurred. The migration exists only as an additive forward artifact pending a future, separately authorized integration and deployment decision.

## 23. Wave 3B Readiness

Wave 3B may validate the technical model internally. It must evaluate signal calibration, User/Spot concept mapping, confidence calibration, decay, contextual projection and incremental Decision value on Development/Regression/locked Holdout without altering Ground Truth to favor the engine. Product integration remains out of scope until those gates pass.

## Final Verdicts

**WAVE 3A USER TASTE ENGINE FOUNDATION — PASS**

**USER TASTE MAP — READY**

**CONTEXTUAL TASTE FOUNDATION — READY**

**SCIENTIFIC VALIDITY — PASS**

**PRODUCTION INTEGRATION — NOT STARTED**

**WAVE 3B INTERNAL TASTE VALIDATION — READY**
