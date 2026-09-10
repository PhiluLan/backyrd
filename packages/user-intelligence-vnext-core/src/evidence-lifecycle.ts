import { contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import { emptyEvidenceEngineState, EvidenceBuildResult, EvidenceEngineState, parseEvidenceEngineState } from "./evidence-chain.js";
import { planLifecycleImpact, REQUIRED_LIFECYCLE_STORES } from "./lifecycle.js";
import { ContractValidationError } from "./schema.js";

export type EvidenceLifecycleAction = "CONSENT_WITHDRAWAL" | "FULL_PERSONALIZATION_RESET" | "ACCOUNT_ERASURE";
export interface EvidenceLifecycleResult {
  readonly action: EvidenceLifecycleAction;
  readonly status: "COMPLETED";
  readonly state: EvidenceEngineState;
  readonly rebuildMaterial: null;
  readonly acceptedEvents: readonly [];
  readonly deduplication: readonly [];
  readonly storeResults: readonly { readonly store: string; readonly effect: "DELETE" | "INVALIDATE" | "RETAIN_NON_PERSONAL" }[];
  readonly proofHash: string;
}

export function applyEvidenceLifecycle(value: EvidenceBuildResult, action: EvidenceLifecycleAction): EvidenceLifecycleResult {
  parseEvidenceEngineState(value.state);
  const plan = planLifecycleImpact(action);
  const storeResults = plan.map((row) => ({ store: row.store, effect: row.effect === "RETAIN_NON_PERSONAL" ? "RETAIN_NON_PERSONAL" as const : row.effect === "INVALIDATE" ? "INVALIDATE" as const : "DELETE" as const }));
  if (action === "ACCOUNT_ERASURE") {
    for (const store of REQUIRED_LIFECYCLE_STORES) {
      const result = storeResults.find((row) => row.store === store);
      if (!result) throw new ContractValidationError("$.storeResults", `missing lifecycle result for ${store}`);
      if (result.effect !== "DELETE" && result.effect !== "RETAIN_NON_PERSONAL") throw new ContractValidationError("$.storeResults", `account erasure did not delete ${store}`);
    }
  }
  const state = emptyEvidenceEngineState(action === "ACCOUNT_ERASURE" ? "ERASED" : action === "CONSENT_WITHDRAWAL" ? "WITHDRAWN" : "RESET");
  const body = { action, status: "COMPLETED" as const, state, rebuildMaterial: null, acceptedEvents: [] as const, deduplication: [] as const, storeResults, contractVersion: CONTRACT_VERSIONS.evidenceEngineState };
  return { action, status: "COMPLETED", state, rebuildMaterial: null, acceptedEvents: [], deduplication: [], storeResults, proofHash: contentHash(body) };
}

export function verifyEvidenceLifecycleCompletion(value: EvidenceLifecycleResult): EvidenceLifecycleResult {
  parseEvidenceEngineState(value.state);
  if (value.rebuildMaterial !== null || value.acceptedEvents.length || value.deduplication.length) throw new ContractValidationError("$.rebuildMaterial", "completed lifecycle result retains personal ledger or rebuild material");
  if (new Set(value.storeResults.map((row) => row.store)).size !== value.storeResults.length || value.storeResults.length !== REQUIRED_LIFECYCLE_STORES.length) throw new ContractValidationError("$.storeResults", "lifecycle proof must cover every store exactly once");
  if (value.action === "ACCOUNT_ERASURE") for (const store of REQUIRED_LIFECYCLE_STORES) {
    const row = value.storeResults.find((candidate) => candidate.store === store);
    if (!row || (store === "technical_audit_manifests" ? row.effect !== "RETAIN_NON_PERSONAL" : row.effect !== "DELETE")) throw new ContractValidationError("$.storeResults", `completed account erasure lacks deletion proof for ${store}`);
  }
  const body = { action: value.action, status: value.status, state: value.state, rebuildMaterial: value.rebuildMaterial, acceptedEvents: value.acceptedEvents, deduplication: value.deduplication, storeResults: value.storeResults, contractVersion: CONTRACT_VERSIONS.evidenceEngineState };
  if (contentHash(body) !== value.proofHash) throw new ContractValidationError("$.proofHash", "lifecycle completion proof mismatch");
  return value;
}
