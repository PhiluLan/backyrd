import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { patchAppDelegate } = require("../plugins/with-ios-link-handoff.js");

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

test("authorized cold-start targets wait for root content and dispatch once", () => {
  const patched = patchAppDelegate(generatedAppDelegate);

  assert.match(patched, /import OSLog/);
  assert.match(patched, /import UserNotifications/);
  assert.match(patched, /Cold launch URL present/);
  assert.match(patched, /Cold launch remote notification present/);
  assert.match(patched, /React Native JavaScript loaded/);
  assert.match(patched, /React Native root content appeared/);
  assert.match(patched, /Notification delegate probe installed/);
  assert.match(patched, /Notification response target=/);
  assert.match(patched, /authorizedTargetKind/);
  assert.match(patched, /authorizedProductTargetKind/);
  assert.match(patched, /if authorizedTarget != "none" && !rootContentReady/);
  assert.match(patched, /pendingAuthorizedProductURL = url/);
  assert.match(patched, /Deferred product URL released target=/);
  assert.match(patched, /self\.pendingAuthorizedProductURL = nil/);
  assert.match(
    patched,
    /if targetKind != "none" && !rootContentReady/,
  );
  assert.match(patched, /pendingAuthorizedResponse = response/);
  assert.match(patched, /pendingAuthorizedResponse = nil/);
  assert.match(patched, /Notification response released target=/);
  assert.match(patched, /once=true/);
  assert.match(
    patched,
    /let expoHandled = super\.application\(app, open: url, options: options\)/,
  );
  assert.match(
    patched,
    /let reactNativeHandled = RCTLinkingManager\.application\(app, open: url, options: options\)/,
  );
  assert.match(patched, /return expoHandled \|\| reactNativeHandled/);
  assert.doesNotMatch(
    patched,
    /return super\.application\(app, open: url, options: options\) \|\|/,
  );
  assert.doesNotMatch(patched, /url\.absoluteString/);
  assert.doesNotMatch(patched, /expo_push_token/i);
  assert.doesNotMatch(patched, /access_token/i);
});

test("native retention keeps the existing target allowlists fail-closed", () => {
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
  assert.match(patched, /UUID\(uuidString: chatID\) != nil/);
  assert.doesNotMatch(patched, /last route/i);
});

test("native link handoff fails closed when Expo changes the generated delegate", () => {
  assert.throws(
    () => patchAppDelegate(generatedAppDelegate.replace(" || ", " && ")),
    /implementation is unknown/,
  );
});

test("native instrumentation fails closed when the launch completion changes", () => {
  assert.throws(
    () => patchAppDelegate(generatedAppDelegate.replace("return super.application(application, didFinishLaunchingWithOptions: launchOptions)", "return true")),
    /launch completion is unknown/,
  );
});
