import { supabase } from "@/lib/supabase/client";
import { getSpotDetail } from "@/lib/backyrd-api";
import type { SpotDetailDTO } from "@backyrd/shared";

export type DecisionContext = {
  decision_mode: string | null;
  title: string | null;
  body: string | null;
  weekday_name: string | null;
  time_bucket: string | null;
  user_confidence: number | null;
  is_fallback: boolean | null;
};

export type DecisionResult = {
  spot_id: string;
  name: string;
  city: string | null;
  is_open_now: boolean | null;
  final_score: number | null;
  matched_tokens: string[];
  matched_counts: number | null;
  matched_terms: string[];
  why_this: string | null;
  detail: SpotDetailDTO | null;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "Die Entscheidung konnte nicht geladen werden.";
}

function normalizeContext(value: unknown): DecisionContext {
  const raw = Array.isArray(value) ? value[0] : value;
  const row = isRecord(raw) ? raw : {};

  return {
    decision_mode: asString(row.decision_mode),
    title: asString(row.title),
    body: asString(row.body),
    weekday_name: asString(row.weekday_name),
    time_bucket: asString(row.time_bucket),
    user_confidence: asNumber(row.user_confidence),
    is_fallback: asBoolean(row.is_fallback),
  };
}

function normalizeRows(value: unknown): Omit<DecisionResult, "detail">[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((row) => ({
      spot_id: String(row.spot_id ?? ""),
      name: asString(row.name) ?? "Unbekannter Spot",
      city: asString(row.city),
      is_open_now: asBoolean(row.is_open_now),
      final_score: asNumber(row.final_score),
      matched_tokens: asStringArray(row.matched_tokens),
      matched_counts: asNumber(row.matched_counts),
      matched_terms: asStringArray(row.matched_terms),
      why_this: asString(row.why_this),
    }))
    .filter((row) => row.spot_id.length > 0);
}

export async function runWebDecision(input: {
  city: string;
  query: string;
  moodA?: string | null;
  moodB?: string | null;
  limit?: number;
}): Promise<{ context: DecisionContext; results: DecisionResult[] }> {
  const city = input.city.trim() || "Basel";
  const query = input.query.trim();
  const moodA = input.moodA?.trim() || query;
  const moodB = input.moodB?.trim() || "";

  const [contextResponse, spotsResponse] = await Promise.all([
    supabase.rpc("get_decision_context_v1", {
      p_city: city,
      p_mood_a_text: moodA,
      p_mood_b_text: moodB,
    }),
    supabase.rpc("backyrd_get_decision_spots_v11", {
      p_city: city,
      p_selected_cluster_ids: [],
      p_query: query,
      p_limit: input.limit ?? 6,
      p_k: 1,
      p_open_bonus: 0,
      p_taste_weight: 0,
      p_explore_weight: 0.05,
    }),
  ]);

  if (spotsResponse.error) {
    throw new Error(errorMessage(spotsResponse.error));
  }

  const rows = normalizeRows(spotsResponse.data).slice(0, input.limit ?? 6);

  const details = await Promise.all(
    rows.map(async (row) => {
      try {
        return await getSpotDetail(row.spot_id);
      } catch {
        return null;
      }
    })
  );

  return {
    context: contextResponse.error
      ? {
          decision_mode: "fallback",
          title: "Wohin jetzt?",
          body: "Diese Orte passen am besten zu deiner aktuellen Suche.",
          weekday_name: null,
          time_bucket: null,
          user_confidence: null,
          is_fallback: true,
        }
      : normalizeContext(contextResponse.data),
    results: rows.map((row, index) => ({
      ...row,
      detail: details[index],
    })),
  };
}
