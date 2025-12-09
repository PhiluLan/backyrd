import { runJsonModel } from "./jsonAi";

/**
 * Intention Engine 2.0
 * - erkennt Primary / Secondary Moods
 * - erkennt Vibes (ruhig / lively / neutral)
 * - extrahiert Must-Haves wie "gute Drinks", "Aussicht", "cozy", "romantisch"
 * - extrahiert Avoid-Words wie "nicht laut", "keine Touristen"
 * - extrahiert Distanz (z. B. "in der Nähe", "max 5km")
 * - erkennt User-Emotion
 * - nutzt sehr strikte JSON-Ausgabe
 */

export async function extractIntention(
  input: string,
  context: {
    profile?: any;
    memory?: any;
    preferences?: any;
    deepPreferences?: any;
  } = {}
) {
  const prompt = `
Du bist eine hochpräzise Intention-Engine.

Analysiere die Nutzernachricht extrem sorgfältig.  
Du darfst KEINE Annahmen erfinden.  
Extrahiere **nur**, was der Nutzer wirklich kommuniziert.

=========================
NUTZERANFRAGE
=========================
"${input}"

=========================
USER-KONTEXT
=========================
${JSON.stringify(context, null, 2)}

=========================
AUFGABE
=========================
Extrahiere folgende Felder:

1) **primaryMood**  
   - Wichtigster Mood (cozy, romantic, lively, calm, artsy, energetic …)  
   - Falls unklar → null

2) **secondaryMoods** (Array)  
   - Weitere Mood-Wörter aus Text  
   - Maximal 5  
   - Keine Duplikate

3) **avoid** (Array)  
   - Dinge, die der User NICHT will  
   Beispiel: "nicht laut", "keine Touristen", "keine Clubs"

4) **mustHaves** (Array)  
   - Dinge, die der Spot unbedingt haben sollte  
   Beispiele:
     - "gute Drinks"
     - "Ausblick"
     - "ruhig"
     - "Kerzenlicht"
     - "Natur"
     - "cozy Atmosphäre"

5) **intensity**  
   - "ruhig"
   - "lebhaft"
   - "neutral"  
   Regel:
     - Wenn Text Wörter wie „ruhig“, „entspannt“, „chillig“ → ruhig  
     - Wenn „lebendig“, „laut“, „vibe“, „party“ → lebhaft  
     - Sonst → neutral

6) **distancePreferenceKm**  
   Regeln:
     - „in der Nähe“, „in walking distance“ → 1  
     - „max 5 km“, „im Umkreis von 10km“ → entsprechende Zahl  
     - Keine Angabe → null

7) **emotion**  
   Eine der folgenden Kategorien:
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

   Regeln:
     - Wenn unklar → "neutral"

8) **summary**  
   1 Satz, der die Absicht zusammenfasst.

=========================
AUSGABEFORMAT
=========================
Du MUSST **strikt** folgendes JSON liefern — ohne Text, ohne Markdown:

{
  "primaryMood": "string | null",
  "secondaryMoods": ["string"],
  "avoid": ["string"],
  "mustHaves": ["string"],
  "intensity": "ruhig | lebhaft | neutral",
  "distancePreferenceKm": number | null,
  "emotion": "string",
  "summary": "string"
}
`;

  return runJsonModel({
    prompt,
    model: "gpt-4.1-mini",
    temperature: 0.4, // stabil & strukturiert
  });
}
