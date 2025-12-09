// lib/ai/memory.ts
import { supabase } from "../supabase";
import { haversineKm } from "../utils/haversine";

/**
 * Memory Engine 2.0
 * Liefert IMMER robuste Profile:
 *  - moodStats (normiert)
 *  - categoryStats (normiert)
 *  - frequentSpots
 *  - dislikedSpots
 *  - avgDistanceKm (korrekt berechnet!)
 *  - activeHours
 *  - spotAttentionScores
 */
export async function buildUserMemory(userId: string) {
  const memory = {
    frequentSpots: [],
    dislikedSpots: [],
    moodStats: {},
    categoryStats: {},
    avgDistanceKm: null,
    activeHours: [],
    spotAttention: {}, // KEY ADDITION
  };

  // Soft fail → falls userId fehlt
  if (!userId) return memory;

  // Helper: Normalize Map 0..1
  const normalizeMap = (map: Record<string, number>) => {
    const entries = Object.entries(map);
    if (entries.length === 0) return {};

    const max = Math.max(...entries.map(([_, v]) => v || 0), 0.0001);
    const out: Record<string, number> = {};

    for (const [k, v] of entries) {
      const nv = Math.max(0, v / max);
      if (nv > 0.03) out[k] = nv; // noise cutoff
    }
    return out;
  };

  // =====================================================================
  // 1) REVIEWS — strongest memory signal
  // =====================================================================
  const { data: reviews } = await supabase
    .from("reviews")
    .select("spot_id, mood_a, mood_b, created_at, spots(lat,lng)")
    .eq("user_id", userId);

  const moodCounts: Record<string, number> = {};
  const timeCounts: Record<string, number> = {};
  const distanceVals: number[] = [];
  const spotAttention: Record<string, number> = {};

  if (reviews) {
    for (const r of reviews) {
      const sid = r.spot_id;
      if (!sid) continue;

      // Mood extraction
      [r.mood_a, r.mood_b].forEach((m) => {
        if (m) {
          const key = m.toLowerCase();
          moodCounts[key] = (moodCounts[key] || 0) + 1;
        }
      });

      // Active hours
      const h = new Date(r.created_at).getHours();
      timeCounts[h] = (timeCounts[h] || 0) + 1;

      // Distance stat
      const lat = Number(r.spots?.lat);
      const lng = Number(r.spots?.lng);
      if (lat && lng) {
        // distance from Basel center (reference)
        const center = { latitude: 47.5596, longitude: 7.5886 };
        distanceVals.push(haversineKm(center, { latitude: lat, longitude: lng }));
      }

      // Spot attention score
      spotAttention[sid] = (spotAttention[sid] || 0) + 3;
    }
  }

  // =====================================================================
  // 2) RESERVATIONS — strong intentionality
  // =====================================================================
  const { data: reservations } = await supabase
    .from("reservations")
    .select("spot_id, date, spots(lat,lng)")
    .eq("user_id", userId);

  if (reservations) {
    for (const r of reservations) {
      const sid = r.spot_id;
      if (!sid) continue;

      const lat = Number(r.spots?.lat);
      const lng = Number(r.spots?.lng);
      if (lat && lng) {
        const center = { latitude: 47.5596, longitude: 7.5886 };
        distanceVals.push(haversineKm(center, { latitude: lat, longitude: lng }));
      }

      spotAttention[sid] = (spotAttention[sid] || 0) + 5; // strong signal
    }
  }

  // =====================================================================
  // 3) VISITS — weaker but valuable signal
  // =====================================================================
  const { data: visits } = await supabase
    .from("spot_visits")
    .select("spot_id, category, created_at")
    .eq("user_id", userId);

  const categoryCounts: Record<string, number> = {};
  const spotCounts: Record<string, number> = {};

  if (visits) {
    for (const v of visits) {
      const cat = v.category?.toLowerCase();
      const sid = v.spot_id;
      if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      if (sid) spotCounts[sid] = (spotCounts[sid] || 0) + 1;

      // Attention
      spotAttention[sid] = (spotAttention[sid] || 0) + 1;
    }
  }

  // =====================================================================
  // 4) DISLIKES — explicit negative signal
  // =====================================================================
  const { data: dislikes } = await supabase
    .from("user_dislikes")
    .select("spot_id")
    .eq("user_id", userId);

  if (dislikes) {
    memory.dislikedSpots = dislikes.map((d) => d.spot_id);
    dislikes.forEach((d) => {
      spotAttention[d.spot_id] = (spotAttention[d.spot_id] || 0) - 3; // reduce score
    });
  }

  // =====================================================================
  // Normalize & finalize
  // =====================================================================

  memory.moodStats = normalizeMap(moodCounts);
  memory.categoryStats = normalizeMap(categoryCounts);

  memory.frequentSpots = Object.entries(spotCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([sid]) => sid);

  memory.activeHours = Object.entries(timeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => Number(h));

  memory.avgDistanceKm =
    distanceVals.length > 0
      ? distanceVals.reduce((a, b) => a + b, 0) / distanceVals.length
      : null;

  memory.spotAttention = normalizeMap(spotAttention); // New vector

  return memory;
}
