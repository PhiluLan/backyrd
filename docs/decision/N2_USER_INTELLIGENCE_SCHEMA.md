# N2 User Intelligence Graph Schema

Status: **IMPLEMENTED — FOUNDATION ONLY**

Version: `backyrd-user-intelligence-schema-v1`

## 1. Relational graph

N2 uses a relational Evidence graph rather than a separate graph database:

`User → Memory Events → Spot/Context Evidence → Taste Beliefs → Place Types/Contexts → Behavioral Patterns → Outcomes`

The graph is reconstructed through stable IDs, scoped rows, Evidence fingerprints and versioned derived state. This supports deletion, audit, indexes and deterministic replay without new infrastructure.

## 2. Nodes and edges

| Area | Canonical storage/output | Meaning |
|---|---|---|
| User | `user_id` | private subject boundary |
| Memory | `backyrd_memory_events_v1` | immutable facts and provenance |
| Taste | existing `backyrd_user_taste_map_v1` | validated Global, Place-Type and Contextual beliefs |
| Pattern | `backyrd_user_behavior_patterns_v1` | repeated Occasion/behavior signature |
| State | `backyrd_user_intelligence_state_v1` | rebuild watermark, lifecycle and fingerprints |
| Timeline | bounded query over Memory plus Lab-derived transitions | why Backyrd believes something today |

Taste concepts remain the 45 controlled Wave-3B.1 concepts. No Taste weights, confidence formula, decay model or projection authority changed.

## 3. Behavioral/Occasion Pattern v1

A candidate signature requires at least two dimensions. A `KNOWN` Pattern requires prospectively:

- at least three independent sessions;
- at least two independent Spots;
- at least two Outcome-supported Events;
- at least seven days of Evidence span;
- bounded Confidence of at least `0.55`.

Confidence combines independent sessions, Spots, Outcome support, time span, consistency and Recency. Raw Event count alone cannot promote a Pattern. Insufficient Evidence remains `UNKNOWN`. Positive and negative support and contradiction rate remain visible.

These thresholds are foundation safeguards, not a claim of Product-quality optimization; N2 introduces no behavioral ranking influence.

## 4. User knowledge lifecycle

`COLD`, `EARLY`, `DEVELOPING`, `MATURE`, `LONG_TERM` and `UNKNOWN` express Evidence state, not User value. Independence gates prevent same-session flooding from becoming maturity or certainty. On withdrawal, state becomes unavailable and all N2-derived rows are removed.

## 5. Confidence and contradictions

Taste Confidence remains owned by the frozen Wave-3B.1 engine. Pattern Confidence has its own version and must not be interpreted as the same probability. Conflicting cozy/lively or positive/negative Evidence is retained in scoped rows and Pattern contradiction fields; N2 does not flatten it into “medium.”

## 6. Cross-city portability

Global, Place-Type, Contextual Taste and Behavioral Patterns contain no city requirement. A Basel history produces the same Taste hash when queried for Copenhagen. Local city is provenance/context only. N4 supplies local Spot Intelligence; N5 later selects Decision-relevant User knowledge.

## 7. N3 and N5 boundaries

- N3 creates the full immutable current Moment. N2 only accepts a minimized post-Decision signature.
- N2 exposes a bounded User Intelligence query by concept/scope.
- N5 must decide what is relevant, apply its privacy/token budget and build the `RelevantUserProjection`.
- N2 sends no User data to an LLM and does not implement ranking.

## 8. Observability

Internal Lab/debug access can reconstruct Event summaries, Evidence families, Taste scopes, Patterns, Confidence, contradictions, Recency, Drift, provenance, versions and timeline. Public contracts do not expose raw Memory, raw history or private Trust data.
