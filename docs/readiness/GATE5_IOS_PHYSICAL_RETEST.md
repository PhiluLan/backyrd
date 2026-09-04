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

The pre-router buffer was merged as canonical Main
`a7039476f498ed3e39f3d49351120e4004ebf60a` and published as iOS Production
update `01a063b2-e7b4-72f9-856b-ece9e2927c0c`. Device-local Expo metadata
proved one successful launch and zero failed launches. The correctly
PID-terminated cold-start Spot flow again opened Home. Because the buffer never
received a value, this proves the Safari-confirmed cold launch is not delivered
through Expo Router's `+native-intent` callback before navigation readiness.

Local inspection of the installed Expo SDK separates two native APIs. Expo
Router 6.0.24 uses ExpoLinking's synchronous `getLinkingURL()` for iOS initial
navigation. Expo Linking also exposes React Native's asynchronous
`Linking.getInitialURL()`, which is the platform API documented and implemented
to return the URL that launched the app. The prior candidates exercised only
the synchronous Expo value and runtime listener.

The next bounded candidate removes the ineffective pre-router buffer. Once the
root navigator has a key, it reads React Native's retained initial URL exactly
once, validates it through the unchanged strict Spot/User UUID allowlist, and
replaces only when the validated target is not already active. It does not
subscribe to URL events, so foreground/background routing remains exclusively
with Expo Router. Promise rejection, empty/root, Auth, malformed, unknown, and
non-Product URLs cannot navigate through this fallback.

The exact four-file change is bound by recertification
`gate5_ios_rn_initial_url_v1`. Canonical merge, Production OTA, and the same
physical cold-start acceptance remain mandatory before Gate 5 can close.

## Native iOS handoff boundary

PR 190 was merged normally as canonical Main
`503662d074ccefba56cc45d2f986c43710987458` after all checks passed and was
published as Production iOS update
`01a063c4-17cb-7541-b951-4c57f6bffc6b`. Device-local expo-updates metadata
proved that update active, kept, and successfully launched with zero failed
launches. With the Backyrd process actually terminated by PID, Safari presented
the expected “In Backyrd öffnen?” confirmation for a real Production Spot URL,
but confirmation did not reach the requested Spot. Backyrd briefly showed a
black launch surface and Safari presented the confirmation again. No Backyrd
crash report was present on the device, and an ordinary app launch remained
healthy. The PR 190 JavaScript fallback therefore did not close the physical
Cold Start and is explicitly not the accepted Gate-5 identity.

Per the Founder/CTO stop condition, no further JavaScript router or OTA fallback
was attempted. A clean Expo SDK 54 native prebuild exposed the remaining native
boundary: the generated custom-scheme delegate returned
`super.application(...) || RCTLinkingManager.application(...)`. When the Expo
delegate reports success, Swift short-circuit evaluation prevents React
Native's URL handler from receiving that event. This behavior is consistent
with the physical evidence: Expo accepts the launch while
`Linking.getInitialURL()` has no retained Product URL to replay.

The bounded native correction evaluates both handlers before combining their
results. It adds only boolean OSLog diagnostics for launch-URL presence and the
two handler results; the URL, route payload, account data, and tokens are never
logged. The config plugin refuses the native build if Expo's generated
AppDelegate no longer matches the reviewed contract. Product URL validation
remains the existing strict Spot/User UUID allowlist, and malformed or unknown
targets remain fail-closed.

Validation completed before review:

- Mobile Product contracts: PASS;
- native URL and fail-closed regressions: 5/5 PASS;
- Mobile TypeScript and lint: PASS;
- clean Expo iOS prebuild with the patched delegate: PASS;
- unsigned Release build for generic physical iOS: BUILD SUCCEEDED.

## Root startup navigation coordination candidate

PR 196 merged normally as canonical Main
`d3eda080765fc8c779057db2fef1038c54b971da` after all Required Checks passed.
EAS Production build `a29cf871-6efd-4447-8112-16b22d9c72b2` produced signed
App Store build 55 from that exact commit. Its IPA SHA-256 is
`b8c698ca7fdac43e9afbc8c5598556bb7d966dcbe7df413983436bb76123f172`.
The build was submitted only to TestFlight for internal Gate-5 acceptance.

The first physical PID-terminated Spot launch on build 55 showed the
Naturhistorisches Museum Basel loading state and then returned to Home. This
proves the native initial-target store, pull, JavaScript revalidation and route
dispatch all completed. Source tracing identified the later writer precisely:
`app/index.tsx` initially redirects to `/gate`; `GateScreen.routeUser()` starts
the asynchronous verified-user and Product Entry checks; after the initial
Spot dispatch, that already-running call resolves `nextRoute` to `/(tabs)` and
executes `router.replace(target)`, overwriting the accepted Spot route.

The Founder/CTO-authorized candidate `a5b9b10ed1f05cbfaef492c4564296ea8997e69c`
adds one process-local startup authority around that existing writer. On iOS,
Gate waits for the native pull to select either a typed target receipt or no
target. No target permits the existing Home transition. A valid target permits
no Home write and waits for both the existing Product Entry result and Legal
Gate clearance before the existing Expo Router dispatch. Mandatory Auth,
onboarding and Legal destinations retain priority.

