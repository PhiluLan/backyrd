import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import "./test-spot-product-presentation.mjs";
import "./test-spot-address-presentation.mjs";
import "./test-supabase-runtime-config.mjs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const decision = read("app/(tabs)/wohin.tsx");
const retiredDecision = read("app/(tabs)/decision.tsx");
const home = read("app/(tabs)/index.tsx");
const tabs = read("app/(tabs)/_layout.tsx");
const entryGate = read("app/gate.tsx");
const map = read("app/(tabs)/map.tsx");
const feed = read("app/(tabs)/feed.tsx");
const profile = read("lib/profile.ts");
const config = read("app.config.ts");
const spotImages = read("lib/spot-images.ts");
const spotArtwork = read("components/spot/SpotArtwork.tsx");
const spotDetail = read("app/spot/[id].tsx");
const reviewComposer = read("app/review/new.tsx");
const homeEvents = read("components/events/HomeEventsSection.tsx");
const eventDiscovery = read("lib/events-v1.ts");
const spotOpeningStatus = read("lib/spot-opening-status.ts");
const spotProductProfile = read("lib/spot-product-profile.ts");
const productDecision = read("lib/decision/productDecision.ts");
const supabaseClient = read("lib/supabase.ts");
const supabaseRuntimeConfig = read("lib/supabaseRuntimeConfig.ts");
const userFacingError = read("lib/userFacingError.ts");
const founderLiveBinding = read("lib/decision/productDecisionRelease.generated.ts");
const founderLiveControl = read("packages/product-decision-contract/src/index.mjs");
const pushNotificationRouter = read("components/PushNotificationRouter.tsx");
const profileScreen = read("app/(tabs)/profile.tsx");
const safetyGuard = read("components/safety/GlobalSafetyEnforcementGuard.tsx");
const analyticsProvider = read("providers/AnalyticsProvider.tsx");
const googleSignIn = read("lib/googleSignIn.ts");
const signOut = read("lib/signOut.ts");

for (const path of ["app/(tabs)/feed.tsx", "app/(tabs)/profile.tsx", "app/user/[id].tsx"]) {
  const source = read(path);
  assert.match(source, /throw new Error\("safety_visibility_unavailable"\)/, `${path} must fail closed if post or review visibility is unavailable`);
  assert.doesNotMatch(source, /visiblePostsResult\.data\)\s*\? visiblePostsResult\.data\s*:\s*postIds/, `${path} must not expose unchecked posts`);
  assert.doesNotMatch(source, /visibleReviewsResult\.data\)\s*\? visibleReviewsResult\.data\s*:\s*reviewIds/, `${path} must not expose unchecked reviews`);
  assert.match(source, /comment_count: commentCounts\.get\(post\.post_id\) \?\? 0/, `${path} must not show unchecked comment counts`);

  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = syntax.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "filterSafetyVisiblePosts");
  assert.ok(declaration, `${path} must expose a safety filter for contract testing`);
  const filterSource = `${declaration.getText(syntax)}\nexports.filterSafetyVisiblePosts = filterSafetyVisiblePosts;`;
  async function checkSafetyFilter(failingRpc) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(filterSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      module,
      exports: module.exports,
      console: { log() {} },
      supabase: { rpc: async (name, params) => {
        const kind = name === "safety_visible_entity_ids_v1" ? params.p_entity_type : name;
        if (kind === failingRpc) return { data: null, error: new Error("unavailable") };
        if (kind === "safety_visible_social_post_ids_v1") return { data: ["post-1"], error: null };
        if (kind === "review") return { data: ["review-1"], error: null };
        if (kind === "profile") return { data: ["user-1"], error: null };
        return { data: [{ post_id: "post-1", visible_count: 2 }], error: null };
      } },
    });
    const posts = [{ post_id: "post-1", review_id: "review-1", user_id: "user-1", display_name: "Person", username: "person", avatar_url: "avatar", comment_count: 99 }];
    return module.exports.filterSafetyVisiblePosts(posts);
  }
  await assert.rejects(checkSafetyFilter("safety_visible_social_post_ids_v1"), /safety_visibility_unavailable/, `${path} must hide posts on a post-safety failure`);
  await assert.rejects(checkSafetyFilter("review"), /safety_visibility_unavailable/, `${path} must hide reviews on a review-safety failure`);
  const masked = await checkSafetyFilter("profile");
  assert.equal(masked[0].display_name, "Backyrd User", `${path} must mask unverified authors`);
  const withoutCounts = await checkSafetyFilter("safety_visible_comment_counts_v1");
  assert.equal(withoutCounts[0].comment_count, 0, `${path} must suppress unverified counts`);
}
assert.match(read("app/(tabs)/feed.tsx"), /updatePostsForMode\(feedMode, \(\) => \[\]\)/, "a failed safety refresh must remove stale feed posts");
assert.match(read("app/gate.tsx"), /verifiedUserError\.status !== 401 && verifiedUserError\.status !== 403[\s\S]*throw verifiedUserError/, "a transient identity error must not log out the user");
assert.match(read("app/(tabs)/profile.tsx"), /await signOutWithPushCleanup\(\)/, "account logout must detach push before ending the session");
assert.doesNotMatch(read("app/auth/login.tsx") + read("app/auth/register.tsx"), /accounts\.google\.com\/o\/oauth2|exchangeCodeForSession/, "Google sign-in must not exchange a Google code as a Supabase code");
for (const authScreen of ["app/auth/login.tsx", "app/auth/register.tsx"]) {
  const source = read(authScreen);
  assert.match(source, /Platform\.OS === "ios" \? <AuthProviderButton provider="apple"/, `${authScreen} must show Apple sign-in on iOS`);
  assert.match(source, /Platform\.OS === "android" \? <AuthProviderButton provider="google"/, `${authScreen} must not show Google sign-in on iOS`);
}
assert.match(entryGate, /Erst einmal Orte entdecken/, "signed-out users must be able to explore before registration");
assert.match(tabs, /const isGuest = !user/, "guest navigation must identify signed-out users");
assert.match(tabs, /href: isGuest \? null : undefined/, "guest navigation must not advertise signed-in tabs");
assert.match(home, /if \(!user\) \{[\s\S]*search: normalized/, "guest home search must use public catalog rather than Decision");
assert.match(map, /spotMatchesSearch\(s, debouncedSearch, spotMoods\[s\.id\]/, "map search must include catalog context");
assert.match(map, /viewMode === "map" \? <Animated\.View/, "map preview sheet must not cover the list view");
assert.match(profileScreen, /<Modal transparent animationType="slide" presentationStyle="overFullScreen" visible=\{showEdit\}/, "profile editor must cover the tab bar");
assert.match(reviewComposer, /disabled=\{uploading \|\| !mediaReady \|\| !hasContent\}/, "empty moments must not be offered for publication");
assert.match(feed, /loadDiscoverySpots\("", 6\)/, "an empty moments feed must offer real spots, not fabricated moments");
assert.match(feed, /router\.push\("\/users\/search" as never\)/, "following empty state must open people discovery");

function loadP0Module(source, modules) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module,
    exports: module.exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `unexpected P0 dependency: ${name}`);
      return modules[name];
    },
  });
  return module.exports;
}

