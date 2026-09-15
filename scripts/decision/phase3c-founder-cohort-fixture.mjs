import { createHash } from "node:crypto";
import { ACCEPTED_POLICY_VERSION, REGISTRY_HASH, REGISTRY_VERSION, createFounderWorldCohortHandoff, hashBody } from "../../packages/world-knowledge-core/dist/index.js";
import { postgresJsonbText } from "../world-knowledge/postgres-jsonb-canonical.mjs";

const h = (value) => hashBody({ value }, []);
const pgHash = (value) => createHash("sha256").update(postgresJsonbText(value), "utf8").digest("hex");
const contextKeys = ["purpose.primary_visit", "offering.onsite", "context.visit_situations", "context.atmosphere", "context.typical_dayparts"];
const contextExclusions = ["CAPABILITY_INTENT_MAPPING", "CONTACTS", "OWNER_TIER", "PAYMENT", "PRIVATE_PROVENANCE", "RANKING_WEIGHTS", "SUBSCRIPTION", "USER_TASTE"];
export const LOCAL_FOUNDER_COHORT_FIXTURE = Object.freeze([
  { spotId: "1101ee26-5046-4cdc-921a-5a3bd4cb5306", name: "Volta Bräu" },
  { spotId: "57cb213c-9472-40b6-80be-a810fd77b7c9", name: "ELYS Boulderloft" },
  { spotId: "f8ae8625-aa9c-4647-9af5-c981fc40854a", name: "Tierpark Lange Erlen" },
  { spotId: "ff90b2f4-0c51-4423-adb5-e9a0ad22213e", name: "Consum Weinbar" },
  { spotId: "644fbd15-91f8-4ab7-8a4b-dbe06622d148", name: "Café Frühling" },
]);
export function makeFounderCohortHandoff(entries = LOCAL_FOUNDER_COHORT_FIXTURE) {
  const normalized = entries.map((entry, index) => typeof entry === "string" ? { spotId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: entry } : entry);
  const spotDetails = normalized.map(({ spotId, name }, index) => {
    const manifestHash = h(`manifest:${name}`);
    const fact = (key, value, resolution = "KNOWN_VALUE") => ({ key, scope: "GLOBAL", resolution, value, trust: "VERIFIED", freshness: "CURRENT", basisClaimHashes: [h(`claim:${spotId}:${key}`)] });
    const ageRule = name === "Volta Bräu" ? [fact("rule.age_access_conditions", { rules: [{ mode: "UNACCOMPANIED_MINIMUM", minimumAge: 13, accompaniment: "ADULT", appliesFromTime: null, days: [], area: null, event: null }], notes: null })] : [];
    const price = name === "Consum Weinbar" ? [fact("operation.price_range", { currency: "CHF", min: 12, max: 38 })] : [];
    const worldSnapshot = { contractVersion: "backyrd.world-knowledge.shadow-snapshot@1.0", registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: ACCEPTED_POLICY_VERSION, spotId, resolvedAt: "2026-09-16T18:00:00.000Z", facts: [fact("identity.name", name), fact("location.locality", "Basel"), fact("accessibility.step_free_entrance", index === 0 ? true : null, index === 0 ? "KNOWN_TRUE" : "UNKNOWN"), ...ageRule, ...price], explicitUnknowns: index === 0 ? [] : [{ key: "accessibility.step_free_entrance", scope: "GLOBAL" }], conflicts: [] };
    return { spotId, fallbackName: name, manifest: { manifestHash, worldSnapshot } };
  });
  const spots = spotDetails.map((detail) => {
    const contextBody = { contractVersion: "backyrd.world-knowledge.context-handoff-shadow@1.0", registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_POLICY_VERSION, spotId: detail.spotId, resolvedAt: detail.manifest.worldSnapshot.resolvedAt, entries: {}, absentKeys: contextKeys, explicitUnknowns: [], conflicts: [], exclusions: contextExclusions };
    const contextHandoffHash = pgHash(contextBody);
    return { spotId: detail.spotId, manifestHash: detail.manifest.manifestHash, resolutionHash: h(`resolution:${detail.spotId}`), inputHash: h(`input:${detail.spotId}`), snapshotHash: h(`source-snapshot:${detail.spotId}`), contextHandoff: { ...contextBody, handoffHash: contextHandoffHash }, contextHandoffHash };
  });
  const manifestBody = { contractVersion: "backyrd.world-knowledge.founder-cohort-shadow@3.0", scope: "FOUNDER_EVALUATION_ONLY", cohortId: `founder-fixture-${normalized.length}`, registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_POLICY_VERSION, spots, exclusions: ["ADMIN_NOTES", "CAPABILITY_INTENT_MAPPING", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "RANKING_WEIGHTS", "SUBSCRIPTION", "USER_TASTE"] };
  return createFounderWorldCohortHandoff({ manifest: { ...manifestBody, cohortHash: pgHash(manifestBody) }, spotDetails });
}
