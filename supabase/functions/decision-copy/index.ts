import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type ReviewSnippet = {
  text?: string | null;
  mood_a?: string | null;
  mood_b?: string | null;
};

type DecisionCopySpotInput = {
  spot_id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  category_name?: string | null;
  description?: string | null;
  price_level?: number | null;
  opening_hours_summary?: string | null;
  is_open_now?: boolean | null;
  matched_tokens?: string[] | null;
  matched_counts?: number[] | null;
  matched_terms?: string[] | null;
  why_this?: string | null;
  reviews?: ReviewSnippet[] | null;
  rank?: number;
};

type DecisionCopyRequest = {
  city: string;
  moodA: string;
  moodB: string;
  decisionMode?: string | null;
  userConfidence?: number | null;
  spots: DecisionCopySpotInput[];
};

type DecisionCopyItem = {
  spot_id: string;
  headline: string;
  subtitle: string;
  why: string;
  cta_label: string;
};

type DecisionCopyResponse = {
  title: string;
  body: string;
  items: DecisionCopyItem[];
  source: "openai" | "fallback";
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item)).filter(Boolean).slice(0, 8);
}

function safeReviews(value: unknown): ReviewSnippet[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 3)
    .map((review: any) => ({
      text: clean(review?.text).slice(0, 280),
      mood_a: clean(review?.mood_a).slice(0, 40),
      mood_b: clean(review?.mood_b).slice(0, 40),
    }))
    .filter((review) => review.text || review.mood_a || review.mood_b);
}

function moodText(payload: DecisionCopyRequest) {
  return [clean(payload.moodA), clean(payload.moodB)].filter(Boolean).join(" + ");
}

function priceText(value?: number | null) {
  if (!value || value < 1) return "";
  if (value === 1) return "eher unkompliziert";
  if (value === 2) return "normal preislich";
  if (value === 3) return "eher etwas gehobener";
  return "preislich spezieller";
}

function humanFallbackWhy(payload: DecisionCopyRequest, spot: DecisionCopySpotInput, index: number) {
  const moods = moodText(payload);
  const city = clean(spot.city) || clean(payload.city) || "hier";
  const category = clean(spot.category_name);
  const address = clean(spot.address);
  const tokens = safeArray(spot.matched_tokens);
  const reviews = safeReviews(spot.reviews);
  const firstReview = reviews.find((review) => review.text)?.text;
  const firstToken = tokens[0];
  const categoryPart = category ? ` als ${category}` : "";
  const addressPart = address ? ` an der ${address}` : "";
  const pricePart = priceText(spot.price_level);

  if (index === 0) {
    if (firstReview) {
      return `${spot.name}${categoryPart} wirkt wie der naheliegende erste Pick. In den Rückmeldungen klingt es eher nach ${firstToken || moods}; ${pricePart ? `${pricePart}, ` : ""}also gut, wenn du jetzt nicht mehr lange überlegen willst.`;
    }

    return `${spot.name}${categoryPart}${addressPart} ist der Pick, mit dem ich anfangen würde. Nicht zu kompliziert, nicht zu speziell — einfach eine gute erste Richtung für ${moods}.`;
  }

  if (index === 1) {
    return `${spot.name}${categoryPart} ist die sichere zweite Wahl. Weniger Experiment, mehr “das funktioniert wahrscheinlich” — gerade, wenn du ${moods} suchst.`;
  }

  return `${spot.name}${categoryPart} ist etwas offener. Ich würde ihn nehmen, wenn du nicht beim offensichtlichsten Ort landen willst, aber trotzdem in ${city} bleiben möchtest.`;
}

function fallbackCopy(payload: DecisionCopyRequest): DecisionCopyResponse {
  const city = clean(payload.city) || "deiner Stadt";
  const moods = moodText(payload) || "deinen Vibe";

  return {
    source: "fallback",
    title: "Ich hätte diese drei im Kopf",
    body: `Für ${moods} in ${city} würde ich nicht ewig suchen. Diese drei fühlen sich nach einer guten Richtung an — der erste ist am sichersten, der dritte etwas offener.`,
    items: payload.spots.slice(0, 3).map((spot, index) => ({
      spot_id: spot.spot_id,
      headline:
        index === 0
          ? "Würde ich zuerst nehmen"
          : index === 1
            ? "Sichere zweite Wahl"
            : "Etwas mehr Zufall",
      subtitle:
        index === 0
          ? "Wenn du jetzt einfach los willst."
          : index === 1
            ? "Weniger mutig, aber wahrscheinlich gut."
            : "Für den Fall, dass du offen bist.",
      why: humanFallbackWhy(payload, spot, index),
      cta_label: "Dahin gehen",
    })),
  };
}

