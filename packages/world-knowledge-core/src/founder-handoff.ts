import { createHash } from "node:crypto";
import { canonicalJson, hashBody } from "./canonical.js";
import { parseAttributeValue } from "./contracts.js";
import { REGISTRY_HASH, REGISTRY_VERSION } from "./registry.js";
import { ACCEPTED_POLICY_VERSION, ACCEPTED_SOURCE_POLICY } from "./slice3b.js";

export const FOUNDER_COHORT_HANDOFF_VERSION = "backyrd.world-knowledge.founder-cohort-handoff@1.0" as const;
export const FOUNDER_SHADOW_COHORT_VERSION = "backyrd.world-knowledge.founder-cohort-shadow@3.0" as const;
export const FOUNDER_SHADOW_SNAPSHOT_VERSION = "backyrd.world-knowledge.shadow-snapshot@1.0" as const;
export const FOUNDER_CONTEXT_SHADOW_VERSION = "backyrd.world-knowledge.context-handoff-shadow@1.0" as const;

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface FounderShadowFact {
  readonly key: string;
  readonly scope: string;
  readonly resolution: "KNOWN_TRUE" | "KNOWN_FALSE" | "KNOWN_VALUE" | "UNKNOWN" | "DISPUTED";
  readonly value: JsonValue;
  readonly trust: "VERIFIED" | "CONFLICTING";
  readonly freshness: "CURRENT";
  readonly basisClaimHashes: readonly string[];
}

export interface FounderShadowSnapshot {
  readonly contractVersion: typeof FOUNDER_SHADOW_SNAPSHOT_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly registryHash: string;
  readonly policyVersion: typeof ACCEPTED_POLICY_VERSION;
  readonly spotId: string;
  readonly resolvedAt: string;
  readonly facts: readonly FounderShadowFact[];
  readonly explicitUnknowns: readonly { readonly key: string; readonly scope: string }[];
  readonly conflicts: readonly { readonly key: string; readonly scope: string; readonly claimHashes: readonly string[] }[];
}

export interface FounderShadowCohortManifest {
  readonly contractVersion: typeof FOUNDER_SHADOW_COHORT_VERSION;
  readonly scope: "FOUNDER_EVALUATION_ONLY";
  readonly cohortId: string;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly policyVersion: typeof ACCEPTED_POLICY_VERSION;
  readonly spots: readonly { readonly spotId: string; readonly manifestHash: string; readonly resolutionHash: string; readonly inputHash: string; readonly snapshotHash: string; readonly contextHandoff: FounderContextShadowHandoff; readonly contextHandoffHash: string }[];
  readonly exclusions: readonly string[];
  readonly cohortHash: string;
}

export interface FounderWorldCohortHandoff {
  readonly contractVersion: typeof FOUNDER_COHORT_HANDOFF_VERSION;
  readonly scope: "FOUNDER_EVALUATION_ONLY";
  readonly source: "WORLD_KNOWLEDGE_FOUNDER_EXPORT";
  readonly manifest: FounderShadowCohortManifest;
  readonly manifestContentHash: string;
  readonly registryHash: string;
  readonly policyHash: string;
  readonly compatibilityMode: "REGISTRY_2_1_CONTEXT_EXCLUDED_EVALUATION_ONLY";
  readonly spots: readonly { readonly spotId: string; readonly name: string; readonly manifestHash: string; readonly sourceSnapshotHash: string; readonly snapshotContentHash: string; readonly snapshot: FounderShadowSnapshot }[];
  readonly exportedAt: string;
  readonly productionAuthorized: false;
  readonly productQualityClaim: false;
  readonly handoffHash: string;
}

