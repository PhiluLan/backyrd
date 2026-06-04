// mobile/lib/decision/backyrdDecision.ts
import { supabase } from "@/lib/supabase";

export type BackyrdDecisionSpot = {
  spot_id: string;
  name: string;
  city: string;
  is_open_now: boolean | null;
  final_score: string | number;
  matched_tokens: string[] | null;
  matched_counts: number[] | null;
  matched_terms: string[] | null;
  why_this: string | null;
};

export type BackyrdDecisionContextRow = {
  // We keep this flexible because your DB output might evolve.
  // We'll normalize it in the screen.
  [key: string]: any;
};

export type BackyrdDecisionDebugRow = {
  spot_id: string;
  name: string;
  city: string;
  is_open_now: boolean | null;

  raw_mood_strength?: number;
  mood_strength_norm?: string | number;
  mood_match_count?: number;
  text_match_score?: string | number;
  open_now_bonus?: string | number;
  final_score: string | number;

  has_mood_signal?: boolean;
  has_text_signal?: boolean;
  used_semantic_fallback?: boolean;

  matched_tokens: string[] | null;
  matched_counts: number[] | null;
  matched_terms: string[] | null;

  why_this: string | null;
};

function clean(s: string) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

export async function backyrdGetDecisionSpotsV9(params: {
  city: string;
  selectedClusterIds: number[];
  query: string;
  limit: number;
}): Promise<BackyrdDecisionSpot[]> {
  const { city, selectedClusterIds, query, limit } = params;

  const { data, error } = await supabase.rpc("backyrd_get_decision_spots_v9", {
    p_city: clean(city),
    p_selected_cluster_ids: selectedClusterIds,
    p_query: clean(query),
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as BackyrdDecisionSpot[];
}

export async function backyrdGetDecisionContextV2(params: {
  city: string;
  selectedClusterIds: number[];
  query: string;
  limit: number;
}): Promise<BackyrdDecisionContextRow | null> {
  const { city, selectedClusterIds, query, limit } = params;

  const { data, error } = await supabase.rpc("backyrd_get_decision_context_v2", {
    p_city: clean(city),
    p_selected_cluster_ids: selectedClusterIds,
    p_query: clean(query),
    p_limit: limit,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as BackyrdDecisionContextRow | null;
}

export async function backyrdGetDecisionDebugV3(params: {
  city: string;
  selectedClusterIds: number[];
  query: string;
  limit: number;
  k: number;
  openBonus: number;
}): Promise<BackyrdDecisionDebugRow[]> {
  const { city, selectedClusterIds, query, limit, k, openBonus } = params;

  const { data, error } = await supabase.rpc("backyrd_get_decision_debug_v3", {
    p_city: clean(city),
    p_selected_cluster_ids: selectedClusterIds,
    p_query: clean(query),
    p_limit: limit,
    p_k: k,
    p_open_bonus: openBonus,
  });

  if (error) throw error;
  return (data ?? []) as BackyrdDecisionDebugRow[];
}

/**
 * MVP+ 2b logging wrapper RPCs
 * These functions will exist after you run the SQL in Step 6.
 */
export async function backyrdCreateDecisionSessionV1(params: {
  city: string;
  selectedClusterIds: number[];
  query: string;
}): Promise<string | null> {
  const { city, selectedClusterIds, query } = params;

  const { data, error } = await supabase.rpc("backyrd_create_decision_session_v1", {
    p_city: clean(city),
    p_selected_cluster_ids: selectedClusterIds,
    p_query: clean(query),
  });

  if (error) throw error;

  // Support several return shapes
  if (typeof data === "string") return data;
  if (Array.isArray(data)) {
    const first = data[0] as any;
    return typeof first === "string" ? first : (first?.id ?? null);
  }
  return (data as any)?.id ?? null;
}

export async function backyrdLogDecisionImpressionsV1(params: {
  decisionId: string;
  spotIds: string[];
  whyThis: string[];
}): Promise<void> {
  const { decisionId, spotIds, whyThis } = params;

  const { error } = await supabase.rpc("backyrd_log_decision_impressions_v1", {
    p_decision_id: decisionId,
    p_spot_ids: spotIds,
    p_why_this: whyThis,
  });

  if (error) throw error;
}

export async function backyrdLogDecisionActionV1(params: {
  decisionId: string;
  spotId: string;
  action: "tapped" | "saved" | "dismissed" | string;
}): Promise<void> {
  const { decisionId, spotId, action } = params;

  const { error } = await supabase.rpc("backyrd_log_decision_action_v1", {
    p_decision_id: decisionId,
    p_spot_id: spotId,
    p_action: action,
  });

  if (error) throw error;
}
