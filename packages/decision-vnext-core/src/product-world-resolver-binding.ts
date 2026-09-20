import { ACCEPTED_SOURCE_POLICY, REGISTRY_HASH, REGISTRY_VERSION, getAttributeDefinition, parseAttributeValue, type PortKnowledgeEntry, type WorldKnowledgeSnapshot } from "@backyrd/world-knowledge-core";
import { contentHash, deepFreeze } from "./canonical.js";

type Entry = Pick<PortKnowledgeEntry, "key" | "value" | "resolution" | "freshness" | "trust" | "entryHash"> & { readonly validFrom?: string | null; readonly validUntil?: string | null };
export type ProductWorldView = Pick<WorldKnowledgeSnapshot, "spot" | "explicitUnknowns" | "exclusions" | "snapshotHash"> & {
  readonly facts: readonly Entry[];
  readonly operationalRules: readonly Entry[];
  readonly currentStates: readonly Entry[];
  readonly conflicts: readonly { readonly code: string; readonly severity: "INFO" | "WARNING" | "BLOCKING"; readonly attributeKeys: readonly string[] }[];
};

const HASH = /^[0-9a-f]{64}$/;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("product_world_binding_invalid");
  return value as Record<string, unknown>;
};
const rows = (value: unknown, max: number): readonly unknown[] => {
  if (!Array.isArray(value) || value.length > max) throw new Error("product_world_binding_rows_invalid");
  return value;
};
const factKey = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("product_world_fact_key_invalid");
  const definition = getAttributeDefinition(value);
  if (definition.engineAuthorization !== "AUTHORIZED") throw new Error("product_world_fact_not_authorized");
  return value;
};
const decisionRelevant = (key: string) => !key.startsWith("contact.") && key !== "operation.payment_methods";
const city = (value: string) => value.normalize("NFKC").toLocaleLowerCase("de-CH").replaceAll("ä", "a").replaceAll("ö", "o").replaceAll("ü", "u");