const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const contextKeys = ["purpose.primary_visit", "offering.onsite", "context.visit_situations", "context.atmosphere", "context.typical_dayparts"] as const;
type ContextKey = typeof contextKeys[number];
export interface FounderContextShadowHandoff {
  readonly contractVersion: typeof FOUNDER_CONTEXT_SHADOW_VERSION;
  readonly registryVersion: typeof REGISTRY_VERSION;
  readonly policyVersion: typeof ACCEPTED_POLICY_VERSION;
  readonly spotId: string;
  readonly resolvedAt: string;
  readonly entries: Readonly<Partial<Record<ContextKey, FounderShadowFact>>>;
  readonly absentKeys: readonly ContextKey[];
  readonly explicitUnknowns: readonly ContextKey[];
  readonly conflicts: readonly { readonly key: string; readonly scope: string; readonly claimHashes: readonly string[] }[];
  readonly exclusions: readonly string[];
  readonly handoffHash: string;
}
const expectedExclusions = ["ADMIN_NOTES", "CAPABILITY_INTENT_MAPPING", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "RANKING_WEIGHTS", "SUBSCRIPTION", "USER_TASTE"] as const;
const expectedContextExclusions = ["CAPABILITY_INTENT_MAPPING", "CONTACTS", "OWNER_TIER", "PAYMENT", "PRIVATE_PROVENANCE", "RANKING_WEIGHTS", "SUBSCRIPTION", "USER_TASTE"] as const;
const decisionAllowedPrefixes = ["classification.", "offering.", "hours.", "capacity.", "rule.", "operation.", "amenity.", "accessibility.", "state."] as const;
const isContextKey = (key: string): key is ContextKey => contextKeys.includes(key as ContextKey);
const isDecisionAllowedKey = (key: string) => !isContextKey(key) && (key === "identity.name" || key === "location.locality" || key === "location.neighborhood" || key === "location.country_code" || key === "location.timezone" || decisionAllowedPrefixes.some((prefix) => key.startsWith(prefix)) && key !== "operation.payment_methods");

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}_must_be_object`);
  const input = value as Record<string, unknown>;
  const extras = Object.keys(input).filter((key) => !keys.includes(key));
  if (extras.length) throw new Error(`${path}_unknown_field:${extras[0]}`);
  for (const key of keys) if (!(key in input)) throw new Error(`${path}_missing_field:${key}`);
  return input;
}
const text = (value: unknown, path: string) => { if (typeof value !== "string" || value.length < 1 || value.length > 500) throw new Error(`${path}_invalid`); return value.normalize("NFC"); };
const hash = (value: unknown, path: string) => { const parsed = text(value, path); if (!HASH.test(parsed)) throw new Error(`${path}_invalid_hash`); return parsed; };
const identifier = (value: unknown, path: string) => { const parsed = text(value, path); if (!ID.test(parsed)) throw new Error(`${path}_invalid_identifier`); return parsed; };
const list = (value: unknown, path: string, min = 0, max = 100) => { if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${path}_invalid_array`); return value; };
const exact = <T extends string | boolean>(value: unknown, expected: T, path: string): T => { if (value !== expected) throw new Error(`${path}_identity_mismatch`); return expected; };

function postgresJsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((left, right) => Buffer.byteLength(left, "utf8") - Buffer.byteLength(right, "utf8") || Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
    return `{${keys.map((key) => `${JSON.stringify(key)}: ${postgresJsonbText((value as Record<string, unknown>)[key])}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}
const postgresJsonbHash = (value: unknown) => createHash("sha256").update(postgresJsonbText(value), "utf8").digest("hex");

function parseJson(value: unknown, path: string, depth = 0): JsonValue {
  if (depth > 12) throw new Error(`${path}_too_deep`);
  if (value === null || typeof value === "boolean" || typeof value === "string") return typeof value === "string" ? value.normalize("NFC") : value;
  if (typeof value === "number" && Number.isFinite(value)) return Object.is(value, -0) ? 0 : value;
  if (Array.isArray(value)) return value.map((item, index) => parseJson(item, `${path}[${index}]`, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, parseJson(item, `${path}.${key}`, depth + 1)]));
  throw new Error(`${path}_invalid_json`);
}

function parseFact(value: unknown, path: string): FounderShadowFact {
  const input = record(value, path, ["key", "scope", "resolution", "value", "trust", "freshness", "basisClaimHashes"]);
  const key = identifier(input.key, `${path}.key`); const scope = identifier(input.scope, `${path}.scope`);
  const resolution = text(input.resolution, `${path}.resolution`) as FounderShadowFact["resolution"];
  if (!(["KNOWN_TRUE", "KNOWN_FALSE", "KNOWN_VALUE", "UNKNOWN", "DISPUTED"] as string[]).includes(resolution)) throw new Error(`${path}.resolution_invalid`);
  const trust = text(input.trust, `${path}.trust`) as FounderShadowFact["trust"];
  if (!(["VERIFIED", "CONFLICTING"] as string[]).includes(trust)) throw new Error(`${path}.trust_invalid`);
  exact(input.freshness, "CURRENT", `${path}.freshness`);
  const valueParsed = parseJson(input.value, `${path}.value`);
  if (["UNKNOWN", "DISPUTED"].includes(resolution)) { if (valueParsed !== null) throw new Error(`${path}.unknown_requires_null`); }
  else parseAttributeValue(key, valueParsed, `${path}.value`);
  const basisClaimHashes = list(input.basisClaimHashes, `${path}.basisClaimHashes`, 1, 100).map((item, index) => hash(item, `${path}.basisClaimHashes[${index}]`)).sort();
  return { key, scope, resolution, value: valueParsed, trust, freshness: "CURRENT", basisClaimHashes };
}

