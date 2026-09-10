import { contentHash } from "./canonical.js";
import { CONTRACT_VERSIONS } from "./contracts.js";
import { emptyEvidenceEngineState, EvidenceEngineState, parseEvidenceEngineState } from "./evidence-chain.js";
import { planLifecycleImpact, REQUIRED_LIFECYCLE_STORES } from "./lifecycle.js";
import { ContractValidationError } from "./schema.js";

export type EvidenceLifecycleAction = "CONSENT_WITHDRAWAL" | "FULL_PERSONALIZATION_RESET" | "ACCOUNT_ERASURE";
export interface EvidenceLifecycleResult {
  readonly action: EvidenceLifecycleAction;
  readonly status: "COMPLETED";
  readonly state: EvidenceEngineState;
  readonly storeResults: readonly { readonly store: string; readonly effect: "DELETE" | "INVALIDATE" | "RETAIN_NON_PERSONAL" }[];
  readonly proofHash: string;
}

export function applyEvidenceLifecycle(value: unknown, action: EvidenceLifecycleAction): EvidenceLifecycleResult {
  parseEvidenceEngineState(value);
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
  const body = { action, status: "COMPLETED" as const, state, storeResults, contractVersion: CONTRACT_VERSIONS.evidenceEngineState };
  return { action, status: "COMPLETED", state, storeResults, proofHash: contentHash(body) };
}