const authCalls = [];
const google = loadP0Module(googleSignIn, {
  "expo-web-browser": { openAuthSessionAsync: async (url, redirect) => {
    authCalls.push([url, redirect]);
    return { type: "success", url: "backyrd://auth/callback#access_token=access&refresh_token=refresh" };
  } },
  "./authDeepLink": { createSessionFromAuthDeepLink: async (url) => authCalls.push(url) },
  "./supabase": { supabase: { auth: { signInWithOAuth: async (options) => {
    authCalls.push(options);
    return { data: { url: "https://example.test/supabase/authorize" }, error: null };
  } } } },
});
assert.equal(await google.signInWithGoogle(), true);
assert.equal(authCalls[0].provider, "google");
assert.equal(authCalls[0].options.skipBrowserRedirect, true);
assert.equal(authCalls[0].options.redirectTo, "backyrd://auth/callback");
assert.equal(authCalls[1][0], "https://example.test/supabase/authorize");
assert.equal(authCalls[2], "backyrd://auth/callback#access_token=access&refresh_token=refresh");

const logoutCalls = [];
const logout = loadP0Module(signOut, {
  "./notifications": { unregisterPushNotificationsAsync: async () => logoutCalls.push("push-disabled") },
  "./supabase": { supabase: { auth: { signOut: async () => {
    logoutCalls.push("signed-out");
    return { error: null };
  } } } },
});
await logout.signOutWithPushCleanup();
assert.deepEqual(logoutCalls, ["push-disabled", "signed-out"]);
let signOutAttempted = false;
const failedLogout = loadP0Module(signOut, {
  "./notifications": { unregisterPushNotificationsAsync: async () => { throw new Error("offline"); } },
  "./supabase": { supabase: { auth: { signOut: async () => { signOutAttempted = true; return { error: null }; } } } },
});
await assert.rejects(failedLogout.signOutWithPushCleanup(), /offline/);
assert.equal(signOutAttempted, false, "a failed push detach must keep the account session for retry");

