# Research import: Google location verification

Class: FAST_PR. Owned surface: Admin research import. Existing canonical World
authoring and rebuild RPCs remain the write authority. No migration or mobile
release is required.

The authenticated Admin preview prepares a public spot-name/address query. The
existing browser Places SDK searches with `NEXT_PUBLIC_GOOGLE_API_KEY`, just like
the manual editor, and returns at most five Place IDs. The server independently
queries the existing authenticated `mobile-geocode` function with the canonical
query. Only IDs present in both responses are eligible; coordinates always come
from the server response, never from browser input. An existing stored Place ID
must also match. Results show Google Maps attribution and a verification link.

All results require explicit Admin selection because the existing geocoder does
not provide enough business metadata to prove an exact business-name match.
No match/provider failure leaves coordinates unchanged. Existing canonical or
researched coordinates are never replaced through this path.

Each candidate confirmation is HMAC-bound to the full research document, spot,
Admin actor and a fifteen-minute expiry. Commit verifies this before any write.
The pair is added as sourced latitude/longitude claims through the existing
append-only research RPC, followed by canonical rebuild and reader verification.
The Place ID is preserved in provenance, not silently reassigned on `spots`.
Per-claim RPC failures are reported; partial imports are not reported as complete.

## Deployment

No new Google key or Admin environment variable is required. Browser search uses
the existing `NEXT_PUBLIC_GOOGLE_API_KEY`; verification uses the deployed
`mobile-geocode` function and its existing Google configuration and cost limits.
The existing server-only `SUPABASE_SERVICE_ROLE_KEY` signs the confirmation.
Provider errors remain visible and do not prevent unrelated research claims from
being reviewed/imported. Browser key restrictions remain unchanged.

No production lookup or write is proven by unit tests. Live acceptance: preview
Nomad's exported research document, inspect provider result, compare its address
and position, commit an explicitly selected pair only if canonical coordinates
are absent, then verify the authoring detail and World reader. Existing locations
must instead remain unchanged with an explanation.

## Acceptance

Targeted tests cover mismatched Place IDs, existing identities, invalid coordinates,
provider failures, bounded requests, tampering, actor/document/spot binding and expiry. Admin typecheck and
the classifier-selected CI gates are required before merge.
