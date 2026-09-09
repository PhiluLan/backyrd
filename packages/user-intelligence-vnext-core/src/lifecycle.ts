import { contentHash } from "./canonical.js";
import { ContractValidationError } from "./schema.js";

export const LIFECYCLE_MANIFEST_VERSION = "backyrd.user-intelligence.lifecycle-manifest@1.0";
export const REQUIRED_LIFECYCLE_STORES = Object.freeze([
  "canonical_memory_events", "evidence_chains", "taste_nodes", "practical_preferences", "direct_spot_affinities",
  "snapshots", "latest_pointer", "change_records", "projections", "work_items", "caches", "transparency_views", "technical_audit_manifests",
] as const);

export type LifecycleStoreName = typeof REQUIRED_LIFECYCLE_STORES[number];
export interface LifecycleStorePolicy {
  readonly store: LifecycleStoreName;
  readonly owner: "MEMORY" | "USER_INTELLIGENCE" | "PLATFORM_OPERATIONS";
  readonly privacyClass: "PERSONAL_RAW" | "PERSONAL_DERIVED" | "PERSONAL_POINTER" | "NON_PERSONAL_TECHNICAL";
  readonly stateKind: "SOURCE_OF_TRUTH" | "DERIVED" | "POINTER" | "CACHE" | "WORK" | "AUDIT";
  readonly exportBehavior: "EXPORT_OBSERVATIONS" | "EXPORT_USER_READABLE" | "EXPORT_METADATA" | "NOT_USER_EXPORTABLE_NON_PERSONAL";
  readonly retentionOwner: string;
  readonly purgeBehavior: string;
  readonly consentWithdrawalBehavior: string;
  readonly accountErasureBehavior: string;
  readonly rebuildStrategy: string;
  readonly allowedAuditResidue: "NONE" | "NON_PERSONAL_MANIFEST_ONLY";
  readonly maximumLifetime: "PRODUCT_POLICY_TBD" | "SOURCE_BOUND" | "EPHEMERAL" | "WHILE_REFERENCED" | "PERMANENT_NON_PERSONAL";
  readonly dependencies: readonly LifecycleStoreName[];
}

const personal = (store: LifecycleStoreName, owner: LifecycleStorePolicy["owner"], stateKind: LifecycleStorePolicy["stateKind"], exportBehavior: LifecycleStorePolicy["exportBehavior"], maximumLifetime: LifecycleStorePolicy["maximumLifetime"], dependencies: readonly LifecycleStoreName[] = []): LifecycleStorePolicy => ({
  store, owner, privacyClass: stateKind === "SOURCE_OF_TRUTH" ? "PERSONAL_RAW" : stateKind === "POINTER" ? "PERSONAL_POINTER" : "PERSONAL_DERIVED", stateKind, exportBehavior,
  retentionOwner: `${owner.toLowerCase()}:lifecycle-policy`,
  purgeBehavior: stateKind === "SOURCE_OF_TRUTH" ? "delete matching observations and trigger dependent rebuild or purge" : "delete or invalidate before source lifecycle completes",
  consentWithdrawalBehavior: "purge personalization state and invalidate projections",
  accountErasureBehavior: "delete all user-linked rows and references",
  rebuildStrategy: stateKind === "SOURCE_OF_TRUTH" ? "not rebuilt; restored only from an authorized source" : "rebuild only from still-authorized source observations",
  allowedAuditResidue: "NONE", maximumLifetime, dependencies,
});

export const USER_INTELLIGENCE_LIFECYCLE_MANIFEST = Object.freeze({
  version: LIFECYCLE_MANIFEST_VERSION,
  retentionDurationsFinal: false,
  sourceLifecycleDominatesDerivedState: true,
  stores: Object.freeze([
    personal("canonical_memory_events", "MEMORY", "SOURCE_OF_TRUTH", "EXPORT_OBSERVATIONS", "PRODUCT_POLICY_TBD"),
    personal("evidence_chains", "USER_INTELLIGENCE", "DERIVED", "EXPORT_USER_READABLE", "SOURCE_BOUND", ["canonical_memory_events"]),
    personal("taste_nodes", "USER_INTELLIGENCE", "DERIVED", "EXPORT_USER_READABLE", "SOURCE_BOUND", ["evidence_chains"]),
    personal("practical_preferences", "USER_INTELLIGENCE", "DERIVED", "EXPORT_USER_READABLE", "SOURCE_BOUND", ["evidence_chains"]),
    personal("direct_spot_affinities", "USER_INTELLIGENCE", "DERIVED", "EXPORT_USER_READABLE", "SOURCE_BOUND", ["evidence_chains"]),
    personal("snapshots", "USER_INTELLIGENCE", "DERIVED", "EXPORT_USER_READABLE", "SOURCE_BOUND", ["taste_nodes", "practical_preferences", "direct_spot_affinities"]),
    personal("latest_pointer", "USER_INTELLIGENCE", "POINTER", "EXPORT_METADATA", "WHILE_REFERENCED", ["snapshots"]),
    personal("change_records", "USER_INTELLIGENCE", "AUDIT", "EXPORT_USER_READABLE", "SOURCE_BOUND", ["evidence_chains", "snapshots"]),
    personal("projections", "USER_INTELLIGENCE", "DERIVED", "EXPORT_METADATA", "EPHEMERAL", ["snapshots"]),
    personal("work_items", "PLATFORM_OPERATIONS", "WORK", "EXPORT_METADATA", "EPHEMERAL", ["canonical_memory_events"]),
    personal("caches", "PLATFORM_OPERATIONS", "CACHE", "EXPORT_METADATA", "EPHEMERAL", ["snapshots", "projections"]),
    personal("transparency_views", "USER_INTELLIGENCE", "DERIVED", "EXPORT_USER_READABLE", "EPHEMERAL", ["snapshots"]),
    {
      store: "technical_audit_manifests", owner: "PLATFORM_OPERATIONS", privacyClass: "NON_PERSONAL_TECHNICAL", stateKind: "AUDIT",
      exportBehavior: "NOT_USER_EXPORTABLE_NON_PERSONAL", retentionOwner: "platform-operations:technical-audit-policy",
      purgeBehavior: "retain only contract, code and policy identities; reject user identifiers and user payloads",
      consentWithdrawalBehavior: "no action because personal data is structurally forbidden", accountErasureBehavior: "no action because personal data is structurally forbidden",
      rebuildStrategy: "recreate from released contract artifacts", allowedAuditResidue: "NON_PERSONAL_MANIFEST_ONLY", maximumLifetime: "PERMANENT_NON_PERSONAL", dependencies: [],
    },
  ] satisfies readonly LifecycleStorePolicy[]),
});

