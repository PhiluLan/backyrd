// supabase/functions/decision-v13/index.ts

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  OPENAI_API_KEY: string;
};

type SemanticMatchRow = {
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  similarity: number;
  document_text: string;
};

type V12DecisionRow = {
  spot_id: string;
  name: string;
  city: string | null;
  is_open_now: boolean | null;
  final_score: number | string | null;
  matched_tokens: string[] | null;
  matched_counts: number[] | null;
  matched_terms: string[] | null;
  why_this: string | null;
};

type SpotMetaRow = {
  id: string;
  name: string;
  city: string | null;
  category_id: string | null;
  categories?: {
    name?: string | null;
  } | null;
};

type PlaceTypeProfileRow = {
  context_key: string;
  place_type: string;
  label: string;
  weight: number | string;
  confidence: number | string;
  positive_count: number;
  negative_count: number;
  last_event_at: string | null;
};


type DecisionContextKeyRow = {
  context_scope: string;
  context_key: string;
};

type ContextualTasteRow = {
  context_scope: string;
  context_key: string;
  feature_type: string;
  feature_key: string;
  weight: number | string;
  confidence: number | string;
  positive_count: number;
  negative_count: number;
  last_event_at: string | null;
};

type RecentDecisionMemoryRow = {
  spot_id: string;
  spot_name: string | null;
  memory_kind: string;
  last_event_type: string;
  last_rank: number | null;
  penalty: number | string;
  bonus: number | string;
  last_event_at: string | null;
};

