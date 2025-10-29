const { withAppDelegate, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withFixAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const appDelegatePath = path.join(cfg.modRequest.platformProjectRoot, projectName, "AppDelegate.swift");
    const content = `import ExpoModulesCore
import UIKit

@main
class AppDelegate: ExpoAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;
    fs.writeFileSync(appDelegatePath, content);
    return cfg;
  });
};
