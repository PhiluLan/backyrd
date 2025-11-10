import { supabase } from "../supabase";

export async function buildUserMemory(userId: string) {
  let memory: any = {
    frequentSpots: [],
    dislikedSpots: [],
    moodStats: {},
    categoryStats: {},
    avgDistanceKm: null,
    activeHours: [],
  };

  // --------------------------
  // 1) Reviews → Moods + Likes
  // --------------------------
  const { data: reviews } = await supabase
    .from("reviews")
    .select("spot_id, mood_a, mood_b, created_at");

  if (reviews) {
    const moodCount: Record<string, number> = {};
    const timeCount: Record<string, number> = {};

    reviews.forEach((r) => {
      // Moods
      [r.mood_a, r.mood_b].forEach((m) => {
        if (m) {
          const key = m.toLowerCase();
          moodCount[key] = (moodCount[key] || 0) + 1;
        }
      });

      // aktive Uhrzeit
      const hour = new Date(r.created_at).getHours().toString();
      timeCount[hour] = (timeCount[hour] || 0) + 1;
    });

    memory.moodStats = moodCount;

    // aktive Uhrzeiten extrahieren
    memory.activeHours = Object.entries(timeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => Number(h));
  }

  // ------------------------------------------
  // 2) Bookings (reservations) → Distance Stats
  // ------------------------------------------
  const { data: reservations } = await supabase
    .from("reservations")
    .select("spot:spot_id(lat,lng), created_at");

  if (reservations) {
    const distances: number[] = [];
    reservations.forEach((r) => {
      if (r.spot?.lat && r.spot?.lng) {
        distances.push(Number(r.spot.lat));
      }
    });
    if (distances.length > 0) {
      memory.avgDistanceKm =
        distances.reduce((a, b) => a + b, 0) / distances.length;
    }
  }

  // ---------------------------------------
  // 3) Click Tracking (spot_visits)
  // ---------------------------------------
  const { data: visits } = await supabase
    .from("spot_visits")
    .select("spot_id, category, created_at")
    .eq("user_id", userId);

  if (visits) {
    const catCount: Record<string, number> = {};
    const spotCount: Record<string, number> = {};

    visits.forEach((v) => {
      if (v.category) {
        const key = v.category.toLowerCase();
        catCount[key] = (catCount[key] || 0) + 1;
      }
      spotCount[v.spot_id] = (spotCount[v.spot_id] || 0) + 1;
    });

    memory.categoryStats = catCount;

    // häufige Spots
    memory.frequentSpots = Object.entries(spotCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
  }

  // ---------------------------------------
  // 4) Negative Moods (User Avoids)
  // ---------------------------------------
  const { data: dislikes } = await supabase
    .from("user_dislikes")
    .select("spot_id")
    .eq("user_id", userId);

  if (dislikes) {
    memory.dislikedSpots = dislikes.map((d) => d.spot_id);
  }

  return memory;
}
