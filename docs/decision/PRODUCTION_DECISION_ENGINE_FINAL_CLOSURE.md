# Production Decision Engine Final Closure

Version: `backyrd-canonical-semantics-v1` / Current Moment V2 / deterministic ranking v3.

## Correctness boundary

One shared interpreter now produces Current Intent for both N3 and the v13 retrieval adapter. Free text is interpreted once; the legacy v13 fields are compatibility hints derived from that result. `Regentag` therefore cannot be known to N3 while remaining unknown to retrieval.

The live funnel is ordered as follows:

1. v12 and semantic retrieval, bounded to 20 semantic candidates and a measured fused universe.
2. Distribution filtering in v13.
3. Deterministic hard exclusions (identity, canonical place type, city, explicit open-now and explicit excluded/required place types).
4. Freeze at at most 20 eligible candidates for factual evaluation; the visible Product result remains independently bounded.
5. Canonical N4 and accepted SPOT facts.
6. Deterministic ranking and candidate-specific reason authorization.
7. Optional validated N6 reordering inside the same frozen authority hierarchy.

Hard-invalid candidates cannot consume eligible handoff positions. Production traces showed that a strong Gold match could sit at fusion position 12, so the post-eligibility evaluation window is now 20 across the runtime, service RPC and storage constraint. The benchmark produced 25 fused candidates, 17 hard-eligible candidates and a 17-candidate frozen handoff.

## Deterministic ordering

The comparator uses semantic tiers, not a tuned score. In order:

- factual disposition (`MATCHED`, `PARTIAL`, `UNKNOWN`, `CONTRADICTED`);
- factual matches/partials/mismatches;
- explicit semantic intent authority;
- preferred canonical place type;
- bounded moment/N5 signals;
- stable retrieval position.

Known mismatch is distinct from unknown. Unknown remains neutral; a known contradiction to explicit current intent cannot win merely because it has one unrelated positive fact.

Current factual support includes rain, environment, family, child age, activity, accessibility, duration, noise/quiet, social context, conversation, planning, daypart and price where the request and candidate both contain canonical evidence. Rain and indoor remain separate facts: indoor helps a rainy request, while outdoor alone is not a contradiction when rain suitability is otherwise supported.

## N6 and reasons

N6 receives exactly the eligible frozen set and exact candidate-specific reasons. The validator enforces the deterministic current-intent hierarchy even when no long-term semantic concept is present. It may reorder only within an equal authority tier. Provider failure or rejection preserves the deterministic result.

Product copy selects direct factual/current-intent reasons before personalization or generic place-type text. No reason exists without a candidate-specific N4/accepted-fact reference.

## Observability and rollback

`backyrd_decision_funnel_traces_v1` stores a minimized, service-only reconstruction of source identities/ranks, fusion, every hard exclusion, N3 facts, N4 serialization, deterministic components, authorized reason IDs, N6 disposition and final response order. It contains no raw user history or provider secrets.

Rollback is operational: disable the internal Decision/N6 capability to return to v13, or deploy the preceding Edge Function version. The additive trace table does not participate in ranking truth and needs no destructive rollback.

## Geographic boundary

The current Product contract remains exact selected city. Riehen is not silently reclassified as Basel. Metro/region expansion needs an explicit Product geography contract; it is not inferred in this closure.
