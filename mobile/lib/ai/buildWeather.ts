// lib/ai/buildWeather.ts

/**
 * Next-Gen Weather Engine for GPT-based Journey generation.
 * Adds:
 * - severity bands
 * - outdoor viability score
 * - 3h forecast
 * - temperature feeling bands
 * - wind categories
 * - cloud/visibility descriptors
 */

export async function buildWeather(lat: number, lng: number) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current_weather=true&hourly=temperature_2m,precipitation,cloudcover,windspeed_10m,weathercode&forecast_days=1`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.current_weather) {
      return {
        error: "no-weather",
        summary: "Keine Wetterdaten verfügbar",
        outdoor: "unknown",
      };
    }

    const cw = data.current_weather;

    /* ============================================================
       BASICS
    ============================================================ */
    const temp = cw.temperature;
    const wind = cw.windspeed;
    const code = cw.weathercode;

    /* ============================================================
       TEMPERATURE FEELING
    ============================================================ */
    let temperatureBand: "cold" | "cool" | "mild" | "warm" | "hot";

    if (temp <= 2) temperatureBand = "cold";
    else if (temp <= 10) temperatureBand = "cool";
    else if (temp <= 18) temperatureBand = "mild";
    else if (temp <= 26) temperatureBand = "warm";
    else temperatureBand = "hot";

    /* ============================================================
       WIND SEVERITY
    ============================================================ */
    let windBand: "calm" | "breezy" | "windy" | "strong";

    if (wind < 10) windBand = "calm";
    else if (wind < 25) windBand = "breezy";
    else if (wind < 45) windBand = "windy";
    else windBand = "strong";

    /* ============================================================
       PRECIPITATION SEVERITY (RAIN/SNOW)
    ============================================================ */
    const precip = data.hourly?.precipitation?.[cw.time] ?? 0; // fallback

    let precipSeverity: "none" | "light" | "moderate" | "strong";
    if (precip === 0) precipSeverity = "none";
    else if (precip < 1.5) precipSeverity = "light";
    else if (precip < 4) precipSeverity = "moderate";
    else precipSeverity = "strong";

    const isRain = code >= 51 && code < 90;

    /* ============================================================
       CLOUD COVER & VISIBILITY
    ============================================================ */
    const cloud = data.hourly?.cloudcover?.[cw.time] ?? 0;

    let sky: "clear" | "partly-cloudy" | "cloudy" | "overcast";
    if (cloud < 20) sky = "clear";
    else if (cloud < 50) sky = "partly-cloudy";
    else if (cloud < 80) sky = "cloudy";
    else sky = "overcast";

    /* ============================================================
       NEXT 3 HOURS FORECAST (IMPORTANT FOR WALKS)
    ============================================================ */
    const times = data.hourly?.time || [];
    const idxNow = times.indexOf(cw.time);

    let rainNext3h = false;
    if (idxNow !== -1) {
      const next3 = data.hourly.precipitation.slice(idxNow, idxNow + 3);
      rainNext3h = next3.some((p: number) => p > 0.2);
    }

    /* ============================================================
       OUTDOOR SCORE
    ============================================================ */
    let outdoor: "high" | "medium" | "low" | "unsafe";

    if (precipSeverity === "strong") outdoor = "unsafe";
    else if (precipSeverity === "moderate" || windBand === "strong" || temperatureBand === "cold") {
      outdoor = "low";
    } else if (precipSeverity === "light" || windBand === "windy") {
      outdoor = "medium";
    } else {
      outdoor = "high";
    }

    /* ============================================================
       SUMMARY for GPT
    ============================================================ */
    let summaryParts = [];

    summaryParts.push(
      {
        clear: "klar",
        "partly-cloudy": "leicht bewölkt",
        cloudy: "bewölkt",
        overcast: "bedeckt",
      }[sky]
    );

    summaryParts.push(
      {
        cold: "sehr kalt",
        cool: "kühl",
        mild: "mild",
        warm: "warm",
        hot: "heiss",
      }[temperatureBand]
    );

    if (isRain) summaryParts.push("Regen");
    if (windBand === "windy" || windBand === "strong") summaryParts.push("windig");

    const summary = summaryParts.filter(Boolean).join(", ");

    /* ============================================================
       RETURN FINAL OBJECT
    ============================================================ */
    return {
      temperature: temp,
      temperatureBand,
      wind,
      windBand,
      code,
      isRain,
      precipSeverity,
      sky,
      cloud,
      rainNext3h,
      outdoor,
      summary,
      raw: data,
    };
  } catch (err) {
    console.warn("Weather fetch error:", err);

    return {
      error: "weather-failed",
      summary: "Wetter konnte nicht geladen werden",
      outdoor: "unknown",
    };
  }
}
