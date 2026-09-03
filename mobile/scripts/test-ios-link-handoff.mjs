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
    return true
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

test("native link handoff invokes Expo and React Native without short-circuiting", () => {
  const patched = patchAppDelegate(generatedAppDelegate);

  assert.match(patched, /import OSLog/);
  assert.match(patched, /Cold launch URL present/);
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
});

test("native link handoff fails closed when Expo changes the generated delegate", () => {
  assert.throws(
    () => patchAppDelegate(generatedAppDelegate.replace(" || ", " && ")),
    /implementation is unknown/,
  );
});
