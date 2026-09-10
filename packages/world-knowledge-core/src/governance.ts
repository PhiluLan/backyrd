import { hashBody, sha256 } from "./canonical.js";
import { ATTRIBUTE_DEFINITIONS, PRIMARY_CATEGORY_LABELS, REGISTRY_HASH, REGISTRY_VERSION, type AttributeDefinition } from "./registry.js";
import { array, ContractValidationError, enumValue, hash, identifier, object, required, string, timestamp } from "./schema.js";

export const REGISTRY_GOVERNANCE_VERSION = "backyrd.world-knowledge.registry-governance@1.0" as const;
export const CHANGE_CLASSES = ["LABEL_ONLY", "ADDITIVE_DEFINITION", "ADDITIVE_ALLOWED_VALUE", "SEMANTIC_CHANGE", "DEPRECATION", "REMOVAL", "KEY_REPLACEMENT"] as const;
export const COMPATIBILITY_STATUSES = ["BACKWARD_COMPATIBLE", "REQUIRES_ADAPTER", "BREAKING"] as const;
export const APPROVER_ROLES = ["WORLD_KNOWLEDGE_MAINTAINER", "PRODUCT_CTO"] as const;
export type ChangeClass = typeof CHANGE_CLASSES[number];

export interface RegistryRelease {
  readonly governanceVersion: typeof REGISTRY_GOVERNANCE_VERSION;
  readonly registryVersion: string;
  readonly registryHash: string;
  readonly predecessorVersion: string | null;
  readonly changeClass: ChangeClass;
  readonly createdAt: string;
  readonly approval: { readonly recordId: string; readonly role: typeof APPROVER_ROLES[number]; readonly approvedAt: string };
  readonly changeSummary: readonly string[];
  readonly compatibilityStatus: typeof COMPATIBILITY_STATUSES[number];
  readonly deprecations: readonly { readonly key: string; readonly replacementKey: string | null; readonly removalNotBeforeVersion: string | null; readonly compatibilityPlan: string }[];
  readonly aliases: readonly { readonly fromKey: string; readonly toKey: string; readonly relation: "NAVIGATION_ONLY" | "SEMANTICALLY_EQUIVALENT" }[];
  readonly releaseHash: string;
}

export interface RegistryShape {
  readonly version: string;
  readonly hash: string;
  readonly definitions: readonly AttributeDefinition[];
  readonly categoryLabels: Readonly<Record<string, { readonly de: string; readonly en: string }>>;
}

const versionMajor = (value: string): number => {
  const match = /@(\d+)\.\d+$/.exec(value);
  if (!match) throw new ContractValidationError("$.registryVersion", "expected version ending in @major.minor");
  return Number(match[1]);
};
const semanticDefinition = (item: AttributeDefinition) => { const { labels: _labels, ...semantic } = item; return semantic; };

export function createRegistryRelease(inputValue: unknown): RegistryRelease {
  const input = object(inputValue, "$", ["registryVersion", "registryHash", "predecessorVersion", "changeClass", "createdAt", "approval", "changeSummary", "compatibilityStatus", "deprecations", "aliases"]);
  const approvalInput = object(required(input, "approval"), "$.approval", ["recordId", "role", "approvedAt"]);
  const deprecations = array(required(input, "deprecations"), "$.deprecations").map((value, index) => {
    const path = `$.deprecations[${index}]`; const item = object(value, path, ["key", "replacementKey", "removalNotBeforeVersion", "compatibilityPlan"]);
    const replacement = required(item, "replacementKey", path); const removal = required(item, "removalNotBeforeVersion", path);
    return { key: identifier(required(item, "key", path), `${path}.key`), replacementKey: replacement === null ? null : identifier(replacement, `${path}.replacementKey`), removalNotBeforeVersion: removal === null ? null : string(removal, `${path}.removalNotBeforeVersion`, { min: 1 }), compatibilityPlan: string(required(item, "compatibilityPlan", path), `${path}.compatibilityPlan`, { min: 1 }) };
  });
  const aliases = array(required(input, "aliases"), "$.aliases").map((value, index) => {
    const path = `$.aliases[${index}]`; const item = object(value, path, ["fromKey", "toKey", "relation"]);
    const fromKey = identifier(required(item, "fromKey", path), `${path}.fromKey`); const toKey = identifier(required(item, "toKey", path), `${path}.toKey`);
    if (fromKey === toKey) throw new ContractValidationError(path, "alias must be directed between distinct keys");
    return { fromKey, toKey, relation: enumValue(required(item, "relation", path), ["NAVIGATION_ONLY", "SEMANTICALLY_EQUIVALENT"] as const, `${path}.relation`) };
  });
  const predecessor = required(input, "predecessorVersion");
  const body = {
    governanceVersion: REGISTRY_GOVERNANCE_VERSION, registryVersion: string(required(input, "registryVersion"), "$.registryVersion", { min: 1 }), registryHash: hash(required(input, "registryHash"), "$.registryHash"),
    predecessorVersion: predecessor === null ? null : string(predecessor, "$.predecessorVersion", { min: 1 }), changeClass: enumValue(required(input, "changeClass"), CHANGE_CLASSES, "$.changeClass"), createdAt: timestamp(required(input, "createdAt"), "$.createdAt"),
    approval: { recordId: identifier(required(approvalInput, "recordId", "$.approval"), "$.approval.recordId"), role: enumValue(required(approvalInput, "role", "$.approval"), APPROVER_ROLES, "$.approval.role"), approvedAt: timestamp(required(approvalInput, "approvedAt", "$.approval"), "$.approval.approvedAt") },
    changeSummary: array(required(input, "changeSummary"), "$.changeSummary", { min: 1 }).map((value, index) => string(value, `$.changeSummary[${index}]`, { min: 1, max: 240 })).sort(),
    compatibilityStatus: enumValue(required(input, "compatibilityStatus"), COMPATIBILITY_STATUSES, "$.compatibilityStatus"), deprecations: [...deprecations].sort((a, b) => a.key.localeCompare(b.key)), aliases: [...aliases].sort((a, b) => a.fromKey.localeCompare(b.fromKey)),
  };
  return { ...body, releaseHash: hashBody(body, []) };
}

