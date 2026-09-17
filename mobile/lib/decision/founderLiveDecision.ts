import * as Crypto from "expo-crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FOUNDER_DECISION_CONTRACT,
  FounderDecisionUnavailableError,
  routeFounderDecision,
  type FounderDecisionRequest,
} from "@backyrd/founder-live-control-plane";
import { FOUNDER_LIVE_RELEASE_BINDING } from "./founderLiveRelease.generated";

type InvokeResult<T> = { data: T | null; error: unknown };

const hash = async (value: unknown) => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  JSON.stringify(value),
);

async function freshAccessToken(supabase: SupabaseClient, expectedUserId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || userData.user.id !== expectedUserId) {
    throw new FounderDecisionUnavailableError("founder_session_user_changed", userError);
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.access_token || sessionData.session.user.id !== userData.user.id) {
    throw new FounderDecisionUnavailableError("founder_session_not_fresh", sessionError);
  }
  return sessionData.session.access_token;
}

export async function invokeFounderLiveDecision<T extends object>({
  supabase,
  expectedUserId,
  requestId,
  idempotencyKey,
  context,
  continuation,
  legacyBody,
}: {
  supabase: SupabaseClient;
  expectedUserId: string;
  requestId: string;
  idempotencyKey: string;
  context: FounderDecisionRequest["context"];
  continuation: FounderDecisionRequest["continuation"];
  legacyBody: Record<string, unknown>;
}) {
  const accessToken = await freshAccessToken(supabase, expectedUserId);
  const request: FounderDecisionRequest = {
    contractVersion: FOUNDER_DECISION_CONTRACT.request as FounderDecisionRequest["contractVersion"],
    requestId,
    idempotencyKey,
    context,
    continuation,
  };

  return routeFounderDecision<T>({
    binding: FOUNDER_LIVE_RELEASE_BINDING,
    request,
    hash,
    invokeVNext: async () => {
      throw new FounderDecisionUnavailableError("founder_vnext_candidate_not_bound");
    },
    invokeExisting: async () => {
      const { data, error } = await supabase.functions.invoke<T>(FOUNDER_LIVE_RELEASE_BINDING.fallbackFunction, {
        body: legacyBody,
        headers: { Authorization: `Bearer ${accessToken}` },
      }) as InvokeResult<T>;
      if (error || !data) throw error ?? new Error("existing_engine_empty_response");
      return data;
    },
  });
}
