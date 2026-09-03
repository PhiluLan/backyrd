import { NativeModules, Platform } from "react-native";

import { resolveProductDeepLink } from "./native-intent-route";
import { resolveNotificationRoute } from "./notification-route";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NativeInitialTarget = {
  receipt: string;
  provenance: "deep_link" | "notification";
  targetType: "spot" | "user" | "direct_message" | "test_push";
  identifier: string;
};

type NativeInitialTargetBridge = {
  pullInitialTarget(): Promise<unknown>;
  acknowledgeInitialTarget(receipt: string): Promise<boolean>;
};

function bridge(): NativeInitialTargetBridge | null {
  if (Platform.OS !== "ios") return null;
  const candidate = NativeModules.BackyrdInitialTargetBridge as
    | Partial<NativeInitialTargetBridge>
    | undefined;
  return typeof candidate?.pullInitialTarget === "function" &&
    typeof candidate.acknowledgeInitialTarget === "function"
    ? (candidate as NativeInitialTargetBridge)
    : null;
}

export function parseNativeInitialTarget(value: unknown): NativeInitialTarget | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const receipt = record.receipt;
  const provenance = record.provenance;
  const targetType = record.targetType;
  const identifier = record.identifier;

  if (
    typeof receipt !== "string" ||
    !UUID_PATTERN.test(receipt) ||
    typeof identifier !== "string"
  ) {
    return null;
  }

  if (
    provenance === "deep_link" &&
    (targetType === "spot" || targetType === "user") &&
    UUID_PATTERN.test(identifier)
  ) {
    return { receipt, provenance, targetType, identifier };
  }

  if (
    provenance === "notification" &&
    ((targetType === "direct_message" && UUID_PATTERN.test(identifier)) ||
      (targetType === "test_push" && identifier === "/privacy-consent"))
  ) {
    return { receipt, provenance, targetType, identifier };
  }

  return null;
}

export function resolveNativeInitialTargetRoute(
  target: NativeInitialTarget,
): string | null {
  if (target.provenance === "deep_link") {
    return resolveProductDeepLink(
      `backyrd://${target.targetType}/${target.identifier}`,
    );
  }

  return target.targetType === "direct_message"
    ? resolveNotificationRoute({
        type: "direct_message",
        chat_id: target.identifier,
      })
    : resolveNotificationRoute({
        type: "test_push",
        route: target.identifier,
      });
}

export async function pullNativeInitialTarget(): Promise<NativeInitialTarget | null> {
  const nativeBridge = bridge();
  if (!nativeBridge) {
    throw new Error("native_initial_target_bridge_unavailable");
  }
  return parseNativeInitialTarget(await nativeBridge.pullInitialTarget());
}

export async function acknowledgeNativeInitialTarget(
  receipt: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(receipt)) return false;
  const nativeBridge = bridge();
  if (!nativeBridge) return false;
  return nativeBridge.acknowledgeInitialTarget(receipt);
}
