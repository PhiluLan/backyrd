// mobile/lib/locationPrivacy.ts

import { Platform } from "react-native";
import * as Location from "expo-location";

import { hasActiveConsent } from "./consent";
import { safeDevelopmentWarning } from "./privacySanitize";

export type LocationPurpose =
  | "map_recenter"
  | "nearby_discovery"
  | "journey_ranking"
  | "smart_review_match"
  | "city_detection";

export type PrivacyLocationSuccess = {
  ok: true;
  purpose: LocationPurpose;
  location: Location.LocationObject;
  source: "current" | "last_known";
};

export type PrivacyLocationFailureReason =
  | "web_unsupported"
  | "consent_not_granted"
  | "services_disabled"
  | "permission_denied"
  | "position_unavailable"
  | "unexpected_error";

export type PrivacyLocationFailure = {
  ok: false;
  purpose: LocationPurpose;
  reason: PrivacyLocationFailureReason;
  canOpenSettings: boolean;
  message: string;
};

export type PrivacyLocationResult =
  | PrivacyLocationSuccess
  | PrivacyLocationFailure;

type GetPrivacySafeLocationOptions = {
  purpose: LocationPurpose;
  accuracy?: Location.Accuracy;
  requestPermission?: boolean;
  forceConsentRefresh?: boolean;
  timeoutMs?: number;
  allowLastKnown?: boolean;
  lastKnownMaxAgeMs?: number;
  lastKnownRequiredAccuracy?: number;
};

function failure(
  purpose: LocationPurpose,
  reason: PrivacyLocationFailureReason,
  message: string,
  canOpenSettings = false,
): PrivacyLocationFailure {
  return { ok: false, purpose, reason, message, canOpenSettings };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getPrivacySafeLocation(
  options: GetPrivacySafeLocationOptions,
): Promise<PrivacyLocationResult> {
  const {
    purpose,
    accuracy = Location.Accuracy.Balanced,
    requestPermission = true,
    forceConsentRefresh = false,
    timeoutMs = 8_000,
    allowLastKnown = true,
    lastKnownMaxAgeMs = 5 * 60 * 1_000,
    lastKnownRequiredAccuracy = 1_500,
  } = options;

  if (Platform.OS === "web") {
    return failure(
      purpose,
      "web_unsupported",
      "Die Standortfunktion ist in dieser Webansicht nicht verfügbar.",
    );
  }

  try {
    const consentGranted = await hasActiveConsent("precise_location", {
      forceRefresh: forceConsentRefresh,
    });

    if (!consentGranted) {
      return failure(
        purpose,
        "consent_not_granted",
        "Aktiviere den präzisen Standort zuerst unter Datenschutz & Einwilligungen.",
      );
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      return failure(
        purpose,
        "services_disabled",
        "Aktiviere die Ortungsdienste deines Geräts und versuche es erneut.",
        true,
      );
    }

    const existingPermission =
      await Location.getForegroundPermissionsAsync();

    const permission =
      existingPermission.status === "granted" || !requestPermission
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      return failure(
        purpose,
        "permission_denied",
        "Erlaube Backyrd den Standortzugriff in den Geräteeinstellungen.",
        !permission.canAskAgain,
      );
    }

    const current = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy,
        mayShowUserSettingsDialog: true,
      }),
      timeoutMs,
    );

    if (current) {
      return {
        ok: true,
        purpose,
        location: current,
        source: "current",
      };
    }

    if (allowLastKnown) {
      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: lastKnownMaxAgeMs,
        requiredAccuracy: lastKnownRequiredAccuracy,
      });

      if (lastKnown) {
        return {
          ok: true,
          purpose,
          location: lastKnown,
          source: "last_known",
        };
      }
    }

    return failure(
      purpose,
      "position_unavailable",
      "Dein Standort konnte gerade nicht bestimmt werden. Du kannst die Funktion weiterhin ohne Standort verwenden.",
    );
  } catch (error) {
    safeDevelopmentWarning(`[locationPrivacy] ${purpose} failed`, error);

    return failure(
      purpose,
      "unexpected_error",
      "Der Standort konnte gerade nicht bestimmt werden.",
    );
  }
}

export async function reverseGeocodePrivacySafe(
  location: Pick<Location.LocationObject, "coords">,
): Promise<Location.LocationGeocodedAddress | null> {
  try {
    const rows = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    return rows[0] ?? null;
  } catch (error) {
    safeDevelopmentWarning("[locationPrivacy] reverse geocode failed", error);
    return null;
  }
}

export async function requestLocationDevicePermissionAfterConsent(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  if (Platform.OS === "web") {
    return { granted: false, canAskAgain: false };
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    return { granted: false, canAskAgain: true };
  }

  const existing = await Location.getForegroundPermissionsAsync();
  const permission =
    existing.status === "granted"
      ? existing
      : await Location.requestForegroundPermissionsAsync();

  return {
    granted: permission.status === "granted",
    canAskAgain: permission.canAskAgain,
  };
}