/** Validates the SQL resolver's manifest-bound Product projection; never relabels it as a TS World port. */
export function parseProductWorldResolverBinding(value: unknown, targetCity: string): ProductWorldView {
  const binding = object(value);
  if (binding.contractVersion !== "backyrd.world-knowledge.product-resolver-binding@1.0" || typeof binding.manifestHash !== "string" || !HASH.test(binding.manifestHash)) throw new Error("product_world_manifest_binding_invalid");
  const raw = object(binding.decisionProjection);
  if (raw.contractVersion !== "backyrd.world-knowledge.product-decision-projection@1.0" || raw.registryVersion !== REGISTRY_VERSION || binding.registryHash !== REGISTRY_HASH || raw.policyVersion !== ACCEPTED_SOURCE_POLICY.policyVersion || typeof raw.spotId !== "string" || !ID.test(raw.spotId)) throw new Error("product_world_resolver_identity_invalid");
  if (typeof binding.resolvedAt !== "string" || !Number.isFinite(Date.parse(binding.resolvedAt))) throw new Error("product_world_resolver_time_invalid");
  const seen = new Map<string, string>();
  const parsed = rows(raw.facts, 200).flatMap((item): (Entry & { kind: string })[] => {
    const row = object(item); const key = factKey(row.key);
    if (!decisionRelevant(key)) return [];
    if (row.scope !== "SPOT" || seen.has(key)) throw new Error("product_world_fact_scope_or_duplicate");
    seen.set(key, String(row.resolution));
    if (row.freshness !== "CURRENT") throw new Error("product_world_fact_not_current_verified");
    if (!Array.isArray(row.basisClaimHashes) || !row.basisClaimHashes.length || row.basisClaimHashes.some((hash) => typeof hash !== "string" || !HASH.test(hash))) throw new Error("product_world_fact_provenance_invalid");
    if (row.resolution === "UNKNOWN" || row.resolution === "DISPUTED") {
      if (row.value !== null || row.trust !== (row.resolution === "DISPUTED" ? "CONFLICTING" : "VERIFIED")) throw new Error("product_world_nonknowledge_invalid");
      return [];
    }
    if (row.trust !== "VERIFIED" || !["KNOWN_VALUE", "KNOWN_TRUE", "KNOWN_FALSE"].includes(String(row.resolution))) throw new Error("product_world_fact_not_current_verified");
    const validated = parseAttributeValue(key, row.value, `product_world.${key}`);
    if (row.resolution === "KNOWN_TRUE" && validated !== true || row.resolution === "KNOWN_FALSE" && validated !== false) throw new Error("product_world_fact_resolution_mismatch");
    if (key === "state.current" && (row.validityVerified !== true || (row.validFrom !== null && (typeof row.validFrom !== "string" || !Number.isFinite(Date.parse(row.validFrom)))) || (row.validUntil !== null && (typeof row.validUntil !== "string" || !Number.isFinite(Date.parse(row.validUntil)))))) throw new Error("product_world_current_state_validity_unverified");
    return [{ key, value: validated, resolution: row.resolution as Entry["resolution"], freshness: "CURRENT", trust: "VERIFIED", entryHash: contentHash({ manifestHash: binding.manifestHash, fact: row }), ...(key === "state.current" ? { validFrom: row.validFrom as string | null, validUntil: row.validUntil as string | null } : {}), kind: getAttributeDefinition(key).kind }];
  });
  const byKey = (key: string): unknown => parsed.find((item) => item.key === key)?.value ?? null;
  const locality = byKey("location.locality");
  if (typeof locality !== "string" || city(locality) !== city(targetCity)) throw new Error("product_world_locality_invalid");
  if (typeof byKey("identity.name") !== "string") throw new Error("product_world_identity_name_unavailable");
  const conflictRows = rows(raw.conflicts, 100).flatMap((item) => { const row = object(item); const key = factKey(row.key); if (!decisionRelevant(key)) return []; if (row.scope !== "SPOT" || seen.get(key) !== "DISPUTED" || !Array.isArray(row.claimHashes) || row.claimHashes.length < 2) throw new Error("product_world_conflict_invalid"); return [{ code: "OVERLAPPING_CONTRADICTORY_CLAIMS", severity: "BLOCKING" as const, attributeKeys: [key] }]; });
  const unknownRows = rows(raw.explicitUnknowns, 200).flatMap((item) => { const row = object(item); const key = factKey(row.key); if (!decisionRelevant(key)) return []; if (row.scope !== "SPOT" || seen.get(key) !== "UNKNOWN") throw new Error("product_world_unknown_invalid"); return [{ key, scope: "SPOT" }]; });
  if ([...seen].some(([key, resolution]) => resolution === "DISPUTED" && !conflictRows.some((item) => item.attributeKeys[0] === key) || resolution === "UNKNOWN" && !unknownRows.some((item) => item.key === key))) throw new Error("product_world_nonknowledge_unbound");
  const facts = parsed.filter((item) => item.kind === "FACT");
  const operationalRules = parsed.filter((item) => item.kind === "OPERATIONAL_RULE");
  const currentStates = parsed.filter((item) => item.kind === "CURRENT_STATE");
  const spot: WorldKnowledgeSnapshot["spot"] = {
    spotId: raw.spotId,
    identity: { name: byKey("identity.name") as string | null },
    location: { addressLine1: null, locality: targetCity, neighborhood: null, countryCode: null, latitude: null, longitude: null, timezone: byKey("location.timezone") as string | null },
    classification: { primaryCategory: byKey("classification.primary_category") as WorldKnowledgeSnapshot["spot"]["classification"]["primaryCategory"], placeTypes: (byKey("classification.place_types") ?? []) as WorldKnowledgeSnapshot["spot"]["classification"]["placeTypes"] },
    publicContact: { publicEmail: null, website: null, phone: null, instagram: null, facebook: null, linkedin: null, tiktok: null },
  };
  return deepFreeze({ spot, facts, operationalRules, currentStates, conflicts: conflictRows, explicitUnknowns: unknownRows, exclusions: [], snapshotHash: contentHash({ manifestHash: binding.manifestHash, resolvedAt: binding.resolvedAt, decisionProjection: raw }) });
}
