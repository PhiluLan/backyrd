const fs = require("node:fs");
const path = require("node:path");
const { withAppDelegate, withDangerousMod } = require("@expo/config-plugins");
const {
  withBuildSourceFile,
} = require("@expo/config-plugins/build/ios/XcodeProjectFile");

const IMPORT_ANCHOR = "import ReactAppDependencyProvider\n";
const APPLICATION_ANCHOR = "@UIApplicationMain\n";
const LOGGER_ANCHOR = "public class AppDelegate: ExpoAppDelegate {\n";
const OPEN_URL_IMPLEMENTATION = `    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)`;
const DID_FINISH_RETURN =
  "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)";

const INITIAL_TARGET_BRIDGE = `private enum BackyrdInitialTargetStoreResult {
  case stored
  case duplicate
  case conflict
  case closed
}

private struct BackyrdInitialTarget: Equatable {
  let receipt: String
  let provenance: String
  let targetType: String
  let identifier: String

  var dictionary: [String: String] {
    [
      "receipt": receipt,
      "provenance": provenance,
      "targetType": targetType,
      "identifier": identifier,
    ]
  }
}

private final class BackyrdInitialTargetStore {
  static let shared = BackyrdInitialTargetStore()

  private let lock = NSLock()
  private var pending: BackyrdInitialTarget?
  private var acknowledgedReceipt: String?
  private var initialWindowClosed = false

  private init() {}

  func store(provenance: String, targetType: String, identifier: String) -> BackyrdInitialTargetStoreResult {
    lock.lock()
    defer { lock.unlock() }

    guard !initialWindowClosed else { return .closed }
    if let pending {
      if pending.provenance == provenance,
         pending.targetType == targetType,
         pending.identifier == identifier {
        return .duplicate
      }
      return .conflict
    }

    pending = BackyrdInitialTarget(
      receipt: UUID().uuidString.lowercased(),
      provenance: provenance,
      targetType: targetType,
      identifier: identifier
    )
    return .stored
  }

  func pull() -> BackyrdInitialTarget? {
    lock.lock()
    defer { lock.unlock() }
    initialWindowClosed = true
    return pending
  }

  func acknowledge(receipt: String) -> Bool {
    lock.lock()
    defer { lock.unlock() }

    if acknowledgedReceipt == receipt {
      return true
    }
    guard let pending, pending.receipt == receipt else {
      return false
    }
    self.pending = nil
    acknowledgedReceipt = receipt
    return true
  }
}

@objc(BackyrdInitialTargetBridge)
final class BackyrdInitialTargetBridge: NSObject {
  private let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.philipplanger.backyrd",
    category: "NativeInitialTargetBridge"
  )

  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(pullInitialTarget:rejecter:)
  func pullInitialTarget(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let target = BackyrdInitialTargetStore.shared.pull()
    logger.notice(
      "Initial target pulled present=\\(target != nil, privacy: .public) provenance=\\(target?.provenance ?? \"none\", privacy: .public) target=\\(target?.targetType ?? \"none\", privacy: .public)"
    )
    resolve(target?.dictionary ?? NSNull())
  }

  @objc(acknowledgeInitialTarget:resolver:rejecter:)
  func acknowledgeInitialTarget(
    _ receipt: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let acknowledged = BackyrdInitialTargetStore.shared.acknowledge(receipt: receipt)
    logger.notice("Initial target acknowledged=\\(acknowledged, privacy: .public)")
    resolve(acknowledged)
  }
}

private func backyrdCanonicalUUID(_ value: Any?) -> String? {
  guard let value = value as? String else { return nil }
  let pattern = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
  guard value.range(of: pattern, options: .regularExpression) != nil else {
    return nil
  }
  return value.lowercased()
}

private func backyrdAuthorizedNotificationTarget(
  _ userInfo: [AnyHashable: Any]
) -> (targetType: String, identifier: String)? {
  if userInfo["type"] as? String == "test_push",
     userInfo["route"] as? String == "/privacy-consent" {
    return ("test_push", "/privacy-consent")
  }
  if userInfo["type"] as? String == "direct_message",
     let chatID = backyrdCanonicalUUID(userInfo["chat_id"]) {
    return ("direct_message", chatID)
  }
  return nil
}

private final class BackyrdNotificationHandoffProbe: NSObject, UNUserNotificationCenterDelegate {
  private weak var downstream: UNUserNotificationCenterDelegate?
  private let logger: os.Logger

  init(downstream: UNUserNotificationCenterDelegate, logger: os.Logger) {
    self.downstream = downstream
    self.logger = logger
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let target = backyrdAuthorizedNotificationTarget(notification.request.content.userInfo)
    logger.notice("Notification foreground target=\\(target?.targetType ?? \"none\", privacy: .public)")
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
    if let target = backyrdAuthorizedNotificationTarget(
      response.notification.request.content.userInfo
    ) {
      let result = BackyrdInitialTargetStore.shared.store(
        provenance: "notification",
        targetType: target.targetType,
        identifier: target.identifier
      )
      switch result {
      case .stored, .duplicate:
        logger.notice("Notification initial target stored target=\\(target.targetType, privacy: .public)")
        completionHandler()
        return
      case .conflict:
        logger.notice("Notification initial target conflict blocked=true")
        completionHandler()
        return
      case .closed:
        break
      }
    }

    let target = backyrdAuthorizedNotificationTarget(
      response.notification.request.content.userInfo
    )
    logger.notice("Notification runtime target=\\(target?.targetType ?? \"none\", privacy: .public) forwarded=\\(self.downstream != nil, privacy: .public)")
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

const INITIAL_TARGET_BRIDGE_EXPORT = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BackyrdInitialTargetBridge, NSObject)

RCT_EXTERN_METHOD(pullInitialTarget:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acknowledgeInitialTarget:(NSString *)receipt
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
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
    .replace(APPLICATION_ANCHOR, `${INITIAL_TARGET_BRIDGE}${APPLICATION_ANCHOR}`)
    .replace(
      LOGGER_ANCHOR,
      `${LOGGER_ANCHOR}  private let linkHandoffLogger = Logger(\n    subsystem: Bundle.main.bundleIdentifier ?? "com.philipplanger.backyrd",\n    category: "NativeLinkHandoff"\n  )\n  private var notificationHandoffProbe: BackyrdNotificationHandoffProbe?\n\n  private func authorizedProductTarget(_ url: URL) -> (targetType: String, identifier: String)? {\n    guard url.scheme?.lowercased() == "backyrd",\n          url.user == nil,\n          url.password == nil,\n          url.port == nil,\n          url.query == nil,\n          url.fragment == nil else {\n      return nil\n    }\n\n    var components: [String] = []\n    if let host = url.host, !host.isEmpty {\n      components.append(host)\n    }\n    components.append(contentsOf: url.path.split(separator: "/").map(String.init))\n\n    guard components.count == 2,\n          (components[0] == "spot" || components[0] == "user"),\n          let identifier = backyrdCanonicalUUID(components[1]) else {\n      return nil\n    }\n    return (components[0], identifier)\n  }\n`,
    )
    .replace(
      "  ) -> Bool {\n    let delegate = ReactNativeDelegate()",
      `  ) -> Bool {
    let launchURL = launchOptions?[.url] as? URL
    let launchProductTarget = launchURL.flatMap(authorizedProductTarget)
    if let launchProductTarget {
      _ = BackyrdInitialTargetStore.shared.store(
        provenance: "deep_link",
        targetType: launchProductTarget.targetType,
        identifier: launchProductTarget.identifier
      )
    }

    let launchNotification = launchOptions?[.remoteNotification] as? [AnyHashable: Any]
    let launchNotificationTarget = launchNotification.flatMap(backyrdAuthorizedNotificationTarget)
    if let launchNotificationTarget {
      _ = BackyrdInitialTargetStore.shared.store(
        provenance: "notification",
        targetType: launchNotificationTarget.targetType,
        identifier: launchNotificationTarget.identifier
      )
    }
    linkHandoffLogger.notice("Cold launch URL authorized=\\(launchProductTarget != nil, privacy: .public)")
    linkHandoffLogger.notice("Cold launch notification authorized=\\(launchNotificationTarget != nil, privacy: .public)")

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
      `    if let target = authorizedProductTarget(url) {
      let result = BackyrdInitialTargetStore.shared.store(
        provenance: "deep_link",
        targetType: target.targetType,
        identifier: target.identifier
      )
      switch result {
      case .stored, .duplicate:
        linkHandoffLogger.notice("Product initial target stored target=\\(target.targetType, privacy: .public)")
        return true
      case .conflict:
        linkHandoffLogger.notice("Product initial target conflict blocked=true")
        return true
      case .closed:
        break
      }
    }

    // Runtime links continue through both established handlers. Unknown and
    // malformed targets are never stored and remain fail-closed in JS.
    let expoHandled = super.application(app, open: url, options: options)
    let reactNativeHandled = RCTLinkingManager.application(app, open: url, options: options)
    linkHandoffLogger.notice(
      "Open URL runtime expo=\\(expoHandled, privacy: .public) reactNative=\\(reactNativeHandled, privacy: .public)"
    )
    return expoHandled || reactNativeHandled`,
    );
}

function withIosLinkHandoff(config) {
  const withPatchedAppDelegate = withAppDelegate(config, (modConfig) => {
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

  const withRegisteredBridge = withBuildSourceFile(withPatchedAppDelegate, {
    filePath: "BackyrdInitialTargetBridge.m",
    contents: INITIAL_TARGET_BRIDGE_EXPORT,
    overwrite: true,
  });

  return withDangerousMod(withRegisteredBridge, ["ios", (modConfig) => {
    const projectName = modConfig.modRequest.projectName;
    const bridgingHeaderPath = path.join(
      modConfig.modRequest.platformProjectRoot,
      projectName,
      `${projectName}-Bridging-Header.h`,
    );
    const bridgeImport = "#import <React/RCTBridgeModule.h>";
    const contents = fs.readFileSync(bridgingHeaderPath, "utf8");
    if (!contents.includes(bridgeImport)) {
      fs.writeFileSync(bridgingHeaderPath, `${contents.trimEnd()}\n${bridgeImport}\n`);
    }
    return modConfig;
  }]);
}

module.exports = withIosLinkHandoff;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.INITIAL_TARGET_BRIDGE_EXPORT = INITIAL_TARGET_BRIDGE_EXPORT;
