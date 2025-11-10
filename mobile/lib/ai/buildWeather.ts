// lib/ai/buildWeather.ts

export async function buildWeather(lat: number, lng: number) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current_weather=true&hourly=temperature_2m,precipitation,cloudcover,windspeed_10m`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data || !data.current_weather) {
      return {
        error: "no-weather",
        summary: "Keine Wetterdaten verfügbar",
      };
    }

    const cw = data.current_weather;

    const weather = {
      temperature: cw.temperature,
      wind: cw.windspeed,
      code: cw.weathercode,
      isRain: cw.weathercode >= 50 && cw.weathercode < 90,
      isClear: cw.weathercode === 0,
      isCloudy: cw.weathercode >= 1 && cw.weathercode <= 3,
      raw: data,
    };

    // Menschenlesbare Kurzbeschreibung
    let summary = "";

    if (weather.isRain) summary = "Regen";
    else if (weather.isClear) summary = "Klarer Himmel";
    else if (weather.isCloudy) summary = "Bewölkt";
    else summary = "Gemischtes Wetter";

    return {
      ...weather,
      summary,
    };
  } catch (err) {
    console.warn("Weather fetch error:", err);
    return {
      error: "weather-failed",
      summary: "Wetter konnte nicht geladen werden",
    };
  }
}
