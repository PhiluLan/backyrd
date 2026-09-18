import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeDecisionProductSingleRoute,
  executeDecisionProductInteraction,
  DecisionProductUnavailableError,
  type DecisionProductResponse,
  type DecisionProductRequest,
  type DecisionProductInteractionRequest,
} from "@backyrd/founder-live-control-plane";
import { DECISION_PRODUCT_RELEASE_BINDING } from "./founderLiveRelease.generated";

type InvokeResult<T> = { data: T | null; error: unknown };

async function freshAccessToken(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new DecisionProductUnavailableError("decision_session_not_available", error);
  }
  return data.session.access_token;
}

export async function recordDecisionProductInteraction({
  supabase,
  request,
}: {
  supabase: SupabaseClient;
  request: DecisionProductInteractionRequest;
}): Promise<void> {
  const accessToken = await freshAccessToken(supabase);
  await executeDecisionProductInteraction({
    binding: DECISION_PRODUCT_RELEASE_BINDING,
    request,
    invoke: async () => {
      const { data, error } = await supabase.functions.invoke<unknown>(
        DECISION_PRODUCT_RELEASE_BINDING.transportFunction,
        { body: request, headers: { Authorization: `Bearer ${accessToken}` } },
      ) as InvokeResult<unknown>;
      if (error || !data) throw error ?? new Error("decision_interaction_empty_response");
      return data;
    },
  });
}

export async function invokeDecisionProduct({
  supabase,
  request,
}: {
  supabase: SupabaseClient;
  request: DecisionProductRequest;
}): Promise<DecisionProductResponse> {
  const accessToken = await freshAccessToken(supabase);
  return executeDecisionProductSingleRoute({
    binding: DECISION_PRODUCT_RELEASE_BINDING,
    request,
    invoke: async () => {
      const { data, error } = await supabase.functions.invoke<unknown>(
        DECISION_PRODUCT_RELEASE_BINDING.transportFunction,
        { body: request, headers: { Authorization: `Bearer ${accessToken}` } },
      ) as InvokeResult<unknown>;
      if (error || !data) throw error ?? new Error("decision_single_route_empty_response");
      return data;
    },
  });
}
