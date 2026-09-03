const { withAppDelegate } = require("@expo/config-plugins");

const IMPORT_ANCHOR = "import ReactAppDependencyProvider\n";
const LOGGER_ANCHOR = "public class AppDelegate: ExpoAppDelegate {\n";
const OPEN_URL_IMPLEMENTATION = `    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)`;

function patchAppDelegate(source) {
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(
      "Backyrd iOS link handoff: generated AppDelegate import anchor is missing",
    );
  }
  if (!source.includes(LOGGER_ANCHOR)) {
    throw new Error(
      "Backyrd iOS link handoff: generated AppDelegate class anchor is missing",
    );
  }
  if (!source.includes(OPEN_URL_IMPLEMENTATION)) {
    throw new Error(
      "Backyrd iOS link handoff: generated open-URL implementation is unknown; refusing an unverified native build",
    );
  }

  return source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}import OSLog\n`)
    .replace(
      LOGGER_ANCHOR,
      `${LOGGER_ANCHOR}  private let linkHandoffLogger = Logger(\n    subsystem: Bundle.main.bundleIdentifier ?? "com.philipplanger.backyrd",\n    category: "NativeLinkHandoff"\n  )\n`,
    )
    .replace(
      "  ) -> Bool {\n    let delegate = ReactNativeDelegate()",
      `  ) -> Bool {
    let hasLaunchURL = launchOptions?[.url] is URL
    linkHandoffLogger.notice("Cold launch URL present: \\(hasLaunchURL, privacy: .public)")

    let delegate = ReactNativeDelegate()`,
    )
    .replace(
      OPEN_URL_IMPLEMENTATION,
      `    // Invoke both handlers. The Expo handler may report success without
    // forwarding the URL to React Native; short-circuiting here loses the
    // original product link during a terminated-app launch.
    let expoHandled = super.application(app, open: url, options: options)
    let reactNativeHandled = RCTLinkingManager.application(app, open: url, options: options)
    linkHandoffLogger.notice(
      "Open URL handoff expo=\\(expoHandled, privacy: .public) reactNative=\\(reactNativeHandled, privacy: .public)"
    )
    return expoHandled || reactNativeHandled`,
    );
}

function withIosLinkHandoff(config) {
  return withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== "swift") {
      throw new Error(
        "Backyrd iOS link handoff requires the generated Swift AppDelegate",
      );
    }

    modConfig.modResults.contents = patchAppDelegate(
      modConfig.modResults.contents,
    );
    return modConfig;
  });
}

module.exports = withIosLinkHandoff;
module.exports.patchAppDelegate = patchAppDelegate;
