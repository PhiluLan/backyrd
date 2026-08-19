# Product Event Mapping — Sprint 1

| Existing Product source | Canonical N2 event | Meaning | Not inferred |
| --- | --- | --- | --- |
| `decision_sessions` | `decision_request` | A Decision was requested | preference or satisfaction |
| `decision_impressions` | `candidate_exposed` | Candidate was shown | interest or visit |
| authenticated spot-detail action | `spot_opened` | User opened a spot | experience or satisfaction |
| `favorites` insert/delete | `saved` / `save_removed` | stronger interest / removal | satisfaction or dislike |
| authenticated route action | `navigation_intent` | route intent | visit or satisfaction |
| `reservations` insert | `reservation_intent` | reservation intent | visit or satisfaction |
| photo-bound `smart_review_v1` | `verified_visit` | qualified experience confirmation | positive/negative satisfaction or attribute taste |

Analytics remains observability-only because it obeys separate optional analytics consent. It is not the canonical personalization source.

Decision IDs are carried when Product has them. A Decision-to-Review link says only that events may be in a journey; it does not prove that a Decision caused a visit.