export function parseRegistryRelease(value: unknown): RegistryRelease {
  const input = object(value, "$", ["governanceVersion", "registryVersion", "registryHash", "predecessorVersion", "changeClass", "createdAt", "approval", "changeSummary", "compatibilityStatus", "deprecations", "aliases", "releaseHash"]);
  if (required(input, "governanceVersion") !== REGISTRY_GOVERNANCE_VERSION) throw new ContractValidationError("$.governanceVersion", "unknown governance version");
  const { governanceVersion: _ignored, releaseHash: supplied, ...draft } = input;
  const parsed = createRegistryRelease(draft); if (parsed.releaseHash !== hash(supplied, "$.releaseHash")) throw new ContractValidationError("$.releaseHash", "release hash mismatch");
  return parsed;
}

export function validateRegistryTransition(previous: RegistryShape, next: RegistryShape, releaseValue: unknown): RegistryRelease {
  const release = parseRegistryRelease(releaseValue);
  if (release.registryVersion !== next.version || release.registryHash !== next.hash || release.predecessorVersion !== previous.version) throw new ContractValidationError("$", "release identity does not bind transition");
  const expectedHash = next.version === REGISTRY_VERSION && sha256(next.definitions) === sha256(ATTRIBUTE_DEFINITIONS) && sha256(next.categoryLabels) === sha256(PRIMARY_CATEGORY_LABELS) ? REGISTRY_HASH : sha256({ version: next.version, definitions: next.definitions, categoryLabels: next.categoryLabels });
  if (expectedHash !== next.hash) throw new ContractValidationError("$.registryHash", "next registry content hash mismatch");
  const before = new Map(previous.definitions.map((item) => [item.key, item])); const after = new Map(next.definitions.map((item) => [item.key, item]));
  const removed = [...before.keys()].filter((key) => !after.has(key)); const added = [...after.keys()].filter((key) => !before.has(key));
  const changed = [...before.keys()].filter((key) => after.has(key) && sha256(semanticDefinition(before.get(key)!)) !== sha256(semanticDefinition(after.get(key)!)));
  if (release.changeClass === "LABEL_ONLY" && (removed.length || added.length || changed.length)) throw new ContractValidationError("$.changeClass", "label-only release changed registry semantics");
  if (release.changeClass === "ADDITIVE_DEFINITION" && (!added.length || removed.length || changed.length)) throw new ContractValidationError("$.changeClass", "additive definition release must only add stable keys");
  if (release.changeClass === "ADDITIVE_ALLOWED_VALUE") {
    if (added.length || removed.length || !changed.length) throw new ContractValidationError("$.changeClass", "allowed-value release may only extend existing definitions");
    for (const key of changed) { const oldDef = before.get(key)!; const newDef = after.get(key)!; const oldValues = oldDef.allowedValues ?? []; if (sha256({ ...semanticDefinition(oldDef), allowedValues: undefined }) !== sha256({ ...semanticDefinition(newDef), allowedValues: undefined }) || oldValues.some((value) => !(newDef.allowedValues ?? []).includes(value))) throw new ContractValidationError("$.changeClass", "allowed-value release removed or changed semantics"); }
  }
  if (release.changeClass === "SEMANTIC_CHANGE" && versionMajor(next.version) <= versionMajor(previous.version)) throw new ContractValidationError("$.registryVersion", "semantic changes require a major version increase");
  if (release.changeClass === "DEPRECATION" && (!release.deprecations.length || removed.length)) throw new ContractValidationError("$.deprecations", "deprecation must retain keys and provide a plan");
  if (release.changeClass === "REMOVAL") for (const key of removed) if (!release.deprecations.some((item) => item.key === key && item.compatibilityPlan.length > 0)) throw new ContractValidationError("$.deprecations", `removal lacks prior deprecation plan:${key}`);
  if (release.changeClass === "KEY_REPLACEMENT" && (!removed.length || !added.length || !release.aliases.length)) throw new ContractValidationError("$.aliases", "key replacement requires directed aliases, removal, and addition");
  return release;
}

export const FOUNDATION_REGISTRY_SHAPE: RegistryShape = Object.freeze({ version: REGISTRY_VERSION, hash: REGISTRY_HASH, definitions: ATTRIBUTE_DEFINITIONS, categoryLabels: PRIMARY_CATEGORY_LABELS });
export const FOUNDATION_REGISTRY_RELEASE = createRegistryRelease({ registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, predecessorVersion: null, changeClass: "ADDITIVE_DEFINITION", createdAt: "2026-09-10T11:01:01.000Z", approval: { recordId: "approval:pr-271-cto", role: "PRODUCT_CTO", approvedAt: "2026-09-10T11:01:01.000Z" }, changeSummary: ["Foundation Slice 1 registry accepted"], compatibilityStatus: "BACKWARD_COMPATIBLE", deprecations: [], aliases: [] });