function validatePayload(input: any): DecisionCopyRequest {
  const city = clean(input?.city);
  const moodA = clean(input?.moodA);
  const moodB = clean(input?.moodB);

  const spots = Array.isArray(input?.spots)
    ? input.spots
        .slice(0, 3)
        .map((spot: any, index: number) => ({
          spot_id: clean(spot?.spot_id),
          name: clean(spot?.name),
          city: clean(spot?.city),
          address: clean(spot?.address),
          category_name: clean(spot?.category_name),
          description: clean(spot?.description).slice(0, 420),
          price_level: Number.isFinite(Number(spot?.price_level)) ? Number(spot.price_level) : null,
          opening_hours_summary: clean(spot?.opening_hours_summary).slice(0, 220),
          is_open_now: typeof spot?.is_open_now === "boolean" ? spot.is_open_now : null,
          matched_tokens: safeArray(spot?.matched_tokens),
          matched_counts: Array.isArray(spot?.matched_counts)
            ? spot.matched_counts.slice(0, 8).map((n: unknown) => Number(n)).filter(Number.isFinite)
            : [],
          matched_terms: safeArray(spot?.matched_terms),
          why_this: clean(spot?.why_this).slice(0, 320),
          reviews: safeReviews(spot?.reviews),
          rank: Number.isFinite(Number(spot?.rank)) ? Number(spot.rank) : index + 1,
        }))
        .filter((spot: DecisionCopySpotInput) => spot.spot_id && spot.name)
    : [];

  if (!city) throw new Error("city_required");
  if (!moodA || !moodB) throw new Error("moods_required");
  if (!spots.length) throw new Error("spots_required");

  return {
    city,
    moodA,
    moodB,
    decisionMode: clean(input?.decisionMode),
    userConfidence: Number.isFinite(Number(input?.userConfidence)) ? Number(input.userConfidence) : null,
    spots,
  };
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;

  const parts: string[] = [];

  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }

  return parts.join("\n").trim();
}

function stripForbiddenLanguage(text: string) {
  return clean(text)
    .replace(/\bSignale\b/gi, "Hinweise")
    .replace(/\bSignal\b/gi, "Hinweis")
    .replace(/\bMood-Signale\b/gi, "Stimmungen")
    .replace(/\bMood-Spur\b/gi, "Richtung")
    .replace(/\bplausibler Pick\b/gi, "gute Option")
    .replace(/\bReview\/Mood-Signalen\b/gi, "Rückmeldungen")
    .replace(/\bReviews\/Mood-Signalen\b/gi, "Rückmeldungen")
    .replace(/\bDatenbasis\b/gi, "Eindruck")
    .replace(/\bDaten\b/gi, "Eindruck")
    .replace(/\bbasierend auf\b/gi, "ausgehend von")
    .replace(/\bAlgorithmus\b/gi, "Auswahl");
}

