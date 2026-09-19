import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeDecisionProductSingleRoute,
  executeDecisionProductInteraction,
  DecisionProductUnavailableError,
  type DecisionProductResponse,
  type DecisionProductRequest,
  type DecisionProductInteractionRequest,
} from "@backyrd/product-decision-contract";
import { DECISION_PRODUCT_RELEASE_BINDING } from "./productDecisionRelease.generated";

type InvokeResult<T> = { data: T | null; error: unknown };

// The server has its own, shorter evaluation deadline. A stalled session
// refresh or network transport must still release the Mobile loading state.
async function withinDecisionDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
  code: string,
  onTimeout?: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new DecisionProductUnavailableError(code));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function freshAccessToken(supabase: SupabaseClient) {
  const { data, error } = await withinDecisionDeadline(
    supabase.auth.getSession(), 8_000, "decision_session_timeout",
  );
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
      const abort = new AbortController();
      const { data, error } = await withinDecisionDeadline(supabase.functions.invoke<unknown>(
        DECISION_PRODUCT_RELEASE_BINDING.transportFunction,
        { body: request, headers: { Authorization: `Bearer ${accessToken}` }, signal: abort.signal },
      ) as Promise<InvokeResult<unknown>>, 15_000, "decision_interaction_transport_timeout", () => abort.abort());
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
      const abort = new AbortController();
      const { data, error } = await withinDecisionDeadline(supabase.functions.invoke<unknown>(
        DECISION_PRODUCT_RELEASE_BINDING.transportFunction,
        { body: request, headers: { Authorization: `Bearer ${accessToken}` }, signal: abort.signal },
      ) as Promise<InvokeResult<unknown>>, 15_000, "decision_request_transport_timeout", () => abort.abort());
      if (error || !data) throw error ?? new Error("decision_single_route_empty_response");
      return data;
    },
  });
}
