import {
  REGISTRY_HASH,
  REGISTRY_VERSION,
  SOURCE_USE_CASES,
  UNCONFIGURED_SOURCE_POLICY,
  createSourcePolicy,
} from "@backyrd/world-knowledge-core";

const prohibitedUseCases = Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, "PROHIBITED"]));
const noMinimumTrust = Object.fromEntries(SOURCE_USE_CASES.map((useCase) => [useCase, null]));

/** Test-only authority for the deterministic Decision sandbox. It is not a product source policy. */
export const SYNTHETIC_WORLD_SOURCE_POLICY = createSourcePolicy({
  policyVersion: "backyrd.world-knowledge.source-policy@synthetic-decision-sandbox-1",
  registryVersion: REGISTRY_VERSION,
  registryHash: REGISTRY_HASH,
  createdAt: "2026-01-15T12:00:00.000Z",
  entries: UNCONFIGURED_SOURCE_POLICY.entries.map((entry) => entry.attributeKey === "hours.regular" ? {
    ...entry,
    state: "CONFIGURED",
    allowedSourceTypes: ["OFFICIAL_SOURCE"],
    allowedActorTypes: ["SYSTEM"],
    sourceReference: "REQUIRED",
    selfAssertionAllowed: false,
    verificationProcess: { requirement: "NONE", allowedProcessIds: [] },
    freshness: { policyRef: "freshness:synthetic-decision-hours", mode: "SCHEDULE_BOUND" },
    useCases: { ...prohibitedUseCases, GENERAL_WORLD: "ALLOWED", OPENING_HOURS_ELIGIBILITY: "ALLOWED" },
    minimumTrustByUseCase: { ...noMinimumTrust, GENERAL_WORLD: "REFERENCED", OPENING_HOURS_ELIGIBILITY: "REFERENCED" },
  } : entry),
});