assert.match(decision, /invokeDecisionProduct/, "Wohin must pass through the sealed Product client boundary");
assert.match(productDecision, /freshAccessToken/, "Decision requests must carry a fresh authenticated session token to the server boundary");
assert.match(supabaseClient, /AppState\.addEventListener\("change",/, "native Auth refresh must follow foreground state");
assert.match(supabaseClient, /supabaseRuntimeConfig/, "the client must use the shared fail-closed runtime configuration");
assert.match(supabaseRuntimeConfig, /validPair\(native\) \?\? validPair\(update\)/, "a complete valid OTA configuration must recover an incomplete native pair");
assert.match(supabaseClient, /state === "active"[\s\S]*auth\.startAutoRefresh\(\)[\s\S]*auth\.stopAutoRefresh\(\)/, "foreground resumes refresh and background stops it");
assert.match(userFacingError, /decision_session_timeout[\s\S]*Anmeldung konnte nicht rechtzeitig erneuert werden/, "session stalls must not be mislabeled as a network outage");
for (const [name, source] of [["profile", profileScreen], ["safety", safetyGuard], ["analytics", analyticsProvider]]) {
  assert.doesNotMatch(source, /onAuthStateChange\(async\s*\(/, `${name} must not await work under the Supabase auth lock`);
  assert.match(source, /onAuthStateChange\([\s\S]*?setTimeout\(/, `${name} must defer Supabase work until after the auth callback returns`);
}
assert.match(decision, /withinIdentityDeadline\(supabase\.auth\.getUser\(\)\)/, "Wohin must bound its Auth gate");
assert.match(decision, /withinIdentityDeadline\([\s\S]*?\.from\("profiles"\)/, "Wohin must bound its profile lookup");
assert.match(decision, /Dein Profil konnte gerade nicht geprüft werden[\s\S]*Erneut prüfen/, "Wohin must expose a retryable, honest identity failure");

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
    "./supabaseRuntimeConfig": { supabaseRuntimeConfig: { valid: true, url: "https://test.supabase.co", anonKey: "a".repeat(32) } },
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
assert.match(spotDetail, /spotProductOpeningHours\(worldProfile\)/, "Spot Detail must derive hours from the manifested World profile");
const spotProfileModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(spotProductProfile, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  module: spotProfileModule,
  exports: spotProfileModule.exports,
  require: (name) => name === "./supabase" ? { supabase: {} } : assert.fail(`unexpected Spot profile import: ${name}`),
  Intl,
});
const spotProfileRuntime = spotProfileModule.exports;
const closedSunday = spotProfileRuntime.spotProductOpeningHours({
  spot: { source: "WORLD_KNOWLEDGE", regularHours: [{ day: "MONDAY", intervals: [{ start: "09:00", end: "18:00" }] }, { day: "SUNDAY", intervals: [] }] },
});
assert.equal(closedSunday.length, 2, "an explicit closed day must not be dropped");
assert.equal(closedSunday[1].day_of_week, "Sonntag");
assert.equal(closedSunday[1].open_time, "");
assert.match(spotDetail, /Heute geschlossen/, "an explicit closed day must be labeled closed, not unknown");
const confirmedHighlight = "Im IWB Unterwerk wird Craft Beer gebraut.";
assert.equal(spotProfileRuntime.presentSpotProductField({ attributeKey: "description.highlight", knowledgeState: "KNOWN_VALUE", value: confirmedHighlight }), confirmedHighlight, "a confirmed World description must retain original spelling");
assert.match(spotDetail, /worldProfile\.spot\.name/, "Spot Detail must derive its displayed identity from World Knowledge");
assert.match(spotProductProfile, /source: "WORLD_KNOWLEDGE" \| "LEGACY_COMPATIBILITY"/, "Spot profile source must be explicit");
assert.match(spotProductProfile, /profile\.spot\.source !== "WORLD_KNOWLEDGE"/, "legacy data must not be mixed into a manifested World schedule");
assert.match(spotOpeningStatus, /unknown: "Öffnungszeiten unbekannt"/, "missing hours must not be presented as closed");
assert.match(spotDetail, /Backyrd zeigt keinen Öffnungsstatus/, "hours uncertainty must be explicit");
assert.match(spotDetail, /SPOT_OPENING_STATUS_COPY/, "Spot Detail must use canonical opening-status copy");
assert.match(spotDetail, /contactActions\.map\(\(contact\) => <ContactAction/, "all available canonical contact links must remain reachable");
assert.match(spotDetail, /specialHoursList\[0\]\.date/, "the first confirmed special opening time must be visible before expansion");
assert.match(spotDetail, /<Modal animationType="slide" presentationStyle="fullScreen" visible=\{moreInfoExpanded\}/, "additional World fields must have a dedicated detail view");
assert.match(spotDetail, /presentableReviews\.slice\(0, 3\)/, "Spot Detail must keep the meaningful Moment preview bounded");
assert.match(spotDetail, /presentableReviews = reviews\.filter/, "Spot Detail must not render visually empty Moment cards");
assert.match(spotDetail, /<SafeAreaView style=\{styles\.moreInfoScreen\} edges=\{\["top", "bottom"\]\}/, "More Infos must respect device safe areas");
assert.match(spotDetail, /<SectionTitle>Rund um diesen Spot<\/SectionTitle>/, "the existing nearby rail must remain present");
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