function parseContextHandoff(value: unknown, expectedSpotId: string, expectedHash: string, path: string): FounderContextShadowHandoff {
  const input = record(value, path, ["contractVersion", "registryVersion", "policyVersion", "spotId", "resolvedAt", "entries", "absentKeys", "explicitUnknowns", "conflicts", "exclusions", "handoffHash"]);
  exact(input.contractVersion, FOUNDER_CONTEXT_SHADOW_VERSION, `${path}.contractVersion`); exact(input.registryVersion, REGISTRY_VERSION, `${path}.registryVersion`); exact(input.policyVersion, ACCEPTED_POLICY_VERSION, `${path}.policyVersion`); exact(input.spotId, expectedSpotId, `${path}.spotId`);
  const resolvedAt = text(input.resolvedAt, `${path}.resolvedAt`); if (!Number.isFinite(Date.parse(resolvedAt))) throw new Error(`${path}.resolvedAt_invalid`);
  if (!input.entries || typeof input.entries !== "object" || Array.isArray(input.entries)) throw new Error(`${path}.entries_must_be_object`);
  const rawEntries = input.entries as Record<string, unknown>; const entries = Object.fromEntries(Object.entries(rawEntries).map(([key, entry]) => {
    if (!isContextKey(key)) throw new Error(`${path}.entries_unknown_key`); const parsed = parseFact(entry, `${path}.entries.${key}`); if (parsed.key !== key) throw new Error(`${path}.entries_key_mismatch`); if (parsed.resolution === "UNKNOWN" || parsed.resolution === "DISPUTED") throw new Error(`${path}.entries_non_known_state`); return [key, parsed];
  })) as Partial<Record<ContextKey, FounderShadowFact>>;
  const contextKeyList = (entry: unknown, itemPath: string) => list(entry, itemPath, 0, contextKeys.length).map((item, index) => { const key = text(item, `${itemPath}[${index}]`); if (!isContextKey(key)) throw new Error(`${itemPath}[${index}]_invalid`); return key; });
  const absentKeys = contextKeyList(input.absentKeys, `${path}.absentKeys`); const explicitUnknowns = contextKeyList(input.explicitUnknowns, `${path}.explicitUnknowns`);
  const conflicts = list(input.conflicts, `${path}.conflicts`, 0, 100).map((item, index) => { const row = record(item, `${path}.conflicts[${index}]`, ["key", "scope", "claimHashes"]); const key = text(row.key, `${path}.conflicts[${index}].key`); if (!isContextKey(key)) throw new Error(`${path}.conflicts[${index}].key_invalid`); return { key, scope: identifier(row.scope, `${path}.conflicts[${index}].scope`), claimHashes: list(row.claimHashes, `${path}.conflicts[${index}].claimHashes`, 2, 100).map((item, claimIndex) => hash(item, `${path}.conflicts[${index}].claimHashes[${claimIndex}]`)).sort() }; });
  const stateKeys = [...Object.keys(entries), ...absentKeys, ...explicitUnknowns, ...conflicts.map((conflict) => conflict.key)];
  if (new Set(stateKeys).size !== stateKeys.length) throw new Error(`${path}_knowledge_state_overlap`);
  const exclusions = list(input.exclusions, `${path}.exclusions`, expectedContextExclusions.length, expectedContextExclusions.length).map((item, index) => text(item, `${path}.exclusions[${index}]`));
  if (canonicalJson(exclusions) !== canonicalJson(expectedContextExclusions)) throw new Error(`${path}.exclusions_mismatch`);
  const suppliedHash = hash(input.handoffHash, `${path}.handoffHash`); if (suppliedHash !== expectedHash || postgresJsonbHash(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "handoffHash"))) !== suppliedHash) throw new Error(`${path}.handoff_hash_mismatch`);
  return { contractVersion: FOUNDER_CONTEXT_SHADOW_VERSION, registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_POLICY_VERSION, spotId: expectedSpotId, resolvedAt, entries, absentKeys, explicitUnknowns, conflicts, exclusions, handoffHash: suppliedHash };
}

