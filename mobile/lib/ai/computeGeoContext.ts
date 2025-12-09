import { haversineKm } from "../utils/haversine";

/**
 * GeoContext 3.0
 * Liefert GPT echte geographische Intelligenz:
 *  - Distanzmatrix
 *  - Relative Nähe (0–1 normalisiert)
 *  - Mikro-Cluster (Gebiete)
 *  - Transition-Scores (wie gut A → B funktioniert)
 *  - kompaktes Summary
 */

export function computeGeoContext(candidates: Array<{ id: string; lat: number; lng: number }>) {
  if (!candidates || candidates.length === 0) {
    return {
      distances: {},
      normalized: {},
      transitions: {},
      clusters: [],
      summary: {
        totalCandidates: 0,
        approxClusters: 0,
        notes: "Keine Geo-Daten vorhanden",
      },
    };
  }

  // =====================================================================
  // 1) Distanzmatrix
  // =====================================================================
  const distances: Record<string, Record<string, number>> = {};
  let maxDistance = 0;

  for (const a of candidates) {
    distances[a.id] = {};
    for (const b of candidates) {
      const d =
        a.id === b.id
          ? 0
          : haversineKm(
              { latitude: a.lat, longitude: a.lng },
              { latitude: b.lat, longitude: b.lng }
            );

      distances[a.id][b.id] = d;
      if (d > maxDistance) maxDistance = d;
    }
  }

  // =====================================================================
  // 2) Normalisierte Distanzmatrix (0 = identisch, 1 = weit entfernt)
  // =====================================================================
  const normalized: Record<string, Record<string, number>> = {};
  for (const a of candidates) {
    normalized[a.id] = {};
    for (const b of candidates) {
      const d = distances[a.id][b.id];
      normalized[a.id][b.id] = maxDistance === 0 ? 0 : d / maxDistance;
    }
  }

  // =====================================================================
  // 3) Micro-Cluster (geographische Bereiche)
  // =====================================================================
  // Distance threshold: Spots unter 0.25 (25% der maxDistance) sind "nearby"
  const THRESHOLD = 0.25;

  const clusters: Array<{ clusterKey: string; ids: string[] }> = [];
  const visited = new Set<string>();

  for (const a of candidates) {
    if (visited.has(a.id)) continue;

    const group = [a.id];
    visited.add(a.id);

    for (const b of candidates) {
      if (visited.has(b.id)) continue;

      if (normalized[a.id][b.id] <= THRESHOLD) {
        group.push(b.id);
        visited.add(b.id);
      }
    }

    group.sort();
    clusters.push({
      clusterKey: group.join("-"),
      ids: group,
    });
  }

  // =====================================================================
  // 4) Transition Scores (wie gut passt A → B?)
  // =====================================================================
  // "Nähe" = 1 - normalizedDistance
  // Damit GPT weiß:
  //   - Gute Reihenfolgen (A → B → C)
  //   - Vermeidung sinnloser Wege

  const transitions: Record<string, Record<string, number>> = {};

  for (const a of candidates) {
    transitions[a.id] = {};
    for (const b of candidates) {
      if (a.id === b.id) {
        transitions[a.id][b.id] = 0;
      } else {
        const score = 1 - normalized[a.id][b.id]; // higher = better
        transitions[a.id][b.id] = Number(score.toFixed(4));
      }
    }
  }

  // =====================================================================
  // 5) Summary (für GPT)
  // =====================================================================
  const summary = {
    totalCandidates: candidates.length,
    approxClusters: clusters.length,
    notes:
      clusters.length === candidates.length
        ? "Alle Spots sind räumlich klar getrennt."
        : clusters.length === 1
        ? "Alle Spots liegen sehr nah beieinander."
        : "Es existieren mehrere natürliche Gebiete / Areas.",
  };

  return {
    distances,
    normalized,
    transitions,
    clusters,
    summary,
  };
}
