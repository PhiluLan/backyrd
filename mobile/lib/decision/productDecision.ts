import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeDecisionProductSingleRoute,
  decisionProductInputFailure,
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
      // The canonical Decision uses the same Zürich database region as Web.
      const abort = new AbortController();
      const { data, error } = await withinDecisionDeadline(supabase.functions.invoke<unknown>(
        DECISION_PRODUCT_RELEASE_BINDING.transportFunction,
        { body: request, headers: { Authorization: `Bearer ${accessToken}`, "x-region": "eu-central-2" }, signal: abort.signal },
      ) as Promise<InvokeResult<unknown>>, 15_000, "decision_interaction_transport_timeout", () => abort.abort());
      if (error || !data) throw error ?? new Error("decision_interaction_empty_response");
      return data;
    },
  });
}

export type PersonalDecisionTrace = {
  handoff: null | { facts: { id: string; key: string; modality: string; value: unknown }[] };
  ranked: { spot: string; rank: number | null; tier: string; beforeNext: string | null;
    facts: { factId: string; state: string; reason: string }[]; matchedPreferences: string[] }[];
};

function unpackPersonalTrace(value: unknown, onTrace?: (trace: PersonalDecisionTrace) => void): unknown {
  if (onTrace && value && typeof value === "object" && "result" in value && "personalTrace" in value) {
    const trace = value.personalTrace;
    if (trace && typeof trace === "object" && "handoff" in trace && "ranked" in trace && Array.isArray(trace.ranked)
      && (trace.handoff === null || typeof trace.handoff === "object" && trace.handoff && "facts" in trace.handoff && Array.isArray(trace.handoff.facts))) {
      onTrace(trace as PersonalDecisionTrace);
    }
    return value.result;
  }
  return value;
}

export async function invokeDecisionProduct({
  supabase,
  request,
  onTrace,
}: {
  supabase: SupabaseClient;
  request: DecisionProductRequest;
  onTrace?: (trace: PersonalDecisionTrace) => void;
}): Promise<DecisionProductResponse> {
  const accessToken = await freshAccessToken(supabase);
  return executeDecisionProductSingleRoute({
    binding: DECISION_PRODUCT_RELEASE_BINDING,
    request,
    invoke: async () => {
      // The canonical Decision uses the same Zürich database region as Web.
      const abort = new AbortController();
      const { data, error } = await withinDecisionDeadline(supabase.functions.invoke<unknown>(
        DECISION_PRODUCT_RELEASE_BINDING.transportFunction,
        { body: request, headers: { Authorization: `Bearer ${accessToken}`, "x-region": "eu-central-2", ...(onTrace ? { "x-backyrd-personal-trace": "1" } : {}) }, signal: abort.signal },
      ) as Promise<InvokeResult<unknown>>, 33_000, "decision_request_transport_timeout", () => abort.abort());
      if (error && typeof error === "object" && "context" in error && error.context instanceof Response && error.context.status === 422) {
        const failure = decisionProductInputFailure(unpackPersonalTrace(await error.context.json(), onTrace));
        if (failure) throw failure;
      }
      if (error || !data) throw error ?? new Error("decision_single_route_empty_response");
      return unpackPersonalTrace(data, onTrace);
    },
  });
}
