// lib/ai/computeAreaContext.ts
import { localAreas } from "./localAreas";

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeAreaContext(spots) {
  // Spots = topRanked oder slim
  let bestArea = null;
  let bestDist = Infinity;

  spots.forEach((s) => {
    localAreas.forEach((area) => {
      const d = haversineKm(s.lat, s.lng, area.center.lat, area.center.lng);
      if (d < bestDist) {
        bestDist = d;
        bestArea = area;
      }
    });
  });

  return {
    area: bestArea,
    distanceToCenter: bestDist,
  };
}
