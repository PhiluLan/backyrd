// lib/ai/localKnowledge.ts
// --- Basel Local Knowledge Layer 3.0 ---
// Nutzt Bounding-Boxes + Micro-Vibes
// Voll kompatibel mit computeAreaContext 4.0

export type AreaInfo = {
  area: string;
  vibe: string;
  nightlife?: number; // 0–1
  cozy?: number;
  romantic?: number;
  walkable?: number;
};

// ================================================
// 1) AREA CLASSIFIER (Bounding Box + Mood-Vibe)
// ================================================
export function classifyArea(lat: number, lng: number): AreaInfo {
  // Altstadt Grossbasel – Rathaus, Spalenberg, Barfüsserplatz
  if (lat > 47.553 && lat < 47.563 && lng > 7.58 && lng < 7.59) {
    return {
      area: "Altstadt Grossbasel",
      vibe: "historic, cozy, romantic, cultural",
      nightlife: 0.5,
      cozy: 0.9,
      romantic: 0.8,
      walkable: 1.0,
    };
  }

  // Altstadt Kleinbasel – Rheinufer, Alpenstrasse, Bar-Clubs
  if (lat > 47.557 && lat < 47.568 && lng > 7.59 && lng < 7.61) {
    return {
      area: "Altstadt Kleinbasel",
      vibe: "nightlife, bars, energetic, alternative",
      nightlife: 0.9,
      cozy: 0.5,
      romantic: 0.4,
      walkable: 0.9,
    };
  }

  // Gundeli – Bahnhof, Food, junge Szene
  if (lat > 47.542 && lat < 47.555 && lng > 7.57 && lng < 7.59) {
    return {
      area: "Gundeli",
      vibe: "young, food-focused, urban mix",
      nightlife: 0.6,
      cozy: 0.6,
      romantic: 0.4,
      walkable: 0.8,
    };
  }

  // St. Johann – Industrie, Kunst, trendig
  if (lat > 47.565 && lat < 47.578 && lng > 7.56 && lng < 7.585) {
    return {
      area: "St. Johann",
      vibe: "industrial chic, creative, casual",
      nightlife: 0.5,
      cozy: 0.5,
      romantic: 0.3,
      walkable: 0.7,
    };
  }

  // Klybeck – Alternative Szene, Ateliers, ruhig
  if (lat > 47.575 && lat < 47.585 && lng > 7.59 && lng < 7.61) {
    return {
      area: "Klybeck",
      vibe: "alternative, relaxed, artsy, riverside",
      nightlife: 0.7,
      cozy: 0.7,
      romantic: 0.5,
      walkable: 0.8,
    };
  }

  // Fallback für alles andere in Basel
  return {
    area: "Basel",
    vibe: "mixed, urban",
    nightlife: 0.5,
    cozy: 0.5,
    romantic: 0.5,
    walkable: 0.8,
  };
}

// ======================================================
// 2) FLOW PREFERENCE ENGINE (Routen-Intelligenz)
// ======================================================
//
// Bewertung wie gut sich eine Route von A → B anfühlt
// 0.0 – sehr schlecht
// 1.0 – perfekt fließender Übergang
//

export function getAreaFlowPreference(from: string, to: string): number {
  if (from === to) return 1.0;

  const flows: Record<string, Record<string, number>> = {
    "Altstadt Grossbasel": {
      "Altstadt Kleinbasel": 0.9,
      "St. Johann": 0.7,
      "Gundeli": 0.6,
      "Klybeck": 0.5,
    },
    "Altstadt Kleinbasel": {
      "Altstadt Grossbasel": 0.9,
      Klybeck: 0.8,
      "St. Johann": 0.7,
      Gundeli: 0.5,
    },
    Gundeli: {
      "Altstadt Grossbasel": 0.8,
      "St. Johann": 0.4,
      "Altstadt Kleinbasel": 0.4,
      Klybeck: 0.3,
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

  return flows[from]?.[to] ?? 0.4;
}
