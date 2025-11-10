// lib/ai/localKnowledge.ts
// Local Basel Insider Knowledge Layer

export function classifyArea(lat: number, lng: number) {
  // EXTREM grob aber sehr nützlich (Basel Bounding Boxes)
  // später kann man das durch echte Polygone ersetzen

  // Grossbasel Zentrum
  if (lat > 47.553 && lat < 47.563 && lng > 7.58 && lng < 7.59) {
    return { area: "Altstadt Grossbasel", vibe: "historic, cozy, romantic" };
  }

  // Kleinbasel Zentrum
  if (lat > 47.557 && lat < 47.568 && lng > 7.59 && lng < 7.61) {
    return { area: "Altstadt Kleinbasel", vibe: "nightlife, bars, energetic" };
  }

  // Gundeli
  if (lat > 47.542 && lat < 47.555 && lng > 7.57 && lng < 7.59) {
    return { area: "Gundeli", vibe: "young, food-focused, urban mix" };
  }

  // St. Johann
  if (lat > 47.565 && lat < 47.578 && lng > 7.56 && lng < 7.585) {
    return { area: "St. Johann", vibe: "industrial chic, creative, casual" };
  }

  // Klybeck
  if (lat > 47.575 && lat < 47.585 && lng > 7.59 && lng < 7.61) {
    return { area: "Klybeck", vibe: "alternative, relaxed, artsy" };
  }

  return { area: "Basel", vibe: "mixed" };
}

// ========================================
// Flow-Prioritäten zwischen Basler Quartieren
// ========================================

export function getAreaFlowPreference(from: string, to: string) {
  const same = from === to;

  if (same) return 1.0; // perfekt

  const flows: Record<string, Record<string, number>> = {
    "Altstadt Grossbasel": {
      "Altstadt Kleinbasel": 0.9,
      "St. Johann": 0.7,
      "Gundeli": 0.6,
      "Klybeck": 0.5,
    },
    "Altstadt Kleinbasel": {
      "Altstadt Grossbasel": 0.9,
      "Klybeck": 0.8,
      "St. Johann": 0.7,
      "Gundeli": 0.5,
    },
    Gundeli: {
      "Altstadt Grossbasel": 0.8,
      "St. Johann": 0.4,
      "Altstadt Kleinbasel": 0.4,
      "Klybeck": 0.3,
    },
    "St. Johann": {
      "Altstadt Kleinbasel": 0.8,
      "Altstadt Grossbasel": 0.7,
      Klybeck: 0.6,
      Gundeli: 0.4,
    },
    Klybeck: {
      "Altstadt Kleinbasel": 0.9,
      "St. Johann": 0.8,
      "Altstadt Grossbasel": 0.5,
      Gundeli: 0.3,
    },
  };

  return flows[from]?.[to] ?? 0.5;
}
