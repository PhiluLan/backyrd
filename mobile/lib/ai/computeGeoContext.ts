import { haversineKm } from "../utils/haversine";

export function computeGeoContext(candidates: any[]) {
  // Distanzmatrix
  const distances: Record<string, Record<string, number>> = {};

  for (const a of candidates) {
    distances[a.id] = {};
    for (const b of candidates) {
      if (a.id === b.id) {
        distances[a.id][b.id] = 0;
      } else {
        distances[a.id][b.id] = haversineKm(
          { latitude: a.lat, longitude: a.lng },
          { latitude: b.lat, longitude: b.lng }
        );
      }
    }
  }

  // Clustering (super simpel — reicht für GPT)
  const cluster = candidates.map((s) => ({
    id: s.id,
    lat: s.lat,
    lng: s.lng,
    clusterKey: `${Math.round(s.lat * 50)}-${Math.round(s.lng * 50)}`,
  }));

  return {
    distances,
    cluster,
    summary: {
      totalCandidates: candidates.length,
      approxClusters: new Set(cluster.map((c) => c.clusterKey)).size,
    },
  };
}
