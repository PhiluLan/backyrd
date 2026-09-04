import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/native-intent-route.ts", import.meta.url),
  "utf8",
);
const nativeIntentSource = fs.readFileSync(
  new URL("../app/+native-intent.tsx", import.meta.url),
  "utf8",
);
const rootLayoutSource = fs.readFileSync(
  new URL("../app/_layout.tsx", import.meta.url),
  "utf8",
);
const coldStartRouterSource = fs.readFileSync(
  new URL("../components/ColdStartProductDeepLinkRouter.tsx", import.meta.url),
  "utf8",
);
const nativeInitialTargetSource = fs.readFileSync(
  new URL("../lib/native-initial-target.ts", import.meta.url),
  "utf8",
);
const gateSource = fs.readFileSync(
  new URL("../app/gate.tsx", import.meta.url),
  "utf8",
);
const legalGateSource = fs.readFileSync(
  new URL("../components/consent/LegalGateGuard.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { resolveProductDeepLink } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const spotId = "eaf1527a-e193-4982-bef4-aa599ee70daa";
const userId = "15541483-7467-4e16-af26-901d000e74d2";

test("accepts the canonical spot and user deep-link shapes", () => {
  assert.equal(resolveProductDeepLink(`backyrd://spot/${spotId}`), `/spot/${spotId}`);
  assert.equal(resolveProductDeepLink(`backyrd:///spot/${spotId}`), `/spot/${spotId}`);
  assert.equal(resolveProductDeepLink(`/spot/${spotId}`), `/spot/${spotId}`);
  assert.equal(resolveProductDeepLink(`backyrd://user/${userId}`), `/user/${userId}`);
  assert.equal(resolveProductDeepLink(`backyrd:///user/${userId}`), `/user/${userId}`);
  assert.equal(resolveProductDeepLink(`user/${userId}`), `/user/${userId}`);
});

test("fails closed for unknown, malformed, and ambiguous routes", () => {
  const rejected = [
    "backyrd://messages/secret",
    "backyrd://spot/not-a-uuid",
    `backyrd://spot/${spotId}/extra`,
    `backyrd://user/${userId}/extra`,
    "backyrd://attacker.example/spot/eaf1527a-e193-4982-bef4-aa599ee70daa",
    "https://example.com/spot/eaf1527a-e193-4982-bef4-aa599ee70daa",
    "backyrd://%",
    "",
  ];

  for (const value of rejected) {
    assert.equal(resolveProductDeepLink(value), null, value);
  }
});

test("revalidates typed native envelopes before Product navigation", () => {
  assert.match(nativeInitialTargetSource, /typeof receipt !== "string"/);
  assert.match(nativeInitialTargetSource, /!UUID_PATTERN\.test\(receipt\)/);
  assert.match(nativeInitialTargetSource, /provenance === "deep_link"/);
  assert.match(nativeInitialTargetSource, /targetType === "spot" \|\| targetType === "user"/);
  assert.match(nativeInitialTargetSource, /provenance === "notification"/);
  assert.match(nativeInitialTargetSource, /targetType === "direct_message"/);
  assert.match(nativeInitialTargetSource, /targetType === "test_push"/);
  assert.match(nativeInitialTargetSource, /identifier === "\/privacy-consent"/);
  assert.match(nativeInitialTargetSource, /resolveProductDeepLink/);
  assert.match(nativeInitialTargetSource, /resolveNotificationRoute/);
  assert.match(nativeInitialTargetSource, /return null;/);
  assert.doesNotMatch(nativeInitialTargetSource, /UserDefaults|AsyncStorage/);
});

test("uses native intent for runtime links and an acknowledged iOS initial target", () => {
  assert.match(
    nativeIntentSource,
    /const productDeepLink = resolveProductDeepLink\(rawPath\)/,
  );
  assert.match(
    nativeIntentSource,
    /if \(productDeepLink\) \{[\s\S]*?return productDeepLink;/,
  );
  assert.match(coldStartRouterSource, /useRootNavigationState\(\)/);
  assert.match(coldStartRouterSource, /pullNativeInitialTarget\(\)/);
  assert.match(coldStartRouterSource, /resolveNativeInitialTargetRoute\(target\)/);
  assert.match(coldStartRouterSource, /acknowledgeNativeInitialTarget/);
  assert.match(coldStartRouterSource, /acceptedNativeReceipts\.has\(target\.receipt\)/);
  assert.match(coldStartRouterSource, /duplicate dispatch blocked=true/);
  assert.match(coldStartRouterSource, /if \(Platform\.OS === "ios"\)/);
  assert.match(coldStartRouterSource, /initial-url present=/);
  assert.match(coldStartRouterSource, /dispatch target=/);
  assert.doesNotMatch(coldStartRouterSource, /console\.log\([^\n]*rawUrl/);
  assert.match(
    coldStartRouterSource,
    /Non-iOS clients retain the established initial-URL contract[\s\S]*?Linking\.getInitialURL\(\)/,
  );
  assert.match(
    coldStartRouterSource,
    /if \(initialRoute && pathnameRef\.current !== initialRoute\)/,
  );
  assert.doesNotMatch(coldStartRouterSource, /useLinkingURL/);
  assert.doesNotMatch(coldStartRouterSource, /getLinkingURL/);
  assert.doesNotMatch(coldStartRouterSource, /addEventListener/);
  assert.doesNotMatch(
    rootLayoutSource,
    /if \(!fontsLoaded \|\| authLoading\) return/,
  );
  assert.ok(
    rootLayoutSource.indexOf("<RootStack />") <
      rootLayoutSource.indexOf("<ColdStartProductDeepLinkRouter ready={bootstrapReady} />") &&
      rootLayoutSource.indexOf("<ColdStartProductDeepLinkRouter ready={bootstrapReady} />") <
      rootLayoutSource.indexOf("<PushNotificationRouter />"),
    "the root navigator must mount before runtime routing effects run",
  );
  assert.match(coldStartRouterSource, /if \(!ready \|\| !rootNavigationState\?\.key\) return/);
  assert.match(rootLayoutSource, /StyleSheet\.absoluteFillObject/);
});

test("gives one startup authority priority over the asynchronous default Home writer", () => {
  assert.match(coldStartRouterSource, /selectTarget\(target\.receipt\)/);
  assert.match(coldStartRouterSource, /waitForTargetDispatch/);
  assert.match(coldStartRouterSource, /selectNoTarget\(\)/);
  assert.match(gateSource, /await rootStartupNavigationAuthority\.waitForSelection\(\)/);
  assert.match(gateSource, /target === "\/\(tabs\)" && startupSelection\.kind === "target"/);
  assert.match(gateSource, /allowProductTargetFromEntryGate\(\)/);
  assert.match(gateSource, /completeDefaultStart\(\)/);
  assert.match(legalGateSource, /setLegalState\("clear"\)/);
  assert.match(legalGateSource, /status\?\.gate_required === true \? "required" : "clear"/);
  assert.doesNotMatch(coldStartRouterSource, /setTimeout|setInterval/);
  assert.doesNotMatch(gateSource, /setTimeout|setInterval/);
});