export function parseFounderShadowSnapshot(value: unknown): FounderShadowSnapshot {
  const input = record(value, "founder_snapshot", ["contractVersion", "registryVersion", "registryHash", "policyVersion", "spotId", "resolvedAt", "facts", "explicitUnknowns", "conflicts"]);
  exact(input.contractVersion, FOUNDER_SHADOW_SNAPSHOT_VERSION, "founder_snapshot.contractVersion");
  exact(input.registryVersion, REGISTRY_VERSION, "founder_snapshot.registryVersion"); exact(input.registryHash, REGISTRY_HASH, "founder_snapshot.registryHash");
  exact(input.policyVersion, ACCEPTED_POLICY_VERSION, "founder_snapshot.policyVersion");
  const resolvedAt = text(input.resolvedAt, "founder_snapshot.resolvedAt"); if (!Number.isFinite(Date.parse(resolvedAt))) throw new Error("founder_snapshot.resolvedAt_invalid");
  const facts = list(input.facts, "founder_snapshot.facts", 0, 200).map((item, index) => parseFact(item, `founder_snapshot.facts[${index}]`));
  if (facts.some((item) => !isDecisionAllowedKey(item.key))) throw new Error("founder_snapshot_non_decision_fact");
  const factKeys = facts.map((item) => `${item.key}:${item.scope}`); if (new Set(factKeys).size !== factKeys.length) throw new Error("founder_snapshot_duplicate_fact");
  const pair = (item: unknown, path: string) => { const row = record(item, path, ["key", "scope"]); return { key: identifier(row.key, `${path}.key`), scope: identifier(row.scope, `${path}.scope`) }; };
  const conflict = (item: unknown, path: string) => { const row = record(item, path, ["key", "scope", "claimHashes"]); return { ...pair({ key: row.key, scope: row.scope }, path), claimHashes: list(row.claimHashes, `${path}.claimHashes`, 2, 100).map((entry, index) => hash(entry, `${path}.claimHashes[${index}]`)).sort() }; };
  return { contractVersion: FOUNDER_SHADOW_SNAPSHOT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: ACCEPTED_POLICY_VERSION, spotId: identifier(input.spotId, "founder_snapshot.spotId"), resolvedAt: new Date(resolvedAt).toISOString(), facts, explicitUnknowns: list(input.explicitUnknowns, "founder_snapshot.explicitUnknowns", 0, 200).map((item, index) => pair(item, `founder_snapshot.explicitUnknowns[${index}]`)), conflicts: list(input.conflicts, "founder_snapshot.conflicts", 0, 100).map((item, index) => conflict(item, `founder_snapshot.conflicts[${index}]`)) };
}

function parseManifest(value: unknown): FounderShadowCohortManifest {
  const input = record(value, "founder_manifest", ["contractVersion", "scope", "cohortId", "registryVersion", "policyVersion", "spots", "exclusions", "cohortHash"]);
  exact(input.contractVersion, FOUNDER_SHADOW_COHORT_VERSION, "founder_manifest.contractVersion"); exact(input.scope, "FOUNDER_EVALUATION_ONLY", "founder_manifest.scope");
  exact(input.registryVersion, REGISTRY_VERSION, "founder_manifest.registryVersion"); exact(input.policyVersion, ACCEPTED_POLICY_VERSION, "founder_manifest.policyVersion");
  const cohortHash = hash(input.cohortHash, "founder_manifest.cohortHash"); if (postgresJsonbHash(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "cohortHash"))) !== cohortHash) throw new Error("founder_manifest_content_hash_mismatch");
  const spots = list(input.spots, "founder_manifest.spots", 1, 40).map((item, index) => { const path = `founder_manifest.spots[${index}]`; const row = record(item, path, ["spotId", "manifestHash", "resolutionHash", "inputHash", "snapshotHash", "contextHandoff", "contextHandoffHash"]); const spotId = identifier(row.spotId, `${path}.spotId`); const contextHandoffHash = hash(row.contextHandoffHash, `${path}.contextHandoffHash`); return { spotId, manifestHash: hash(row.manifestHash, `${path}.manifestHash`), resolutionHash: hash(row.resolutionHash, `${path}.resolutionHash`), inputHash: hash(row.inputHash, `${path}.inputHash`), snapshotHash: hash(row.snapshotHash, `${path}.snapshotHash`), contextHandoff: parseContextHandoff(row.contextHandoff, spotId, contextHandoffHash, `${path}.contextHandoff`), contextHandoffHash }; });
  if (new Set(spots.map((item) => item.spotId)).size !== spots.length) throw new Error("founder_manifest_duplicate_spot");
  const exclusions = list(input.exclusions, "founder_manifest.exclusions", expectedExclusions.length, expectedExclusions.length).map((item, index) => text(item, `founder_manifest.exclusions[${index}]`));
  if (canonicalJson(exclusions) !== canonicalJson(expectedExclusions)) throw new Error("founder_manifest_exclusions_mismatch");
  return { contractVersion: FOUNDER_SHADOW_COHORT_VERSION, scope: "FOUNDER_EVALUATION_ONLY", cohortId: identifier(input.cohortId, "founder_manifest.cohortId"), registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_POLICY_VERSION, spots, exclusions, cohortHash };
}

