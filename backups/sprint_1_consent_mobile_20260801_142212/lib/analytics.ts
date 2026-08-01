import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { supabase } from "./supabase";

const INSTALLATION_ID_KEY = "@backyrd/analytics/installation-id-v1";
const SESSION_ID_KEY = "@backyrd/analytics/session-id-v1";
const SESSION_LAST_SEEN_KEY = "@backyrd/analytics/session-last-seen-v1";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export type AnalyticsProperties = Record<string, unknown>;
export type AnalyticsSeverity = "info" | "warning" | "error" | "fatal";

export type TrackEventInput = {
  eventName: string;
  screenName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  spotId?: string | null;
  decisionId?: string | null;
  properties?: AnalyticsProperties;
  occurredAt?: string;
};

export type ReportErrorInput = {
  error: unknown;
  screenName?: string | null;
  errorType?: string;
  severity?: AnalyticsSeverity;
  handled?: boolean;
  context?: AnalyticsProperties;
};

function appVersion() {
  return Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "unknown";
}

function buildNumber() {
  return Constants.nativeBuildVersion ?? null;
}

function platformName() {
  return Platform.OS;
}

function cleanUuid(value?: string | null) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function errorParts(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Unknown error",
      stack: error.stack ?? null,
      name: error.name || "Error",
    };
  }

  if (typeof error === "string") {
    return { message: error, stack: null, name: "Error" };
  }

  try {
    return {
      message: JSON.stringify(error),
      stack: null,
      name: "UnknownError",
    };
  } catch {
    return { message: String(error), stack: null, name: "UnknownError" };
  }
}