export function validateLifecycleManifest(value: typeof USER_INTELLIGENCE_LIFECYCLE_MANIFEST = USER_INTELLIGENCE_LIFECYCLE_MANIFEST): typeof USER_INTELLIGENCE_LIFECYCLE_MANIFEST {
  if (value.version !== LIFECYCLE_MANIFEST_VERSION) throw new ContractValidationError("$.version", "unsupported lifecycle manifest version");
  const names = value.stores.map(({ store }) => store);
  if (new Set(names).size !== names.length) throw new ContractValidationError("$.stores", "duplicate store policy");
  for (const required of REQUIRED_LIFECYCLE_STORES) if (!names.includes(required)) throw new ContractValidationError("$.stores", `missing lifecycle policy for ${required}`);
  for (const row of value.stores) {
    if (!row.retentionOwner || !row.purgeBehavior || !row.consentWithdrawalBehavior || !row.accountErasureBehavior || !row.rebuildStrategy) throw new ContractValidationError(`$.stores.${row.store}`, "incomplete lifecycle policy");
    for (const dependency of row.dependencies) if (!names.includes(dependency)) throw new ContractValidationError(`$.stores.${row.store}.dependencies`, `unknown store ${dependency}`);
    if (row.privacyClass !== "NON_PERSONAL_TECHNICAL" && row.allowedAuditResidue !== "NONE") throw new ContractValidationError(`$.stores.${row.store}.allowedAuditResidue`, "personal stores cannot leave audit residue");
  }
  return value;
}

export const USER_INTELLIGENCE_LIFECYCLE_MANIFEST_HASH = contentHash(USER_INTELLIGENCE_LIFECYCLE_MANIFEST);

export type LifecycleAction = "EXPORT" | "CORRECTION" | "ACTIVITY_EXCLUSION" | "PARTIAL_RESET" | "FULL_PERSONALIZATION_RESET" | "CONSENT_WITHDRAWAL" | "RETENTION_EXPIRY" | "ACCOUNT_ERASURE" | "REBUILD";
export interface LifecycleImpact {
  readonly store: LifecycleStoreName;
  readonly effect: "EXPORT" | "DELETE" | "INVALIDATE" | "REBUILD" | "RETAIN_NON_PERSONAL" | "NO_DIRECT_CHANGE";
}

export function planLifecycleImpact(action: LifecycleAction): readonly LifecycleImpact[] {
  return USER_INTELLIGENCE_LIFECYCLE_MANIFEST.stores.map((row) => {
    if (row.privacyClass === "NON_PERSONAL_TECHNICAL") return { store: row.store, effect: "RETAIN_NON_PERSONAL" as const };
    if (action === "EXPORT") return { store: row.store, effect: "EXPORT" as const };
    if (["ACCOUNT_ERASURE", "CONSENT_WITHDRAWAL", "FULL_PERSONALIZATION_RESET"].includes(action)) {
      return { store: row.store, effect: row.store === "projections" || row.store === "latest_pointer" || row.store === "caches" ? "INVALIDATE" as const : "DELETE" as const };
    }
    if (action === "RETENTION_EXPIRY" && row.stateKind === "SOURCE_OF_TRUTH") return { store: row.store, effect: "DELETE" as const };
    if (["CORRECTION", "ACTIVITY_EXCLUSION", "PARTIAL_RESET", "RETENTION_EXPIRY", "REBUILD"].includes(action)) {
      return { store: row.store, effect: row.stateKind === "SOURCE_OF_TRUTH" && action !== "RETENTION_EXPIRY" ? "NO_DIRECT_CHANGE" as const : row.stateKind === "POINTER" || row.stateKind === "CACHE" ? "INVALIDATE" as const : "REBUILD" as const };
    }
    return { store: row.store, effect: "NO_DIRECT_CHANGE" as const };
  });
}