export function createFounderWorldCohortHandoff(input: { readonly manifest: unknown; readonly spotDetails: readonly { readonly spotId: string; readonly fallbackName: string; readonly manifest: { readonly manifestHash: string; readonly worldSnapshot: unknown } }[] }): FounderWorldCohortHandoff {
  const manifest = parseManifest(input.manifest); if (input.spotDetails.length !== manifest.spots.length) throw new Error("founder_handoff_spot_count_mismatch");
  const details = new Map(input.spotDetails.map((item) => [item.spotId, item])); if (details.size !== input.spotDetails.length) throw new Error("founder_handoff_duplicate_spot");
  const spots = manifest.spots.map((binding) => { const detail = details.get(binding.spotId); if (!detail) throw new Error("founder_handoff_spot_missing"); if (detail.manifest.manifestHash !== binding.manifestHash) throw new Error("founder_handoff_manifest_hash_mismatch"); const raw = record(detail.manifest.worldSnapshot, "founder_source_snapshot", ["contractVersion", "registryVersion", "registryHash", "policyVersion", "spotId", "resolvedAt", "facts", "explicitUnknowns", "conflicts"]); const filtered = { ...raw, facts: list(raw.facts, "founder_source_snapshot.facts", 0, 200).filter((item) => isDecisionAllowedKey(String((item as Record<string, unknown>)?.key ?? ""))), explicitUnknowns: list(raw.explicitUnknowns, "founder_source_snapshot.explicitUnknowns", 0, 200).filter((item) => isDecisionAllowedKey(String((item as Record<string, unknown>)?.key ?? ""))), conflicts: list(raw.conflicts, "founder_source_snapshot.conflicts", 0, 100).filter((item) => isDecisionAllowedKey(String((item as Record<string, unknown>)?.key ?? ""))) }; const snapshot = parseFounderShadowSnapshot(filtered); if (snapshot.spotId !== binding.spotId) throw new Error("founder_handoff_snapshot_spot_mismatch"); const identityName = snapshot.facts.find((fact) => fact.key === "identity.name" && fact.resolution === "KNOWN_VALUE")?.value; const name = typeof identityName === "string" ? identityName : text(detail.fallbackName, "founder_handoff.fallbackName"); return { spotId: binding.spotId, name, manifestHash: binding.manifestHash, sourceSnapshotHash: binding.snapshotHash, snapshotContentHash: hashBody(snapshot as unknown as Record<string, unknown>, []), snapshot }; });
  const exportedAt = [...spots.map((item) => item.snapshot.resolvedAt)].sort().at(-1)!;
  const body = { contractVersion: FOUNDER_COHORT_HANDOFF_VERSION, scope: "FOUNDER_EVALUATION_ONLY" as const, source: "WORLD_KNOWLEDGE_FOUNDER_EXPORT" as const, manifest, manifestContentHash: hashBody(manifest as unknown as Record<string, unknown>, []), registryHash: REGISTRY_HASH, policyHash: ACCEPTED_SOURCE_POLICY.policyHash, compatibilityMode: "REGISTRY_2_1_CONTEXT_EXCLUDED_EVALUATION_ONLY" as const, spots, exportedAt, productionAuthorized: false as const, productQualityClaim: false as const };
  return { ...body, handoffHash: hashBody(body, []) };
}

