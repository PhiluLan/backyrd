import * as Crypto from "expo-crypto";

import { supabase } from "./supabase";

type MemoryProductAction = "spot_opened" | "navigation_intent";
type EntrySurface = "decision" | "home" | "search" | "map" | "profile" | "favorite" | "deep_link" | "nearby" | "generic";

/**
 * Records an authenticated Product fact for the server-side N2 bridge.
 * This is intentionally best-effort: it never changes visible Product behavior.
 */
export async function recordMemoryProductAction(input: {
  actionType: MemoryProductAction;
  spotId: string;
  decisionId?: string | null;
  entrySurface: EntrySurface;
}) {
  const { error } = await supabase.rpc("backyrd_record_memory_product_action_v1", {
    p_client_event_id: Crypto.randomUUID(),
    p_action_type: input.actionType,
    p_spot_id: input.spotId,
    p_decision_id: input.decisionId ?? null,
    p_entry_surface: input.entrySurface,
  });

  // The bridge is disabled by default and must never make a visible action fail.
  if (error && error.code !== "42501") {
    console.warn("memory bridge product action failed", error.code);
  }
}
