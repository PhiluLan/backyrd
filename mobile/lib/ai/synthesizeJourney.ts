// lib/ai/synthesizeJourney.ts
import { runJsonModel } from "./jsonAi";

/** Optional: leichte Typen für bessere DX */
type RankedPick = { id: string; score?: number };

type SynthExtra = {
  memory?: any;
  preferences?: any;
  deepPreferences?: any;
  geoContext?: any;     // computeGeoContext output
  areaContext?: any;    // { auto, manual, flow } hybrid
  context?: any;        // buildContext output
  weather?: any;        // buildWeather output
};

type RawStep = {
  step?: number;
  spotId?: string;
  title?: string;
  reason?: string;
};

type SynthOut = {
  greeting?: string;
  steps?: RawStep[];
  _debug?: string;
};

function coerceString(v: any) {
  if (v == null) return "";
  return String(v);
}

export async function synthesizeJourney(
  intention: any,
  topRanked: RankedPick[],
  userProfile: any,
  extra: SynthExtra // memory + preferences + deepPreferences + geoContext + areaContext + context + weather
) {
  const {
    memory,
    preferences,
    deepPreferences,
    geoContext,
    areaContext,
    context,
    weather,
  } = extra || {};

  // Whitelist zulässiger IDs für maximale Robustheit
  const allowedIds = Array.from(
    new Set((topRanked || []).map((x) => coerceString(x?.id)).filter(Boolean))
  );

  const prompt = `
DU BIST: Ein persönlicher Ausgeh-Kurator (warm, smart, leicht verspielt). Du passt deinen Stil an die emotionale Lage an.

===========================
STRICT JSON MODE
===========================
- Gib AUSSCHLIESSLICH gültiges JSON zurück.
- KEIN Markdown, KEINE Codeblöcke, KEIN Text außerhalb des JSON.
- Verwende NUR IDs aus ALLOWED_IDS.

===========================
EMOTIONS-REGELN
===========================
Wenn emotion = "stressed" | "overwhelmed":
  ruhig, sanft, entlastend; keine Reizüberflutung.
Wenn emotion = "tired":
  cozy, leicht, energiesparend.
Wenn emotion = "romantic":
  warm, intim (nicht kitschig), leichte Poesie erlaubt.
Wenn emotion = "energetic" | "adventurous":
  lebendig, upbeat, neugierig, aber präzise.
Wenn emotion = "sad":
  warm, stabilisierend, geborgen.
Wenn emotion = "seeking" | "neutral":
  freundlicher Standardstil.

SPRACHTON:
- warm, natürlich, menschlich
- greeting: max. 1–2 Sätze
- jede "reason": max. 1 kurzer Satz

===========================
DATEN
===========================
INTENTION:
${JSON.stringify(intention, null, 2)}

USER_PROFILE:
${JSON.stringify(userProfile || {}, null, 2)}

MEMORY:
${JSON.stringify(memory || {}, null, 2)}

PREFERENCES:
${JSON.stringify(preferences || {}, null, 2)}

DEEP_PREFERENCES:
${JSON.stringify(deepPreferences || {}, null, 2)}

TOP_CANDIDATES:
${JSON.stringify(topRanked, null, 2)}

ALLOWED_IDS:
${JSON.stringify(allowedIds, null, 2)}

GEO_CONTEXT:
${JSON.stringify(geoContext || {}, null, 2)}

AREA_CONTEXT (hybrid: auto+manual+flow):
${JSON.stringify(areaContext || {}, null, 2)}

CONTEXT (Zeit/Tag/Saison):
${JSON.stringify(context || {}, null, 2)}

WEATHER:
${JSON.stringify(weather || {}, null, 2)}

===========================
ROUTING-REGELN (verbindlich)
===========================
- 2–4 Schritte, geologisch sinnvoll (keine großen Sprünge).
- Max. Distanz zwischen zwei Spots: 4.2 km (nutze GEO_CONTEXT).
- Bevorzuge nahe Kandidaten, Cluster sind gut.
- Dinner VOR Bar (außer night-mode).
- Spaziergang zwischen Essen & Bar erlaubt.
- Berücksichtige Uhrzeit & Wochentag:
  • evening → Dinner zuerst
  • night → Bar zuerst
  • Fr/Sa → lebhafter ok
  • So → ruhiger, geöffnete Spots
- Saison:
  • Sommer → Outdoor, Terrasse, Rooftop
  • Winter → Indoor, cozy
- Wetter:
  • Regen → kein Outdoor
  • Sonne → Terrasse/Spaziergang ok
  • Kälte → Indoor
  • Wind → kurze Wege, wenig Outdoor
- Area-Regeln (Basel):
  • St. Johann → cozy, kleine Bars, Nachbarschaft
  • Gundeli → hip, kreativ, jung, urban
  • Claraplatz → nightlife, international
  • Altstadt → romantisch, ruhig, Spaziergänge
  • Klybeck → alternativ, experimentell, rough
- Nutze NUR IDs aus ALLOWED_IDS.

===========================
ANTWORTFORMAT (Pflicht)
===========================
{
  "greeting": "string",
  "steps": [
    { "step": 1, "spotId": "uuid", "title": "string", "reason": "string" }
  ],
  "_debug": "kurz welche Regeln/Signale angewendet wurden"
}

GIB AUSSCHLIESSLICH GÜLTIGES JSON ZURÜCK.
`;

  // Modelcall (runJsonModel sorgt bereits für JSON-only; zusätzlich sanitisieren wir)
  const rawOut = await runJsonModel({ prompt });

  // Manche Implementationen geben bereits ein Objekt zurück, manche einen String
  const out: SynthOut =
    typeof rawOut === "string"
      ? JSON.parse(rawOut)
      : (rawOut as SynthOut);

  // --------- Sanitize + Whitelist ---------
  const allowed = new Set(allowedIds);
  const steps = Array.isArray(out?.steps) ? out.steps : [];

  const cleaned = steps
    .map((x: RawStep, i: number) => {
      const sid = coerceString(x?.spotId).trim();
      if (!sid || !allowed.has(sid)) return null;

      return {
        step: Number.isFinite(Number(x?.step)) ? Number(x?.step) : i + 1,
        spotId: sid,
        title: coerceString(x?.title).slice(0, 80),
        reason: coerceString(x?.reason).slice(0, 120),
      };
    })
    .filter(Boolean) as Required<RawStep>[];

  // Begrenze final 2–4 Schritte
  const finalSteps =
    cleaned.length >= 2 ? cleaned.slice(0, 4) : cleaned.slice(0, 1);

  return {
    greeting: coerceString(out?.greeting) || "Hier ist eine Idee, die zu dir passt:",
    steps: finalSteps,
    _debug: coerceString(out?._debug || ""),
  };
}