function fingerprintFor(message: string, stack: string | null) {
  const raw = `${message}|${stack?.split("\n").slice(0, 3).join("|") ?? ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `rn_${Math.abs(hash)}`;
}

let installationIdCache: string | null = null;
let sessionIdCache: string | null = null;
let currentScreenCache: string | null = null;
let startPromise: Promise<string | null> | null = null;

export async function getInstallationId() {
  if (installationIdCache) return installationIdCache;

  const stored = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (cleanUuid(stored)) {
    installationIdCache = stored;
    return stored;
  }

  const created = Crypto.randomUUID();
  installationIdCache = created;
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

export function setCurrentAnalyticsScreen(screenName: string | null) {
  currentScreenCache = screenName;
}

export function getCurrentAnalyticsScreen() {
  return currentScreenCache;
}

export async function registerInstallation(properties: AnalyticsProperties = {}) {
  try {
    const installationId = await getInstallationId();
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? null;

    const { error } = await supabase.rpc("analytics_register_installation_v1", {
      p_installation_id: installationId,
      p_platform: platformName(),
      p_app_version: appVersion(),
      p_build_number: buildNumber(),
      p_device_model: Device.modelName ?? Device.deviceName ?? null,
      p_os_version: String(Device.osVersion ?? Platform.Version ?? ""),
      p_locale: locale,
      p_country: null,
      p_city: null,
      p_properties: {
        app_variant: Constants.expoConfig?.extra?.appVariant ?? "prod",
        device_type: Device.deviceType ?? null,
        is_device: Device.isDevice,
        ...properties,
      },
    });

    if (error) throw error;
  } catch (error) {
    console.warn("[analytics] register installation failed", error);
  }
}

async function storedSessionIsFresh() {
  const [storedId, storedLastSeen] = await Promise.all([
    AsyncStorage.getItem(SESSION_ID_KEY),
    AsyncStorage.getItem(SESSION_LAST_SEEN_KEY),
  ]);

  const lastSeen = Number(storedLastSeen ?? 0);
  const fresh = cleanUuid(storedId) && Number.isFinite(lastSeen) && Date.now() - lastSeen < SESSION_TIMEOUT_MS;

  if (!fresh) return null;
  sessionIdCache = storedId;
  return storedId;
}

export async function startAnalyticsSession(entryScreen?: string | null) {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    try {
      const existing = sessionIdCache ?? (await storedSessionIsFresh());
      if (existing) {
        await touchAnalyticsSession(entryScreen ?? undefined, false);
        return existing;
      }

      const installationId = await getInstallationId();
      const { data, error } = await supabase.rpc("analytics_start_session_v1", {
        p_installation_id: installationId,
        p_platform: platformName(),
        p_app_version: appVersion(),
        p_build_number: buildNumber(),
        p_entry_screen: entryScreen ?? null,
        p_properties: {
          app_variant: Constants.expoConfig?.extra?.appVariant ?? "prod",
        },
      });

      if (error) throw error;
      const sessionId = cleanUuid(data as string | null);
      if (!sessionId) return null;

      sessionIdCache = sessionId;
      await AsyncStorage.multiSet([
        [SESSION_ID_KEY, sessionId],
        [SESSION_LAST_SEEN_KEY, String(Date.now())],
      ]);

      await trackAnalyticsEvent({
        eventName: "app_opened",
        screenName: entryScreen ?? null,
        properties: { cold_start: true },
      });

      return sessionId;
    } catch (error) {
      console.warn("[analytics] start session failed", error);
      return null;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export async function touchAnalyticsSession(exitScreen?: string | null, end = false) {
  try {
    const sessionId = sessionIdCache ?? (await storedSessionIsFresh());
    if (!sessionId) return;

    const { error } = await supabase.rpc("analytics_touch_session_v1", {
      p_session_id: sessionId,
      p_exit_screen: exitScreen ?? currentScreenCache,
      p_end: end,
    });

    if (error) throw error;
    await AsyncStorage.setItem(SESSION_LAST_SEEN_KEY, String(Date.now()));

    if (end) {
      sessionIdCache = null;
      await AsyncStorage.multiRemove([SESSION_ID_KEY, SESSION_LAST_SEEN_KEY]);
    }
  } catch (error) {
    console.warn("[analytics] touch session failed", error);
  }
}

export async function trackAnalyticsEvent(input: TrackEventInput) {
  try {
    const eventName = input.eventName.trim();
    if (!eventName) return null;

    const installationId = await getInstallationId();
    const sessionId = sessionIdCache ?? (await startAnalyticsSession(input.screenName));

    const { data, error } = await supabase.rpc("analytics_track_event_v1", {
      p_event_name: eventName,
      p_session_id: sessionId,
      p_installation_id: installationId,
      p_screen_name: input.screenName ?? currentScreenCache,
      p_entity_type: input.entityType ?? null,
      p_entity_id: cleanUuid(input.entityId),
      p_spot_id: cleanUuid(input.spotId),
      p_decision_id: cleanUuid(input.decisionId),
      p_platform: platformName(),
      p_app_version: appVersion(),
      p_properties: input.properties ?? {},
      p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    });

    if (error) throw error;
    await AsyncStorage.setItem(SESSION_LAST_SEEN_KEY, String(Date.now()));
    return data as number | null;
  } catch (error) {
    console.warn("[analytics] track event failed", error);
    return null;
  }
}

export async function reportAnalyticsError(input: ReportErrorInput) {
  try {
    const parts = errorParts(input.error);
    const installationId = await getInstallationId();
    const sessionId = sessionIdCache ?? (await storedSessionIsFresh());

    const { data, error } = await supabase.rpc("analytics_report_error_v1", {
      p_message: parts.message.slice(0, 4000),
      p_session_id: sessionId,
      p_installation_id: installationId,
      p_fingerprint: fingerprintFor(parts.message, parts.stack),
      p_error_type: input.errorType ?? parts.name ?? "app_error",
      p_stack: parts.stack?.slice(0, 16000) ?? null,
      p_screen_name: input.screenName ?? currentScreenCache,
      p_severity: input.severity ?? "error",
      p_platform: platformName(),
      p_app_version: appVersion(),
      p_handled: input.handled ?? true,
      p_context: input.context ?? {},
      p_occurred_at: new Date().toISOString(),
    });

    if (error) throw error;
    return data as number | null;
  } catch (error) {
    console.warn("[analytics] report error failed", error);
    return null;
  }
}

export async function resetAnalyticsSession() {
  sessionIdCache = null;
  await AsyncStorage.multiRemove([SESSION_ID_KEY, SESSION_LAST_SEEN_KEY]);
}
