# Production Current Moment (N3)

Status: Sprint 3, staging/shadow only. Visible `decision-v13` behavior is unchanged.

## Authority and runtime

`packages/decision-input-runtime/src/current-moment.mjs` is the Product adapter. It maps real Product request data and then calls the frozen Lab `buildCurrentMoment` runtime directly. N3 is not reimplemented in Mobile, SQL, an Edge Function, or the repository adapter.

Current intent is authoritative over historical taste. Values retain the frozen N3 provenance, confidence, contradiction, and `UNKNOWN` semantics.

## Product mapping

| Product source | N3 meaning |
| --- | --- |
| `decision_sessions.city` | explicitly selected city |
| session mood text and selected moods | explicit vibe, only through the frozen vocabulary |
| `backyrd_ml_events_v1.context.rawFreeText/query` | current free-text request |
| `audience/selectedAudiences` | social context when unambiguous |
| `preferredPlaceTypes` plus strict category intent | hard required place type |
| excluded place types / explicit open-now | hard constraints |
| server request timestamp plus known city timezone | weekday, calendar, local time, daypart |

Fields the Product did not supply are not inferred merely for completeness. Budget, duration, distance willingness, planning tolerance, occasion, or audience remain `UNKNOWN` unless the frozen runtime can justify them from current observable input.

## Time and degraded behavior

Launch mappings are explicit for Basel/Zurich and Copenhagen. A Product-provided IANA timezone is also accepted. An unsupported city without a timezone fails closed because the frozen N3 runtime requires an honest local clock; it does not silently use server time.

## Parity

Golden cases cover Friends Friday drinks, Solo Afterwork, Date Evening, Family Sunday, broad unknown, explicit quiet conflict, missing audience, missing place type, conflicting fields, and Copenhagen. Product and Lab receive equivalent canonical inputs and produce exact deep equality.
