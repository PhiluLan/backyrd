// lib/ai/rankCandidates.ts
import { runJsonModel } from "./jsonAi";

/**
 * rankCandidates 3.5 ULTRA
 *
 * Liefert exakte KI-Bewertungen pro Spot anhand einer strukturierten,
 * extrem klaren Bewertungsmatrix.
 *
 * GPT kann damit viel bessere, konsistente Rankings erzeugen.
 */
export async function rankCandidates(
  intention: any,
  slim: any[],
  context: {
    memory?: any;
    preferences?: any;
    deepPreferences?: any;
    geoContext?: any;
    areaContext?: any;
  } = {}
) {
  const { memory, preferences, deepPreferences, geoContext, areaContext } = context;

  const prompt = `
Du bist eine hochpräzise Ranking-KI.

Bewerte jeden Spot anhand folgender Kriterien:

==========================
INTENTION DES USERS
==========================
${JSON.stringify(intention, null, 2)}

==========================
USER MEMORY / PREFERENCES
==========================
${JSON.stringify(memory || {}, null, 2)}

==========================
USER PREFERENCE MODEL (V2)
==========================
${JSON.stringify(preferences || {}, null, 2)}

==========================
DEEP PREFERENCES (Neural)
==========================
${JSON.stringify(deepPreferences || {}, null, 2)}

==========================
GEO CONTEXT
==========================
${JSON.stringify(geoContext || {}, null, 2)}

==========================
AREA CONTEXT (Hybrid)
==========================
${JSON.stringify(areaContext || {}, null, 2)}

==========================
CANDIDATES (Slim Spot Profiles)
==========================
${JSON.stringify(slim, null, 2)}

==========================
BEWERTUNGSMATRIX (EXTREM WICHTIG)
==========================

Für jeden Spot berechnest du eine Score zwischen 0 und 1 anhand:

1) Primary Mood Fit (0–1)
2) Secondary Mood Fit (0–1)
3) Avoid Mood Penalty (0–1, aber negativ)
4) Category Fit (0–1)
5) Distance Fit (0–1; ideal, wenn <= PreferredDistance)
6) User Preference Fit (0–1)
7) Deep Preference Similarity (0–1)
8) Area Flow Fit (0–1; wie gut passt der Spot zur geplanten Area)
9) Emotional Alignment (z. B. "stressed" → ruhigere Spots hoch bewerten)

GESAMTSCORE = gewichtete Summe:
{
  primary: 0.25,
  secondary: 0.10,
  avoidPenalty: -0.15,
  category: 0.10,
  distance: 0.10,
  preferences: 0.10,
  deepPreferences: 0.10,
  areaFlow: 0.05,
  emotion: 0.05
}

Gib **nur validen JSON** zurück:

FORMAT:
[
  {
    "id": "spotId",
    "score": number,
    "reasoning": "kurze Begründung",
    "fitFactors": ["Mood fit", "Distance good", "Matches preferences", ...]
  }
]
`;

  return runJsonModel({
    prompt,
    model: "gpt-4.1", // bewusst stärkeres Modell
    temperature: 0.4, // stabilere Rankings
  });
}