The coordinator stores no route, Product identifier, payload, token, history
or personal data. It uses no timeout, retry loop, persistence, extra router or
fallback and closes after default completion or acknowledged target
consumption. Mobile contracts and 23/23 routing regressions pass; TypeScript,
lint, Production release validation, clean Expo prebuild, and the unsigned
generic-device iOS Release compile also pass.

This source remains explicitly **not Production-verified**. Normal PR review
and merge, a new signed Production TestFlight build from canonical Main, and
repeated physical Cold Start plus foreground/background acceptance remain
mandatory.

The exact four-file Mobile transition is bound by recertification
`gate5_ios_native_handoff_v1`. A signed Production build and the physical
Cold Start Spot/User, foreground/background, malformed/unknown, and Push
acceptance remain mandatory before Gate 5 can close.

## Signed Production build 52 physical result

Canonical Main `ea7e8053ccab841573a3d02a4cc0e136b772ca3a` produced signed EAS
Production build 52. Its signature, Production APNs entitlement, bundle
identifier and embedded canonical source were verified before TestFlight
installation. The physical device then proved:

- foreground Spot and User links reached the exact Production records;
- background Spot and User links reached the exact Production records;
- malformed UUID and unknown target types remained on the safe Product root;
- PID-terminated Spot and User launches both opened Home instead of their
  requested records.

The native boolean-only instrumentation captured `Cold launch URL present:
true` and `Open URL handoff expo=false reactNative=true`. This disproves the
earlier short-circuit hypothesis as the complete root cause: iOS supplies the
launch URL and React Native accepts the handoff, but the cold Product route is
still lost after that boundary. Per Founder/CTO instruction, no further
JavaScript router or OTA deep-link fallback is attempted. Gate 5 remains
blocked on this P1.

The first real Push attempt also failed after a successful device
registration. Re-registering the device reproduced the failure. Credential
inspection found an existing valid Apple APNs key that was not assigned in the
active EAS Production credential set. Reassigning that same valid key restored
real Production foreground delivery without rotation, replacement, token
export or token disclosure.

Inspection then proved a separate tap-routing defect: `send-test-push` sends
the intended `/privacy-consent` target, while the Mobile router ignored every
target without `chat_id`, accepted arbitrary non-empty chat identifiers, and
could replay the persisted last response. The bounded notification correction
accepts only UUID-backed `direct_message` targets and the exact allowlisted
test-push route, rejects every other value, deduplicates response identifiers,
and clears a consumed persisted response. It does not alter the cold deep-link
path. The exact four-file transition is bound by recertification
`gate5_ios_notification_routing_v1`; canonical merge, Production OTA and the
physical background/cold Push matrix remain mandatory.

Production OTA `01a067f7-6eee-77b5-8a61-96cdc4a72a30` was verified active
on signed build 52 from the on-device Expo Updates database with one successful
launch and zero failed launches. The physical Push matrix then proved
foreground delivery, background delivery, and background tap routing to the
exact allowlisted Privacy Center target. The real Expo Push token was not read,
printed, logged, committed, documented, or transmitted outside the existing
authenticated Product delivery path.

The PID-terminated Push test delivered the notification but opened Home after
the tap. Source inspection isolated the separate defect: the notification
router consumed the persisted response without waiting for Expo Router's root
navigation key, although the existing cold Product-link router already treats
that key as the navigation-readiness boundary. Recertification
`gate5_ios_push_cold_start_readiness_v1` binds only the two-file correction and
its regression: wait for the existing root navigation key before consuming the
response, while preserving strict allowlisted target resolution, response-ID
deduplication, and persisted-response clearing. Canonical merge, Production
OTA, and physical cold-start Push re-acceptance remain mandatory.

## Founder/CTO-authorized native Cold Start probe

Production OTA after PR 193 did not alter signed build 52's native launch
boundary. Its correctly PID-terminated Push tap again opened Home. Together
with the signed-build evidence above, the one remaining Gate-5 P1 class now
covers PID-terminated Spot, User, and allowlisted Push target launches.

The authorized diagnostic candidate adds one bounded handoff trace spanning:

- native launch URL and remote-notification presence as booleans;
- native notification target category and whether Expo's existing delegate was
  called;
- React Native JavaScript-load and root-content appearance;
- initial URL / retained notification presence, allowlist result and target
  category;
- root-navigation readiness and actual one-time route dispatch.

It never logs a URL, UUID, notification identifier, payload, Push token, Auth
token, account value, or personal content. Deep-link and notification launches
have distinct log categories. The existing UUID-backed Spot/User allowlist,
exact Push-target allowlist, response-ID deduplication and consumed-response
clearing are unchanged. Unknown and malformed targets still cannot dispatch.

The native probe wraps and forwards to Expo's installed notification delegate;
it does not create another notification or navigation path. The build fails
closed if Expo changes the reviewed AppDelegate launch, delegate or URL-handoff
anchors. The exact six-file Mobile source transition is bound by recertification
`gate5_ios_native_cold_start_probe_v1`.

