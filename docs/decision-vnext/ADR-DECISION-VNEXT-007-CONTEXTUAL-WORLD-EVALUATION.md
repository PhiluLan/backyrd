# ADR 007 — Contextual World evaluation in the Phase-3C Founder Lab

Status: accepted for local Founder evaluation only. Production authorization: false. Product-ranking authorization: false.

## Decision

The Founder Lab consumes Registry-2.1 context only through `backyrd.decision-vnext.founder-lab-contextual-world-policy@3c-1`. A compatible `purpose.primary_visit` is required for confirmed core-intent coverage. `offering.onsite` is always additional information and cannot confirm a core intent, including when its relationship is `EMBEDDED_FACILITY`.

Conditional visit situations may produce situation evidence. Atmosphere and typical dayparts are soft context only. Neither can make a candidate ineligible. Typical dayparts never imply that a venue is open; regular and special hours continue through the existing versioned opening-state evaluator. Every state preserves `UNKNOWN`, `NOT_CONFIGURED`, `NOT_APPLICABLE`, `INCOMPATIBLE` and `DISPUTED` rather than collapsing them.

## Consequences

- `ELIGIBLE_CONFIRMED` requires confirmed primary-purpose coverage, the target location and every hard constraint.
- Confirmed candidates are displayed before unknown fallbacks as an evaluation grouping, not a Product ranking.
- A conflicting context claim is visible and has no automatic winner.
- Policy mappings contain no Founder spot ID or name.
- World and User contracts stay canonical; the Lab adds no parallel domain contract and writes neither domain.
- The policy, assessments, results and release are content-addressed and replayed deterministically.

## Deferred

Production mappings, complete intent/context taxonomies, Product ranking, weights, confidence calibration, Runtime wiring, persistence and rollout remain unconfigured.
