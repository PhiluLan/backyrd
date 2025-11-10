// /lib/ai/rerank.ts

export type ReRankInput = {
  id: string;
  name: string;
  category: string;
  moods: string[];
  reviewMoods: string[];
  distanceKm: number | null;
};

export type ScoredSpot = ReRankInput & { score: number };

function normalize(s?: string | null): string {
  return (s || "").trim().toLowerCase();
}

export type UserIntent = {
  wantRomance: boolean;
  wantChill: boolean;
  wantLively: boolean;
  wantFood: boolean;
  wantBar: boolean;
  wantWalk: boolean;
};

export function rerankSpots(
  spots: ReRankInput[],
  intent: UserIntent
): ScoredSpot[] {
  return spots
    .map((s) => {
      const cat = normalize(s.category);
      const moods = (s.moods || []).map(normalize);
      const rmoods = (s.reviewMoods || []).map(normalize);

      let moodScore = 0;

      // ✅ Mood Matching
      if (intent.wantRomance) {
        if (moods.some((m) => m.includes("romant"))) moodScore += 1.0;
        if (rmoods.some((m) => m.includes("romant"))) moodScore += 0.8;
      }
      if (intent.wantChill || intent.wantChill === undefined) {
        if (moods.some((m) => m.includes("gemüt") || m.includes("chill"))) moodScore += 0.9;
        if (rmoods.some((m) => m.includes("gemüt") || m.includes("chill"))) moodScore += 0.7;
      }
      if (intent.wantLively) {
        if (moods.some((m) => m.includes("lebend"))) moodScore += 0.8;
        if (rmoods.some((m) => m.includes("party"))) moodScore += 0.6;
      }

      // ✅ Kategorie-Matching
      let catScore = 0;
      if (intent.wantFood && cat.includes("restaurant")) catScore += 1.2;
      if (intent.wantBar && (cat.includes("bar") || cat.includes("wein"))) catScore += 1.0;
      if (intent.wantWalk && (cat.includes("walk") || cat.includes("aussicht"))) catScore += 0.8;

      // ✅ Distanz-Bonus
      const dist = s.distanceKm ?? 999;
      let distScore = 0;
      if (dist <= 1) distScore = 1.2;
      else if (dist <= 3) distScore = 0.9;
      else if (dist <= 5) distScore = 0.5;
      else distScore = -0.5;

      // ✅ Popularität (Review-Moods)
      const popularityScore = Math.min(1.0, Math.log(1 + rmoods.length) / 2);

      // ✅ Gesamtscore (gewichtet)
      const score =
        moodScore * 1.5 +
        catScore * 1.3 +
        distScore * 1.2 +
        popularityScore * 1.0;

      return {
        ...s,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
}
