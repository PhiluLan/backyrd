// lib/ai/synthesizeJourney.ts
import { runJsonModel } from "./jsonAi";

/* ============================================================
   TYPES
============================================================ */
type RankedPick = { id: string; score?: number };

type SynthExtra = {
  memory?: any;
  preferences?: any;
  deepPreferences?: any;
  geoContext?: any; 
  areaContext?: any;   // hybrid auto+manual+flow
  context?: any;       // Tageszeit, Saison etc.
  weather?: any;
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

const S_MAX_TITLE = 80;
const S_MAX_REASON = 140;

/* Small helper */
function S(v: any) {
  if (v == null) return "";
  return String(v);
}

/* ============================================================
   MAIN FUNCTION
============================================================ */
export async function synthesizeJourney(
  intention: any,
  topRanked: RankedPick[],
  userProfile: any,
  extra: SynthExtra
) {
  const { memory, preferences, deepPreferences, geoContext, areaContext, context, weather } =
    extra || {};

  /* ---- Whitelist: sichere IDs ---- */
  const allowedIds = Array.from(
    new Set((topRanked || []).map((x) => S(x.id)).filter(Boolean))
  );

  /* ============================================================
     PROMPT
  ============================================================= */
  const prompt = `
DU BIST: Ein hypermoderner Ausgeh-Kurator. Stil warm, präzise, empathisch, leicht verspielt.
Dein Output ist IMMER 100% JSON – ohne Text davor oder danach.

===========================
STRICT JSON MODE
===========================
- Liefere AUSSCHLIESSLICH JSON.
- KEIN Markdown, keine Kommentare, kein Text außerhalb des JSON.
- Verwende NUR Spot-IDs aus ALLOWED_IDS.
- Baue 2–4 Schritte.
- Alle Schritte müssen unterschiedliche Spot-IDs haben.

===========================
EMOTION → TON & FLOW
===========================
- stressed / overwhelmed → ruhig, entlastend, kurze Wege
- tired → cozy, low-energy, warm
- romantic → intim, ruhig, leichte Sinnlichkeit, aber nicht kitschig
- energetic / adventurous → lebendig, neugierig, aber präzise
- sad → stabilisierend, sanft
- seeking / neutral → normaler freundlicher Ton

===========================
ROUTING-REGELN (verbindlich)
===========================
- Max. Distanz zwischen zwei Steps: 4.2 km (nutze GEO_CONTEXT.distances).
- Nutze Cluster (GEO_CONTEXT.cluster) bevorzugt.
- Folge Area Flow (AREA_CONTEXT.flow) falls sinnvoll.
- Abend: Dinner vor Bar.
- Nacht: Bar zuerst.
- Sonntag: ruhigere Auswahl.
- Sommer: Outdoor bevorzugt (wenn Wetter OK).
- Winter: Indoor & cozy.
- Regen: KEIN Outdoor.
- Kälte/Wind: kurze Wege, Indoor bevorzugt.
- Steps müssen logisch zueinander passen.

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

AREA_CONTEXT:
${JSON.stringify(areaContext || {}, null, 2)}

CONTEXT (Zeit & Saison):
${JSON.stringify(context || {}, null, 2)}

WEATHER:
${JSON.stringify(weather || {}, null, 2)}

===========================
OUTPUTFORMAT (Pflicht)
===========================
{
  "greeting": "string",
  "steps": [
    { "step": 1, "spotId": "uuid", "title": "string", "reason": "string" }
  ],
  "_debug": "max. 1 kurzer Satz, was angewendet wurde"
}
`;

  /* ============================================================
     MODEL CALL
  ============================================================= */
  const raw = await runJsonModel({ prompt, model: "gpt-4.1" });

  const out: SynthOut =
    typeof raw === "string" ? JSON.parse(raw) : (raw as SynthOut);

  /* ============================================================
     SANITIZE + REPAIR
  ============================================================= */
  const ALLOWED = new Set(allowedIds);
  let steps = Array.isArray(out?.steps) ? out.steps : [];

  // Filter invalid IDs
  steps = steps.filter((s) => s && ALLOWED.has(S(s.spotId)));

  // Remove duplicates
  const used = new Set<string>();
  steps = steps.filter((s) => {
    const id = S(s.spotId);
    if (used.has(id)) return false;
    used.add(id);
    return true;
  });

  // Sort steps by numeric order, fallback index
  steps = steps
    .map((s, i) => ({
      step: Number.isFinite(Number(s.step)) ? Number(s.step) : i + 1,
      spotId: S(s.spotId),
      title: S(s.title).slice(0, S_MAX_TITLE),
      reason: S(s.reason).slice(0, S_MAX_REASON),
    }))
    .sort((a, b) => a.step - b.step);

  /* MINIMUM 2 STEPS ENFORCED */
  if (steps.length < 2) {
    // Not enough steps → take first 2 allowed IDs
    const add = allowedIds.slice(0, 2).filter((id) => !used.has(id));
    steps = add.map((id, i) => ({
      step: i + 1,
      spotId: id,
      title: "Empfehlung",
      reason: "Passt gut zur Anfrage.",
    }));
  }

  // Maximum 4 steps
  steps = steps.slice(0, 4);

  /* ============================================================
     FINAL RETURN
  ============================================================= */
  return {
    greeting: S(out?.greeting) || "Hier ist eine Idee, die zu dir passt:",
    steps,
    _debug: S(out?._debug),
  };
}
