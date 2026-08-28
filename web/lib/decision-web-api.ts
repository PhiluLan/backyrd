import { supabase } from "@/lib/supabase/client";
import {
  getPublicSpotDetail,
  type PublicSpotDetailDTO,
} from "@/lib/public-spot-detail";

export type DecisionInputMode = "guided" | "free";
export type DecisionOption = {
  key: string;
  label: string;
  placeTypes?: string[];
  queryHint: string;
};
export const DIRECTION_OPTIONS: DecisionOption[] = [
  {
    key: "restaurant",
    label: "Essen",
    placeTypes: ["restaurant"],
    queryHint: "Restaurant, Essen, Lunch oder Dinner",
  },
  {
    key: "cafe",
    label: "Café",
    placeTypes: ["cafe"],
    queryHint: "Café, Kaffee, gemütlich sitzen",
  },
  {
    key: "bar",
    label: "Drinks",
    placeTypes: ["bar"],
    queryHint: "Bar, Drinks, Cocktails oder Wein",
  },
  {
    key: "culture",
    label: "Kultur",
    placeTypes: ["culture"],
    queryHint: "Museum, Kunst, Galerie oder Kultur",
  },
  {
    key: "activity",
    label: "Aktivität",
    placeTypes: ["activity", "experience"],
    queryHint: "Aktivität, Erlebnis, etwas unternehmen",
  },
  {
    key: "outing",
    label: "Ausflug",
    placeTypes: ["outing", "experience"],
    queryHint: "Ausflug, rausgehen, entdecken",
  },
];
export const AUDIENCE_OPTIONS: DecisionOption[] = [
  {
    key: "kids",
    label: "Mit Kind",
    placeTypes: ["activity", "culture", "outing", "experience", "cafe"],
    queryHint: "kinderfreundlich, mit Kind, Familie",
  },
  {
    key: "date",
    label: "Date",
    placeTypes: ["restaurant", "bar", "cafe", "culture"],
    queryHint: "Date, romantisch, persönlich",
  },
  {
    key: "friends",
    label: "Freunde",
    placeTypes: ["bar", "restaurant", "activity", "cafe"],
    queryHint: "mit Freunden, Gruppe, locker",
  },
  {
    key: "solo",
    label: "Allein",
    placeTypes: ["cafe", "culture", "outing"],
    queryHint: "alleine, solo, me time",
  },
];
export const MOOD_OPTIONS: DecisionOption[] = [
  { key: "cozy", label: "Cozy", queryHint: "cozy gemütlich warm" },
  { key: "quiet", label: "Ruhig", queryHint: "ruhig nicht laut entspannt" },
  {
    key: "inspiring",
    label: "Inspirierend",
    queryHint: "inspirierend kreativ besonders",
  },
  { key: "urban", label: "Urban", queryHint: "urban städtisch modern" },
  { key: "chic", label: "Chic", queryHint: "chic stilvoll schön" },
  {
    key: "lively",
    label: "Lebhaft",
    queryHint: "lebhaft energie gute stimmung",
  },
];

type Candidate = {
  rank: number;
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  is_open_now: boolean | null;
  combined_score: number;
  human_reason: string | null;
  technical_why_this: string | null;
  matched_tokens?: string[];
  matched_terms?: string[];
};
type Response = {
  ok: boolean;
  error?: string;
  model?: string;
  version?: string;
  candidates?: Candidate[];
  north_star?: {
    active?: boolean;
    decision_id?: string;
    personalization_active?: boolean;
  };
  continuation?: {
    decision_id: string;
    page: number;
    request_id: string | null;
    exhausted: boolean;
    remaining_count: number;
  };
};
export type DecisionResult = Candidate & { detail: PublicSpotDetailDTO | null };
export type DecisionRun = {
  decisionId: string;
  page: number;
  exhausted: boolean;
  personalized: boolean;
  results: DecisionResult[];
};
export type DecisionRequest = {
  city: string;
  inputMode: DecisionInputMode;
  rawFreeText?: string | null;
  directions: string[];
  audiences: string[];
  moods: string[];
  moodA?: string;
  moodB?: string;
};

const clean = (value?: string | null) =>
  (value ?? "").trim().replace(/\s+/g, " ");
const unique = <T>(items: T[]) => Array.from(new Set(items));
const labels = (options: DecisionOption[], keys: string[]) =>
  keys
    .map((key) => options.find((option) => option.key === key)?.label)
    .filter(Boolean)
    .join(" + ");
const hints = (options: DecisionOption[], keys: string[]) =>
  keys.flatMap(
    (key) => options.find((option) => option.key === key)?.queryHint ?? [],
  );

