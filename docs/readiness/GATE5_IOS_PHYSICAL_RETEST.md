# Gate 5 — Production iOS Physical Retest

Date: 2026-09-02  
Device: physical iPhone 16, iOS 26.6.1  
Production app: `com.philipplanger.backyrd`, version 1.1.0, build 50

## Reproduced defect

A cold-start OS launch with a valid real-Production Spot URL returned to Home
instead of opening the Spot. The Native Intent handler redirected every
`backyrd://` URL through `/gate` before product-route evaluation. The existing
User profile route was not an accepted Native Intent target.

## Authorized remediation scope

The remediation is limited to the public Spot and User deep-link contracts.
Both accept only canonical UUID-backed targets. Unknown routes, malformed IDs,
additional path segments, non-Backyrd web URLs, and malformed URLs fail closed
through the existing gate. Auth callback handling remains before product-route
handling and is unchanged.

The exact Mobile source change is bound by recertification
`gate5_ios_deep_link_routing_v1` in the Production Product Lineage manifest.
Decision, Mood, database, Supabase runtime, and other Product semantics are
unchanged.

## Validation before Production deployment

- physical cold-start reproduction against the prior Production OTA: FAIL as expected;
- canonical Spot link shapes: PASS;
- canonical User link shapes: PASS;
- malformed and unknown link regression: PASS, fail closed;
- Mobile Product contracts: PASS;
- Mobile TypeScript: PASS;
- Mobile lint: PASS;
- Mobile Production release validation: PASS.

Post-merge Production OTA identifiers and the final foreground/background/
cold-start physical results are recorded after canonical deployment.
