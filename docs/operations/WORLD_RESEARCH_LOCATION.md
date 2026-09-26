# Research import: Google location verification

Class: FAST_PR. Owned surface: Admin research import. Existing canonical World
authoring and rebuild RPCs remain the write authority. No migration or mobile
release is required.

The authenticated Admin preview looks up the existing `spots.google_place_id`
through Place Details, or uses a bounded (five-result) Text Search if no ID is
stored. The query contains only the public spot name, street, city and country.
Google responses are shown with Google Maps attribution and a verification link.

Only one operational result with an exact normalized name, street/house number,
city and country is preselected. A different existing legacy position suppresses
automatic selection. All other returned matches require explicit Admin selection;
no match/provider failure leaves coordinates unchanged. Existing canonical or
researched coordinates are never replaced through this path.

Each candidate confirmation is HMAC-bound to the full research document, spot,
Admin actor and a fifteen-minute expiry. Commit verifies this before any write.
The pair is added as sourced latitude/longitude claims through the existing
append-only research RPC, followed by canonical rebuild and reader verification.
The Place ID is preserved in provenance, not silently reassigned on `spots`.
Per-claim RPC failures are reported; partial imports are not reported as complete.

## Deployment

Admin server needs `GOOGLE_PLACES_API_KEY` with Places API (New) access plus its
existing server-only `SUPABASE_SERVICE_ROLE_KEY`. Never reuse a browser-restricted
public key as a server credential. Missing configuration is visibly reported and
does not prevent unrelated research claims from being reviewed/imported.

No production lookup or write is proven by unit tests. Live acceptance: preview
Nomad's exported research document, inspect provider result, compare its address
and position, commit an explicitly selected pair only if canonical coordinates
are absent, then verify the authoring detail and World reader. Existing locations
must instead remain unchanged with an explanation.

## Acceptance

Targeted tests cover exact/ambiguous/wrong address, city, country and Place ID,
closed results, invalid coordinates, provider/configuration failures, bounded
requests, tampering, actor/document/spot binding and expiry. Admin typecheck and
the classifier-selected CI gates are required before merge.
