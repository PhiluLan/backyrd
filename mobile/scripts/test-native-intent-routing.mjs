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
const productRouterSource = fs.readFileSync(
  new URL("../components/ProductDeepLinkRouter.tsx", import.meta.url),
  "utf8",
);
const legalGuardSource = fs.readFileSync(
  new URL("../components/consent/LegalGateGuard.tsx", import.meta.url),
  "utf8",
);
const safetyGuardSource = fs.readFileSync(
  new URL("../components/safety/GlobalSafetyEnforcementGuard.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  consumeInitialProductDeepLink,
  rememberInitialProductDeepLink,
  resolveProductDeepLink,
} = await import(
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

test("retains a validated initial route exactly once across bootstrap", () => {
  rememberInitialProductDeepLink(`/spot/${spotId}`);
  assert.equal(consumeInitialProductDeepLink(), `/spot/${spotId}`);
  assert.equal(consumeInitialProductDeepLink(), null);

  rememberInitialProductDeepLink("/messages/not-allowed");
  assert.equal(consumeInitialProductDeepLink(), null);
});

test("binds cold-start retention to a root router mounted during bootstrap", () => {
  assert.match(
    nativeIntentSource,
    /if \(options\.initial\) rememberInitialProductDeepLink\(productDeepLink\)/,
  );
  assert.match(rootLayoutSource, /<ProductDeepLinkRouter \/>/);
  assert.match(productRouterSource, /Linking\.useLinkingURL\(\)/);
  assert.match(
    productRouterSource,
    /resolveProductDeepLink\(linkingUrl \?\? ""\)/,
  );
  assert.doesNotMatch(
    rootLayoutSource,
    /if \(!fontsLoaded \|\| authLoading\) return/,
  );
  assert.ok(
    rootLayoutSource.indexOf("<RootStack />") <
      rootLayoutSource.indexOf("<ProductDeepLinkRouter />"),
    "the root navigator must mount before initial-link routing effects run",
  );
  assert.match(rootLayoutSource, /StyleSheet\.absoluteFillObject/);
  assert.match(
    rootLayoutSource,
    /GlobalSafetyEnforcementGuard enabled=\{bootstrapReady\}/,
  );
  assert.match(rootLayoutSource, /LegalGateGuard enabled=\{bootstrapReady\}/);
  assert.match(legalGuardSource, /if \(!enabled\) return;/);
  assert.match(safetyGuardSource, /if \(!enabled\)/);
});