export function buildCanonicalDecisionRequest(input: DecisionRequest) {
  const city = clean(input.city) || "Basel";
  const directionLabel = labels(DIRECTION_OPTIONS, input.directions);
  const audienceLabel = labels(AUDIENCE_OPTIONS, input.audiences);
  const moodLabel = labels(MOOD_OPTIONS, input.moods);
  const moodText = [clean(input.moodA), clean(input.moodB), moodLabel]
    .filter(Boolean)
    .join(" + ");
  const selectedPlaceTypes = unique([
    ...input.directions.flatMap(
      (key) =>
        DIRECTION_OPTIONS.find((option) => option.key === key)?.placeTypes ??
        [],
    ),
    ...input.audiences.flatMap(
      (key) =>
        AUDIENCE_OPTIONS.find((option) => option.key === key)?.placeTypes ?? [],
    ),
  ]);
  const free = input.inputMode === "free" ? clean(input.rawFreeText) : "";
  const query = free
    ? [
        free,
        `Ort in ${city}`,
        directionLabel ? `Gewünschte Richtung: ${directionLabel}` : null,
        audienceLabel ? `Situation: ${audienceLabel}` : null,
        moodText ? `Stimmung: ${moodText}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : [
        directionLabel ? `Richtung: ${directionLabel}` : null,
        audienceLabel ? `Situation: ${audienceLabel}` : null,
        moodText ? `Stimmung: ${moodText}` : null,
        unique([
          ...hints(DIRECTION_OPTIONS, input.directions),
          ...hints(AUDIENCE_OPTIONS, input.audiences),
          ...hints(MOOD_OPTIONS, input.moods),
        ]).join(", ") || null,
        `Ort in ${city}`,
      ]
        .filter(Boolean)
        .join("\n");
  return {
    city,
    moodA: clean(input.moodA) || null,
    moodB: clean(input.moodB) || null,
    query,
    preferredPlaceTypes: selectedPlaceTypes,
    audience: input.audiences,
    strictCategoryIntent: selectedPlaceTypes.length > 0,
    inputMode: input.inputMode,
    rawFreeText: free || null,
    limit: 16,
    v12Limit: 16,
    semanticLimit: 24,
  };
}

async function sessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("Bitte melde dich an, um Für jetzt zu nutzen.");
  return data.session.access_token;
}
async function enrich(candidates: Candidate[]) {
  return Promise.all(
    candidates.slice(0, 10).map(async (candidate) => {
      try {
        return {
          ...candidate,
          detail: await getPublicSpotDetail(candidate.spot_id),
        };
      } catch {
        return { ...candidate, detail: null };
      }
    }),
  );
}
function validate(data: Response | null | undefined) {
  if (!data?.ok)
    throw new Error("Deine Vorschläge konnten gerade nicht geladen werden.");
  if (data.north_star?.active !== true || !data.north_star.decision_id)
    throw new Error("Die aktuelle Decision ist gerade nicht verfügbar.");
}
export async function runWebDecision(
  input: DecisionRequest,
): Promise<DecisionRun> {
  const token = await sessionToken();
  const body = buildCanonicalDecisionRequest(input);
  const { data, error } = await supabase.functions.invoke<Response>(
    "decision-v13",
    { body, headers: { Authorization: `Bearer ${token}` } },
  );
  if (error)
    throw new Error("Deine Vorschläge konnten gerade nicht geladen werden.");
  validate(data);
  return {
    decisionId: data!.north_star!.decision_id!,
    page: 1,
    exhausted: data?.continuation?.exhausted === true,
    personalized: data?.north_star?.personalization_active === true,
    results: await enrich(
      Array.isArray(data?.candidates) ? data!.candidates! : [],
    ),
  };
}
export async function continueWebDecision(
  decisionId: string,
  requestId: string,
): Promise<DecisionRun> {
  const token = await sessionToken();
  const { data, error } = await supabase.functions.invoke<Response>(
    "decision-v13",
    {
      body: {
        continuationDecisionId: decisionId,
        continuationRequestId: requestId,
      },
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (error)
    throw new Error("Weitere Vorschläge konnten gerade nicht geladen werden.");
  validate(data);
  return {
    decisionId:
      data!.north_star?.decision_id ?? data!.continuation!.decision_id,
    page: data!.continuation?.page ?? 2,
    exhausted: data?.continuation?.exhausted === true,
    personalized: data?.north_star?.personalization_active === true,
    results: await enrich(
      Array.isArray(data?.candidates) ? data!.candidates! : [],
    ),
  };
}
export async function recordVisibleDecisionImpression(
  decisionId: string,
  spotId: string,
  page: number,
  position: number,
) {
  const { error } = await supabase.rpc(
    "backyrd_record_visible_decision_impression_v1",
    {
      p_decision_id: decisionId,
      p_spot_id: spotId,
      p_page_number: page,
      p_position_in_page: position,
    },
  );
  if (error) throw new Error("Die Ansicht konnte nicht bestätigt werden.");
}
export async function recordDecisionFeedback(
  decisionId: string,
  spotId: string,
  action: "like" | "dislike",
) {
  const { error } = await supabase.rpc("log_decision_action_v1", {
    p_decision_id: decisionId,
    p_spot_id: spotId,
    p_action: action === "like" ? "exact_mood" : "not_there",
  });
  if (error) throw new Error("Dein Feedback konnte nicht gespeichert werden.");
}
