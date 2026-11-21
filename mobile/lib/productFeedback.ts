import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { supabase } from "./supabase";

export type ProductFeedbackSentiment = "helpful" | "almost" | "not_helpful";

export async function submitDecisionFeedback(input: {
  decisionId: string;
  sentiment: ProductFeedbackSentiment;
  message?: string;
}): Promise<string> {
  const message = input.message?.trim() || null;
  const { data, error } = await supabase.rpc("submit_product_feedback_v1", {
    p_surface: "decision",
    p_sentiment: input.sentiment,
    p_message: message,
    p_decision_id: input.decisionId,
    p_client_context: {
      platform: Platform.OS,
      app_version: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? "unknown",
      update_id: Updates.updateId ?? null,
    },
  });

  if (error) throw error;
  if (typeof data !== "string") throw new Error("feedback_receipt_missing");
  return data;
}