function normalizeAiResult(parsed: any, payload: DecisionCopyRequest): DecisionCopyResponse {
  const fallback = fallbackCopy(payload);
  const inputIds = new Set(payload.spots.map((spot) => spot.spot_id));

  const items: DecisionCopyItem[] = Array.isArray(parsed?.items)
    ? parsed.items
        .map((item: any) => ({
          spot_id: clean(item?.spot_id),
          headline: stripForbiddenLanguage(item?.headline).slice(0, 42),
          subtitle: stripForbiddenLanguage(item?.subtitle).slice(0, 76),
          why: stripForbiddenLanguage(item?.why).slice(0, 320),
          cta_label: stripForbiddenLanguage(item?.cta_label).slice(0, 24) || "Dahin gehen",
        }))
        .filter((item: DecisionCopyItem) => inputIds.has(item.spot_id) && item.headline && item.subtitle && item.why)
    : [];

  if (items.length !== payload.spots.length) {
    return fallback;
  }

  return {
    source: "openai",
    title: stripForbiddenLanguage(parsed?.title).slice(0, 70) || fallback.title,
    body: stripForbiddenLanguage(parsed?.body).slice(0, 300) || fallback.body,
    items,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let payload: DecisionCopyRequest;

  try {
    payload = validatePayload(await req.json());
  } catch (error) {
    return jsonResponse(
      {
        error: "bad_request",
        message: error instanceof Error ? error.message : "Invalid payload",
      },
      400,
    );
  }

  if (!OPENAI_API_KEY) {
    return jsonResponse(fallbackCopy(payload));
  }

  const systemPrompt = `
Du schreibst für Backyrd, eine App, die Freunden Orte empfiehlt.

Du bist NICHT:
- ein Datenanalyst
- ein Marketing-Texter
- ein Roboter
- ein Restaurantkritiker
- ein Reiseführer

Du bist:
- ein guter Freund mit Geschmack
- ehrlich
- ruhig
- natürlich
- direkt
- leicht charmant
- nicht übertrieben

Sprache:
- Deutsch
- Schweizer/mitteleuropäisch natürlich, aber kein Dialekt
- kurze Sätze
- klingt wie eine echte Empfehlung per WhatsApp
- warm, aber nicht kitschig
- selbstbewusst, aber nicht absolut

Du bekommst pro Ort echten Kontext:
- Name
- Kategorie
- Adresse
- Beschreibung, falls vorhanden
- Preislevel
- Öffnungszeiten-Zusammenfassung, falls vorhanden
- offene/geschlossene Info, falls vorhanden
- Begriffe, die zum gewünschten Vibe passen
- echte Review-Ausschnitte

Verbotene Wörter und Formulierungen:
- Signal
- Signale
- Mood-Signale
- Mood-Spur
- Daten
- Datenbasis
- plausibel
- basierend auf
- Algorithmus
- Ranking
- Score
- Review-Signale
- Nutzerverhalten
- starke Hinweise
- perfekte Empfehlung
- "landet hier wegen"
- "wurde verbunden mit"
- "dieser Ort wurde"

Wichtig:
- Nicht behaupten, dass du etwas sicher weisst, wenn der Kontext dünn ist.
- Nutze echte Details nur, wenn sie geliefert wurden.
- Verwandle technische Begriffe in natürliche Sprache.
- Sage lieber "klingt nach", "wirkt eher", "ich würde" statt absoluter Aussagen.
- Der erste Spot darf klar empfohlen werden.
- Der dritte Spot darf etwas spielerischer/offener sein.
- Keine Aufzählungen.
- Kein "laut Reviews" in jedem Satz. Wenn du Reviews nutzt, dann natürlich: "In den Rückmeldungen klingt es eher nach..."
`.trim();

  const userPrompt = {
    task: "Schreibe natürliche Texte für einen Decision Screen mit drei Ort-Empfehlungen.",
    situation:
      "Der User will nicht ewig suchen. Er hat zwei Vibes eingegeben. Die App zeigt drei Orte.",
    city: payload.city,
    moodA: payload.moodA,
    moodB: payload.moodB,
    decisionMode: payload.decisionMode,
    userConfidence: payload.userConfidence,
    spots: payload.spots,
    desired_style_examples: [
      "Ich würde hier anfangen, wenn du etwas Ruhiges willst, aber trotzdem nicht komplett aus dem Stadtgefühl raus möchtest.",
      "Das ist eher die sichere Wahl: kein grosser Überraschungsmoment, aber wahrscheinlich genau angenehm für heute.",
      "Den würde ich nehmen, wenn du offen bist für etwas weniger Offensichtliches.",
      "Klingt nach einem Ort, an dem man nicht viel erklären muss: hingehen, sitzen, ankommen.",
      "Nicht der lauteste Pick, aber wahrscheinlich der passendere.",
      "Wenn du nicht komplett experimentieren willst, ist das wahrscheinlich der angenehmste Startpunkt.",
      "Wirkt nach einer guten Wahl, wenn du sitzen, reden und nicht noch fünf Orte vergleichen willst.",
    ],
    output_rules: {
      title: "Max 60 Zeichen. Klingt wie ein Freund, nicht wie UI-Systemtext.",
      body: "Max 280 Zeichen. Erklärt die Auswahl locker und ehrlich.",
      items: {
        headline: "Max 34 Zeichen. Natürliches Label, z.B. 'Würde ich zuerst nehmen'.",
        subtitle: "Max 68 Zeichen. Kein technisches Warum.",
        why: "Max 300 Zeichen. Freundschaftliche Empfehlung. Konkreter Grund, aber keine technischen Wörter.",
        cta_label: "2-4 Wörter.",
      },
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: JSON.stringify(userPrompt),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "decision_copy",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["title", "body", "items"],
              properties: {
                title: { type: "string" },
                body: { type: "string" },
                items: {
                  type: "array",
                  minItems: payload.spots.length,
                  maxItems: payload.spots.length,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["spot_id", "headline", "subtitle", "why", "cta_label"],
                    properties: {
                      spot_id: { type: "string" },
                      headline: { type: "string" },
                      subtitle: { type: "string" },
                      why: { type: "string" },
                      cta_label: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        temperature: 0.88,
        max_output_tokens: 1000,
      }),
    });

    clearTimeout(timeout);

    if (!openAiResponse.ok) {
      const errorText = await openAiResponse.text();
      console.log("OpenAI decision-copy failed:", openAiResponse.status, errorText);
      return jsonResponse(fallbackCopy(payload));
    }

    const raw = await openAiResponse.json();
    const outputText = extractOutputText(raw);

    if (!outputText) {
      return jsonResponse(fallbackCopy(payload));
    }

    const parsed = JSON.parse(outputText);
    return jsonResponse(normalizeAiResult(parsed, payload));
  } catch (error) {
    console.log("decision-copy error:", error);
    return jsonResponse(fallbackCopy(payload));
  }
});