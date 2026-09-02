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

## Cold-start follow-up

The first Production OTA restored the canonical Safari-to-Spot and
Safari-to-User routes while Backyrd was running or backgrounded. A fully
terminated Backyrd process still returned to Home. Device-local expo-updates
metadata proved that the new update was active with successful launches, so
the remaining failure was not stale OTA delivery.

The delayed Auth/font bootstrap temporarily renders without the root
navigator. Expo Router therefore loses the initial route before the navigator
mounts. The follow-up retains only an already validated initial Spot/User route
in memory and consumes it exactly once when the root router mounts. Invalid or
non-Product routes cannot enter this pending contract.

Additional regression coverage proves one-time consumption, invalid-route
rejection, and the wiring between Native Intent and the root router. Physical
Cold Start is repeated after canonical merge and Production OTA.

The post-deploy Cold Start still returned to Home while the device-local
expo-updates database proved update `01a06375-051e-7846-8b6b-c87d8c3ae5c4`
was active, kept, and successfully launched with zero failed launches. This
proved that relying on Native Intent module timing alone was insufficient.

The final candidate uses Expo SDK 54's native `useLinkingURL()` source after
bootstrap, then passes that URL through the unchanged Spot/User UUID allowlist
before routing. Auth callbacks and every unknown URL continue to fall outside
the Product redirect contract. The implementation and its regression are
limited to the existing Product deep-link router and test.
