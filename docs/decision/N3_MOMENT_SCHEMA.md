# N3 Current Moment Schema v1

Status: **IMPLEMENTED — TEMPORARY DECISION STATE**

Version: `backyrd-current-moment-schema-v1`

Parent: `backyrd-decision-system-contracts-v1`

## 1. Contract

`CurrentMoment` is immutable for one Decision. Every known dimension contains:

- controlled `value`;
- Confidence in `[0,1]`;
- source class;
- source, source ID, observed time and freshness provenance;
- reason code;
- lower-authority alternatives when present.

An absent dimension is listed in `unknownFields`. Missing evidence never becomes a negative or default value.

## 2. Dimensions

| Area | Dimension | Controlled meaning |
|---|---|---|
| social | `social_context` | solo, date, friends, family, family with kids, work, group |
| occasion | `occasion` | breakfast, lunch, afterwork, dinner, late night, celebration, tourist, business, casual |
| intent | `activity_intent` | food, drink, walk, culture, outing, activity, experience, work, broad |
| desire | `vibe` | bounded current atmosphere terms |
| desire | `energy` | low, balanced, high |
| desire | `budget_orientation` | budget, balanced, premium |
| logistics | `spontaneity` | planned, flexible, spontaneous |
| logistics | `planning_tolerance` | low, medium, high |
| logistics | `duration` | under 60m, 1–2h, 2–4h, open-ended |
| logistics | `distance_willingness` | near, moderate, far |
| environment | `environment` | indoor, outdoor, either |
| orientation | `orientation` | food, drink, activity |
| discovery | `novelty_appetite` | familiar, balanced, novel |
| social | `social_intensity` | low, medium, high |
| fact | `city` | minimized current city only |
| fact | `weekday` / `calendar` | timezone-derived weekday/weekend |
| fact | `daypart` / `local_time` | timezone-derived local clock context |
| authority | `explicit_constraints` | unchanged Structured Intent hard constraints |
| extension | `other_needs` | bounded explicit text values only |

## 3. Source classes

`EXPLICIT_CURRENT_INPUT > OBSERVED_CURRENT_FACT > INFERRED_FROM_CURRENT_REQUEST > MEMORY_SUPPORTED_HYPOTHESIS > UNKNOWN`.

Source class describes epistemic status, not ranking weight. Objective facts and desires remain separate. N5/N6 must not present a Memory hypothesis as something the User explicitly said.

## 4. Confidence

Dimension Confidence follows the supporting Evidence. Explicit fields are `1.0`; validated clock facts are `1.0`; deterministic semantic interpretations carry bounded field-specific Confidence; N2 Pattern hypotheses inherit discounted Pattern Confidence capped at `0.74`.

Overall Confidence measures sufficiency of justified core current evidence and applies a contradiction penalty. It is not a probability that the User will like a Spot.

## 5. Outputs

- `currentMoment`: full internal immutable contract;
- `desireProjection`: only current desire dimensions;
- `historySignature`: N2-compatible minimized post-Decision boundary;
- `n6Projection`: compact value/Confidence/source representation;
- `flightRecorder`: full internal Evidence lineage.

No output ranks Candidates, mutates User Intelligence or persists itself.
