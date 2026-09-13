import { ACCEPTED_POLICY_VERSION, REGISTRY_HASH, REGISTRY_VERSION, createFounderWorldCohortHandoff, hashBody } from "../../packages/world-knowledge-core/dist/index.js";

const h = (value) => hashBody({ value }, []);
export function makeFounderCohortHandoff(names = ["Volta Bräu", "Limmat Lokal"]) {
  const spotDetails = names.map((name, index) => {
    const spotId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`; const manifestHash = h(`manifest:${name}`);
    const fact = (key, value, resolution = "KNOWN_VALUE") => ({ key, scope: "GLOBAL", resolution, value, trust: "VERIFIED", freshness: "CURRENT", basisClaimHashes: [h(`claim:${spotId}:${key}`)] });
    const worldSnapshot = { contractVersion: "backyrd.world-knowledge.shadow-snapshot@1.0", registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: ACCEPTED_POLICY_VERSION, spotId, resolvedAt: "2026-09-16T18:00:00.000Z", facts: [fact("identity.name", name), fact("location.locality", index % 2 ? "Basel" : "Zurich"), fact("accessibility.step_free_entrance", index === 0 ? true : null, index === 0 ? "KNOWN_TRUE" : "UNKNOWN")], explicitUnknowns: index === 0 ? [] : [{ key: "accessibility.step_free_entrance", scope: "GLOBAL" }], conflicts: [] };
    return { spotId, fallbackName: name, manifest: { manifestHash, worldSnapshot } };
  });
  const spots = spotDetails.map((detail) => ({ spotId: detail.spotId, manifestHash: detail.manifest.manifestHash, resolutionHash: h(`resolution:${detail.spotId}`), inputHash: h(`input:${detail.spotId}`), snapshotHash: h(`source-snapshot:${detail.spotId}`) }));
  const manifestBody = { contractVersion: "backyrd.world-knowledge.founder-cohort-shadow@2.0", scope: "FOUNDER_EVALUATION_ONLY", cohortId: `founder-fixture-${names.length}`, registryVersion: REGISTRY_VERSION, policyVersion: ACCEPTED_POLICY_VERSION, spots, exclusions: ["ADMIN_NOTES", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "SUBSCRIPTION"] };
  return createFounderWorldCohortHandoff({ manifest: { ...manifestBody, cohortHash: hashBody(manifestBody, []) }, spotDetails });
}
