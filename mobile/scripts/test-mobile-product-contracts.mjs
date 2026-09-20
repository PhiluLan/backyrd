import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const decision = read("app/(tabs)/wohin.tsx");
const retiredDecision = read("app/(tabs)/decision.tsx");
const home = read("app/(tabs)/index.tsx");
const tabs = read("app/(tabs)/_layout.tsx");
const profile = read("lib/profile.ts");
const config = read("app.config.ts");
const spotImages = read("lib/spot-images.ts");
const spotArtwork = read("components/spot/SpotArtwork.tsx");
const spotDetail = read("app/spot/[id].tsx");
const homeEvents = read("components/events/HomeEventsSection.tsx");
const eventDiscovery = read("lib/events-v1.ts");
const spotOpeningStatus = read("lib/spot-opening-status.ts");
const productDecision = read("lib/decision/productDecision.ts");
const supabaseClient = read("lib/supabase.ts");
const userFacingError = read("lib/userFacingError.ts");
const founderLiveBinding = read("lib/decision/productDecisionRelease.generated.ts");
const founderLiveControl = read("packages/product-decision-contract/src/index.mjs");
const pushNotificationRouter = read("components/PushNotificationRouter.tsx");

assert.match(decision, /invokeDecisionProduct/, "Wohin must pass through the sealed Product client boundary");
assert.match(productDecision, /freshAccessToken/, "Decision requests must carry a fresh authenticated session token to the server boundary");
assert.match(supabaseClient, /AppState\.addEventListener\("change",/, "native Auth refresh must follow foreground state");
assert.match(supabaseClient, /state === "active"[\s\S]*auth\.startAutoRefresh\(\)[\s\S]*auth\.stopAutoRefresh\(\)/, "foreground resumes refresh and background stops it");
assert.match(userFacingError, /decision_session_timeout[\s\S]*Anmeldung konnte nicht rechtzeitig erneuert werden/, "session stalls must not be mislabeled as a network outage");

function exerciseAuthLifecycle(platform) {
  const calls = [];
  const listeners = [];
  const runtime = ts.transpileModule(supabaseClient, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const modules = {
    "react-native-url-polyfill/auto": {},
    "react-native": { Platform: { OS: platform }, AppState: { addEventListener: (event, listener) => listeners.push({ event, listener }) } },
    "@supabase/supabase-js": { createClient: () => ({ auth: { startAutoRefresh: () => calls.push("start"), stopAutoRefresh: () => calls.push("stop") } }) },
    "expo-constants": { expoConfig: { extra: { supabaseUrl: "https://test.supabase.co", supabaseAnonKey: "a".repeat(32) } } },
    "./supabaseStorage": { secureStoreAdapter: {} },
  };
  vm.runInNewContext(runtime, { require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `unexpected Auth lifecycle import: ${name}`);
    return modules[name];
  }, exports: {}, process: { env: {} }, URL });
  return { calls, listeners };
}

