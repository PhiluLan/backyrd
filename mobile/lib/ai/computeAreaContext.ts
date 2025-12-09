// lib/ai/computeAreaContext.ts
import { localAreas } from "./localAreas";

/**
 * ComputeAreaContext 4.0
 * Kombiniert:
 *  - lokale manuell gepflegte Areas (z. B. Kleinbasel, Altstadt)
 *  - automatisch abgeleitete Cluster aus GeoContext
 *  - Mood-Vibe-Summary der Spots
 *
 * OUTPUT:
 * {
 *   autoAreas: [...],       // basierend auf räumlicher Nähe
 *   manualAreas: [...],     // aus localAreas.ts → Stadtwissen
 *   dominantArea: {...},    // der "wahrscheinlich beste" Bezirk
 *   vibeSummary: "..."      // kurzer GPT-optimierter Kontext
 * }
 */

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeAreaContext(
  spots: Array<{ id: string; name: string; lat: number; lng: number; categoryName?: string; moods?: string[] }>
) {
  if (!spots || spots.length === 0) {
    return {
      autoAreas: [],
      manualAreas: [],
      dominantArea: null,
      vibeSummary: "Keine Spots geliefert.",
    };
  }

  // ============================================================
  // 1) Auto-Areas (Clustered via proximity)
  // ============================================================
  const AUTO_THRESHOLD_KM = 0.35; // Spots im gleichen Block / Quartier
  const autoAreas: Array<{ areaKey: string; ids: string[] }> = [];

  const visited = new Set<string>();

  for (const a of spots) {
    if (visited.has(a.id)) continue;

    const group = [a];
    visited.add(a.id);

    for (const b of spots) {
      if (visited.has(b.id)) continue;

      const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
      if (d <= AUTO_THRESHOLD_KM) {
        group.push(b);
        visited.add(b.id);
      }
    }

    autoAreas.push({
      areaKey: group.map((g) => g.id).join("-"),
      ids: group.map((g) => g.id),
    });
  }

  // ============================================================
  // 2) Manuelle Stadtteile
  // ============================================================
  const manualAreas = spots.map((spot) => {
    let best = null;
    let bestDist = Infinity;

    for (const area of localAreas) {
      const d = haversineKm(spot.lat, spot.lng, area.center.lat, area.center.lng);
      if (d < bestDist) {
        bestDist = d;
        best = { ...area, distanceKm: Number(d.toFixed(3)) };
      }
    }

    return {
      spotId: spot.id,
      name: spot.name,
      assigned: best,
    };
  });

  // ============================================================
  // 3) Dominante Area bestimmen
  // ============================================================
  const freq: Record<string, number> = {};

  for (const m of manualAreas) {
    const k = m.assigned.name;
    freq[k] = (freq[k] || 0) + 1;
  }

  const dominant = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])[0];

  const dominantArea = dominant
    ? { name: dominant[0], count: dominant[1] }
    : null;

  // ============================================================
  // 4) Vibe-Summary für GPT
  // ============================================================
  const allMoods = spots.flatMap((s) => s.moods || []);
  const uniqueMoods = Array.from(new Set(allMoods)).slice(0, 5);

  const vibeSummary = `
Die Spots befinden sich überwiegend in: **${dominantArea?.name ?? "unbekannt"}**
Mood-Vibes: ${uniqueMoods.join(", ") || "neutral"}
Es existieren ${autoAreas.length} natürliche geographische Cluster.
Stadtteil-Zuweisungen basieren auf localAreas + Haversine.
`.trim();

  return {
    autoAreas,
    manualAreas,
    dominantArea,
    vibeSummary,
  };
}
