import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, deepFreeze } from "./canonical.js";
import type { FounderLiveExecution } from "./founder-live-api.js";

export const FOUNDER_LIVE_DURABLE_IDEMPOTENCY_VERSION = "backyrd.decision-vnext.founder-live-durable-idempotency-port@1.0" as const;
export const FOUNDER_LIVE_IDEMPOTENCY_SCOPE = "backyrd.founder-live.idempotency-scope@1.0" as const;
export const FOUNDER_LIVE_IDEMPOTENCY_PURPOSE = "FOUNDER_LIVE_READ_ONLY_EVALUATION" as const;
const RPC = "backyrd_founder_live_idempotency_commit_v1" as const;
const SHA256 = /^[0-9a-f]{64}$/;

export interface FounderLiveIdempotencyRpcClient {
  rpc(name: typeof RPC, parameters: Readonly<Record<string, unknown>>): Promise<{ readonly data: unknown; readonly error: { readonly message?: string } | null }>;
}

export interface FounderLiveDurableIdempotencyCommit {
  readonly subjectBindingHash: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly execution: FounderLiveExecution;
}

export type FounderLiveDurableIdempotencyResult =
  | { readonly status: "CREATED"; readonly responseHash: string; readonly createdAt: string; readonly expiresAt: string }
  | { readonly status: "REPLAYED"; readonly responseHash: string; readonly execution: FounderLiveExecution; readonly createdAt: string; readonly expiresAt: string }
  | { readonly status: "CONFLICT" | "EXPIRED"; readonly createdAt: string; readonly expiresAt: string };

export interface FounderLiveDurableIdempotencyPort {
  readonly contractVersion: typeof FOUNDER_LIVE_DURABLE_IDEMPOTENCY_VERSION;
  commit(input: FounderLiveDurableIdempotencyCommit): Promise<FounderLiveDurableIdempotencyResult>;
}

export interface FounderLiveDurableIdempotencyBindings {
  readonly releaseHash: string;
  readonly artifactHash: string;
  readonly sourceSetHash: string;
  readonly responseContractVersion: string;
  readonly hmacSecret: string;
  readonly ttlSeconds?: number;
}

const hashBytes = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const equalHash = (left: string, right: string): boolean => SHA256.test(left) && SHA256.test(right)
  && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
const assertHash = (name: string, value: string): void => { if (!SHA256.test(value)) throw new Error(`founder_live_idempotency_${name}_invalid`); };
const stringField = (row: Record<string, unknown>, key: string): string => {
  const value = row[key]; if (typeof value !== "string" || value.length === 0) throw new Error(`founder_live_idempotency_rpc_${key}_invalid`); return value;
};

export function createFounderLiveDurableIdempotencyPort(
  client: FounderLiveIdempotencyRpcClient,
  bindings: FounderLiveDurableIdempotencyBindings,
): FounderLiveDurableIdempotencyPort {
  assertHash("release_hash", bindings.releaseHash); assertHash("artifact_hash", bindings.artifactHash); assertHash("source_set_hash", bindings.sourceSetHash);
  if (!/^backyrd\.[a-z0-9._-]+@[0-9]+\.[0-9]+$/.test(bindings.responseContractVersion)) throw new Error("founder_live_idempotency_response_contract_invalid");
  if (Buffer.byteLength(bindings.hmacSecret, "utf8") < 32) throw new Error("founder_live_idempotency_hmac_secret_too_short");
  const ttlSeconds = bindings.ttlSeconds ?? 86400;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86400) throw new Error("founder_live_idempotency_ttl_invalid");
  const digest = (kind: "subject" | "key", value: string) => createHmac("sha256", bindings.hmacSecret)
    .update(`${FOUNDER_LIVE_IDEMPOTENCY_SCOPE}\0${FOUNDER_LIVE_IDEMPOTENCY_PURPOSE}\0${bindings.releaseHash}\0${kind}\0${value}`, "utf8").digest("hex");

  return Object.freeze({
    contractVersion: FOUNDER_LIVE_DURABLE_IDEMPOTENCY_VERSION,
    async commit(input: FounderLiveDurableIdempotencyCommit): Promise<FounderLiveDurableIdempotencyResult> {
      assertHash("subject_binding", input.subjectBindingHash); assertHash("payload_hash", input.payloadHash);
      if (input.idempotencyKey.length < 1 || input.idempotencyKey.length > 256) throw new Error("founder_live_idempotency_key_invalid");
      const responseEnvelopeBytes = canonicalJson(input.execution); const responseHash = hashBytes(responseEnvelopeBytes);
      const { data, error } = await client.rpc(RPC, {
        p_scope_version: FOUNDER_LIVE_IDEMPOTENCY_SCOPE, p_purpose: FOUNDER_LIVE_IDEMPOTENCY_PURPOSE,
        p_subject_digest: digest("subject", input.subjectBindingHash), p_idempotency_key_digest: digest("key", input.idempotencyKey),
        p_payload_hash: input.payloadHash, p_response_contract_version: bindings.responseContractVersion,
        p_release_hash: bindings.releaseHash, p_artifact_hash: bindings.artifactHash, p_source_set_hash: bindings.sourceSetHash,
        p_response_envelope_bytes: responseEnvelopeBytes, p_response_hash: responseHash, p_ttl_seconds: ttlSeconds,
      });
      if (error) throw new Error("founder_live_idempotency_rpc_failed");
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("founder_live_idempotency_rpc_result_invalid");
      const row = data as Record<string, unknown>; const status = row.status; const createdAt = stringField(row, "createdAt"); const expiresAt = stringField(row, "expiresAt");
      if (status === "CONFLICT" || status === "EXPIRED") return deepFreeze({ status, createdAt, expiresAt });
      if (status !== "CREATED" && status !== "REPLAYED") throw new Error("founder_live_idempotency_rpc_status_invalid");
      const storedHash = stringField(row, "responseHash"); assertHash("stored_response_hash", storedHash);
      if (status === "CREATED") {
        if (!equalHash(storedHash, responseHash)) throw new Error("founder_live_idempotency_created_hash_mismatch");
        return deepFreeze({ status, responseHash: storedHash, createdAt, expiresAt });
      }
      const storedBytes = stringField(row, "responseEnvelopeBytes");
      if (!equalHash(hashBytes(storedBytes), storedHash)) throw new Error("founder_live_idempotency_replay_hash_mismatch");
      let execution: FounderLiveExecution; try { execution = JSON.parse(storedBytes) as FounderLiveExecution; } catch { throw new Error("founder_live_idempotency_replay_json_invalid"); }
      return deepFreeze({ status, responseHash: storedHash, execution, createdAt, expiresAt });
    },
  });
}