export function parseFounderWorldCohortHandoff(value: unknown): FounderWorldCohortHandoff {
  const input = record(value, "founder_handoff", ["contractVersion", "scope", "source", "manifest", "manifestContentHash", "registryHash", "policyHash", "compatibilityMode", "spots", "exportedAt", "productionAuthorized", "productQualityClaim", "handoffHash"]);
  exact(input.contractVersion, FOUNDER_COHORT_HANDOFF_VERSION, "founder_handoff.contractVersion"); exact(input.scope, "FOUNDER_EVALUATION_ONLY", "founder_handoff.scope"); exact(input.source, "WORLD_KNOWLEDGE_FOUNDER_EXPORT", "founder_handoff.source"); exact(input.registryHash, REGISTRY_HASH, "founder_handoff.registryHash"); exact(input.compatibilityMode, "REGISTRY_2_1_CONTEXT_EXCLUDED_EVALUATION_ONLY", "founder_handoff.compatibilityMode"); exact(input.productionAuthorized, false, "founder_handoff.productionAuthorized"); exact(input.productQualityClaim, false, "founder_handoff.productQualityClaim");
  const manifest = parseManifest(input.manifest); const manifestContentHash = hash(input.manifestContentHash, "founder_handoff.manifestContentHash"); if (hashBody(manifest as unknown as Record<string, unknown>, []) !== manifestContentHash) throw new Error("founder_handoff_manifest_content_hash_mismatch"); const rows = list(input.spots, "founder_handoff.spots", 1, 40).map((item, index) => { const row = record(item, `founder_handoff.spots[${index}]`, ["spotId", "name", "manifestHash", "sourceSnapshotHash", "snapshotContentHash", "snapshot"]); const snapshot = parseFounderShadowSnapshot(row.snapshot); const parsed = { spotId: identifier(row.spotId, `founder_handoff.spots[${index}].spotId`), name: text(row.name, `founder_handoff.spots[${index}].name`), manifestHash: hash(row.manifestHash, `founder_handoff.spots[${index}].manifestHash`), sourceSnapshotHash: hash(row.sourceSnapshotHash, `founder_handoff.spots[${index}].sourceSnapshotHash`), snapshotContentHash: hash(row.snapshotContentHash, `founder_handoff.spots[${index}].snapshotContentHash`), snapshot }; if (snapshot.spotId !== parsed.spotId || hashBody(snapshot as unknown as Record<string, unknown>, []) !== parsed.snapshotContentHash) throw new Error("founder_handoff_snapshot_integrity_mismatch"); return parsed; });
  const byId = new Map(rows.map((item) => [item.spotId, item])); if (byId.size !== rows.length || rows.length !== manifest.spots.length) throw new Error("founder_handoff_spot_set_mismatch");
  for (const binding of manifest.spots) { const row = byId.get(binding.spotId); if (!row || row.manifestHash !== binding.manifestHash || row.sourceSnapshotHash !== binding.snapshotHash) throw new Error("founder_handoff_manifest_binding_mismatch"); }
  exact(input.policyHash, ACCEPTED_SOURCE_POLICY.policyHash, "founder_handoff.policyHash");
  const parsed = { contractVersion: FOUNDER_COHORT_HANDOFF_VERSION, scope: "FOUNDER_EVALUATION_ONLY" as const, source: "WORLD_KNOWLEDGE_FOUNDER_EXPORT" as const, manifest, manifestContentHash, registryHash: REGISTRY_HASH, policyHash: ACCEPTED_SOURCE_POLICY.policyHash, compatibilityMode: "REGISTRY_2_1_CONTEXT_EXCLUDED_EVALUATION_ONLY" as const, spots: rows, exportedAt: new Date(text(input.exportedAt, "founder_handoff.exportedAt")).toISOString(), productionAuthorized: false as const, productQualityClaim: false as const, handoffHash: hash(input.handoffHash, "founder_handoff.handoffHash") };
  if (hashBody(parsed as unknown as Record<string, unknown>, ["handoffHash"]) !== parsed.handoffHash) throw new Error("founder_handoff_hash_mismatch"); return parsed;
}
