import { createPublicKey, verify as verifySignature } from "node:crypto";
import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import { ContractValidationError, identifier, schema, sha256, timestamp, type Infer } from "./schema.js";

export const FOUNDER_LIVE_PRODUCTION_MODE = "PRODUCTION_FOUNDER_READ_ONLY" as const;
export const FOUNDER_LIVE_RUNTIME_AUTHORITY_VERSION = "backyrd.decision-vnext.founder-live-runtime-authority@1.0" as const;
export const FOUNDER_LIVE_KILL_SWITCH_VERSION = "backyrd.decision-vnext.founder-live-kill-switch@1.0" as const;
export const FOUNDER_LIVE_RUNTIME_TRUST_ROOT_VERSION = "backyrd.decision-vnext.founder-live-runtime-trust-root@1.0" as const;

const gitSha = schema.string({ pattern: /^[a-f0-9]{40}$/ });
const signature = schema.string({ min: 80, max: 128, pattern: /^[A-Za-z0-9+/]+={0,2}$/ });

export const FounderLiveRuntimeTrustRootSchema = schema.object({
  contractVersion: schema.literal(FOUNDER_LIVE_RUNTIME_TRUST_ROOT_VERSION), trustRootId: identifier, keyId: identifier,
  algorithm: schema.literal("Ed25519"), scope: schema.literal("FOUNDER_LIVE_PRODUCTION_RUNTIME"), publicKeySpkiPem: schema.string({ min: 80, max: 512 }),
  validFrom: timestamp, validUntil: timestamp, status: schema.enum(["NOT_PROVISIONED", "ACTIVE", "REVOKED"] as const), trustRootHash: sha256,
});
export type FounderLiveRuntimeTrustRoot = Infer<typeof FounderLiveRuntimeTrustRootSchema>;

export const FounderLiveRuntimeAuthorityRecordSchema = schema.object({
  contractVersion: schema.literal(FOUNDER_LIVE_RUNTIME_AUTHORITY_VERSION), authorityId: identifier, mode: schema.literal(FOUNDER_LIVE_PRODUCTION_MODE),
  purpose: schema.literal("FOUNDER_DECISION_EVALUATION"), projectRef: identifier, canonicalMainSha: gitSha, canonicalTreeSha: gitSha,
  releaseHash: sha256, artifactHash: sha256, sourceSetHash: sha256, productionPlanHash: sha256, policyHash: sha256,
  authorityGeneration: schema.number({ integer: true, min: 1 }), authorityNonce: identifier, killSwitchGeneration: schema.number({ integer: true, min: 1 }),
  expectedMemberCount: schema.literal(2), validFrom: timestamp, validUntil: timestamp, issuer: schema.literal("BACKYRD_FOUNDER_LIVE_RUNTIME_AUTHORITY"),
  readOnlyScope: schema.literal(true), learningAuthorized: schema.literal(false), writebackAuthorized: schema.literal(false), rankingAuthorized: schema.literal(false),
  eligibilityAuthorized: schema.literal(false), shadowTrafficAuthorized: schema.literal(false), genericProductionAuthority: schema.literal(false),
  keyId: identifier, authorityHash: sha256, signature,
});
export type FounderLiveRuntimeAuthorityRecord = Infer<typeof FounderLiveRuntimeAuthorityRecordSchema>;

export const FounderLiveKillSwitchRecordSchema = schema.object({
  contractVersion: schema.literal(FOUNDER_LIVE_KILL_SWITCH_VERSION), recordId: identifier, projectRef: identifier, authorityHash: sha256,
  authorityGeneration: schema.number({ integer: true, min: 1 }), killSwitchGeneration: schema.number({ integer: true, min: 1 }),
  state: schema.enum(["ENGAGED", "DISENGAGED_FOR_EXACT_RELEASE"] as const), observedAt: timestamp, validUntil: timestamp,
  issuer: schema.literal("BACKYRD_FOUNDER_LIVE_EMERGENCY_AUTHORITY"), keyId: identifier, recordHash: sha256, signature,
});
export type FounderLiveKillSwitchRecord = Infer<typeof FounderLiveKillSwitchRecordSchema>;

export interface FounderLiveRuntimeExpectedIdentity {
  readonly projectRef: string; readonly canonicalMainSha: string; readonly canonicalTreeSha: string; readonly releaseHash: string;
  readonly artifactHash: string; readonly sourceSetHash: string; readonly productionPlanHash: string; readonly policyHash: string;
}
export interface FounderLiveRuntimeAuthorityInspection {
  readonly status: "VERIFIED_NON_EXECUTABLE";
  readonly authorityHash: string;
  readonly authorityGeneration: number;
  readonly killSwitchGeneration: number;
  readonly projectRef: string;
  readonly executionAuthorized: false;
}

