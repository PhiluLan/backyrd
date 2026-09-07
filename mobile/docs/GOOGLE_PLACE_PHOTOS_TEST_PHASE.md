# Google Place Photos — Founder/Basel test phase

Google Place Photos are centrally disabled in
`mobile/lib/spot-photo-policy.ts`. Mobile Spot surfaces continue to render the
canonical Owner/Admin image when one exists and otherwise use the established
Backyrd fallback. The authenticated resolver, short success cache, request
deduplication, negative cache, Edge Function, rate limits, and counters remain
intact but dormant.

Re-enable Google Place Photos only by changing the reviewed
`SPOT_PHOTO_POLICY.googlePlacePhotosEnabled` value. No screen-specific switch is
required.

## Deferred

**Google Place Photos v2 — controlled re-enable before wider Basel rollout**

Before re-enabling, review the shared durable resolution strategy, per-surface
budgets, cost telemetry, attribution/compliance, refresh strategy, and Google
usage caps.
