import { createHmac } from "node:crypto";
import type { FounderLiveRateLimitPort } from "./founder-live-api.js";

const HASH = /^[0-9a-f]{64}$/;
const TOKEN = /^[a-z0-9][a-z0-9._:-]{1,79}$/;
export const FOUNDER_LIVE_DURABLE_RATE_LIMIT_VERSION = "backyrd.decision-vnext.founder-live-rate-limit-port@1.0" as const;
export const FOUNDER_LIVE_DURABLE_RATE_LIMIT_RPC = "backyrd_consume_launch_cost_boundary_v1" as const;
export const FOUNDER_LIVE_DURABLE_RATE_LIMIT_MIGRATION = "20260904233000_gate7_launch_cost_boundaries.sql" as const;
export const FOUNDER_LIVE_DURABLE_RATE_LIMIT_MIGRATION_SHA256 = "0b0cb4fd8f773313174f1f765956f3195604c3eea624bdd3d6fab82c7bf553aa" as const;

export interface FounderLiveRateLimitRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    readonly data: unknown;
    readonly error: { readonly message?: string } | null;
  }>;
}

export interface FounderLiveRateLimitRuntimeBinding {
  readonly environment: string;
  readonly projectRef: string;
  readonly functionHost: string;
  readonly releaseHash: string;
  readonly artifactHash: string;
  readonly sourceSetHash: string;
  readonly subjectKeyVersion: string;
}

export interface FounderLiveRateLimitLimits {
  readonly subjectMinute: number;
  readonly subjectDay: number;
  readonly globalMinute: number;
  readonly globalDay: number;
}

export interface FounderLiveDurableRateLimitInput {
  readonly rpc: FounderLiveRateLimitRpcClient;
  readonly expectedBinding: FounderLiveRateLimitRuntimeBinding;
  readonly loadRuntimeBinding: () => FounderLiveRateLimitRuntimeBinding;
  readonly loadSubjectKey: () => { readonly version: string; readonly value: string };
  readonly limits: FounderLiveRateLimitLimits;
  readonly assertActive: () => void;
  readonly operation?: string;
}

function sameBinding(actual: FounderLiveRateLimitRuntimeBinding, expected: FounderLiveRateLimitRuntimeBinding): boolean {
  return actual.environment === "PRODUCTION"
    && actual.environment === expected.environment
    && actual.projectRef === expected.projectRef
    && actual.functionHost === expected.functionHost
    && actual.releaseHash === expected.releaseHash
    && actual.artifactHash === expected.artifactHash
    && actual.sourceSetHash === expected.sourceSetHash
    && actual.subjectKeyVersion === expected.subjectKeyVersion;
}

function validateBinding(value: FounderLiveRateLimitRuntimeBinding): void {
  if (value.environment !== "PRODUCTION"
    || !TOKEN.test(value.projectRef)
    || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/[a-z0-9-]+$/.test(value.functionHost)
    || !HASH.test(value.releaseHash)
    || !HASH.test(value.artifactHash)
    || !HASH.test(value.sourceSetHash)
    || !TOKEN.test(value.subjectKeyVersion)) throw new Error("founder_live_rate_limit_binding_invalid");
}

function validateLimits(value: FounderLiveRateLimitLimits): void {
  if (!Number.isSafeInteger(value.subjectMinute) || value.subjectMinute < 1
    || !Number.isSafeInteger(value.subjectDay) || value.subjectDay < value.subjectMinute
    || !Number.isSafeInteger(value.globalMinute) || value.globalMinute < value.subjectMinute
    || !Number.isSafeInteger(value.globalDay) || value.globalDay < value.globalMinute) {
    throw new Error("founder_live_rate_limit_limits_invalid");
  }
}

/**
 * Adapts the already-shipped, transactional Gate-7 Postgres boundary to the
 * Founder Live port. It stores only a purpose-bound HMAC pseudonym. All
 * counters remain multi-instance and restart safe inside the canonical RPC.
 */
export function createFounderLiveDurableRateLimitPort(input: FounderLiveDurableRateLimitInput): FounderLiveRateLimitPort {
  validateBinding(input.expectedBinding);
  validateLimits(input.limits);
  const operation = input.operation ?? "founder_live_decision";
  if (!TOKEN.test(operation)) throw new Error("founder_live_rate_limit_operation_invalid");

  return Object.freeze({
    contractVersion: FOUNDER_LIVE_DURABLE_RATE_LIMIT_VERSION,
    async consume(subjectBindingHash: string): Promise<boolean> {
      input.assertActive();
      if (!HASH.test(subjectBindingHash)) throw new Error("founder_live_rate_limit_subject_invalid");
      const before = input.loadRuntimeBinding();
      validateBinding(before);
      if (!sameBinding(before, input.expectedBinding)) throw new Error("founder_live_rate_limit_binding_drift");
      const key = input.loadSubjectKey();
      if (key.version !== before.subjectKeyVersion || Buffer.byteLength(key.value, "utf8") < 32) {
        throw new Error("founder_live_rate_limit_subject_key_drift");
      }
      const subjectKey = createHmac("sha256", key.value)
        .update(`backyrd-founder-live-rate-limit@1.0:${key.version}:${subjectBindingHash}`)
        .digest("hex");
      input.assertActive();
      const { data, error } = await input.rpc.rpc(FOUNDER_LIVE_DURABLE_RATE_LIMIT_RPC, {
        p_operation: operation,
        p_subject_key: subjectKey,
        p_subject_minute_limit: input.limits.subjectMinute,
        p_subject_day_limit: input.limits.subjectDay,
        p_global_minute_limit: input.limits.globalMinute,
        p_global_day_limit: input.limits.globalDay,
      });
      input.assertActive();
      const after = input.loadRuntimeBinding();
      validateBinding(after);
      if (!sameBinding(after, input.expectedBinding)) throw new Error("founder_live_rate_limit_binding_drift");
      if (error || !data || typeof data !== "object") throw new Error("founder_live_rate_limit_store_unavailable");
      const result = data as { readonly allowed?: unknown; readonly blockedScope?: unknown };
      if (result.allowed === true) return true;
      if (result.allowed === false && ["subject_minute", "subject_day", "global_minute", "global_day"].includes(String(result.blockedScope))) return false;
      throw new Error("founder_live_rate_limit_store_response_invalid");
    },
  });
}