const without = (value: Readonly<Record<string, unknown>>, ...keys: readonly string[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

function verifyDetached(value: Readonly<Record<string, unknown>>, hashField: string, root: FounderLiveRuntimeTrustRoot): void {
  const body = without(value, hashField, "signature");
  if (value[hashField] !== contentHash(body)) throw new ContractValidationError(`$.${hashField}`, "content hash mismatch");
  const rawSignature = value.signature;
  if (typeof rawSignature !== "string" || !verifySignature(null, Buffer.from(canonicalJson(body), "utf8"), createPublicKey(root.publicKeySpkiPem), Buffer.from(rawSignature, "base64"))) throw new ContractValidationError("$.signature", "detached signature rejected");
}

/**
 * Verifies provenance only. It deliberately cannot mint an execution capability.
 * A later separately authorised release must provide a pinned ACTIVE trust root
 * and an activation-specific capability loader.
 */
export function inspectFounderLiveRuntimeAuthority(input: {
  readonly record: unknown; readonly trustRoot: unknown; readonly acceptedTrustRootHash: string;
  readonly expected: FounderLiveRuntimeExpectedIdentity; readonly now: string;
}): FounderLiveRuntimeAuthorityInspection {
  const root = FounderLiveRuntimeTrustRootSchema.parse(input.trustRoot);
  const rootBody = without(root as unknown as Record<string, unknown>, "trustRootHash");
  if (root.trustRootHash !== contentHash(rootBody) || root.trustRootHash !== input.acceptedTrustRootHash || root.status !== "ACTIVE") throw new ContractValidationError("$.trustRoot", "trust root is not externally accepted");
  const now = Date.parse(timestamp.parse(input.now));
  if (now < Date.parse(root.validFrom) || now > Date.parse(root.validUntil)) throw new ContractValidationError("$.trustRoot", "trust root is outside validity");
  const record = FounderLiveRuntimeAuthorityRecordSchema.parse(input.record);
  verifyDetached(record as unknown as Record<string, unknown>, "authorityHash", root);
  if (record.keyId !== root.keyId || now < Date.parse(record.validFrom) || now > Date.parse(record.validUntil)) throw new ContractValidationError("$.authority", "authority is stale or uses another key");
  for (const key of ["projectRef", "canonicalMainSha", "canonicalTreeSha", "releaseHash", "artifactHash", "sourceSetHash", "productionPlanHash", "policyHash"] as const) if (record[key] !== input.expected[key]) throw new ContractValidationError(`$.authority.${key}`, "runtime identity mismatch");
  return deepFreeze({ status: "VERIFIED_NON_EXECUTABLE", authorityHash: record.authorityHash, authorityGeneration: record.authorityGeneration, killSwitchGeneration: record.killSwitchGeneration, projectRef: record.projectRef, executionAuthorized: false });
}

/** A fresh record is validated for audit/rehearsal only and never enables execution. */
export function inspectFounderLiveKillSwitch(input: {
  readonly record: unknown; readonly trustRoot: unknown; readonly acceptedTrustRootHash: string;
  readonly authority: FounderLiveRuntimeAuthorityInspection; readonly now: string;
}): Readonly<{ state: FounderLiveKillSwitchRecord["state"]; recordHash: string; executionAuthorized: false }> {
  const root = FounderLiveRuntimeTrustRootSchema.parse(input.trustRoot);
  if (root.trustRootHash !== input.acceptedTrustRootHash || root.status !== "ACTIVE") throw new ContractValidationError("$.trustRoot", "kill-switch trust root rejected");
  const record = FounderLiveKillSwitchRecordSchema.parse(input.record);
  verifyDetached(record as unknown as Record<string, unknown>, "recordHash", root);
  const now = Date.parse(timestamp.parse(input.now));
  if (record.keyId !== root.keyId || record.projectRef !== input.authority.projectRef || record.authorityHash !== input.authority.authorityHash || record.authorityGeneration !== input.authority.authorityGeneration || record.killSwitchGeneration !== input.authority.killSwitchGeneration || now < Date.parse(record.observedAt) || now > Date.parse(record.validUntil)) throw new ContractValidationError("$.killSwitch", "kill switch is stale or unrelated");
  return deepFreeze({ state: record.state, recordHash: record.recordHash, executionAuthorized: false });
}
