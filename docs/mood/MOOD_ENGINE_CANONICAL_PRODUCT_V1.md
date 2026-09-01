# Backyrd Canonical Product Mood V1

## Product contract

Mood answers one question: **“How does this place feel?”** It is a current, community-contributed qualitative perception of a Spot. It is neither User Taste, Decision Context, Offering/Purpose, N4/Spot Intelligence nor Gold/Accepted Fact.

The truthful aggregate statement is: “Across unique eligible community contributors for this Spot, the average share of their Mood-bearing visits described it with canonical Mood Y is X%.” It does not mean X% of visitors. Percentages need not sum to 100 because each Review may contain up to two Moods.

Review Mood remains optional: 0, 1 or 2 short expressions. Phase 2 does not make Mood mandatory because that Product change has not been authorized. Mood A and B have equal weight.

## Semantic model

`reviews.mood_a` and `reviews.mood_b` preserve the submitted expression. The canonical layer is additive:

1. NFC Unicode normalization, trim, whitespace collapse and case normalization.
2. Exact canonical label or approved alias lookup.
3. Known non-Mood/test/unsafe expression rejection.
4. Otherwise `UNRESOLVED`; no nearest-concept coercion and no automatic concept creation.

Stable concept identity uses keys such as `mood.cozy`; localized labels are presentation. Aliases are globally unique after normalization, so one active expression cannot resolve to two concepts. Related concepts such as `mood.loud` and `mood.lively` remain distinct. Clusters organize concepts but are neither votes nor user-facing percentages.

The initial registry contains 22 concepts, 63 governed aliases and 6 small clusters. Eleven approved German grammatical forms support the same resolver in free-text Decision queries. It reconciles the current Product vocabulary, legitimate legacy language and known production aliases without importing Offering, Purpose, objective attributes or legacy Spot mappings as community votes.

## Data ownership and current contribution

`backyrd_review_mood_expressions_v1` stores raw expression, normalized expression, resolution status and optional concept. `RESOLVED`, `UNRESOLVED` and `INVALID` are the only states. Unresolved and invalid expressions remain attributable to the historical Review but never enter the aggregate.

`backyrd_spot_mood_contributions_v1` contains at most one normalized evidence row per non-deleted user and Spot. All eligible Mood-bearing Reviews remain evidence. For each concept, `user_mood_score = Reviews containing that resolved concept / all eligible Mood-bearing Reviews for that user and Spot`. A Review without any resolved Mood does not enter the denominator; unresolved and invalid expressions do not enter a concept numerator. The latest eligible Review ID remains only a lineage anchor. Historical Reviews are not rewritten or deleted, and one frequent visitor still occupies only one community-contributor slot.

Product publication is limited to one `REAL` Review per user, Spot and `Europe/Zurich` calendar day. `backyrd_review_daily_publications_v1` reserves that key transactionally from the database clock before insert, so parallel requests cannot both publish. A second attempt returns `REVIEW_SAME_DAY_LIMIT`, leaves the existing Review untouched and creates no Mood contribution. A different day creates a new historical visit. This is a Product cadence rule, not a Safety violation.

Account deletion inherits the existing Review contract (`user_id ON DELETE SET NULL`): the historical Review and its anonymized contribution may remain, while public aggregates never expose contributor identity. The stable anonymous `contributor_key` preserves denominator integrity. This does not change the existing privacy/legal lifecycle.

## Trust and moderation

Eligibility reuses `distribution_trust_entity_is_eligible_v1(..., 'feed')` and the canonical Safety registry lifecycle. Reviews in `hidden`, `removed` or `deleted` state are excluded. Restoration to `live` rebuilds the contribution. There is no Mood trust score and no influence multiplier.

The Safety trigger runs after existing lifecycle/distribution triggers. Review writes, Safety lifecycle changes and governed resolution changes all refresh affected current contributions and rebuild affected Spot profiles.

## Canonical aggregate

`backyrd_spot_mood_profile_v1` is the sole active derived truth for community Spot Mood. Source contributions remain authoritative and rebuildable. For each concept:

- denominator: eligible unique contributors with at least one resolved Mood across their eligible visits;
- user score: concept-bearing eligible Reviews divided by all eligible Mood-bearing Reviews for that user and Spot;
- community score: sum of those user scores, so every unique user has at most total weight 1 per concept;
- percentage: `100 × community score / unique contributor denominator`, rounded to two decimals;
- rank: community score, then positive contributor count, then stable concept key.

