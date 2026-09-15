import { canonicalJson, hashBody } from "./canonical.js";
import { FRESHNESS_STATES, RESOLUTION_STATES, TRUST_STATES, parseAttributeValue } from "./contracts.js";
import { parseWorldKnowledgeSnapshot, type PortKnowledgeEntry } from "./port.js";
import { REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { ContractValidationError, array, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";
import { SOURCE_USE_CASES, type SourcePolicy } from "./source-policy.js";

export const CONTEXT_HANDOFF_VERSION = "backyrd.world-knowledge.context-handoff@1.0" as const;
export const CONTEXT_HANDOFF_KEYS = ["purpose.primary_visit", "offering.onsite", "context.visit_situations", "context.atmosphere", "context.typical_dayparts"] as const;

export interface ContextHandoffEntry {
  readonly key: typeof CONTEXT_HANDOFF_KEYS[number];
  readonly resolution: PortKnowledgeEntry["resolution"];
  readonly freshness: PortKnowledgeEntry["freshness"];
  readonly trust: PortKnowledgeEntry["trust"];
  readonly value: PortKnowledgeEntry["value"];
  readonly basisClaimRefs: readonly string[];
  readonly entryHash: string;
}

export interface WorldKnowledgeContextHandoff {
  readonly contractVersion: typeof CONTEXT_HANDOFF_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly spotId: string;
  readonly snapshotHash: string;
  readonly createdAt: string;
  readonly primaryVisitPurpose: ContextHandoffEntry | null;
  readonly onsiteOfferings: ContextHandoffEntry | null;
  readonly visitSituations: ContextHandoffEntry | null;
  readonly atmosphere: ContextHandoffEntry | null;
  readonly typicalDayparts: ContextHandoffEntry | null;
  readonly absentKeys: readonly typeof CONTEXT_HANDOFF_KEYS[number][];
  readonly explicitUnknowns: readonly typeof CONTEXT_HANDOFF_KEYS[number][];
  readonly conflicts: readonly { readonly code: string; readonly attributeKeys: readonly string[]; readonly claimRefs: readonly string[] }[];
  readonly exclusions: readonly string[];
  readonly handoffHash: string;
}

const fieldByKey = {
  "purpose.primary_visit": "primaryVisitPurpose",
  "offering.onsite": "onsiteOfferings",
  "context.visit_situations": "visitSituations",
  "context.atmosphere": "atmosphere",
  "context.typical_dayparts": "typicalDayparts",
} as const;

export function createWorldKnowledgeContextHandoff(snapshotValue: unknown, acceptedPolicies: readonly Pick<SourcePolicy, "policyVersion" | "policyHash">[], createdAtValue: string): WorldKnowledgeContextHandoff {
  const snapshot = parseWorldKnowledgeSnapshot(snapshotValue, acceptedPolicies);
  const createdAt = timestamp(createdAtValue, "$.createdAt");
  const contextual = new Map(snapshot.facts.filter((entry) => CONTEXT_HANDOFF_KEYS.includes(entry.key as typeof CONTEXT_HANDOFF_KEYS[number])).map((entry) => [entry.key, entry]));
  const body: Omit<WorldKnowledgeContextHandoff, "handoffHash"> = {
    contractVersion: CONTEXT_HANDOFF_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH,
    spotId: snapshot.spot.spotId, snapshotHash: snapshot.snapshotHash, createdAt,
    primaryVisitPurpose: contextual.get("purpose.primary_visit") as ContextHandoffEntry | undefined ?? null,
    onsiteOfferings: contextual.get("offering.onsite") as ContextHandoffEntry | undefined ?? null,
    visitSituations: contextual.get("context.visit_situations") as ContextHandoffEntry | undefined ?? null,
    atmosphere: contextual.get("context.atmosphere") as ContextHandoffEntry | undefined ?? null,
    typicalDayparts: contextual.get("context.typical_dayparts") as ContextHandoffEntry | undefined ?? null,
    absentKeys: CONTEXT_HANDOFF_KEYS.filter((key) => !contextual.has(key) && !snapshot.explicitUnknowns.some((entry) => entry.key === key)),
    explicitUnknowns: CONTEXT_HANDOFF_KEYS.filter((key) => snapshot.explicitUnknowns.some((entry) => entry.key === key)),
    conflicts: snapshot.conflicts.filter((conflict) => conflict.attributeKeys.some((key) => CONTEXT_HANDOFF_KEYS.includes(key as typeof CONTEXT_HANDOFF_KEYS[number]))).map((conflict) => ({ code: conflict.code, attributeKeys: [...conflict.attributeKeys].sort(), claimRefs: [...conflict.claimRefs].sort() })),
    exclusions: ["CAPABILITY_INTENT_MAPPING", "CONTACTS", "OWNER_TIER", "PAYMENT", "PRIVATE_PROVENANCE", "RANKING_WEIGHTS", "SUBSCRIPTION", "USER_TASTE"],
  };
  return Object.freeze({ ...body, handoffHash: hashBody(body, []) });
}

export function parseWorldKnowledgeContextHandoff(value: unknown): WorldKnowledgeContextHandoff {
  const input = object(value, "$", ["contractVersion", "registryVersion", "registryHash", "spotId", "snapshotHash", "createdAt", "primaryVisitPurpose", "onsiteOfferings", "visitSituations", "atmosphere", "typicalDayparts", "absentKeys", "explicitUnknowns", "conflicts", "exclusions", "handoffHash"]);
  if (required(input, "contractVersion") !== CONTEXT_HANDOFF_VERSION) throw new ContractValidationError("$.contractVersion", "unknown context handoff version");
  if (required(input, "registryVersion") !== REGISTRY_VERSION || required(input, "registryHash") !== REGISTRY_HASH) throw new ContractValidationError("$.registryVersion", "unknown registry identity");
  timestamp(required(input, "createdAt"), "$.createdAt"); hash(required(input, "snapshotHash"), "$.snapshotHash"); string(required(input, "spotId"), "$.spotId", { min: 1, max: 180 });
  for (const key of CONTEXT_HANDOFF_KEYS) {
    const field = fieldByKey[key]; const entry = required(input, field, "$.");
    if (entry !== null) {
      const parsed = object(entry, `$.${field}`, ["key", "scope", "resolution", "freshness", "trust", "value", "observedAt", "validFrom", "validUntil", "basisClaimRefs", "sourceAssessmentHashes", "authorizedUseCases", "entryHash"]);
      if (required(parsed, "key", `$.${field}`) !== key) throw new ContractValidationError(`$.${field}.key`, "context field key mismatch");
      identifier(required(parsed, "scope", `$.${field}`), `$.${field}.scope`); enumValue(required(parsed, "resolution", `$.${field}`), RESOLUTION_STATES, `$.${field}.resolution`); enumValue(required(parsed, "freshness", `$.${field}`), FRESHNESS_STATES, `$.${field}.freshness`); enumValue(required(parsed, "trust", `$.${field}`), TRUST_STATES, `$.${field}.trust`);
      parseAttributeValue(key, required(parsed, "value", `$.${field}`), `$.${field}.value`); timestamp(required(parsed, "observedAt", `$.${field}`), `$.${field}.observedAt`);
      for (const temporal of ["validFrom", "validUntil"] as const) if (required(parsed, temporal, `$.${field}`) !== null) timestamp(required(parsed, temporal, `$.${field}`), `$.${field}.${temporal}`);
      array(required(parsed, "basisClaimRefs", `$.${field}`), `$.${field}.basisClaimRefs`).forEach((item, index) => identifier(item, `$.${field}.basisClaimRefs[${index}]`));
      array(required(parsed, "sourceAssessmentHashes", `$.${field}`), `$.${field}.sourceAssessmentHashes`).forEach((item, index) => hash(item, `$.${field}.sourceAssessmentHashes[${index}]`));
      array(required(parsed, "authorizedUseCases", `$.${field}`), `$.${field}.authorizedUseCases`).forEach((item, index) => enumValue(item, SOURCE_USE_CASES, `$.${field}.authorizedUseCases[${index}]`));
      const suppliedEntryHash = hash(required(parsed, "entryHash", `$.${field}`), `$.${field}.entryHash`); const entryBody = Object.fromEntries(Object.entries(parsed).filter(([name]) => name !== "entryHash"));
      if (hashBody(entryBody, []) !== suppliedEntryHash) throw new ContractValidationError(`$.${field}.entryHash`, "context entry hash mismatch");
    }
  }
  for (const field of ["absentKeys", "explicitUnknowns", "conflicts", "exclusions"] as const) array(required(input, field), `$.${field}`);
  const suppliedHash = hash(required(input, "handoffHash"), "$.handoffHash");
  const body = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "handoffHash"));
  if (hashBody(body, []) !== suppliedHash) throw new ContractValidationError("$.handoffHash", "context handoff hash mismatch");
  const parsed = { ...body, handoffHash: suppliedHash } as unknown as WorldKnowledgeContextHandoff;
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new ContractValidationError("$", "context handoff is not canonical");
  return parsed;
}