const nativeAuth = exerciseAuthLifecycle("ios");
assert.equal(nativeAuth.listeners.length, 1, "native Auth refresh must register once");
assert.equal(nativeAuth.listeners[0].event, "change");
nativeAuth.listeners[0].listener("background");
nativeAuth.listeners[0].listener("active");
assert.deepEqual(nativeAuth.calls, ["stop", "start"], "a resumed native client must restart token refresh");
assert.equal(exerciseAuthLifecycle("web").listeners.length, 0, "the native listener must not affect web Auth");
assert.match(founderLiveBinding, /"transportFunction": "decision-v13"/, "Build-57 must retain the one deployed transport slug");
assert.match(founderLiveBinding, /backyrd\.decision-vnext\.product-request@1\.0/, "Mobile must bind the vNext request contract");
assert.match(founderLiveBinding, /backyrd\.decision-vnext\.product-response@1\.0/, "Mobile must bind the vNext Product response contract");
assert.match(founderLiveBinding, /"executionAuthorized": false/, "bound candidates must not imply runtime authority");
assert.doesNotMatch(`${productDecision}\n${founderLiveBinding}`, /EXPO_PUBLIC_.*VNEXT|AsyncStorage|clientToggle/i, "Mobile must not contain a vNext authority toggle");
assert.doesNotMatch(`${decision}\n${productDecision}\n${founderLiveControl}`, /DecisionV13|legacyBody|invokeExisting|fallbackFunction|north_star|semantic_v13|personalized_v12/, "the Mobile Decision path must contain no legacy engine contract or fallback");
assert.doesNotMatch(decision, /backyrd_record_visible_decision_impression_v1|log_decision_action_v1|recordMemoryProductAction|trackAnalyticsEvent/, "Decision must not emit legacy impression, feedback, memory, analytics or navigation writes");
assert.match(decision, /visibleWohinCandidates/, "Wohin must show the server-ranked candidates without client ranking");
assert.match(decision, /candidate\.actualAvailability/, "Product rendering must present server availability honestly");
assert.match(decision, /candidate\.reasons/, "Product rendering must present server reasons");
assert.match(decision, /response\.limitations/, "Product rendering must present server limitations");
assert.match(decision, /<FlatList[\s\S]*data=\{candidates\}/, "Wohin must present the bounded server-ranked window");
assert.match(decision, /onViewableItemsChanged/, "Candidate impressions must require actual visibility");
assert.equal((decision.match(/<TextInput\b/g) ?? []).length, 1, "Wohin has exactly one user input");
assert.match(decision, /createWohinRequest/, "Wohin must send only its fresh free-text request");
assert.match(retiredDecision, /Redirect href="\/\(tabs\)\/wohin"/, "Old Decision deep links must redirect to Wohin");
assert.match(decision, /eventType: "candidate_impression"/, "Visible Product candidates must use the same-route canonical impression event");
assert.match(decision, /eventType: "candidate_opened"/, "Product candidate opens must use the same-route canonical open event");
assert.match(productDecision, /executeDecisionProductInteraction/, "Product interactions must use the sealed single-route boundary");
assert.match(founderLiveControl, /product-decision-learning-port@1\.0/, "Learning acknowledgement must bind the canonical User port");
assert.match(spotDetail, /decisionOrigin/, "Spot Detail must identify Decision-originated navigation");
assert.match(spotDetail, /if \(!decisionOrigin\)/, "Spot Detail must suppress Decision-originated legacy writes");
assert.match(pushNotificationRouter, /Platform\.OS === "web"\) return/, "Web must not invoke native push notification APIs");
assert.doesNotMatch(decision, /create_decision_session_v1|Math\.max\(\s*82/);
assert.match(home, /pathname: "\/\(tabs\)\/wohin"/, "Home search must enter Wohin");
assert.match(tabs, /name="wohin"/, "Wohin must be visible in app navigation");
assert.match(tabs, /name="decision" options=\{\{ href: null \}\}/, "Old Decision must not be a visible tab");
assert.match(home, /auto: "1"/, "Home submission must execute Decision");
assert.match(home, /loadDiscoverySpots/, "Home must use the canonical Product-visible catalog");
assert.doesNotMatch(home, /\.from\(["']spots["']\)/, "Home must not rebuild Product visibility in the client");
assert.doesNotMatch(home, /GERADE ANGESAGT/i, "Home must not make an unsupported trending claim");
assert.match(spotImages, /distribution_trust_spot_catalog_v1/, "image discovery must reuse Product visibility");
assert.match(spotImages, /resolveCanonicalSpotImage/, "image precedence must have one canonical resolver");
assert.match(spotImages, /OWNER_ADMIN[\s\S]*BACKYRD_FALLBACK/, "only the verified header image may become the primary source");
assert.match(spotArtwork, /cachePolicy="memory-disk"/, "editorial images must use the device cache");
assert.match(spotArtwork, /onError=/, "image errors must have an explicit fallback path");
assert.match(spotArtwork, /preferredOwnerImageFailed/, "a broken preferred image must fall through to Google");
assert.doesNotMatch(tabs, /checkForUpdateAsync|fetchUpdateAsync|reloadAsync/, "Tabs must not control OTA lifecycle");
assert.doesNotMatch(profile, /\.insert\(|\.update\(/, "Mobile profile repair must remain read-only");
assert.doesNotMatch(`${decision}\n${tabs}`, /decision-debug/, "retired Decision debug route must stay absent");
assert.match(config, /checkAutomatically: "ON_LOAD"/);
assert.match(config, /BACKYRD_RELEASE_BUILD/);
assert.match(spotDetail, /spotOpeningStatusNow/, "Spot Detail must use the canonical opening-hours presentation helper");
assert.match(spotOpeningStatus, /unknown: "Öffnungszeiten unbekannt"/, "missing hours must not be presented as closed");
assert.match(spotDetail, /Backyrd zeigt keinen Öffnungsstatus/, "hours uncertainty must be explicit");
assert.match(spotDetail, /SPOT_OPENING_STATUS_COPY/, "Spot Detail must use canonical opening-status copy");
assert.match(spotDetail, /reviews\.slice\(0, 3\)/, "Spot Detail must keep the Moment preview bounded");
assert.match(spotDetail, /descriptionExpanded/, "Spot Detail must keep long descriptions collapsed initially");
assert.match(spotDetail, /hoursExpanded/, "Spot Detail must keep full weekly hours opt-in");
assert.doesNotMatch(spotDetail, /appearance="light"/, "Spot Detail must not reintroduce a light state surface");
assert.match(homeEvents, /<ScrollView[\s\S]*horizontal/, "multiple Home events must be horizontally scrollable");
assert.match(homeEvents, /events\.length === 1[\s\S]*styles\.singleCard/, "one Home event must retain the full-width card fallback");
assert.match(homeEvents, /events\.length === 0[\s\S]*Aktuell sind noch keine Events bestätigt/, "zero Home events must retain the empty state");
assert.match(homeEvents, /\.slice\(0, 8\)/, "the chronological discovery result must expose several upcoming events");
assert.match(homeEvents, /HOME_RAIL/, "Events must use the shared Home rail contract");
assert.match(homeEvents, /snapToInterval/, "Events must use the shared Home rail snap contract");
assert.match(home, /HOME_RAIL/, "Spots must use the shared Home rail contract");
assert.match(home, /snapToInterval/, "Spots must use the shared Home rail snap contract");
assert.match(home, /resolveLocationContext\(\{ purpose: "nearby_discovery", requestPermission: false/, "Home must never prompt for location merely to decorate a card");
assert.match(home, /SPOT_OPENING_STATUS_COPY/, "Home cards must present the canonical opening status");
assert.match(home, /spot\.category_name.*spot\.address/, "Home cards must fall back to the address when no current location is available");
assert.match(spotOpeningStatus, /openingSoon: "Öffnet bald"/, "opening-soon status must remain explicit");
assert.match(spotOpeningStatus, /closingSoon: "Schließt bald"/, "closing-soon status must remain explicit");
assert.match(spotOpeningStatus, /SOON_WINDOW_MINUTES = 30/, "opening-status urgency must remain bounded to 30 minutes");
assert.doesNotMatch(homeEvents, /pagingEnabled|autoplay|setInterval/, "Home rails must remain manually scrollable without autoplay");
assert.match(eventDiscovery, /\.order\("start_at", \{ ascending: true \}\)/, "Home events must remain chronologically ordered");

console.log("Mobile Product contracts passed.");