The launch evidence threshold is 3 eligible contributors. Below 3, the internal model records `EARLY`, while the public view masks exact counts and percentage and clients show “Erste Eindrücke”. At 0, clients show an intentional invitation state. N4, Research, Owner or Admin data never fills missing community Mood.

## Product and server contracts

`packages/shared/src/contracts/mood.ts` defines max two, max 40 Unicode characters, stable profile shape, resolver states and the threshold. Server/database validation remains authoritative for stale clients and direct authenticated Review inserts. The Review Edge function accepts raw expressions, invokes the deterministic resolver, stores no client-supplied concept IDs and returns resolution results. Mobile Quick, Smart and standard Review share this path/contract and no longer create `mood_tokens`. Web has no local fixed vocabulary.

Autocomplete uses active canonical concepts and approved aliases, ordered by exact/prefix relevance and aggregate usage. It never uses User Taste. A suggestion failure does not remove the draft; server failure returns a retryable error and never fabricates a mapping.

Mobile Spot Detail, Mobile Map, Consumer Web Spot Detail and active Web cards read `backyrd_spot_mood_profile_public_v1`; clients do not compute aggregate math from Reviews. Individual Review/Moment display may still show the historical expression.

## Admin governance

The Mood Admin view exposes concepts, clusters, alias volume, aggregate usage and unresolved candidates without contributor PII. Existing Admin authorization is checked inside mutation RPCs. Admin may map an alias, approve a new concept, invalidate a term or transactionally merge a true duplicate. Actions require a reason, write an audit row, preserve raw Review history and rebuild affected profiles. Concepts with lineage are retired/merged, not hard-deleted.

## Decision boundary

Founder/CTO authorized the minimal Decision delta on 2026-08-31. `backyrd_resolve_decision_mood_query_v1` resolves explicit Mood fields and free-query aliases through the canonical taxonomy, with at most two distinct concepts. `backyrd_decision_community_mood_signal_v1` reads only `ESTABLISHED` profiles for candidates that already passed Product and Distribution eligibility. The normalized evidence component is non-negative and capped at `0.06`; low, absent, unresolved or unavailable Mood evidence is exactly neutral. It neither retrieves nor excludes Spots and does not change existing component weights.

The Decision response exposes canonical query concepts and internal evidence decomposition, but existing human reason copy is unchanged. No community claim is generated from low evidence. No N3/N4/N5/N6 implementation changed. D2.1/D2.2/D3.1 were formally re-certified through the byte-bound v6 contract; a new live Production bundle identity remains a release/canary gate.

Review Mood has no canonical path to Taste, User Card, N4, Gold or Offering. SQL regression tests snapshot those truth domains around Review submission.

## Legacy migration and deployment

The forward migration preserves Reviews, raw expressions, photos, ownership and timestamps. It classifies every non-empty slot through the resolver, builds current contributions only from actual Review evidence, and rebuilds one profile. `spot_moods`, `spot_moods_agg`, `mood_tokens`, legacy concepts/clusters and 161 semantic Spot mappings remain historical/compatibility data only; active Product readers and writers are unwired. They are not converted into community votes.

Safe deployment order is database → Review Edge/server → Web/Admin → Mobile OTA. Database triggers protect invariants from old Mobile clients. The UI changes are TypeScript/Expo JavaScript only and are OTA-compatible; no native module or native build is introduced. Keep the compatibility window only until the new Edge/Web/Mobile versions are live, then separately retire proven-dead legacy database writers.

New/changed `SECURITY DEFINER` inventory for Security CTO: read-only `backyrd_resolve_mood_input_v2` (keeps the blocked-expression registry private), service-only `backyrd_resolve_decision_mood_query_v1` and `backyrd_decision_community_mood_signal_v1`, `backyrd_enforce_review_daily_publication_v1`, `backyrd_validate_review_mood_input_v2`, `backyrd_rebuild_spot_mood_profile_v1`, `backyrd_refresh_current_mood_contribution_v1`, `backyrd_sync_review_mood_expressions_v1`, `backyrd_refresh_mood_for_safety_item_v1`, `backyrd_rebuild_all_spot_mood_profiles_v1`, `backyrd_admin_resolve_mood_candidate_v1`, and `backyrd_admin_merge_mood_concepts_v1`. Internal rebuild/trigger functions are service-role only; governance RPCs require server-side Admin authorization.
