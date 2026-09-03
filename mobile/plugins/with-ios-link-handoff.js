const { withAppDelegate } = require("@expo/config-plugins");

const IMPORT_ANCHOR = "import ReactAppDependencyProvider\n";
const APPLICATION_ANCHOR = "@UIApplicationMain\n";
const LOGGER_ANCHOR = "public class AppDelegate: ExpoAppDelegate {\n";
const OPEN_URL_IMPLEMENTATION = `    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)`;
const DID_FINISH_RETURN =
  "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)";

const NOTIFICATION_PROBE = `private final class BackyrdNotificationHandoffProbe: NSObject, UNUserNotificationCenterDelegate {
  private weak var downstream: UNUserNotificationCenterDelegate?
  private let logger: os.Logger

  init(downstream: UNUserNotificationCenterDelegate, logger: os.Logger) {
    self.downstream = downstream
    self.logger = logger
  }

  private func authorizedTargetKind(_ userInfo: [AnyHashable: Any]) -> String {
    if userInfo["type"] as? String == "test_push",
       userInfo["route"] as? String == "/privacy-consent" {
      return "test_push"
    }
    if userInfo["type"] as? String == "direct_message",
       let chatID = userInfo["chat_id"] as? String,
       UUID(uuidString: chatID) != nil {
      return "direct_message"
    }
    return "none"
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let targetKind = authorizedTargetKind(notification.request.content.userInfo)
    logger.notice("Notification foreground target=\\(targetKind, privacy: .public)")
    if let downstream {
      downstream.userNotificationCenter?(
        center,
        willPresent: notification,
        withCompletionHandler: completionHandler
      )
    } else {
      completionHandler([])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let targetKind = authorizedTargetKind(response.notification.request.content.userInfo)
    logger.notice("Notification response target=\\(targetKind, privacy: .public) forwarded=\\(self.downstream != nil, privacy: .public)")
    if let downstream {
      downstream.userNotificationCenter?(
        center,
        didReceive: response,
        withCompletionHandler: completionHandler
      )
    } else {
      completionHandler()
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    openSettingsFor notification: UNNotification?
  ) {
    downstream?.userNotificationCenter?(center, openSettingsFor: notification)
  }
}

`;

function patchAppDelegate(source) {
  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(
      "Backyrd iOS link handoff: generated AppDelegate import anchor is missing",
    );
  }
  if (!source.includes(APPLICATION_ANCHOR)) {
    throw new Error(
      "Backyrd iOS link handoff: generated application anchor is missing",
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
  if (!source.includes(DID_FINISH_RETURN)) {
    throw new Error(
      "Backyrd iOS link handoff: generated launch completion is unknown; refusing an unverified native build",
    );
  }

  return source
    .replace(
      IMPORT_ANCHOR,
      `${IMPORT_ANCHOR}import OSLog\nimport UserNotifications\n`,
    )
    .replace(APPLICATION_ANCHOR, `${NOTIFICATION_PROBE}${APPLICATION_ANCHOR}`)
    .replace(
      LOGGER_ANCHOR,
      `${LOGGER_ANCHOR}  private let linkHandoffLogger = Logger(\n    subsystem: Bundle.main.bundleIdentifier ?? "com.philipplanger.backyrd",\n    category: "NativeLinkHandoff"\n  )\n  private var notificationHandoffProbe: BackyrdNotificationHandoffProbe?\n`,
    )
    .replace(
      "  ) -> Bool {\n    let delegate = ReactNativeDelegate()",
      `  ) -> Bool {
    let hasLaunchURL = launchOptions?[.url] is URL
    let hasRemoteNotification = launchOptions?[.remoteNotification] != nil
    linkHandoffLogger.notice("Cold launch URL present: \\(hasLaunchURL, privacy: .public)")
    linkHandoffLogger.notice("Cold launch remote notification present: \\(hasRemoteNotification, privacy: .public)")

    let bridgeLogger = linkHandoffLogger
    NotificationCenter.default.addObserver(
      forName: Notification.Name("RCTJavaScriptDidLoadNotification"),
      object: nil,
      queue: .main
    ) { _ in
      bridgeLogger.notice("React Native JavaScript loaded")
    }
    NotificationCenter.default.addObserver(
      forName: Notification.Name("RCTContentDidAppearNotification"),
      object: nil,
      queue: .main
    ) { _ in
      bridgeLogger.notice("React Native root content appeared")
    }

    let delegate = ReactNativeDelegate()`,
    )
    .replace(
      DID_FINISH_RETURN,
      `    let expoDidFinish = super.application(
      application,
      didFinishLaunchingWithOptions: launchOptions
    )
    let notificationCenter = UNUserNotificationCenter.current()
    let downstream = notificationCenter.delegate
    if let downstream {
      let probe = BackyrdNotificationHandoffProbe(
        downstream: downstream,
        logger: linkHandoffLogger
      )
      notificationHandoffProbe = probe
      notificationCenter.delegate = probe
    }
    linkHandoffLogger.notice(
      "Notification delegate probe installed: \\(self.notificationHandoffProbe != nil, privacy: .public)"
    )
    return expoDidFinish`,
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