Pre-review validation:

- native link / notification / fail-closed regressions: 9/9 PASS;
- Mobile TypeScript: PASS;
- Mobile lint: PASS;
- clean Expo iOS prebuild: PASS;
- unsigned generic-device Release compile: PASS;
- sensitive value logging: 0.

The candidate is diagnostic, not accepted Production identity. Normal PR merge,
a signed Production build from canonical Main, and repeated physical tests are
required before any root cause or Gate-5 closure claim.

## Signed build 53 root-cause proof and bounded native handoff

PR 194 merged normally as canonical Main
5d1e5675c0aaa97f42b832b18acabb5002a4c9ae after all Required Checks passed.
EAS Production build 8bf75d59-48c7-44e8-9cfb-2127b093cf85 produced signed App
Store build 53 from that exact commit and was installed through TestFlight.

With the process terminated before every launch, the same real Production Spot
link reached Naturhistorisches Museum Basel once and fell back to Home twice.
The failed run emitted only category/boolean evidence:

- cold launch URL present: true;
- cold launch remote notification present: false;
- notification delegate probe installed: true;
- URL handoff Expo: false, React Native: true.

This proves the URL was neither absent nor rejected by React Native. It was
accepted before a stable root route existed and was not deterministically
replayed afterward. An allowlisted real Production Push delivered through the
existing secure provider path also opened Home when tapped for a terminated
process. No Push token was read, exported, printed, committed, documented or
persisted outside the existing Product contract.

The smallest correction is native and readiness-bound. It retains only the
existing strict UUID-backed spot or user URL shapes while root content is not
ready. It similarly retains only the two existing authorized Push target
shapes. React Native's own root-content appearance notification releases each
pending target after clearing it, so the target can be consumed exactly once.
A second pending value is blocked. Runtime foreground/background links retain
their existing Expo plus React Native path. Unknown, malformed, query-bearing,
fragment-bearing and non-Backyrd URLs are never retained, and unknown Push
targets continue to the existing fail-closed resolver.

The exact two-file transition is bound by recertification
gate5_ios_native_cold_start_handoff_v1. Native routing and negative regressions
pass 10/10, Product contracts pass, TypeScript and lint pass, a clean generated
iOS project compiles in unsigned Release configuration, and Production release
validation passes with 149 source files scanned. Candidate
ad1685f6e6795487c991e80e7b8e4ad27b32b945 remains explicitly not
Production-verified until normal PR merge, a new signed build from canonical
Main, and the complete repeated physical acceptance matrix.

## Native initial-target bridge candidate

Signed Production build 54 from canonical Main
`3c03fe73c1219c5f5f1a95512f440305b1c5912b` retained the prior native
diagnostics. A correctly terminated physical Cold Start recorded the authorized
Product URL at native launch and its acceptance by React Native before the root
navigator became ready, while the visible result was Home. This proves the
remaining defect is the absence of a replayable acknowledgement boundary—not
URL parsing, Product authorization, or the Expo Router destination contract.

The Founder/CTO-authorized candidate stores only a typed, already validated
initial target in process memory. Deep-Link provenance accepts only canonical
`spot` and `user` UUID targets. Notification provenance accepts only the
existing `test_push` Privacy target and canonical UUID-backed `direct_message`
target. The first target cannot be overwritten by another provenance or target.
Malformed, unknown, ambiguous, query-bearing, fragment-bearing, or otherwise
non-canonical Product URLs never enter the store.

After Product bootstrap and root-navigation readiness, JavaScript explicitly
pulls the typed target and revalidates it through the existing Product or
Notification route resolver. A native receipt permits repeated pulls before
acknowledgement but only one route dispatch. Native state is cleared only after
accepted consumption is acknowledged; duplicate acknowledgements are harmless.
The store uses no `UserDefaults`, disk persistence, route history, or Home
fallback and therefore cannot become a later-launch route.

The Swift bridge is registered through React Native's explicit Objective-C
export contract in the generated Xcode target. Runtime foreground/background
URLs and Notification responses retain their established handlers. Diagnostic
logs contain only provenance, target category, and booleans; identifiers,
payload contents, Push/Auth tokens, personal data, and secrets are excluded.

Candidate source commit:
`049b6a1b72650283acef61efefae151174f68202`; Mobile tree:
`c1e48749ca23d8dd1477b1576dde96efe5f2c13e`. This candidate is explicitly
**not Production-verified**. Normal PR review and merge, a signed Production
build from canonical Main, and repeated physical Cold Start acceptance remain
mandatory.

Pre-PR validation for this exact source commit:

- initial-target and routing regressions: 16/16 PASS;
- Mobile Product contracts: PASS;
- Mobile TypeScript: PASS;
- Mobile lint: PASS;
- Production release validation: PASS, 150 source files scanned;
- clean Expo iOS prebuild: PASS;
- generated Swift bridge, Objective-C export, and Xcode source membership:
  PASS;
- unsigned Release build for generic physical iOS: BUILD SUCCEEDED.
