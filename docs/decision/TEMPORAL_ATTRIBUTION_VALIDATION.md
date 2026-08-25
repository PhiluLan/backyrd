# Temporal Attribution Validation

## Automated acceptance

- UNKNOWN N4 → Passt → later rich N4: no new historical Taste input.
- Known cozy/social N4 → Passt → later lively/not-cozy N4: input and User Card hash remain identical.
- Friends + requested evening survive rebuild; ambient morning remains separate and cannot override.
- Old unpinned feedback fails closed even when current N4 is supplied.
- One Passt keeps one Decision/session identity across all evaluated concepts.
- Only frozen 45-registry concepts cross the envelope.
- Trace persistence writes the frozen Decision trace before the adjacent immutable evidence envelope.
- Worker retry and response-loss reconciliation remain green.
- SQL transaction test covers service-only access, immutable UNKNOWN envelope, Product feedback → N2, and persisted moment signature.

## Frozen-boundary proof

No file in the frozen Decision/N5 learning engines is changed. N5 freeze verification remains valid. Ranking, confidence thresholds, independence, negative guards, 45 Taste Concepts and 60 N4 dimensions are unchanged.

## Failure behavior

| Failure | Disposition |
|---|---|
| Decision package unavailable | `DECISION_PACKAGE_UNAVAILABLE` |
| Event-time N4 unknown/missing | `NO_EVENT_TIME_N4` |
| No allowed Taste concept | `NO_TASTE_AUTHORIZED_CONCEPTS` |
| Historical envelope absent | `UNPINNED_HISTORICAL_FAIL_CLOSED` |
| Context cannot support outcome scope | `SCOPE_NOT_IDENTIFIABLE` |
| Non-Taste exposure/request/correction | explicit no-Taste disposition |

Processing disposition, evidence count, runtime version, source watermark and resulting snapshot are committed atomically. Duplicate feedback, worker retry and response loss remain idempotent through existing event/outbox keys and snapshot persistence.

## Production validation rule

Do not rebuild backyrdBuddy manually. After deployment, verify schema/functions and worker health read-only. The next human lifecycle test may then create one new Decision, browse neutrally and press Passt once; the new event must contain a non-empty requested moment and an exact Decision-time candidate envelope.

