// mobile/lib/privacySanitize.ts

const BLOCKED_LOCATION_KEYS = new Set([
  "lat",
  "lng",
  "lon",
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "coordinate",
  "position",
  "currentposition",
  "current_position",
  "userlocation",
  "user_location",
  "currentlocation",
  "current_location",
  "lastknownlocation",
  "last_known_location",
  "geolocation",
  "gps",
  "altitude",
  "heading",
  "speed",
]);

const MAX_DEPTH = 6;
const MAX_ARRAY_LENGTH = 50;
const MAX_OBJECT_KEYS = 100;
const REDACTED = "[redacted-location]";

function normalizedKey(key: string) {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isRawLocationKey(key: string) {
  const normalized = normalizedKey(key);

  if (BLOCKED_LOCATION_KEYS.has(normalized)) return true;

  return (
    normalized.endsWith("_lat") ||
    normalized.endsWith("_lng") ||
    normalized.endsWith("_lon") ||
    normalized.endsWith("_latitude") ||
    normalized.endsWith("_longitude") ||
    normalized.endsWith("_coords") ||
    normalized.endsWith("_coordinates")
  );
}

export function redactLocationFromText(value: string) {
  return value
    // URL/query parameters.
    .replace(
      /([?&](?:lat|lng|lon|latitude|longitude)=)[^&#\s]+/gi,
      `$1${REDACTED}`,
    )
    // JSON-ish coordinate properties.
    .replace(
      /(["']?(?:lat|lng|lon|latitude|longitude)["']?\s*[:=]\s*)-?\d{1,3}(?:\.\d+)?/gi,
      `$1${REDACTED}`,
    )
    // Common coordinate pairs such as "47.5596, 7.5886".
    .replace(
      /(?<![\d.])-?\d{1,2}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}(?![\d.])/g,
      REDACTED,
    );
}

function sanitizeInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    return redactLocationFromText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }

  if (depth >= MAX_DEPTH) return "[truncated]";

  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactLocationFromText(value.message),
      stack: value.stack
        ? redactLocationFromText(value.stack)
        : null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeInternal(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_OBJECT_KEYS);

    const result: Record<string, unknown> = {};

    for (const [key, nestedValue] of entries) {
      if (isRawLocationKey(key)) {
        result[key] = REDACTED;
        continue;
      }

      const sanitized = sanitizeInternal(nestedValue, depth + 1, seen);
      if (sanitized !== undefined) result[key] = sanitized;
    }

    return result;
  }

  return redactLocationFromText(String(value));
}

export function sanitizePrivacyPayload(
  value: unknown,
): Record<string, unknown> {
  const sanitized = sanitizeInternal(value, 0, new WeakSet());

  if (
    sanitized &&
    typeof sanitized === "object" &&
    !Array.isArray(sanitized)
  ) {
    return sanitized as Record<string, unknown>;
  }

  return {};
}

export function sanitizePrivacyError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: redactLocationFromText(
        error.message || error.name || "Unknown error",
      ),
      stack: error.stack
        ? redactLocationFromText(error.stack)
        : null,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: redactLocationFromText(error),
      stack: null,
    };
  }

  try {
    const sanitized = sanitizeInternal(error, 0, new WeakSet());
    return {
      name: "UnknownError",
      message: redactLocationFromText(JSON.stringify(sanitized)),
      stack: null,
    };
  } catch {
    return {
      name: "UnknownError",
      message: "Unknown error",
      stack: null,
    };
  }
}

export function safeDevelopmentWarning(
  label: string,
  error?: unknown,
) {
  if (!__DEV__) return;

  const sanitized = error
    ? sanitizePrivacyError(error)
    : null;

  if (sanitized) {
    console.warn(label, {
      name: sanitized.name,
      message: sanitized.message,
    });
  } else {
    console.warn(label);
  }
}
