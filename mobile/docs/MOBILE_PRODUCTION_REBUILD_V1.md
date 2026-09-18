# Mobile Product Candidate V1

## Candidate boundary

The source candidate has one authenticated Product Decision path. Home free text
and the Decision tab send the strict
`backyrd.decision-vnext.product-request@1.0` contract to `decision-v13`.
Mobile renders only the server response's presentation, rank, availability,
reasons, and limitations. It has no client ranking, client-generated reason,
legacy Decision fallback, parallel Taste write, or client runtime authority.

The same route accepts strict Product interaction requests for a card that was
actually visible and for a candidate that was opened. Alternative requests and
contextual rejects remain bound to the original Decision through
`previouslyPresentedCandidateIds` and `rejectedCandidateIds`; they do not create
World facts or silently call a legacy continuation contract.

This is candidate source, not current Production truth. The Product control is
OFF by default, the Founder-special Function is disabled in source config, and
the client shows an honest unavailable state when the exact server authority is
not present.

## Startup and releases

Startup is ordered as runtime configuration, one Supabase client, one Auth
provider, font readiness, safety/consent guards, then routing. Recoverable
configuration, auth, network, and rendering failures show Product states instead
of crashing the tree.

Expo Updates does not reload JavaScript from a mounted tab. Native Expo launch
selection applies a compatible update on clean launch. Runtime `1.1.0` is bound
to accepted iOS Build 57; this candidate does not change native dependencies,
runtime configuration, native projects, or plugins.

No OTA has been created, uploaded, published, activated, or delivered for this
candidate. The authoritative readiness and NO-GO record is
`docs/operations/DECISION_VNEXT_OTA_READINESS_REPORT.md`.

## Removed active debt

- Client OpenAI implementation and EAS client-key path
- V3/V9 Decision debug and old Decision renderer dependencies
- tab-mounted `Updates.reloadAsync()`
- direct profile repair writes during auth hydration
- copied service-role Edge Functions and seed script under Mobile
- client-side direct achievement inserts

Historical backend records remain isolated and are not presented as vNext
Product history.
