import { runJsonModel } from "./jsonAi";

export async function extractIntention(input: string, memory: any) {
  const prompt = `
Analysiere die Nutzeranfrage und extrahiere seine Absicht.

NUTZERANFRAGE:
"${input}"

MEMORY:
${JSON.stringify(memory || {}, null, 2)}

Bitte analysiere zusätzlich die emotionale Lage des Nutzers.

Liefere ein Feld "emotion" mit einer der folgenden Kategorien:
- "stressed"
- "tired"
- "calm"
- "romantic"
- "hopeful"
- "sad"
- "energetic"
- "neutral"
- "overwhelmed"
- "seeking"
- "adventurous"

Falls unklar → "neutral".

Beispiel:
"ich brauche was ruhiges" → "stressed"
"ich bin müde von der Woche" → "tired"
"lass uns was lebeniges" → "energetic"
"cozy date" → "romantic"

GIB AUSSCHLIESSLICH folgendes JSON zurück:
{
  "primaryMood": "string",
  "secondaryMoods": ["..."],
  "avoid": ["..."],
  "mustHaves": ["..."],
  "intensity": "ruhig | lebhaft | neutral",
  "distancePreferenceKm": number | null,
  "summary": "string"
}
  `;

  return runJsonModel({ prompt, model: "gpt-4.1-mini" });
}
