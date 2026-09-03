import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  INITIAL_TARGET_BRIDGE_EXPORT,
  patchAppDelegate,
} = require("../plugins/with-ios-link-handoff.js");

const generatedAppDelegate = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }
}
`;

class InitialTargetStoreModel {
  pending = null;
  acknowledgedReceipt = null;
  initialWindowClosed = false;
  nextReceipt = 0;

  store(provenance, targetType, identifier) {
    if (this.initialWindowClosed) return "closed";
    if (this.pending) {
      return this.pending.provenance === provenance &&
        this.pending.targetType === targetType &&
        this.pending.identifier === identifier
        ? "duplicate"
        : "conflict";
    }
    this.nextReceipt += 1;
    this.pending = {
      receipt: `receipt-${this.nextReceipt}`,
      provenance,
      targetType,
      identifier,
    };
    return "stored";
  }

  pull() {
    this.initialWindowClosed = true;
    return this.pending;
  }

  acknowledge(receipt) {
    if (this.acknowledgedReceipt === receipt) return true;
    if (this.pending?.receipt !== receipt) return false;
    this.pending = null;
    this.acknowledgedReceipt = receipt;
    return true;
  }
}

test("STORE -> PULL -> CONSUME -> ACK is exactly once for Spot", () => {
  const store = new InitialTargetStoreModel();
  assert.equal(store.store("deep_link", "spot", "spot-id"), "stored");
  const first = store.pull();
  assert.deepEqual(store.pull(), first, "pull before acknowledgement is stable");
  assert.equal(store.acknowledge(first.receipt), true);
  assert.equal(store.pull(), null);
  assert.equal(store.acknowledge(first.receipt), true, "duplicate acknowledgement is idempotent");
});

test("valid User and Notification targets consume once", () => {
  const userStore = new InitialTargetStoreModel();
  assert.equal(userStore.store("deep_link", "user", "user-id"), "stored");
  const user = userStore.pull();
  assert.equal(user.targetType, "user");
  assert.equal(userStore.acknowledge(user.receipt), true);
  assert.equal(userStore.pull(), null);

  const pushStore = new InitialTargetStoreModel();
  assert.equal(pushStore.store("notification", "test_push", "/privacy-consent"), "stored");
  const push = pushStore.pull();
  assert.equal(push.provenance, "notification");
  assert.equal(pushStore.acknowledge(push.receipt), true);
  assert.equal(pushStore.pull(), null);
});

test("empty pull closes the launch window and lifecycle teardown has no stale target", () => {
  const store = new InitialTargetStoreModel();
  assert.equal(store.pull(), null);
  assert.equal(store.store("deep_link", "spot", "late-id"), "closed");
  assert.equal(new InitialTargetStoreModel().pull(), null);
});

test("Deep Link and Push never overwrite one another", () => {
  const store = new InitialTargetStoreModel();
  assert.equal(store.store("deep_link", "spot", "spot-id"), "stored");
  assert.equal(store.store("notification", "test_push", "/privacy-consent"), "conflict");
  assert.equal(store.pull().provenance, "deep_link");
});

test("generated iOS bridge binds the launch-local state machine", () => {
  const patched = patchAppDelegate(generatedAppDelegate);

  assert.match(patched, /class BackyrdInitialTargetBridge: NSObject/);
  assert.match(patched, /private var pending: BackyrdInitialTarget\?/);
  assert.match(patched, /private var acknowledgedReceipt: String\?/);
  assert.match(patched, /private var initialWindowClosed = false/);
  assert.match(patched, /func pull\(\) -> BackyrdInitialTarget\?/);
  assert.match(patched, /initialWindowClosed = true/);
  assert.match(patched, /return pending/);
  assert.match(patched, /func acknowledge\(receipt: String\) -> Bool/);
  assert.match(patched, /if acknowledgedReceipt == receipt/);
  assert.match(patched, /self\.pending = nil/);
  assert.match(patched, /resolve\(target\?\.dictionary \?\? NSNull\(\)\)/);
  assert.match(patched, /resolve\(acknowledged\)/);
  assert.doesNotMatch(patched, /UserDefaults/);
  assert.doesNotMatch(patched, /RCTContentDidAppearNotification/);
  assert.doesNotMatch(patched, /pendingAuthorizedProductURL/);
  assert.match(
    INITIAL_TARGET_BRIDGE_EXPORT,
    /RCT_EXTERN_MODULE\(BackyrdInitialTargetBridge, NSObject\)/,
  );
  assert.match(INITIAL_TARGET_BRIDGE_EXPORT, /pullInitialTarget:/);
  assert.match(INITIAL_TARGET_BRIDGE_EXPORT, /acknowledgeInitialTarget:/);
});

test("native storage keeps Product and Notification allowlists fail-closed", () => {
  const patched = patchAppDelegate(generatedAppDelegate);

  assert.match(patched, /url\.scheme\?\.lowercased\(\) == "backyrd"/);
  assert.match(patched, /url\.query == nil/);
  assert.match(patched, /url\.fragment == nil/);
  assert.match(patched, /components\.count == 2/);
  assert.match(patched, /\[1-5\]\[0-9a-fA-F\]\{3\}/);
  assert.match(patched, /\[89aAbB\]\[0-9a-fA-F\]\{3\}/);
  assert.match(patched, /components\[0\] == "spot" \|\| components\[0\] == "user"/);
  assert.match(patched, /userInfo\["type"\] as\? String == "test_push"/);
  assert.match(patched, /userInfo\["route"\] as\? String == "\/privacy-consent"/);
  assert.match(patched, /userInfo\["type"\] as\? String == "direct_message"/);
  assert.match(patched, /backyrdCanonicalUUID\(userInfo\["chat_id"\]\)/);
  assert.match(patched, /case \.conflict:[\s\S]*?blocked=true/);
  assert.doesNotMatch(patched, /last route/i);
  assert.doesNotMatch(patched, /url\.absoluteString/);
  assert.doesNotMatch(patched, /expo_push_token/i);
  assert.doesNotMatch(patched, /access_token/i);
});

test("foreground and background runtime handlers remain established", () => {
  const patched = patchAppDelegate(generatedAppDelegate);
  assert.match(
    patched,
    /let expoHandled = super\.application\(app, open: url, options: options\)/,
  );
  assert.match(
    patched,
    /let reactNativeHandled = RCTLinkingManager\.application\(app, open: url, options: options\)/,
  );
  assert.match(patched, /return expoHandled \|\| reactNativeHandled/);
  assert.match(patched, /case \.closed:[\s\S]*?let expoHandled/);
  assert.match(patched, /Notification runtime target=/);
  assert.match(patched, /downstream\.userNotificationCenter\?/);
});

test("native bridge fails closed when Expo changes the generated delegate", () => {
  assert.throws(
    () => patchAppDelegate(generatedAppDelegate.replace(" || ", " && ")),
    /implementation is unknown/,
  );
});

test("native bridge fails closed when launch completion changes", () => {
  assert.throws(
    () => patchAppDelegate(generatedAppDelegate.replace("return super.application(application, didFinishLaunchingWithOptions: launchOptions)", "return true")),
    /launch completion is unknown/,
  );
});
