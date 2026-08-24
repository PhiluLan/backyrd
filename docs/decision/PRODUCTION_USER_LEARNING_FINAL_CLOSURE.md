# Production User Learning Final Closure

Status: Production active on 24 August 2026. The frozen 45 Taste concepts and all learning formulas are unchanged.

## What was repaired

- N4 Spot Intelligence is classified against the frozen Taste registry before it can become User evidence. All 60 N4 dimensions now have one authority: `ALLOWED_TASTE_CONCEPT`, `FACT_ONLY`, `CONTEXT_ONLY`, `OCCASION_ONLY`, `PLACE_TYPE_ONLY`, or `NOT_USER_LEARNABLE`.
- `Passt` and `Nicht passend` are persisted as decision- and candidate-bound N2 outcomes. A correction supersedes the earlier outcome for that moment; `Nicht passend` is not durable dislike.
- Candidate exposure is created from the server-authoritative visible continuation page, not from the internal frozen candidate universe.
- Current standard Reviews create Experience with Satisfaction `UNKNOWN`. Smart Reviews keep the existing verified-visit contract. Controlled Review Moods are interpreted only by the frozen canonical Mood contract.
- Profile and Decision onboarding persist bounded `SELF_DECLARED` N2 evidence. Removal is a correction, not negative evidence.
- Consent, rather than the temporary internal Decision/N6 allowlist, governs N2 and User Card processing. Decision/N6 rollout controls remain unchanged.
- Existing work failed solely by `unknown_spot_evidence_concept` is safely requeued. No event is inserted and no historical source is reinterpreted.

## Current Product-to-N2 contract

| Product action | N2 event | Learning authority |
|---|---|---|
| Decision request | `decision_request` | Context only |
| Visible suggestion | `candidate_exposed` | Exposure only |
| Spot open | `spot_opened` | Bounded interest |
| Save / remove save | `saved` / `save_removed` | Interest / correction |
| Route / reservation | `navigation_intent` / `reservation_intent` | Intent, not satisfaction |
| Verified/Smart Review | `verified_visit` | Experience; satisfaction only when explicitly qualified |
| Canonical standard Review | `verified_visit` | Experience; satisfaction unknown by default |
| Passt | `exact_mood_feedback` | Fit for this Decision moment |
| Nicht passend | `not_there` | Moment correction; never automatic durable dislike |
| Profile/Decision onboarding | `onboarding_preference` | Weak `SELF_DECLARED` authority |

## Safety

All writes remain server-authorized and idempotent. Feedback requires the authenticated owner of the Decision and an actually visible candidate. Consent withdrawal and account deletion purge/abort processing and cannot resurrect a card. No raw Review text or private history is sent to N6.

Deployment: migration `20260824170000_restore_production_user_learning_loop_v1.sql`; Edge Function `decision-engine-worker` v36.
