// lib/ai/buildContext.ts

/**
 * Build an enriched contextual snapshot:
 * - fine-grained daymode
 * - weekday vibe intensity
 * - season preferences
 * - eating/drinking windows
 * - soft weather hook (merged if buildWeather later overrides)
 */

export async function buildContext() {
  const now = new Date();

  const hour = now.getHours();
  const weekday = now.getDay(); // 0 = Sunday
  const month = now.getMonth() + 1;

  /* ============================================================
     1) DAYMODE (ultra-fine)
  ============================================================ */
  let dayMode:
    | "early-morning"
    | "morning"
    | "afternoon"
    | "evening"
    | "late-evening"
    | "night"
    | "deep-night";

  if (hour < 6) dayMode = "deep-night";
  else if (hour < 10) dayMode = "early-morning";
  else if (hour < 12) dayMode = "morning";
  else if (hour < 17) dayMode = "afternoon";
  else if (hour < 20) dayMode = "evening";
  else if (hour < 23) dayMode = "late-evening";
  else dayMode = "night";

  /* ============================================================
     2) SEASON (now includes behavior prefs)
  ============================================================ */
  let season: "winter" | "spring" | "summer" | "autumn";
  if (month === 12 || month <= 2) season = "winter";
  else if (month <= 5) season = "spring";
  else if (month <= 8) season = "summer";
  else season = "autumn";

  const seasonPrefs = {
    winter: {
      outdoorPreference: "low",
      cozyPreference: "high",
      windSensitive: true,
    },
    spring: {
      outdoorPreference: "medium",
      cozyPreference: "medium",
      windSensitive: true,
    },
    summer: {
      outdoorPreference: "high",
      cozyPreference: "low",
      windSensitive: false,
    },
    autumn: {
      outdoorPreference: "medium",
      cozyPreference: "medium",
      windSensitive: true,
    },
  }[season];

  /* ============================================================
     3) WEEKDAY VIBE INTENSITY
     → GPT uses this for flow/liveliness
  ============================================================ */
  const weekdayVibes = {
    0: { label: "very calm (Sunday)", vibeIntensity: 0.2 },
    1: { label: "slow start (Monday)", vibeIntensity: 0.3 },
    2: { label: "normal (Tuesday)", vibeIntensity: 0.4 },
    3: { label: "normal (Wednesday)", vibeIntensity: 0.5 },
    4: { label: "slightly lively (Thursday)", vibeIntensity: 0.6 },
    5: { label: "very lively (Friday)", vibeIntensity: 0.9 },
    6: { label: "going-out peak (Saturday)", vibeIntensity: 1.0 },
  }[weekday];

  /* ============================================================
     4) MEAL WINDOWS (for GPT routing)
  ============================================================ */
  const mealWindows = {
    breakfast: hour >= 7 && hour <= 10,
    lunch: hour >= 11 && hour <= 14,
    dinner: hour >= 18 && hour <= 21,
    drinks: hour >= 20 || hour <= 2, // night-friendly
  };

  /* ============================================================
     5) WEATHER HOOK
     → buildWeather() will overwrite this later in Journey
  ============================================================ */
  const weather = null;

  /* ============================================================
     FINAL CONTEXT OBJECT
  ============================================================ */
  return {
    now: now.toISOString(),
    hour,
    weekday,
    month,
    dayMode,        // ultra-precise
    season,
    seasonPrefs,    // new: actionable preferences
    weekdayVibes,   // new: intensity + label
    mealWindows,    // new: dining/drinking signal
    weather,        // placeholder
  };
}
