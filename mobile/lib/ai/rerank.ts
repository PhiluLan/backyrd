// lib/ai/rerank.ts

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

/**
 * Lokales Intention-Modell (Phase 0)
 * — dieser Intent wird später durch GPT ersetzt & ergänzt.
 */
export type UserIntent = {
  wantRomance?: boolean;
  wantChill?: boolean;
  wantLively?: boolean;
  wantFood?: boolean;
  wantBar?: boolean;
  wantWalk?: boolean;
  preferredDistanceKm?: number | null;
  memory?: any;
  preferences?: any;
  deepPreferences?: any;
};

/**
 * ULTRA HYBRID LOCAL RERANKER
 *
 * Kombiniert:
 * - heuristische Mood-Matches
 * - Kategorie-Matches
 * - Distanzprofil
 * - Popularität
 * - User Preference Signals
 * - Deep Preference Vector Matches
 */
export function rerankSpots(spots: ReRankInput[], intent: UserIntent): ScoredSpot[] {
  const {
    wantRomance,
    wantChill,
    wantLively,
    wantFood,
    wantBar,
    wantWalk,
    preferredDistanceKm,
    preferences,
    deepPreferences,
  } = intent;

  return spots
    .map((spot) => {
      const cat = normalize(spot.category);
      const moods = (spot.moods || []).map(normalize);
      const rmoods = (spot.reviewMoods || []).map(normalize);

      /* ============================================================
         1) M O O D   S C O R E
      ============================================================ */
      let moodScore = 0;

      // Romance / Date
      if (wantRomance) {
        if (moods.some((m) => m.includes("romant"))) moodScore += 1.2;
        if (moods.some((m) => m.includes("cozy"))) moodScore += 0.6;
        if (rmoods.some((m) => m.includes("romant"))) moodScore += 0.8;
      }

      // Cozy / Chill
      if (wantChill || wantChill === undefined) {
        if (moods.some((m) => m.includes("gemüt") || m.includes("cozy") || m.includes("chill")))
          moodScore += 1.1;
        if (rmoods.some((m) => m.includes("gemüt") || m.includes("chill")))
          moodScore += 0.7;
      }

      // Lively / Energetic
      if (wantLively) {
        if (moods.some((m) => m.includes("lebend") || m.includes("party")))
          moodScore += 0.9;
        if (rmoods.some((m) => m.includes("party")))
          moodScore += 0.7;
      }

      /* ============================================================
         2) C A T E G O R Y   S C O R E
      ============================================================ */
      let catScore = 0;

      if (wantFood && cat.includes("restaurant")) catScore += 1.3;
      if (wantBar && (cat.includes("bar") || cat.includes("wein"))) catScore += 1.2;
      if (wantWalk && (cat.includes("walk") || cat.includes("aussicht") || cat.includes("view")))
        catScore += 1.0;

      /* ============================================================
         3) D I S T A N C E   S C O R E
      ============================================================ */
      const dist = spot.distanceKm ?? 999;
      let distScore = 0;

      const ideal = preferredDistanceKm ?? 3; // fallback: 3km angenehm

      if (dist <= ideal) distScore = 1.2;
      else if (dist <= ideal + 1.5) distScore = 0.7;
      else if (dist <= ideal + 3) distScore = 0.3;
      else distScore = -0.4;

      /* ============================================================
         4) P O P U L A R I T Y   S C O R E
      ============================================================ */
      const popularityScore = Math.min(1.0, Math.log(1 + rmoods.length) / 2);

      /* ============================================================
         5) P R E F E R E N C E S   (User Behavior Model)
      ============================================================ */
      let preferenceScore = 0;

      if (preferences?.moodPreferences) {
        for (const m of moods) {
          preferenceScore += preferences.moodPreferences[m] ?? 0;
        }
      }

      /* ============================================================
         6) D E E P   P R E F E R E N C E S   (Neural Similarity)
      ============================================================ */
      let deepScore = 0;
      if (deepPreferences?.vectors && deepPreferences.vectors[spot.id]) {
        deepScore = deepPreferences.vectors[spot.id]; // already normalized 0–1
      }

      /* ============================================================
         7) F I N A L   S C O R E (Weighted Hybrid)
      ============================================================ */
      const score =
        moodScore * 1.6 +
        catScore * 1.3 +
        distScore * 1.1 +
        popularityScore * 0.8 +
        preferenceScore * 1.2 +
        deepScore * 1.4;

      return { ...spot, score };
    })
    .sort((a, b) => b.score - a.score);
}
