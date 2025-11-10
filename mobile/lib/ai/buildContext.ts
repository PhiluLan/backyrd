// lib/ai/buildContext.ts

export async function buildContext() {
  const now = new Date();

  const hour = now.getHours();
  const weekday = now.getDay(); // 0 = Sonntag
  const month = now.getMonth() + 1;

  // Tageszeit-Modus
  let dayMode: "morning" | "afternoon" | "evening" | "night";
  if (hour < 11) dayMode = "morning";
  else if (hour < 17) dayMode = "afternoon";
  else if (hour < 21) dayMode = "evening";
  else dayMode = "night";

  // Saison
  let season: "winter" | "spring" | "summer" | "autumn";
  if (month === 12 || month <= 2) season = "winter";
  else if (month <= 5) season = "spring";
  else if (month <= 8) season = "summer";
  else season = "autumn";

  // Stimmung nach Stadt-Rhythmus
  const typicalVibe = {
    0: "sehr ruhig (Sonntag)",
    1: "ruhiger Wochenstart (Montag)",
    2: "normal (Dienstag)",
    3: "normal (Mittwoch)",
    4: "leicht lebhaft (Donnerstag)",
    5: "sehr lebhaft (Freitag)",
    6: "ausgeh-intensiv (Samstag)",
  }[weekday];

  return {
    now: now.toISOString(),
    hour,
    weekday,
    month,
    dayMode,
    season,
    typicalVibe,
    // Wetter kann später eingebaut werden:
    weather: null,
  };
}
