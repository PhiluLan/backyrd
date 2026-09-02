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

The Production OTA for that candidate then exposed the remaining deterministic
root cause: a valid cold-start Spot link stayed on `Backyrd startet`, while an
ordinary cold start completed immediately on the same device and OTA. Native
expo-updates logs showed a successful launch with no asset, update, or crash
failure. The root layout was returning the bootstrap loading view *instead of*
mounting Expo Router's root navigator until both fonts and the persisted Auth
session had loaded. Initial iOS URL routing cannot complete reliably while that
navigator is absent.

The bounded correction mounts the existing root navigator immediately and
keeps the existing Auth, Safety, Legal, Analytics, Product-link, and Push
components in the same provider/guard hierarchy. The unchanged Product loading
and font-error states are rendered as a blocking full-screen overlay until
bootstrap completes. No route allowlist, authentication, authorization, legal,
safety, Product, Decision, Mood, database, or Supabase runtime semantics change.
Regression coverage binds navigator-before-routing order, rejects the former
early-return bootstrap, and retains all malformed/unknown URL fail-closed tests.

The exact two-file Mobile source change is bound by recertification
`gate5_ios_root_bootstrap_v1`. Canonical merge, Production OTA, and the final
physical foreground/background/cold-start Spot/User and Push acceptance remain
required before this Gate can close.

## Root-navigation readiness follow-up

An initial diagnostic appeared to show a normal-start regression after the root
navigator change. That conclusion was invalid: Apple `devicectl process
terminate` requires `--pid`; the prior command supplied a bundle identifier and
its failure had been discarded, so subsequent launches only reactivated the
already stuck process. After termination by the verified Backyrd PID, the same
Production OTA completed a normal cold start to Home. The temporary
Safety/Legal `enabled` change from `gate5_ios_bootstrap_guard_order_v1` therefore
had no proven defect basis and is fully reverted in the next candidate.

The correctly terminated cold-start Spot flow then exposed the actual remaining
failure: the strict Spot route was resolved, but `ProductDeepLinkRouter` called
`router.replace` before Expo Router had assigned a key to the root navigation
state. Foreground and background flows passed because that state was already
ready; cold start entered the global render-error boundary.

The bounded correction keeps the root navigator mounted during bootstrap but
defers the validated redirect until `useRootNavigationState().key` exists. The
pending URL remains available and still passes the unchanged Spot/User UUID
allowlist. The existing Auth, Safety, Legal, and foreground-refresh behavior is
restored byte-for-byte to the root-bootstrap candidate.

The exact five-file transition, including full removal of the unneeded guard
experiment, is bound by recertification `gate5_ios_navigation_ready_v1`.
Canonical merge, Production OTA, and the final physical acceptance remain
required before Gate 5 can close.

The navigation-key candidate still entered the global error boundary on a
correctly PID-terminated cold-start Spot link. This isolated the collision to
the two independent Product redirects: Expo Router's canonical
`+native-intent` had already returned the validated Spot route, while
`ProductDeepLinkRouter` later issued a second `replace` for the same launch URL.
Foreground/background happened to tolerate the redundant replacement; the
initial navigation transaction did not.

The final bounded candidate removes the entire duplicate runtime router and its
in-memory handoff. `+native-intent` is now the single Product URL authority: it
keeps Auth callbacks first, accepts only UUID-backed Spot/User routes, and sends
all malformed or unknown routes to the existing gate. The root navigator still
mounts during bootstrap behind the blocking loading overlay, so the canonical
initial route has a navigator immediately. Regression coverage proves the
single-path wiring, bootstrap mount, and every prior fail-closed URL case.

This exact five-file simplification is bound by recertification
`gate5_ios_single_native_intent_v1`. Final acceptance remains canonical merge,
Production OTA, and physical foreground/background/cold-start verification.

The single-native-intent candidate was merged as canonical Main
`5257b0ec4a72824adedfdb5ffca2651088ae885d` and published as iOS Production
update `01a063a1-cd1c-70f4-8632-7f6f5caf2dc5`. Device-local Expo metadata
proved one successful launch and zero failed launches. Physical foreground Spot
and background User links reached the correct Production records. A correctly
PID-terminated cold-start Spot link no longer crashed, but opened Home instead
of the requested Spot. Therefore that candidate is explicitly not the Gate-5
accepted Mobile identity.

Inspection of the installed Expo Router implementation explains the remaining
iOS-only gap: its initial URL path uses the synchronous native linking value,
while an iOS custom-scheme launch may expose the URL after that initial state
has already fallen back to the app root. The runtime URL listener remains the
correct authority for an already-mounted app, but the cold launch event can
arrive before a usable root navigation state and is then not replayed.

The bounded follow-up captures only the immutable `Linking.getLinkingURL()`
value from the component's first render. After the root navigation state has a
key, it replays a strict UUID-backed Spot/User target at most once and only when
that target is not already active. It does not subscribe to runtime URLs, so it
cannot compete with Expo Router for foreground/background events. Unknown,
malformed, Auth, notification, and non-Product routes are outside this fallback.

The exact three-file change is bound by recertification
`gate5_ios_cold_launch_fallback_v1`. Canonical merge, Production OTA, and the
same physical cold-start acceptance remain mandatory before Gate 5 can close.

That fallback was merged as canonical Main
`bd22a69527726275e4c33afa7db52400470306ad` and published as iOS Production
update `01a063aa-8cb1-7d0e-81d8-d0c04ed2338b`. Device-local Expo metadata
proved one successful launch and zero failed launches. A correctly
PID-terminated cold-start Spot link still opened Home: by first component
render, `Linking.getLinkingURL()` had already reverted to the root URL. This
candidate is therefore explicitly not the Gate-5 accepted Mobile identity.

The observed ordering narrows the loss boundary to the interval in which
`+native-intent` receives a non-initial iOS URL event but the root navigator has
no key. The next candidate records a strict UUID-backed Spot/User route only in
that interval. The root router atomically marks itself ready and consumes the
pending route once. After readiness, remembering becomes a no-op and Expo
Router remains the sole foreground/background URL owner. Component unmount
marks the handoff unavailable again; malformed, unknown, Auth, notification,
and non-Product routes cannot enter the buffer.

Regression coverage now proves the state transition directly: pre-ready route
is delivered once; the same API is inert while ready; a later pre-ready route
is accepted only after teardown; and the existing strict URL rejection matrix
is unchanged.

The exact four-file change is bound by recertification
`gate5_ios_prerouter_intent_buffer_v1`. Canonical merge, Production OTA, and the
same physical cold-start acceptance remain mandatory before Gate 5 can close.
