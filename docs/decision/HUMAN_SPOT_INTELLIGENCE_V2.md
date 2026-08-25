# Human Spot Intelligence V2

## Boundary

Human Spot Intelligence V2 is a Founder/Admin authoring layer. Its archetype answers one question: **which human questions are most useful for this kind of place?** It is not Spot truth and never enters ranking.

The truth chain remains:

`human question + stable option ID → server whitelist → Accepted Fact → qualification → one atomic N4 rebuild → Decision package`

No Human V2 answer table stores a second semantic truth. Existing Accepted Facts remain authoritative and are projected back into the human controls. Copy, ordering and grouping can change without changing stable question or option semantics.

Frozen contracts remain unchanged: 45 Taste Concepts, 60 N4 dimensions, Decision ranking, N3, N5, N6 and User Intelligence formulas.

## Human model

The editor separates:

- identity: what kind of place this is;
- purpose/activity: what people actually do there, where the frozen catalog supports it;
- fit: audience and qualitative time suitability;
- experience: atmosphere, indoor/outdoor, weather, noise, conversation and duration;
- practical conditions: planning, family, age and observable accessibility features.

The normal UI never exposes fact keys, N4 dimensions, confidence controls or raw enum values. Unknown is explicit. Negative suitability requires a deliberate selection; unchecked never means negative.

## Archetypes and relevance

The registry supports Brewpub, Bar, Cocktail Bar, Wine Bar, Restaurant, Café, Bakery, Nightlife, Museum, Cultural Venue, Zoo, Indoor/Outdoor Activity, Boulder/Climbing, Sport, Park/Garden, Viewpoint/Landmark, Hotel, Retail, Event Venue, Multi-purpose and Unknown.

Primary and secondary archetypes are authoring-only metadata. An explicit Founder choice wins; otherwise a deterministic adapter uses accepted activity facts and the existing category. Hybrid question sets merge by stable question ID, so common questions appear once.

All archetypes receive the cross-cutting core: audience, daypart, atmosphere, environment, rain, noise, conversation, duration, planning, family, age and accessibility. The mixed V1 activity wall is shown only for activity/culture archetypes, with its options filtered to relevant groups.

## Registry and mapping

`backyrd_human_spot_questions_v2` is the server-authoritative, machine-testable question registry. Each row records human copy, control type, archetype relevance, stable options, destination class, canonical fact key, role class and actual Engine consumers. Every active option is one of `CANONICAL_WRITE`, `DISPLAY_METADATA`, `PROPOSAL_ONLY` or `NON_CANONICAL_NOTE`; V2 currently activates only verified canonical writes.

The client submits question IDs and typed values. The server rejects unknown questions, wrong sections, hidden archetype questions, values outside the option whitelist, forged fact keys, source authority and scope.

## Save flow

Founder/Admin saves one section. `backyrd_human_spot_save_section_v2` validates role and optimistic N4 version, creates one provenance source, supersedes conflicting active facts without deleting history, writes all section facts in one transaction, rebuilds N4 once and returns the refreshed authoring profile. A persisted-count mismatch is never shown as success. Idempotency makes retry/response-loss safe.

SPOT answers can become accepted truth. EVENT, PROGRAM and TEMPORARY answers remain proposals and do not contaminate general Spot truth. Public Owner V2 remains disabled; the role metadata provides an Owner-compatible foundation without activation.

## Summary and readiness

“So versteht Backyrd diesen Ort” is deterministic and uses only active, SPOT-scoped Accepted Facts. Every clause comes from place identity, accepted activity, audience or atmosphere facts. There is no AI call and no editable prose truth.

Human readiness is separate from canonical Gold. It measures answered questions relevant to the authoring archetype, treats explicit Unknown as known uncertainty, ignores hidden irrelevant questions and provides clickable missing-information actions. It does not enter ranking and canonical Gold semantics remain unchanged.

## Roles and commercial isolation

- Founder/Admin: full V2 authoring through server authorization.
- Owner Basic/Pro: registry classification exists for a later rollout; public V2 is OFF.
- Owner subscription status is absent from Accepted Facts, N4, factual tiers, reasons and ranking.
- Research proposals remain separate, auditable suggestions and Research scale-up remains paused.

## Known limitations

The frozen model strongly represents place type, activity, audience, vibe, environment, weather, time, age, planning and accessibility. It does not yet provide honest structured Offering/Purpose facts for beer, craft beer, own-brewed beer, concrete food service, apéro or afterwork. V2 displays that limitation rather than mapping these concepts to unrelated vibes. See `HUMAN_SPOT_INTELLIGENCE_V2_1_SEMANTIC_GAPS.md`.