type Candidate = {
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  place_type: string | null;
  place_type_label: string | null;
  is_open_now: boolean | null;

  v12_rank: number | null;
  v12_score: number;
  v12_score_norm: number;

  semantic_rank: number | null;
  semantic_similarity: number;
  semantic_score_norm: number;

  combined_score: number;

  matched_tokens: string[];
  matched_terms: string[];
  technical_why_this: string | null;
  human_reason: string;
  place_type_reason: string | null;
  document_preview: string | null;

  place_type_context_weight: number;
  place_type_global_weight: number;
  place_type_context_confidence: number;
  place_type_global_confidence: number;

  sources: Array<"personalized_v12" | "semantic_v13">;

  explanation: {
    model: string;
    version: string;
    v12_rank: number | null;
    v12_score: number;
    semantic_rank: number | null;
    semantic_similarity: number;
    personalized_component: number;
    semantic_component: number;
    source_bonus: number;
    intent_boost: number;
    category_fit_component: number;
    category_mismatch_penalty: number;
    place_type_boost: number;
    contextual_taste_component: number;
    recent_memory_component: number;
    v12_only_penalty: number;
    weak_intent_penalty: number;
    combined_score: number;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

const MODEL_NAME = "backyrd_decision_v13_orchestrator";
const MODEL_VERSION = "0.1.10";

const DEFAULT_LIMIT = 12;
const DEFAULT_V12_LIMIT = 12;
const DEFAULT_SEMANTIC_LIMIT = 18;

function getEnv(): Env {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  return {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function sanitizeLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function sanitizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function embeddingToSqlVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) return null;

    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getUserIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const sub = payload?.sub;
  const role = payload?.role;

  if (role !== "authenticated") return null;
  if (!sub || typeof sub !== "string") return null;

  return sub;
}

function looksLikeAnonOrServiceToken(token: string | null): boolean {
  if (!token) return true;

  const payload = decodeJwtPayload(token);
  if (!payload) return true;

  const role = payload.role;
  const sub = payload.sub;

  if (role !== "authenticated") return true;
  if (!sub || typeof sub !== "string") return true;

  return false;
}

function buildQueryText(input: {
  city: string | null;
  moodA: string | null;
  moodB: string | null;
  query: string | null;
  primaryPlaceTypes?: string[];
  secondaryPlaceTypes?: string[];
  excludedPlaceTypes?: string[];
  audience?: string[];
  occasions?: string[];
}): string {
  const categoryText = [
    ...(input.primaryPlaceTypes ?? []).map((type) => placeTypeLabel(type)),
    ...(input.secondaryPlaceTypes ?? []).map((type) => placeTypeLabel(type)),
  ]
    .filter(Boolean)
    .join(", ");

  const baseQuery =
    input.query ??
    [input.moodA, input.moodB, categoryText].filter(Boolean).join(" ").trim();

  const parts = [
    baseQuery,
    input.city ? `City: ${input.city}` : null,
    input.moodA ? `Mood A: ${input.moodA}` : null,
    input.moodB ? `Mood B: ${input.moodB}` : null,
    (input.primaryPlaceTypes?.length ?? 0) > 0
      ? `Preferred place types: ${input.primaryPlaceTypes!.map(placeTypeLabel).join(", ")}`
      : null,
    (input.secondaryPlaceTypes?.length ?? 0) > 0
      ? `Secondary place types: ${input.secondaryPlaceTypes!.map(placeTypeLabel).join(", ")}`
      : null,
    (input.excludedPlaceTypes?.length ?? 0) > 0
      ? `Avoid place types: ${input.excludedPlaceTypes!.map(placeTypeLabel).join(", ")}`
      : null,
    (input.audience?.length ?? 0) > 0
      ? `Audience: ${input.audience!.join(", ")}`
      : null,
    (input.occasions?.length ?? 0) > 0
      ? `Occasion: ${input.occasions!.join(", ")}`
      : null,
    "Find places that match the current intent first, then the mood and atmosphere. Personal taste is only a soft signal when it conflicts with the current category intent.",
  ].filter(Boolean);

  return parts.join("\n");
}

function buildContextKey(moodA: string | null, moodB: string | null): string {
  const parts = [moodA, moodB]
    .map((value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);

  return parts.length ? parts.join("+") : "global";
}

function placeTypeFromCategory(categoryName: string | null | undefined): string {
  const category = normalizeText(categoryName);

  if (["cafe", "café", "coffee", "kaffee"].includes(category)) return "cafe";
  if (category === "bar") return "bar";
  if (["restaurant", "essen", "food"].includes(category)) return "restaurant";
  if (["nachtleben", "club", "nightlife"].includes(category)) return "nightlife";
  if (["museum", "kultur", "galerie", "gallery"].includes(category)) return "culture";
  if (["aussichtspunkt", "viewpoint", "ausflug"].includes(category)) return "outing";
  if (["aktivitat", "aktivität", "activity"].includes(category)) return "activity";
  if (["besonderes erlebnis", "erlebnis", "experience"].includes(category)) return "experience";
  if (["unterkunft / hotel", "hotel", "unterkunft"].includes(category)) return "hotel";

  return "other";
}

function placeTypeLabel(placeType: string | null | undefined): string {
  switch (placeType) {
    case "cafe":
      return "Café";
    case "bar":
      return "Bar";
    case "restaurant":
      return "Restaurant";
    case "nightlife":
      return "Nachtleben";
    case "culture":
      return "Kultur";
    case "outing":
      return "Ausflug";
    case "activity":
      return "Aktivität";
    case "experience":
      return "Erlebnis";
    case "hotel":
      return "Hotel";
    default:
      return "Anderes";
  }
}


type DecisionIntent = {
  wantsCafe: boolean;
  wantsWarm: boolean;
  wantsQuiet: boolean;
  wantsRomantic: boolean;
  wantsTalk: boolean;
  wantsDrinks: boolean;
  wantsActivity: boolean;
  wantsCulture: boolean;
  wantsArt: boolean;
  wantsSolo: boolean;
  wantsRainyDay: boolean;
  wantsOuting: boolean;
  avoidRestaurant: boolean;
  avoidParty: boolean;
  avoidBars: boolean;
  wantsKids: boolean;
  wantsFamily: boolean;
  wantsSunday: boolean;
  wantsWeekend: boolean;
  wantsIndoor: boolean;
  wantsOutdoor: boolean;
  hasMoodSignal: boolean;
  hasExplicitPlaceTypeIntent: boolean;
  mustRespectCategory: boolean;
  categoryOnlyMode: boolean;
  primaryPlaceTypes: string[];
  secondaryPlaceTypes: string[];
  excludedPlaceTypes: string[];
  audience: string[];
  occasions: string[];
};

const KNOWN_PLACE_TYPES = [
  "cafe",
  "bar",
  "restaurant",
  "nightlife",
  "culture",
  "outing",
  "activity",
  "experience",
  "hotel",
] as const;

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizePlaceType(value: unknown): string | null {
  const raw = normalizeText(String(value ?? ""));

  if (!raw) return null;

  if (["cafe", "kaffee", "coffee", "café"].includes(raw)) return "cafe";
  if (["bar", "drinks", "cocktails", "bier", "wein"].includes(raw)) return "bar";
  if (["restaurant", "essen", "food", "dinner", "lunch", "brunch"].includes(raw)) return "restaurant";
  if (["nachtleben", "nightlife", "club", "party", "tanzen"].includes(raw)) return "nightlife";
  if (["museum", "museen", "kultur", "culture", "kunst", "art", "galerie", "gallery", "ausstellung"].includes(raw)) return "culture";
  if (["ausflug", "outing", "aussichtspunkt", "viewpoint", "spaziergang", "rausgehen"].includes(raw)) return "outing";
  if (["aktivitat", "aktivitaet", "aktivität", "activity", "klettern", "spiel", "sport"].includes(raw)) return "activity";
  if (["erlebnis", "experience", "besonderes erlebnis"].includes(raw)) return "experience";
  if (["hotel", "unterkunft"].includes(raw)) return "hotel";

  if ((KNOWN_PLACE_TYPES as readonly string[]).includes(raw)) return raw;

  return null;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function sanitizePlaceTypeArray(value: unknown): string[] {
  return uniqueStrings(sanitizeStringArray(value).map(normalizePlaceType).filter(Boolean) as string[]);
}

function detectPlaceTypesFromText(joined: string): string[] {
  const result: string[] = [];

  if (/\b(cafe|kaffee|coffee)\b/.test(joined)) result.push("cafe");
  if (/\b(bar|bars|drinks|cocktail|cocktails|bier|beer|wein|wine|afterwork)\b/.test(joined)) result.push("bar");
  if (/\b(restaurant|restaurants|essen|dinner|lunch|brunch|mittagessen|abendessen|food)\b/.test(joined)) result.push("restaurant");
  if (/\b(nachtleben|nightlife|club|party|tanzen)\b/.test(joined)) result.push("nightlife");
  if (/\b(museum|museen|kultur|culture|galerie|gallery|kunst|art|ausstellung|ausstellungen)\b/.test(joined)) result.push("culture");
  if (/\b(aktivitat|aktivitaet|aktivität|activity|aktivitäten|klettern|spielplatz|sport|jump|aquabasilea)\b/.test(joined)) result.push("activity");
  if (/\b(ausflug|outing|aussicht|view|spaziergang|walk|park|tierpark|zoo|raus|draussen|draußen|outdoor)\b/.test(joined)) result.push("outing");
  if (/\b(erlebnis|experience|besonderes erlebnis)\b/.test(joined)) result.push("experience");
  if (/\b(hotel|unterkunft|hostel)\b/.test(joined)) result.push("hotel");

  return uniqueStrings(result);
}

function removePlaceTypes(values: string[], excluded: string[]): string[] {
  const excludedSet = new Set(excluded);
  return values.filter((value) => !excludedSet.has(value));
}

function hasAnyMoodSignal(joined: string): boolean {
  return /\b(cozy|cosy|gemutlich|gemuetlich|ruhig|quiet|warm|romantisch|romantic|urban|hidden|chic|stylish|inspirierend|inspiration|entspannt|lebhaft|lively|date|afterwork|sonntag|sunday|regen|rain|solo)\b/.test(
    joined,
  );
}

function detectIntent(input: {
  query: string | null;
  moodA: string | null;
  moodB: string | null;
  preferredPlaceTypes?: string[];
  excludedPlaceTypes?: string[];
  audience?: string[];
  occasions?: string[];
  strictCategoryIntent?: boolean;
}): DecisionIntent {
  const joined = normalizeText(
    [input.query, input.moodA, input.moodB].filter(Boolean).join(" "),
  );

  const explicitFromBody = uniqueStrings(input.preferredPlaceTypes ?? []);
  const explicitFromText = detectPlaceTypesFromText(joined);
  const excludedFromBody = uniqueStrings(input.excludedPlaceTypes ?? []);

  const excludedFromText: string[] = [];
  if (/\b(keine bar|kein bar|nicht bar|no bar|ohne bar|keine drinks|kein alkohol)\b/.test(joined)) excludedFromText.push("bar");
  if (/\b(kein restaurant|nicht restaurant|no restaurant|ohne restaurant|kein dinner|kein essen|nicht essen)\b/.test(joined)) excludedFromText.push("restaurant");
  if (/\b(kein club|nicht club|kein nachtleben|nicht nachtleben|keine party|kein party|no party)\b/.test(joined)) {
    excludedFromText.push("nightlife");
  }

  const excludedPlaceTypes = uniqueStrings([...excludedFromBody, ...excludedFromText]);

  let primaryPlaceTypes = removePlaceTypes(
    uniqueStrings([...explicitFromBody, ...explicitFromText]),
    excludedPlaceTypes,
  );

  const wantsKids =
    /\b(kind|kinder|kids|kid|family|familie|familien|tochter|sohn|baby|kleinkind|spielplatz)\b/.test(
      joined,
    ) || (input.audience ?? []).some((a) => /kid|kind|family|familie/i.test(a));

  const wantsFamily =
    wantsKids || /\b(familie|family|familienfreundlich|family friendly)\b/.test(joined);

  const wantsSunday = /\b(sonntag|sunday)\b/.test(joined);
  const wantsWeekend = wantsSunday || /\b(wochenende|weekend|samstag|saturday)\b/.test(joined);
  const wantsIndoor = /\b(indoor|drinnen|innen|regen|regenwetter|rainy|schlechtwetter)\b/.test(joined);
  const wantsOutdoor = /\b(outdoor|draussen|draußen|park|spaziergang|tierpark|zoo|aussicht)\b/.test(joined);

  if (wantsKids && primaryPlaceTypes.length === 0) {
    primaryPlaceTypes = ["activity", "culture", "outing", "experience"];
  }

  if (wantsKids && primaryPlaceTypes.includes("bar")) {
    primaryPlaceTypes = primaryPlaceTypes.filter((type) => type !== "bar");
  }

  const secondaryPlaceTypes: string[] = [];

  if (wantsKids) {
    for (const type of ["culture", "activity", "outing", "experience"]) {
      if (!primaryPlaceTypes.includes(type) && !excludedPlaceTypes.includes(type)) {
        secondaryPlaceTypes.push(type);
      }
    }

    if (!primaryPlaceTypes.includes("cafe") && !excludedPlaceTypes.includes("cafe")) {
      secondaryPlaceTypes.push("cafe");
    }

    if (!excludedPlaceTypes.includes("bar")) excludedPlaceTypes.push("bar");
    if (!excludedPlaceTypes.includes("nightlife")) excludedPlaceTypes.push("nightlife");
  }

  const wantsCafe =
    /\b(cafe|kaffee|coffee)\b/.test(joined) || primaryPlaceTypes.includes("cafe");

  const wantsWarm =
    /\b(warm|gemutlich|gemuetlich|cozy|cosy|ruhig|quiet|intimate|intim|entspannt)\b/.test(
      joined,
    );

  const wantsQuiet =
    /\b(ruhig|quiet|leise|nicht laut|nicht zu laut|calm|entspannt|entspannter|reflektiert)\b/.test(
      joined,
    );

  const wantsRomantic =
    /\b(romantic|romantisch|date|datenight|date night)\b/.test(joined);

  const wantsTalk =
    /\b(talk|reden|gesprach|gespraech|unterhalten|quiet enough|nicht zu laut)\b/.test(
      joined,
    );

  const wantsDrinks =
    /\b(drinks|bar|cocktail|cocktails|bier|beer|wine|wein|afterwork)\b/.test(
      joined,
    ) || primaryPlaceTypes.includes("bar");

  const wantsActivity =
    /\b(activity|aktivitat|aktivitaet|kids|family|familie|klettern|museum|spaziergang|kultur|culture|ausflug)\b/.test(
      joined,
    ) ||
    primaryPlaceTypes.some((type) =>
      ["activity", "culture", "outing", "experience"].includes(type),
    );

  const wantsCulture =
    /\b(kultur|culture|museum|galerie|gallery|kunst|art|creative|kreativ|ausstellung|ausstellungen|inspirierend|inspiration|entdecken|discover)\b/.test(
      joined,
    ) || primaryPlaceTypes.includes("culture");

  const wantsArt =
    /\b(kunst|art|galerie|gallery|ausstellung|ausstellungen|museum|museen|kunsthalle|kreativ|creative)\b/.test(
      joined,
    );

  const wantsSolo =
    /\b(alleine|allein|solo|me time|metime|fur mich|für mich)\b/.test(joined);

  const wantsRainyDay =
    /\b(regen|regenwetter|rain|rainy|schlechtwetter|indoor)\b/.test(joined);

  const wantsOuting =
    /\b(ausflug|spaziergang|view|aussicht|draussen|draußen|outdoor|walk|entdecken|discover)\b/.test(
      joined,
    ) || primaryPlaceTypes.includes("outing");

  const avoidRestaurant =
    excludedPlaceTypes.includes("restaurant") ||
    /\b(kein restaurant|nicht restaurant|no restaurant|ohne restaurant|kein dinner|kein essen|nicht essen)\b/.test(
      joined,
    );

  const avoidParty =
    excludedPlaceTypes.includes("nightlife") ||
    /\b(kein party|keine party|nicht party|no party|kein club|nicht club|kein nachtleben|nicht nachtleben|nicht laut|kein lauter abend)\b/.test(
      joined,
    );

  const avoidBars =
    excludedPlaceTypes.includes("bar") ||
    /\b(keine bar|kein bar|nicht bar|no bar|ohne bar|keine drinks|kein alkohol)\b/.test(
      joined,
    );

  const hasExplicitPlaceTypeIntent = primaryPlaceTypes.length > 0;
  const hasMoodSignal = hasAnyMoodSignal(joined);
  const categoryOnlyMode = hasExplicitPlaceTypeIntent && !input.moodA && !input.moodB && !hasMoodSignal;
  const mustRespectCategory = Boolean(input.strictCategoryIntent) || hasExplicitPlaceTypeIntent || wantsKids;

  return {
    wantsCafe,
    wantsWarm,
    wantsQuiet,
    wantsRomantic,
    wantsTalk,
    wantsDrinks,
    wantsActivity,
    wantsCulture,
    wantsArt,
    wantsSolo,
    wantsRainyDay,
    wantsOuting,
    avoidRestaurant,
    avoidParty,
    avoidBars,
    wantsKids,
    wantsFamily,
    wantsSunday,
    wantsWeekend,
    wantsIndoor,
    wantsOutdoor,
    hasMoodSignal,
    hasExplicitPlaceTypeIntent,
    mustRespectCategory,
    categoryOnlyMode,
    primaryPlaceTypes: uniqueStrings(primaryPlaceTypes),
    secondaryPlaceTypes: uniqueStrings(removePlaceTypes(secondaryPlaceTypes, primaryPlaceTypes)),
    excludedPlaceTypes: uniqueStrings(excludedPlaceTypes),
    audience: uniqueStrings([
      ...(input.audience ?? []),
      ...(wantsKids ? ["kids"] : []),
      ...(wantsFamily ? ["family"] : []),
    ]),
    occasions: uniqueStrings([
      ...(input.occasions ?? []),
      ...(wantsSunday ? ["sunday"] : []),
      ...(wantsWeekend ? ["weekend"] : []),
      ...(wantsRainyDay ? ["rainy_day"] : []),
      ...(wantsIndoor ? ["indoor"] : []),
      ...(wantsOutdoor ? ["outdoor"] : []),
    ]),
  };
}

async function createEmbedding(env: Env, input: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      `OpenAI embeddings failed ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  const embedding = payload?.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Invalid embedding length: expected ${EMBEDDING_DIMENSIONS}, got ${
        Array.isArray(embedding) ? embedding.length : "non-array"
      }`,
    );
  }

  return embedding;
}

async function rpc<T>(
  env: Env,
  functionName: string,
  body: Record<string, unknown>,
  authToken?: string | null,
): Promise<T> {
  const token = authToken ?? env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed ${response.status}: ${
        text || response.statusText
      }`,
    );
  }

  if (!text) return null as T;
  return JSON.parse(text) as T;
}

async function getSemanticCandidates(
  env: Env,
  args: {
    queryEmbedding: number[];
    city: string | null;
    limit: number;
    excludeSpotIds: string[];
  },
): Promise<SemanticMatchRow[]> {
  return await rpc<SemanticMatchRow[]>(
    env,
    "backyrd_match_spot_embeddings_v13",
    {
      p_query_embedding: embeddingToSqlVector(args.queryEmbedding),
      p_city: args.city,
      p_limit: args.limit,
      p_exclude_spot_ids: args.excludeSpotIds,
    },
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function getV12Candidates(
  env: Env,
  args: {
    city: string | null;
    moodA: string | null;
    moodB: string | null;
    query: string | null;
    limit: number;
    userToken: string;
  },
): Promise<V12DecisionRow[]> {
  return await rpc<V12DecisionRow[]>(
    env,
    "backyrd_get_decision_spots_v12",
    {
      p_city: args.city,
      p_selected_cluster_ids: null,
      p_query:
        args.query ?? [args.moodA, args.moodB].filter(Boolean).join(" ").trim(),
      p_limit: args.limit,
      p_k: 1.0,
      p_open_bonus: 0.0,
      p_taste_weight: 0.52,
      p_explore_weight: 0.055,
      p_mood_a_text: args.moodA,
      p_mood_b_text: args.moodB,
    },
    args.userToken,
  );
}

async function fetchSpotMeta(
  env: Env,
  spotIds: string[],
): Promise<Map<string, SpotMetaRow>> {
  const uniqueIds = Array.from(new Set(spotIds.filter(Boolean)));
  const result = new Map<string, SpotMetaRow>();

  if (uniqueIds.length === 0) return result;

  const quotedIds = uniqueIds.map((id) => `"${id}"`).join(",");
  const url =
    `${env.SUPABASE_URL}/rest/v1/spots?select=id,name,city,category_id,categories(name)&id=in.(${quotedIds})`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return result;

    const rows = (await response.json()) as SpotMetaRow[];

    for (const row of rows) {
      result.set(row.id, row);
    }

    return result;
  } catch {
    return result;
  }
}

async function getPlaceTypeProfile(
  env: Env,
  args: {
    userToken: string | null;
    hasUserToken: boolean;
    contextKey: string;
  },
): Promise<{
  global: Map<string, PlaceTypeProfileRow>;
  context: Map<string, PlaceTypeProfileRow>;
}> {
  const empty = {
    global: new Map<string, PlaceTypeProfileRow>(),
    context: new Map<string, PlaceTypeProfileRow>(),
  };

  if (!args.hasUserToken || !args.userToken) return empty;

  try {
    const rows = await rpc<PlaceTypeProfileRow[]>(
      env,
      "backyrd_get_my_place_type_profile_v1",
      {
        p_context_key: null,
        p_limit: 100,
      },
      args.userToken,
    );

    const global = new Map<string, PlaceTypeProfileRow>();
    const context = new Map<string, PlaceTypeProfileRow>();

    for (const row of rows ?? []) {
      if (row.context_key === "global") {
        global.set(row.place_type, row);
      }

      if (row.context_key === args.contextKey) {
        context.set(row.place_type, row);
      }
    }

    return { global, context };
  } catch (error) {
    console.log("place type profile failed", error);
    return empty;
  }
}


async function getDecisionContextKeys(
  env: Env,
  args: {
    city: string | null;
    moodA: string | null;
    moodB: string | null;
    context: Record<string, unknown>;
  },
): Promise<DecisionContextKeyRow[]> {
  try {
    return await rpc<DecisionContextKeyRow[]>(
      env,
      "backyrd_get_context_keys_for_decision_v1",
      {
        p_city: args.city,
        p_mood_a_text: args.moodA,
        p_mood_b_text: args.moodB,
        p_context: args.context,
      },
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
  } catch (error) {
    console.log("decision context keys failed", error);
    return [{ context_scope: "global", context_key: "global" }];
  }
}

async function getContextualTaste(
  env: Env,
  args: {
    userToken: string | null;
    hasUserToken: boolean;
    contextKeys: string[];
  },
): Promise<ContextualTasteRow[]> {
  if (!args.hasUserToken || !args.userToken) return [];

  try {
    return await rpc<ContextualTasteRow[]>(
      env,
      "backyrd_get_my_contextual_taste_v1",
      {
        p_context_keys: args.contextKeys.length ? args.contextKeys : ["global"],
        p_limit: 160,
      },
      args.userToken,
    );
  } catch (error) {
    console.log("contextual taste failed", error);
    return [];
  }
}

async function getRecentDecisionMemory(
  env: Env,
  args: {
    userToken: string | null;
    hasUserToken: boolean;
  },
): Promise<RecentDecisionMemoryRow[]> {
  if (!args.hasUserToken || !args.userToken) return [];

  try {
    return await rpc<RecentDecisionMemoryRow[]>(
      env,
      "backyrd_get_recent_decision_memory_v1",
      {
        p_hours: 48,
        p_limit: 220,
      },
      args.userToken,
    );
  } catch (error) {
    console.log("recent decision memory failed", error);
    return [];
  }
}

function cleanFeatureKey(featureKey: string | null | undefined): string {
  const normalized = normalizeText(featureKey);
  const [, value = normalized] = normalized.split(":");
  return value.trim();
}

function featureMatchesCandidate(candidate: Candidate, row: ContextualTasteRow): boolean {
  const searchable = candidateSearchable(candidate);
  const featureType = normalizeText(row.feature_type);
  const value = cleanFeatureKey(String(row.feature_key ?? ""));
  if (!value) return false;

  if (featureType === "category") {
    const category = normalizeText(candidate.category_name);
    const type = normalizeText(candidate.place_type);
    return category.includes(value) || value.includes(category) || type.includes(value) || searchable.includes(value);
  }

  if (featureType === "price") {
    return searchable.includes(`preislevel: ${value}`) || searchable.includes(`price:${value}`) || searchable.includes(`price ${value}`);
  }

  if (featureType === "city") {
    return normalizeText(candidate.city).includes(value);
  }

  return searchable.includes(value);
}

function scopeTasteMultiplier(scope: string): number {
  switch (scope) {
    case "category_situation":
      return 0.72;
    case "situation":
      return 0.5;
    case "category":
      return 0.34;
    case "global":
      return 0.14;
    default:
      return 0.2;
  }
}

function calculateContextualTasteComponent(candidate: Candidate, rows: ContextualTasteRow[], intent: DecisionIntent): number {
  if (!rows.length) return 0;

  let total = 0;

  for (const row of rows) {
    if (!featureMatchesCandidate(candidate, row)) continue;

    const weight = toNumber(row.weight, 0);
    const confidence = Math.max(0.15, Math.min(1, toNumber(row.confidence, 0) * 7.5));
    const scopeMultiplier = scopeTasteMultiplier(String(row.context_scope ?? ""));
    const signed = weight * confidence * scopeMultiplier;

    total += signed;
  }

  // In explicit category-only mode this is a friend-like nudge, not the boss.
  const cap = intent.categoryOnlyMode ? 0.18 : intent.hasExplicitPlaceTypeIntent ? 0.22 : 0.3;
  return Math.max(-cap, Math.min(cap, total));
}

function calculateRecentMemoryComponent(candidate: Candidate, rows: RecentDecisionMemoryRow[], intent: DecisionIntent): number {
  const row = rows.find((item) => item.spot_id === candidate.spot_id);
  if (!row) return 0;

  const penalty = toNumber(row.penalty, 0);
  const bonus = toNumber(row.bonus, 0);

  // V13.9: Recent memory is a session-diversity layer.
  // A like still teaches taste through contextual memory, but the exact same spot
  // should not be pushed again too aggressively in an immediate repeat.
  let value = penalty + bonus;

  if (row.memory_kind === "recent_dislike") value -= intent.categoryOnlyMode ? 0.1 : 0.06;
  if (row.memory_kind === "recent_positive") value -= intent.categoryOnlyMode ? 0.15 : 0.1;
  if (row.memory_kind === "recent_open") value -= intent.categoryOnlyMode ? 0.04 : 0.015;
  if (row.memory_kind === "recent_seen") value -= intent.categoryOnlyMode ? 0.055 : 0.03;

  return Math.max(-0.56, Math.min(0.08, value));
}

function normalizeV12Score(score: number): number {
  return Math.max(0, Math.min(score, 1));
}

function normalizeSemanticSimilarity(similarity: number): number {
  const normalized = (similarity - 0.5) / 0.25;
  return Math.max(0, Math.min(normalized, 1));
}

function sourceBonus(sources: Candidate["sources"]): number {
  if (sources.includes("personalized_v12") && sources.includes("semantic_v13")) {
    return 0.08;
  }
  return 0;
}

function candidateSearchable(candidate: Candidate): string {
  const category = normalizeText(candidate.category_name);
  const preview = normalizeText(candidate.document_preview);
  const tokens = normalizeText(candidate.matched_tokens.join(" "));
  const terms = normalizeText(candidate.matched_terms.join(" "));
  return `${category} ${preview} ${tokens} ${terms}`;
}

function hasKidsFriendlySignal(searchable: string): boolean {
  return Boolean(
    /\b(kinder|kind|kids|kid|familie|familien|family|family friendly|family-friendly|familienfreundlich|mit kindern|tochter|sohn|kleinkind|baby)\b/.test(searchable) ||
      searchable.includes("spielplatz") ||
      searchable.includes("spielzeug") ||
      searchable.includes("tierpark") ||
      searchable.includes("zoo") ||
      searchable.includes("tiere") ||
      searchable.includes("tier") ||
      searchable.includes("gratis") ||
      searchable.includes("kostenlos") ||
      searchable.includes("unkompliziert") ||
      searchable.includes("niederschwellig")
  );
}

function hasHandsOnFamilySignal(searchable: string): boolean {
  return Boolean(
    searchable.includes("hands-on") ||
      searchable.includes("workshop") ||
      searchable.includes("interaktiv") ||
      searchable.includes("interaktive") ||
      searchable.includes("mitmachen") ||
      searchable.includes("selber") ||
      searchable.includes("kreativ") ||
      searchable.includes("handwerk") ||
      searchable.includes("druck") ||
      searchable.includes("papier") ||
      searchable.includes("technik") ||
      searchable.includes("rundfahrt") ||
      searchable.includes("tram")
  );
}

function hasOutdoorFamilySignal(searchable: string): boolean {
  return Boolean(
    searchable.includes("outdoor") ||
      searchable.includes("draussen") ||
      searchable.includes("draußen") ||
      searchable.includes("park") ||
      searchable.includes("spaziergang") ||
      searchable.includes("natur") ||
      searchable.includes("grun") ||
      searchable.includes("grün") ||
      searchable.includes("wald") ||
      searchable.includes("tiere") ||
      searchable.includes("tierpark") ||
      searchable.includes("zoo")
  );
}

function hasFoodIntent(intent: DecisionIntent): boolean {
  return Boolean(
    intent.primaryPlaceTypes.includes("restaurant") ||
      intent.secondaryPlaceTypes.includes("restaurant") ||
      intent.wantsCafe ||
      intent.wantsDrinks
  );
}

function normalizeCandidateNameKey(candidate: Candidate): string {
  const name = normalizeText(candidate.name)
    .replace(/\b(basel|schweiz|switzerland|universitat|universitaet|university|der|die|das|the|restaurant|bar|cafe|museum)\b/g, " ")
    .replace(/\blange erlen\b/g, "lange erle")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const compact = name.replace(/\s+/g, "");

  if (compact.includes("tierparklangeerle")) return "tierpark-lange-erle";
  if (compact.includes("baslerpapiermuhle") || compact.includes("papiermuhle")) return "basler-papiermuehle";
  if (compact.includes("kunsthalle")) return "kunsthalle-basel";
  if (compact.includes("kunstmuseum")) return "kunstmuseum-basel";

  return compact || candidate.spot_id;
}

function diversifyCandidates(candidates: Candidate[], limit: number, intent: DecisionIntent): Candidate[] {
  const selected: Candidate[] = [];
  const usedNameKeys = new Set<string>();
  const typeCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const key = normalizeCandidateNameKey(candidate);
    if (usedNameKeys.has(key)) continue;

    const type = candidate.place_type ?? "other";
    const currentTypeCount = typeCounts.get(type) ?? 0;

    // In family/activity mode, avoid a wall of museums when stronger outdoor/activity options exist.
    if ((intent.wantsKids || intent.wantsFamily) && type === "culture" && currentTypeCount >= 3 && selected.length < limit - 1) {
      continue;
    }

    selected.push(candidate);
    usedNameKeys.add(key);
    typeCounts.set(type, currentTypeCount + 1);

    if (selected.length >= limit) break;
  }

  if (selected.length >= limit) return selected;

  for (const candidate of candidates) {
    if (selected.some((item) => item.spot_id === candidate.spot_id)) continue;
    const key = normalizeCandidateNameKey(candidate);
    if (usedNameKeys.has(key)) continue;

    selected.push(candidate);
    usedNameKeys.add(key);
    if (selected.length >= limit) break;
  }

  return selected;
}

function isClassicAdultCultureSignal(searchable: string): boolean {
  return Boolean(
    (
      searchable.includes("kunsthalle") ||
      searchable.includes("zeitgenossische kunst") ||
      searchable.includes("zeitgenössische kunst") ||
      searchable.includes("galerie") ||
      searchable.includes("gallery") ||
      searchable.includes("ausstellung")
    ) &&
      !hasKidsFriendlySignal(searchable) &&
      !hasHandsOnFamilySignal(searchable)
  );
}

function isStrongCultureIntent(intent: DecisionIntent): boolean {
  return Boolean(
    intent.primaryPlaceTypes.includes("culture") ||
      (intent.wantsCulture &&
        (intent.wantsArt ||
          intent.wantsQuiet ||
          intent.wantsSolo ||
          intent.wantsRainyDay ||
          intent.avoidRestaurant ||
          intent.avoidParty))
  );
}

function isExplicitNonFoodCultureIntent(intent: DecisionIntent): boolean {
  return Boolean(
    (intent.primaryPlaceTypes.includes("culture") &&
      !intent.primaryPlaceTypes.includes("restaurant") &&
      !intent.primaryPlaceTypes.includes("cafe") &&
      !intent.primaryPlaceTypes.includes("bar")) ||
      (isStrongCultureIntent(intent) &&
        (intent.avoidRestaurant || intent.avoidParty || intent.wantsArt || intent.wantsSolo))
  );
}

function isStrongBarIntent(intent: DecisionIntent): boolean {
  return Boolean(
    !intent.wantsKids &&
      !intent.avoidBars &&
      intent.primaryPlaceTypes.includes("bar") &&
      intent.wantsDrinks
  );
}

function calculateIntentBoost(candidate: Candidate, intent: DecisionIntent): number {
  const searchable = candidateSearchable(candidate);
  const placeType = candidate.place_type ?? "other";

  let boost = 0;

  const strongCultureIntent = isStrongCultureIntent(intent);
  const strongBarIntent = isStrongBarIntent(intent);
  const strongActivityIntent = intent.mustRespectCategory && intent.primaryPlaceTypes.includes("activity") && !intent.wantsDrinks && !intent.wantsCafe;
  const explicitNonFoodCultureIntent = isExplicitNonFoodCultureIntent(intent);
  const kidsFriendly = hasKidsFriendlySignal(searchable);
  const handsOn = hasHandsOnFamilySignal(searchable);
  const outdoorFamily = hasOutdoorFamilySignal(searchable);
  const classicAdultCulture = isClassicAdultCultureSignal(searchable);

  if (intent.wantsKids || intent.wantsFamily) {
    if (kidsFriendly) boost += 0.2;
    if (handsOn) boost += 0.15;
    if (outdoorFamily) boost += intent.wantsIndoor ? 0.02 : 0.14;

    if (placeType === "outing") boost += 0.16;
    if (placeType === "activity") boost += 0.14;
    if (placeType === "experience") boost += 0.1;

    if (placeType === "culture") {
      boost += kidsFriendly || handsOn ? 0.09 : -0.07;
    }

    if (intent.wantsIndoor || intent.wantsRainyDay) {
      if (placeType === "culture" && (kidsFriendly || handsOn)) boost += 0.09;
      if (placeType === "activity" || placeType === "experience") boost += 0.05;
      if (outdoorFamily && !handsOn) boost -= 0.06;
    }

    if (!intent.wantsIndoor && !intent.wantsRainyDay && classicAdultCulture) {
      boost -= 0.16;
    }

    if (placeType === "cafe") boost += 0.015;

    if (placeType === "bar" || placeType === "nightlife") {
      boost -= 0.42;
    }

    if (placeType === "restaurant" && !hasFoodIntent(intent)) {
      boost -= intent.categoryOnlyMode ? 0.46 : 0.28;
    }

    if (
      searchable.includes("club") ||
      searchable.includes("cocktail") ||
      searchable.includes("drinks") ||
      searchable.includes("party") ||
      searchable.includes("bierhalle")
    ) {
      boost -= 0.28;
    }
  }

  if (intent.wantsCafe) {
    if (placeType === "cafe") boost += 0.065;
    if (searchable.includes("kaffee") || searchable.includes("coffee")) boost += 0.025;

    if (placeType === "nightlife" || searchable.includes("party") || searchable.includes("club") || searchable.includes("tanzen")) {
      boost -= 0.07;
    }
  }

  if (intent.wantsWarm && !explicitNonFoodCultureIntent) {
    if (
      searchable.includes("cozy") ||
      searchable.includes("warm") ||
      searchable.includes("gemutlich") ||
      searchable.includes("gemuetlich") ||
      searchable.includes("intimate") ||
      searchable.includes("intim") ||
      searchable.includes("entspannt")
    ) {
      boost += intent.hasExplicitPlaceTypeIntent ? 0.025 : 0.045;
    }
  }

  if (intent.wantsQuiet) {
    if (
      searchable.includes("ruhig") ||
      searchable.includes("quiet") ||
      searchable.includes("calm") ||
      searchable.includes("reflektiert") ||
      searchable.includes("minimalistisch") ||
      searchable.includes("entschleunigt")
    ) {
      boost += 0.04;
    }

    if (
      searchable.includes("club") ||
      searchable.includes("party") ||
      searchable.includes("tanzen") ||
      searchable.includes("bierhalle") ||
      searchable.includes("grosse gruppen") ||
      placeType === "nightlife"
    ) {
      boost -= 0.09;
    }
  }

  if (intent.wantsSunday || intent.wantsWeekend) {
    if (
      searchable.includes("sonntag") ||
      searchable.includes("sunday") ||
      searchable.includes("wochenende") ||
      searchable.includes("weekend") ||
      searchable.includes("brunch")
    ) {
      boost += 0.045;
    }
  }

  if (intent.wantsIndoor) {
    if (searchable.includes("indoor") || searchable.includes("drinnen") || searchable.includes("innen")) {
      boost += 0.055;
    }
    if (placeType === "culture" && (kidsFriendly || handsOn || !intent.wantsKids)) boost += 0.035;
    if (placeType === "activity" || placeType === "experience") boost += 0.025;
  }

  if (intent.wantsRomantic) {
    if (searchable.includes("romantic") || searchable.includes("romantisch") || searchable.includes("date night") || searchable.includes("intimate")) {
      boost += 0.035;
    }
  }

  if (intent.wantsTalk) {
    if (placeType === "cafe" || searchable.includes("quiet") || searchable.includes("ruhig") || searchable.includes("intimate") || searchable.includes("gemutlich") || searchable.includes("gemuetlich")) {
      boost += 0.03;
    }

    if (searchable.includes("club") || searchable.includes("party") || searchable.includes("tanzen") || placeType === "nightlife") {
      boost -= 0.08;
    }
  }

  if (intent.wantsDrinks && !intent.avoidBars && !intent.wantsKids) {
    if (placeType === "bar" || searchable.includes("cocktail") || searchable.includes("drinks")) {
      boost += 0.04;
    }
  }

  // V13.9: for a clear bar-tour / drinks night, bars should dominate.
  // Cafés can remain as soft fallbacks, but not compete in the first few picks.
  if (strongBarIntent) {
    if (placeType === "bar") boost += 0.12;
    else if (placeType === "nightlife") boost += 0.04;
    else if (placeType === "cafe") boost -= 0.22;
    else if (placeType === "restaurant") boost -= 0.2;
    else boost -= 0.28;

    if (
      searchable.includes("weinbar") ||
      searchable.includes("cocktail") ||
      searchable.includes("drinks") ||
      searchable.includes("bier") ||
      searchable.includes("beer") ||
      searchable.includes("bar")
    ) {
      boost += 0.04;
    }
  }

  // V13.10: Wenn geführt klar "Aktivität" gewählt ist, darf persönlicher Bar/Café-Geschmack die Kategorie nicht sprengen.
  if (strongActivityIntent) {
    if (placeType === "activity") boost += 0.14;
    else if (placeType === "experience" || placeType === "outing") boost += 0.07;
    else if (placeType === "culture") boost += 0.01;
    else if (placeType === "bar" || placeType === "nightlife") boost -= 0.5;
    else if (placeType === "cafe" || placeType === "restaurant") boost -= 0.3;
    else boost -= 0.22;
  }

  if (intent.wantsCulture) {
    if (placeType === "culture") {
      boost += intent.wantsKids ? 0.06 : strongCultureIntent ? 0.18 : 0.075;
    }

    if (
      searchable.includes("kunst") ||
      searchable.includes("art") ||
      searchable.includes("museum") ||
      searchable.includes("galerie") ||
      searchable.includes("gallery") ||
      searchable.includes("ausstellung") ||
      searchable.includes("creative") ||
      searchable.includes("kreativ") ||
      searchable.includes("inspirierend") ||
      searchable.includes("inspiration")
    ) {
      boost += intent.wantsKids ? 0.02 : strongCultureIntent ? 0.075 : 0.035;
    }

    if (placeType === "cafe" || placeType === "bar") {
      boost -= explicitNonFoodCultureIntent ? 0.06 : 0.015;
    }
  }

  if (intent.wantsArt && !intent.wantsKids) {
    if (placeType === "culture") boost += 0.08;
    if (searchable.includes("museum")) boost += 0.035;
  }

  if (intent.wantsSolo) {
    if (searchable.includes("solo") || searchable.includes("ruhig") || placeType === "culture") {
      boost += 0.035;
    }
    if (placeType === "nightlife") boost -= 0.08;
  }

  if (intent.wantsRainyDay) {
    if (searchable.includes("regen") || searchable.includes("indoor") || placeType === "culture" || placeType === "cafe") {
      boost += 0.025;
    }
    if (placeType === "outing" && searchable.includes("outdoor") && !intent.wantsOutdoor) {
      boost -= intent.wantsKids ? 0.08 : 0.025;
    }
  }

  if (intent.wantsOuting && !strongCultureIntent) {
    if (placeType === "outing" || placeType === "culture" || placeType === "experience") {
      boost += 0.04;
    }
  }

  if (intent.avoidRestaurant && placeType === "restaurant") boost -= 0.18;

  if (intent.avoidParty) {
    if (placeType === "nightlife" || searchable.includes("club") || searchable.includes("party") || searchable.includes("tanzen") || searchable.includes("lively")) {
      boost -= 0.16;
    }
  }

  if (intent.avoidBars && placeType === "bar") boost -= 0.16;

  if (!intent.wantsActivity && intent.wantsCafe) {
    if (placeType === "activity" || placeType === "culture" || placeType === "outing") {
      boost -= 0.08;
    }
  }

  return Math.max(-0.55, Math.min(boost, 0.58));
}

function calculateCategoryFitComponent(candidate: Candidate, intent: DecisionIntent): {
  component: number;
  penalty: number;
} {
  const placeType = candidate.place_type ?? "other";
  const searchable = candidateSearchable(candidate);
  const kidsFriendly = hasKidsFriendlySignal(searchable);
  const handsOn = hasHandsOnFamilySignal(searchable);
  const outdoorFamily = hasOutdoorFamilySignal(searchable);
  const classicAdultCulture = isClassicAdultCultureSignal(searchable);
  const strongBarIntent = isStrongBarIntent(intent);
  const strongActivityIntent = intent.mustRespectCategory && intent.primaryPlaceTypes.includes("activity") && !intent.wantsDrinks && !intent.wantsCafe;

  if (!intent.hasExplicitPlaceTypeIntent && intent.excludedPlaceTypes.length === 0) {
    return { component: 0, penalty: 0 };
  }

  let component = 0;
  let penalty = 0;

  if (intent.wantsKids || intent.wantsFamily) {
    if (placeType === "activity") component += 0.38;
    else if (placeType === "outing") component += intent.wantsIndoor ? 0.1 : 0.38;
    else if (placeType === "experience") component += 0.28;
    else if (placeType === "culture") {
      if (kidsFriendly || handsOn) component += 0.28;
      else {
        component += 0.08;
        if (classicAdultCulture) penalty -= 0.14;
      }
    } else if (intent.secondaryPlaceTypes.includes(placeType)) {
      component += 0.08;
    } else if (intent.mustRespectCategory && intent.primaryPlaceTypes.length > 0) {
      penalty -= 0.22;
    }

    if ((kidsFriendly || handsOn || outdoorFamily) && ["activity", "outing", "experience", "culture"].includes(placeType)) {
      component += 0.08;
    }
  } else {
    if (intent.primaryPlaceTypes.includes(placeType)) {
      component += intent.mustRespectCategory ? 0.32 : 0.18;
    } else if (intent.secondaryPlaceTypes.includes(placeType)) {
      component += intent.mustRespectCategory ? 0.14 : 0.08;
    } else if (intent.mustRespectCategory && intent.primaryPlaceTypes.length > 0) {
      penalty -= intent.categoryOnlyMode ? 0.22 : 0.18;
    }
  }

  if ((intent.wantsKids || intent.wantsFamily) && placeType === "restaurant" && !hasFoodIntent(intent)) {
    penalty -= intent.categoryOnlyMode ? 0.48 : 0.28;
  }

  // V13.9: clear bar-tour category gating.
  if (strongBarIntent) {
    if (placeType === "bar") component += 0.12;
    else if (placeType === "nightlife") component += 0.02;
    else if (placeType === "cafe") penalty -= 0.34;
    else if (placeType === "restaurant") penalty -= 0.3;
    else penalty -= 0.42;
  }

  // V13.10: Hartes Gating für geführte Aktivitäts-Suche.
  if (strongActivityIntent) {
    if (placeType === "activity") component += 0.14;
    else if (placeType === "experience" || placeType === "outing") component += 0.06;
    else if (placeType === "culture") penalty -= 0.06;
    else if (placeType === "bar" || placeType === "nightlife") penalty -= 0.58;
    else if (placeType === "cafe" || placeType === "restaurant") penalty -= 0.34;
    else penalty -= 0.26;
  }

  if (intent.excludedPlaceTypes.includes(placeType)) {
    penalty -= intent.mustRespectCategory ? 0.42 : 0.24;
  }

  if ((intent.wantsKids || intent.wantsFamily) && (placeType === "bar" || placeType === "nightlife")) {
    penalty -= 0.42;
  }

  return {
    component: Math.max(0, Math.min(component, 0.5)),
    penalty: Math.max(-0.65, Math.min(0, penalty)),
  };
}

function calculatePlaceTypeBoost(candidate: Candidate, intent: DecisionIntent): number {
  const contextWeight = candidate.place_type_context_weight;
  const globalWeight = candidate.place_type_global_weight;

  const contextConfidence = candidate.place_type_context_confidence;
  const globalConfidence = candidate.place_type_global_confidence;

  const contextualMax = intent.hasExplicitPlaceTypeIntent ? 0.06 : 0.16;
  const globalMax = intent.hasExplicitPlaceTypeIntent ? 0.025 : 0.08;

  const contextual = Math.max(-contextualMax, Math.min(contextualMax, contextWeight * 0.09)) *
    Math.max(0.35, Math.min(1, contextConfidence * 3.2));

  const global = Math.max(-globalMax, Math.min(globalMax, globalWeight * 0.045)) *
    Math.max(0.2, Math.min(1, globalConfidence * 2.2));

  const totalMax = intent.hasExplicitPlaceTypeIntent ? 0.07 : 0.18;
  return Math.max(-totalMax, Math.min(totalMax, contextual + global));
}

function calculateV12OnlyPenalty(candidate: Candidate): number {
  const onlyV12 =
    candidate.sources.includes("personalized_v12") &&
    !candidate.sources.includes("semantic_v13");

  if (!onlyV12) return 0;

  if (candidate.v12_score >= 0.8) return -0.035;
  if (candidate.v12_score >= 0.6) return -0.09;
  return -0.13;
}

function calculateWeakIntentPenalty(
  candidate: Candidate,
  intent: DecisionIntent,
): number {
  const category = normalizeText(candidate.category_name);
  const preview = normalizeText(candidate.document_preview);
  const tokens = normalizeText(candidate.matched_tokens.join(" "));
  const searchable = `${category} ${preview} ${tokens}`;

  let penalty = 0;

  if (intent.wantsCafe && intent.wantsWarm) {
    if (candidate.semantic_rank === null && candidate.v12_rank !== null) {
      if (
        searchable.includes("klettern") ||
        searchable.includes("kids") ||
        candidate.place_type === "activity"
      ) {
        penalty -= 0.12;
      }

      if (
        searchable.includes("bier") ||
        searchable.includes("brewpub") ||
        searchable.includes("hazy") ||
        searchable.includes("grosse gruppen") ||
        searchable.includes("grosse halle")
      ) {
        penalty -= 0.08;
      }
    }
  }

  if (intent.wantsTalk) {
    if (
      searchable.includes("club") ||
      searchable.includes("tanzen") ||
      searchable.includes("party") ||
      candidate.place_type === "nightlife"
    ) {
      penalty -= 0.1;
    }
  }

  return Math.max(-0.22, penalty);
}

function createPlaceTypeReason(candidate: Candidate, intent: DecisionIntent): string | null {
  const label = candidate.place_type_label ?? placeTypeLabel(candidate.place_type);

  if (!candidate.place_type || candidate.place_type === "other") return null;

  if (candidate.place_type_context_weight > 0.25 && candidate.place_type_context_confidence >= 0.05) {
    return `Bei dieser Stimmung reagierst du öfter positiv auf ${label}-Orte.`;
  }

  if (
    !intent.hasExplicitPlaceTypeIntent &&
    candidate.place_type_global_weight > 0.35 &&
    candidate.place_type_global_confidence >= 0.08
  ) {
    return `Generell scheinen ${label}-Orte bei dir gut zu funktionieren.`;
  }

  if (candidate.place_type_context_weight < -0.2 && candidate.place_type_context_confidence >= 0.04) {
    return `Bei dieser Stimmung waren ${label}-Orte bisher eher selten dein Treffer.`;
  }

  return null;
}

function createHumanReason(candidate: Candidate, intent: DecisionIntent): string {
  const name = candidate.name;
  const searchable = candidateSearchable(candidate);

  const isCafe = candidate.place_type === "cafe";
  const isBar = candidate.place_type === "bar";
  const isRestaurant = candidate.place_type === "restaurant";
  const isCulture = candidate.place_type === "culture";
  const isOuting = candidate.place_type === "outing";
  const isActivity = candidate.place_type === "activity";
  const isExperience = candidate.place_type === "experience";

  const kidsFriendly = hasKidsFriendlySignal(searchable);
  const handsOn = hasHandsOnFamilySignal(searchable);
  const outdoorFamily = hasOutdoorFamilySignal(searchable);
  const classicAdultCulture = isClassicAdultCultureSignal(searchable);

  const hasCozy =
    searchable.includes("cozy") ||
    searchable.includes("warm") ||
    searchable.includes("gemutlich") ||
    searchable.includes("gemuetlich") ||
    searchable.includes("entspannt");

  const hasUrban = searchable.includes("urban") || searchable.includes("basel") || searchable.includes("stadt");

  const hasIntimate =
    searchable.includes("intimate") ||
    searchable.includes("intim") ||
    searchable.includes("romantic") ||
    searchable.includes("romantisch");

  const typeReason = candidate.place_type_reason;

  if (intent.wantsKids || intent.wantsFamily) {
    if (outdoorFamily && (isOuting || isActivity)) {
      return `${name} passt sehr direkt zu einem freien Tag mit Kind: unkompliziert raus, etwas sehen oder erleben, ohne dass es sich nach grosser Planung anfühlt.`;
    }

    if (handsOn && isCulture) {
      return `${name} ist nicht nur ein klassisches Museum zum Anschauen – es ist greifbarer, kreativer und dadurch deutlich besser für einen Nachmittag mit Kind.`;
    }

    if (kidsFriendly && isCulture) {
      return `${name} funktioniert als Kultur-Pick mit Kind, weil der Ort familienfreundliche Signale mitbringt und nicht nur erwachsenes Ausstellungsprogramm ist.`;
    }

    if ((isActivity || isExperience) && kidsFriendly) {
      return `${name} ist ein praktischer Familien-Pick: aktiv genug, damit es nicht langweilig wird, aber trotzdem unkompliziert für einen spontanen Nachmittag.`;
    }

    if (isCafe && hasCozy) {
      return `${name} wäre eher die ruhige Pause dazu – gut, wenn ihr kurz sitzen wollt, aber nicht der stärkste Hauptplan für einen Tag mit Kind.`;
    }

    if (isRestaurant && !hasFoodIntent(intent)) {
      return `${name} fühlt sich eher nach Essen gehen an. Für “etwas unternehmen mit Kind” würde ich ihn nur als Backup sehen, nicht als eigentlichen Plan.`;
    }

    if (classicAdultCulture) {
      return `${name} ist kulturell stark, wirkt für einen Tag mit Kind aber eher wie die ruhigere zweite Wahl als wie der offensichtlichste Familien-Pick.`;
    }
  }

  if (isCulture) {
    if (intent.wantsArt && intent.wantsQuiet) {
      return `${name} trifft die Suche ziemlich klar: Kunst, Ruhe und Stadtgefühl, ohne Restaurant- oder Party-Vibe.`;
    }

    if (intent.wantsArt || intent.wantsCulture) {
      return `${name} passt als Kultur-Spot zur Anfrage – gut, wenn du nicht nur irgendwo sitzen, sondern wirklich etwas aufnehmen oder entdecken willst.`;
    }

    if (typeReason && candidate.place_type_context_weight > 0.25) {
      return `Ein bewusst anderer Vorschlag: ${typeReason} ${name} bringt eine kulturelle Seite in deine Auswahl.`;
    }

    if (intent.wantsOuting) {
      return `${name} ist ein ruhiger Kultur-Pick, wenn du raus willst, aber nicht unbedingt einen lauten oder konsumlastigen Ort suchst.`;
    }

    return `${name} ist ein Kultur-Pick mit Basel-Gefühl – eher entdecken als nur sitzen.`;
  }

  if (isOuting) {
    if (intent.wantsRomantic) {
      return `${name} passt eher zur kleinen-Ausflug-Seite deiner Suche – gut, wenn es nicht nur ein Tisch und zwei Getränke sein sollen.`;
    }

    return `${name} ist ein guter Ortswechsel: rauskommen, etwas sehen, kurz bleiben oder länger treiben lassen.`;
  }

  if (isActivity) {
    if (intent.hasExplicitPlaceTypeIntent && intent.primaryPlaceTypes.includes("activity")) {
      if (hasCozy && hasUrban) return `${name} passt: aktiv, urban, easy. Genau so ein Spot, wenn du nicht nur rumsitzen willst.`;
      if (hasUrban) return `${name} ist ein urbaner Aktiv-Pick – unkompliziert, direkt, mit etwas Energie.`;
      if (hasCozy) return `${name} bringt Bewegung rein, bleibt aber angenehm entspannt.`;
      return `${name} passt zur Richtung: machen statt nur sitzen. Solider Aktiv-Pick.`;
    }

    if (typeReason && candidate.place_type_context_weight > 0.25) {
      return `${name} passt zu deinem Aktiv-Modus. ${typeReason}`;
    }

    return `${name} bringt Bewegung rein – guter Pick, wenn du wirklich etwas machen willst.`;
  }

  if (isExperience) {
    return `${name} ist der etwas andere Pick – weniger Standard, mehr kleines Erlebnis.`;
  }

  if (candidate.sources.includes("personalized_v12") && candidate.sources.includes("semantic_v13")) {
    if (isCafe && hasCozy && hasIntimate) {
      return `${name} wirkt wie ein sehr guter Match: warm, gemütlich und ruhig genug, um wirklich anzukommen.${typeReason ? ` ${typeReason}` : ""}`;
    }

    if (isCafe && hasCozy) {
      return `${name} passt gut, wenn du etwas Gemütliches suchst, ohne dass es gleich nach grosser Abendplanung wirken muss.${typeReason ? ` ${typeReason}` : ""}`;
    }

    if (isBar && hasIntimate) {
      return `${name} geht in Richtung stimmungsvolle Bar – nicht beliebig, sondern eher warm, urban und mit etwas besonderem Abendgefühl.${typeReason ? ` ${typeReason}` : ""}`;
    }

    if (isRestaurant && hasIntimate) {
      return `${name} wirkt wie ein guter Dinner-Pick: etwas wärmer, persönlicher und mit genug Stimmung für den Abend.${typeReason ? ` ${typeReason}` : ""}`;
    }

    if (typeReason) return `${name} passt zur aktuellen Suche und zu Mustern, die bei dir schon funktioniert haben. ${typeReason}`;
    return `${name} passt zur aktuellen Suche und hat zusätzlich Signale, die zu deinem bisherigen Geschmack passen.`;
  }

  if (candidate.sources.includes("semantic_v13")) {
    if (isCafe && hasCozy) return `${name} trifft die gemütliche Café-Richtung gut: warm, unkompliziert und nicht zu schwer.`;
    if (isBar && hasIntimate) return `${name} ist eher Bar als Café, bringt aber die intime, stimmungsvolle Richtung gut mit.`;
    if (isRestaurant && hasIntimate) return `${name} wirkt eher wie ein Dinner-Spot, aber mit einer passenden warmen und stilvollen Atmosphäre.`;
    if (typeReason) return `${name} passt inhaltlich zur Suche. ${typeReason}`;
    return `${name} passt inhaltlich zu dem, was du gerade beschrieben hast.`;
  }

  if (candidate.sources.includes("personalized_v12")) {
    if (candidate.v12_score >= 0.7) {
      if (typeReason) return `${name} kommt stark aus deinem bisherigen Geschmack. ${typeReason}`;
      return `${name} kommt stark aus deinem bisherigen Geschmack – ich würde ihn aber nur nehmen, wenn er auch zum heutigen Kontext passt.`;
    }

    if (typeReason) return `${name} passt zu einzelnen Signalen aus deinem Profil. ${typeReason}`;
    return `${name} ist eher ein weicher Explore-Pick als ein ganz eindeutiger Treffer.`;
  }

  return `${name} könnte zu deiner Suche passen.`;
}

function fuseCandidates(input: {
  v12: V12DecisionRow[];
  semantic: SemanticMatchRow[];
  limit: number;
  intent: DecisionIntent;
  placeTypeProfile: {
    global: Map<string, PlaceTypeProfileRow>;
    context: Map<string, PlaceTypeProfileRow>;
  };
  contextualTaste: ContextualTasteRow[];
  recentMemory: RecentDecisionMemoryRow[];
}): Candidate[] {
  const map = new Map<string, Candidate>();

  input.v12.forEach((row, index) => {
    const rawScore = toNumber(row.final_score, 0);

    map.set(row.spot_id, {
      spot_id: row.spot_id,
      name: row.name,
      city: row.city ?? null,
      category_name: null,
      place_type: null,
      place_type_label: null,
      is_open_now: row.is_open_now ?? null,

      v12_rank: index + 1,
      v12_score: rawScore,
      v12_score_norm: normalizeV12Score(rawScore),

      semantic_rank: null,
      semantic_similarity: 0,
      semantic_score_norm: 0,

      combined_score: 0,

      matched_tokens: Array.isArray(row.matched_tokens) ? row.matched_tokens : [],
      matched_terms: Array.isArray(row.matched_terms) ? row.matched_terms : [],
      technical_why_this: row.why_this ?? null,
      human_reason: "",
      place_type_reason: null,
      document_preview: null,

      place_type_context_weight: 0,
      place_type_global_weight: 0,
      place_type_context_confidence: 0,
      place_type_global_confidence: 0,

      sources: ["personalized_v12"],

      explanation: {
        model: MODEL_NAME,
        version: MODEL_VERSION,
        v12_rank: index + 1,
        v12_score: rawScore,
        semantic_rank: null,
        semantic_similarity: 0,
        personalized_component: 0,
        semantic_component: 0,
        source_bonus: 0,
        intent_boost: 0,
        category_fit_component: 0,
        category_mismatch_penalty: 0,
        place_type_boost: 0,
        contextual_taste_component: 0,
        recent_memory_component: 0,
        v12_only_penalty: 0,
        weak_intent_penalty: 0,
        combined_score: 0,
      },
    });
  });

  input.semantic.forEach((row, index) => {
    const existing = map.get(row.spot_id);
    const similarity = toNumber(row.similarity, 0);
    const semanticNorm = normalizeSemanticSimilarity(similarity);

    if (existing) {
      existing.category_name = row.category_name ?? existing.category_name;
      existing.semantic_rank = index + 1;
      existing.semantic_similarity = similarity;
      existing.semantic_score_norm = semanticNorm;
      existing.document_preview = row.document_text?.slice(0, 700) ?? null;

      if (!existing.sources.includes("semantic_v13")) {
        existing.sources.push("semantic_v13");
      }

      existing.explanation.semantic_rank = index + 1;
      existing.explanation.semantic_similarity = similarity;
    } else {
      map.set(row.spot_id, {
        spot_id: row.spot_id,
        name: row.name,
        city: row.city ?? null,
        category_name: row.category_name ?? null,
        place_type: placeTypeFromCategory(row.category_name),
        place_type_label: placeTypeLabel(placeTypeFromCategory(row.category_name)),
        is_open_now: null,

        v12_rank: null,
        v12_score: 0,
        v12_score_norm: 0,

        semantic_rank: index + 1,
        semantic_similarity: similarity,
        semantic_score_norm: semanticNorm,

        combined_score: 0,

        matched_tokens: [],
        matched_terms: [],
        technical_why_this: null,
        human_reason: "",
        place_type_reason: null,
        document_preview: row.document_text?.slice(0, 700) ?? null,

        place_type_context_weight: 0,
        place_type_global_weight: 0,
        place_type_context_confidence: 0,
        place_type_global_confidence: 0,

        sources: ["semantic_v13"],

        explanation: {
          model: MODEL_NAME,
          version: MODEL_VERSION,
          v12_rank: null,
          v12_score: 0,
          semantic_rank: index + 1,
          semantic_similarity: similarity,
          personalized_component: 0,
          semantic_component: 0,
          source_bonus: 0,
          intent_boost: 0,
          category_fit_component: 0,
          category_mismatch_penalty: 0,
          place_type_boost: 0,
          v12_only_penalty: 0,
          weak_intent_penalty: 0,
          combined_score: 0,
        },
      });
    }
  });

  const fused = Array.from(map.values()).map((candidate) => {
    if (!candidate.place_type) {
      candidate.place_type = placeTypeFromCategory(candidate.category_name);
      candidate.place_type_label = placeTypeLabel(candidate.place_type);
    }

    const contextProfile = input.placeTypeProfile.context.get(candidate.place_type);
    const globalProfile = input.placeTypeProfile.global.get(candidate.place_type);

    candidate.place_type_context_weight = toNumber(contextProfile?.weight, 0);
    candidate.place_type_global_weight = toNumber(globalProfile?.weight, 0);
    candidate.place_type_context_confidence = toNumber(contextProfile?.confidence, 0);
    candidate.place_type_global_confidence = toNumber(globalProfile?.confidence, 0);

    candidate.place_type_reason = createPlaceTypeReason(candidate, input.intent);

    const strongCultureIntent = isStrongCultureIntent(input.intent);
    const explicitCategoryIntent = input.intent.hasExplicitPlaceTypeIntent;

    const personalizedWeight = input.intent.categoryOnlyMode
      ? 0.12
      : explicitCategoryIntent
        ? 0.18
        : strongCultureIntent
          ? 0.32
          : 0.48;

    const semanticWeight = input.intent.categoryOnlyMode
      ? 0.46
      : explicitCategoryIntent
        ? 0.44
        : strongCultureIntent
          ? 0.5
          : 0.42;

    const personalizedComponent = candidate.v12_score_norm * personalizedWeight;
    const semanticComponent = candidate.semantic_score_norm * semanticWeight;
    const bonus = explicitCategoryIntent ? sourceBonus(candidate.sources) * 0.55 : sourceBonus(candidate.sources);
    const intentBoost = calculateIntentBoost(candidate, input.intent);
    const categoryFit = calculateCategoryFitComponent(candidate, input.intent);
    const placeTypeBoost = strongCultureIntent
      ? calculatePlaceTypeBoost(candidate, input.intent) * 0.45
      : calculatePlaceTypeBoost(candidate, input.intent);
    const contextualTasteComponent = calculateContextualTasteComponent(candidate, input.contextualTaste, input.intent);
    const recentMemoryComponent = calculateRecentMemoryComponent(candidate, input.recentMemory, input.intent);
    const v12Penalty = calculateV12OnlyPenalty(candidate);
    const weakIntentPenalty = calculateWeakIntentPenalty(candidate, input.intent);

    const combined =
      personalizedComponent +
      semanticComponent +
      bonus +
      intentBoost +
      categoryFit.component +
      categoryFit.penalty +
      placeTypeBoost +
      contextualTasteComponent +
      recentMemoryComponent +
      v12Penalty +
      weakIntentPenalty;

    candidate.combined_score = combined;
    candidate.human_reason = createHumanReason(candidate, input.intent);

    candidate.explanation.personalized_component = personalizedComponent;
    candidate.explanation.semantic_component = semanticComponent;
    candidate.explanation.source_bonus = bonus;
    candidate.explanation.intent_boost = intentBoost;
    candidate.explanation.category_fit_component = categoryFit.component;
    candidate.explanation.category_mismatch_penalty = categoryFit.penalty;
    candidate.explanation.place_type_boost = placeTypeBoost;
    candidate.explanation.contextual_taste_component = contextualTasteComponent;
    candidate.explanation.recent_memory_component = recentMemoryComponent;
    candidate.explanation.v12_only_penalty = v12Penalty;
    candidate.explanation.weak_intent_penalty = weakIntentPenalty;
    candidate.explanation.combined_score = combined;

    return candidate;
  });

  fused.sort((a, b) => {
    if (b.combined_score !== a.combined_score) {
      return b.combined_score - a.combined_score;
    }

    const aBestRank = Math.min(a.v12_rank ?? 999, a.semantic_rank ?? 999);
    const bBestRank = Math.min(b.v12_rank ?? 999, b.semantic_rank ?? 999);

    return aBestRank - bBestRank;
  });

  return diversifyCandidates(fused, input.limit, input.intent);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const env = getEnv();

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const callerToken = getBearerToken(request);
    const hasUserToken = !looksLikeAnonOrServiceToken(callerToken);
    const userId = getUserIdFromJwt(callerToken);

    const city = sanitizeString(body.city);
    const moodA = sanitizeString(body.moodA);
    const moodB = sanitizeString(body.moodB);
    const rawQuery = sanitizeString(body.query);
    const preferredPlaceTypes = sanitizePlaceTypeArray(
      body.preferredPlaceTypes ?? body.placeTypes ?? body.categories,
    );
    const explicitSinglePlaceType = normalizePlaceType(
      body.placeType ?? body.category ?? body.direction ?? body.richtung,
    );
    if (explicitSinglePlaceType && !preferredPlaceTypes.includes(explicitSinglePlaceType)) {
      preferredPlaceTypes.push(explicitSinglePlaceType);
    }

    const excludedPlaceTypes = sanitizePlaceTypeArray(
      body.excludedPlaceTypes ?? body.avoidPlaceTypes,
    );
    const audience = sanitizeStringArray(body.audience);
    const occasions = sanitizeStringArray(body.occasions ?? body.occasion);
    const strictCategoryIntent =
      body.strictCategoryIntent === true ||
      body.mustRespectCategory === true ||
      body.categoryIntent === true;

    const categoryQueryFallback = preferredPlaceTypes.length
      ? preferredPlaceTypes.map(placeTypeLabel).join(" ")
      : null;

    const query = rawQuery ?? categoryQueryFallback;

    const limit = sanitizeLimit(body.limit, DEFAULT_LIMIT, 20);
    const v12Limit = sanitizeLimit(body.v12Limit, DEFAULT_V12_LIMIT, 30);
    const semanticLimit = sanitizeLimit(
      body.semanticLimit,
      DEFAULT_SEMANTIC_LIMIT,
      40,
    );

    const excludeSpotIds = Array.isArray(body.excludeSpotIds)
      ? body.excludeSpotIds.map(String).filter(Boolean)
      : [];

    if (!query && !moodA && !moodB && preferredPlaceTypes.length === 0) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing query, moodA, moodB or preferredPlaceTypes",
        },
        400,
      );
    }

    const contextKey = buildContextKey(moodA, moodB);

    const intent = detectIntent({
      query,
      moodA,
      moodB,
      preferredPlaceTypes,
      excludedPlaceTypes,
      audience,
      occasions,
      strictCategoryIntent,
    });

    const queryText = buildQueryText({
      city,
      moodA,
      moodB,
      query,
      primaryPlaceTypes: intent.primaryPlaceTypes,
      secondaryPlaceTypes: intent.secondaryPlaceTypes,
      excludedPlaceTypes: intent.excludedPlaceTypes,
      audience: intent.audience,
      occasions: intent.occasions,
    });

    const decisionContext = {
      source: "decision_v13_edge",
      model_version: MODEL_VERSION,
      inputMode: sanitizeString(body.inputMode),
      rawFreeText: sanitizeString(body.rawFreeText) ?? query,
      query,
      preferredPlaceTypes,
      primaryPlaceTypes: intent.primaryPlaceTypes,
      secondaryPlaceTypes: intent.secondaryPlaceTypes,
      excludedPlaceTypes: intent.excludedPlaceTypes,
      audience: intent.audience,
      occasions: intent.occasions,
      strictCategoryIntent: intent.mustRespectCategory,
      categoryOnlyMode: intent.categoryOnlyMode,
    };

    const decisionContextKeys = await getDecisionContextKeys(env, {
      city,
      moodA,
      moodB,
      context: decisionContext,
    });

    const contextKeys = Array.from(new Set(decisionContextKeys.map((row) => row.context_key).filter(Boolean)));

    const queryEmbedding = await createEmbedding(env, queryText);

    const semanticPromise = getSemanticCandidates(env, {
      queryEmbedding,
      city,
      limit: semanticLimit,
      excludeSpotIds,
    });

    const v12Promise = hasUserToken && callerToken
      ? getV12Candidates(env, {
          city,
          moodA,
          moodB,
          query,
          limit: v12Limit,
          userToken: callerToken,
        })
      : Promise.resolve([]);

    const placeTypeProfilePromise = getPlaceTypeProfile(env, {
      userToken: callerToken,
      hasUserToken,
      contextKey,
    });

    const contextualTastePromise = getContextualTaste(env, {
      userToken: callerToken,
      hasUserToken,
      contextKeys,
    });

    const recentMemoryPromise = getRecentDecisionMemory(env, {
      userToken: callerToken,
      hasUserToken,
    });

    const [semanticCandidates, v12Candidates, placeTypeProfile, contextualTaste, recentMemory] = await Promise.all([
      semanticPromise,
      v12Promise,
      placeTypeProfilePromise,
      contextualTastePromise,
      recentMemoryPromise,
    ]);

    const allSpotIds = Array.from(
      new Set([
        ...(semanticCandidates ?? []).map((row) => row.spot_id),
        ...(v12Candidates ?? []).map((row) => row.spot_id),
      ]),
    );

    const meta = await fetchSpotMeta(env, allSpotIds);

    const semanticWithMeta = (semanticCandidates ?? []).map((row) => {
      const metaRow = meta.get(row.spot_id);

      return {
        ...row,
        name: row.name || metaRow?.name || row.name,
        city: row.city ?? metaRow?.city ?? null,
        category_name: row.category_name ?? metaRow?.categories?.name ?? null,
      };
    });

    const v12WithMeta = (v12Candidates ?? []).map((row) => {
      const metaRow = meta.get(row.spot_id);

      return {
        ...row,
        name: row.name || metaRow?.name || row.name,
        city: row.city ?? metaRow?.city ?? null,
      };
    });

    const fused = fuseCandidates({
      v12: v12WithMeta,
      semantic: semanticWithMeta,
      limit,
      intent,
      placeTypeProfile,
      contextualTaste,
      recentMemory,
    });

    for (const candidate of fused) {
      const row = meta.get(candidate.spot_id);
      if (!row) continue;

      candidate.name = candidate.name || row.name;
      candidate.city = candidate.city ?? row.city ?? null;
      candidate.category_name =
        candidate.category_name ??
        row.categories?.name ??
        null;

      candidate.place_type = placeTypeFromCategory(candidate.category_name);
      candidate.place_type_label = placeTypeLabel(candidate.place_type);

      const contextProfile = placeTypeProfile.context.get(candidate.place_type);
      const globalProfile = placeTypeProfile.global.get(candidate.place_type);

      candidate.place_type_context_weight = toNumber(contextProfile?.weight, 0);
      candidate.place_type_global_weight = toNumber(globalProfile?.weight, 0);
      candidate.place_type_context_confidence = toNumber(contextProfile?.confidence, 0);
      candidate.place_type_global_confidence = toNumber(globalProfile?.confidence, 0);

      candidate.place_type_reason = createPlaceTypeReason(candidate, intent);
      candidate.human_reason = createHumanReason(candidate, intent);
    }

    return jsonResponse({
      ok: true,
      model: MODEL_NAME,
      version: MODEL_VERSION,
      mode: hasUserToken ? "personalized_semantic" : "semantic_only_no_user_token",
      warning: hasUserToken
        ? null
        : "No authenticated user JWT was provided. V12 personalization was skipped. Call this from the app with the user's Supabase access_token for full personalization.",
      user_id: userId,
      embedding_model: EMBEDDING_MODEL,
      embedding_dimensions: EMBEDDING_DIMENSIONS,
      city,
      moodA,
      moodB,
      contextKey,
      query,
      queryText,
      intent,
      counts: {
        v12: v12Candidates?.length ?? 0,
        semantic: semanticCandidates?.length ?? 0,
        fused: fused.length,
        place_type_global: placeTypeProfile.global.size,
        place_type_context: placeTypeProfile.context.size,
        contextual_taste: contextualTaste.length,
        recent_memory: recentMemory.length,
      },
      place_type_profile: {
        context_key: contextKey,
        global: Array.from(placeTypeProfile.global.values()),
        context: Array.from(placeTypeProfile.context.values()),
      },
      contextual_memory: {
        context_keys: decisionContextKeys,
        taste: contextualTaste,
        recent: recentMemory,
      },
      candidates: fused.map((candidate, index) => ({
        rank: index + 1,
        spot_id: candidate.spot_id,
        name: candidate.name,
        city: candidate.city,
        category_name: candidate.category_name,
        place_type: candidate.place_type,
        place_type_label: candidate.place_type_label,
        is_open_now: candidate.is_open_now,
        combined_score: candidate.combined_score,
        sources: candidate.sources,
        v12_rank: candidate.v12_rank,
        v12_score: candidate.v12_score,
        semantic_rank: candidate.semantic_rank,
        semantic_similarity: candidate.semantic_similarity,
        matched_tokens: candidate.matched_tokens,
        matched_terms: candidate.matched_terms,
        human_reason: candidate.human_reason,
        place_type_reason: candidate.place_type_reason,
        technical_why_this: candidate.technical_why_this,
        document_preview: candidate.document_preview,
        place_type_context_weight: candidate.place_type_context_weight,
        place_type_global_weight: candidate.place_type_global_weight,
        place_type_context_confidence: candidate.place_type_context_confidence,
        place_type_global_confidence: candidate.place_type_global_confidence,
        explanation: candidate.explanation,
      })),
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});