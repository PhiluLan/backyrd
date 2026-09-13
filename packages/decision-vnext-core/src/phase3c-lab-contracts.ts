import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const PHASE3C_LAB_VERSIONS = Object.freeze({
  compatibility: "backyrd.decision-vnext.founder-lab-compatibility@3c-1",
  request: "backyrd.decision-vnext.founder-lab-request@3c-1",
  interpretation: "backyrd.decision-vnext.founder-lab-interpretation@3c-1",
  cohort: "backyrd.decision-vnext.founder-lab-cohort@3c-1",
  assessment: "backyrd.decision-vnext.founder-lab-candidate-assessment@3c-1",
  result: "backyrd.decision-vnext.founder-lab-result@3c-1",
  oracle: "backyrd.decision-vnext.founder-lab-oracle@3c-1",
  report: "backyrd.decision-vnext.founder-lab-report@3c-1",
  release: "backyrd.decision-vnext.founder-lab-release@3c-1",
} as const);

const nullableIdentifier = schema.union([identifier, schema.literal(null)] as const);
const nullableInteger = schema.union([schema.number({ integer: true, min: 0, max: 100_000 }), schema.literal(null)] as const);
const knowledgeState = schema.enum(["KNOWN", "UNKNOWN", "NOT_CONFIGURED", "NOT_AVAILABLE", "DENIED"] as const);
const labFlags = {
  evaluationOnly: schema.literal(true), calibrationOnly: schema.literal(true), productionAuthorized: schema.literal(false),
  productRankingAuthorized: schema.literal(false), externalProviderUsed: schema.literal(false), rawTextPersisted: schema.literal(false),
  writesUserIntelligence: schema.literal(false), commercialInfluence: schema.literal("FORBIDDEN"),
} as const;

export const Phase3CLabCompatibilitySchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.compatibility), compatibilityId: identifier,
  productContextWorldRegistryVersion: schema.literal("backyrd.world-knowledge.registry@1.1"), productContextWorldRegistryHash: sha256,
  founderLabWorldRegistryVersion: schema.literal("backyrd.world-knowledge.registry@2.0"), founderLabWorldRegistryHash: sha256,
  mode: schema.literal("EXPLICIT_EVALUATION_ADAPTER_NO_POLICY_UPGRADE"), authoringDraftsAuthorized: schema.literal(false),
  compatibilityHash: sha256,
});
export type Phase3CLabCompatibility = Infer<typeof Phase3CLabCompatibilitySchema>;

export const FounderLabRequestSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.request), requestId: identifier, ephemeralText: schema.string({ min: 1, max: 2_000 }),
  deviceLocation: schema.union([schema.object({ state: schema.literal("AVAILABLE"), city: identifier }), schema.object({ state: schema.enum(["DENIED", "NOT_AVAILABLE"] as const), city: schema.literal(null) })] as const),
  userMode: schema.enum(["NEUTRAL_MISSING", "NO_CONSENT", "COLD", "KILL_SWITCH", "ACTIVE_SYNTHETIC"] as const),
  alternativeRequested: schema.boolean(), rejectedCandidateIds: schema.array(identifier, { max: 50 }),
});
export type FounderLabRequest = Infer<typeof FounderLabRequestSchema>;

const group = schema.object({ size: nullableInteger, minimumAge: nullableInteger, adultPresent: schema.boolean(), companionType: nullableIdentifier });
const budget = schema.object({ state: knowledgeState, amount: nullableInteger, currency: schema.union([schema.literal("CHF"), schema.literal(null)] as const), perPerson: schema.boolean(), calibrationLabel: nullableIdentifier });
const dateTime = schema.object({ state: knowledgeState, localDate: schema.union([schema.string({ pattern: /^\d{4}-\d{2}-\d{2}$/ }), schema.literal(null)] as const), dayPhase: nullableIdentifier, timeZone: schema.union([schema.string({ min: 1, max: 80 }), schema.literal(null)] as const) });

/** Founder-editable values only. Authority and provenance fields are deliberately absent. */
export const FounderLabCorrectionsSchema = schema.object({
  primaryIntent: schema.optional(nullableIdentifier), secondaryIntent: schema.optional(nullableIdentifier), occasion: schema.optional(nullableIdentifier),
  moods: schema.optional(schema.array(identifier, { max: 12 })), targetCity: schema.optional(nullableIdentifier), dateTime: schema.optional(dateTime),
  group: schema.optional(group), budget: schema.optional(budget), stayDuration: schema.optional(schema.union([schema.enum(["SHORT", "MEDIUM", "LONG"] as const), schema.literal(null)] as const)),
  hardConstraints: schema.optional(schema.array(identifier, { max: 30 })), softPreferences: schema.optional(schema.array(identifier, { max: 30 })),
});
export type FounderLabCorrections = Infer<typeof FounderLabCorrectionsSchema>;

export const FounderLabInterpretationSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.interpretation), resolverVersion: identifier, inputHash: sha256,
  primaryIntent: nullableIdentifier, secondaryIntent: nullableIdentifier, intentCompatibility: schema.enum(["COMPATIBLE", "INCOMPATIBLE", "NOT_APPLICABLE", "UNKNOWN"] as const),
  occasion: nullableIdentifier, moods: schema.array(identifier, { max: 12 }), targetCity: nullableIdentifier,
  dateTime,
  group, budget, stayDuration: schema.union([schema.enum(["SHORT", "MEDIUM", "LONG"] as const), schema.literal(null)] as const),
  hardConstraints: schema.array(identifier, { max: 30 }), softPreferences: schema.array(identifier, { max: 30 }), unresolvedTerms: schema.array(schema.string({ min: 1, max: 120 }), { max: 30 }),
  locationAuthority: schema.object({ explicitTargetWins: schema.literal(true), authorizedCity: nullableIdentifier, deviceCityUsed: schema.boolean(), state: knowledgeState }),
  limitations: schema.array(identifier, { max: 30 }), rawTextPersisted: schema.literal(false), interpretationHash: sha256,
});
export type FounderLabInterpretation = Infer<typeof FounderLabInterpretationSchema>;

export const FounderLabCohortSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.cohort), cohortId: identifier, source: schema.enum(["FOUNDER_WORLD_COHORT", "SYNTHETIC_FALLBACK"] as const),
  worldRegistryVersion: schema.string({ min: 1, max: 160 }), worldRegistryHash: sha256, sourcePolicyVersion: schema.string({ min: 1, max: 160 }),
  spotBindings: schema.array(schema.object({ spotId: identifier, snapshotHash: sha256, fixtureProfileHash: sha256 }), { min: 1, max: 40 }),
  limitations: schema.array(identifier, { max: 20 }), mixedSources: schema.literal(false), cohortHash: sha256,
});
export type FounderLabCohort = Infer<typeof FounderLabCohortSchema>;

const reason = schema.object({ reasonCode: identifier, domain: schema.enum(["WORLD", "USER", "CONTEXT", "LIMITATION"] as const), sourceHash: sha256, statementDe: schema.string({ min: 1, max: 500 }), confirmed: schema.boolean() });
export const FounderLabCandidateAssessmentSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.assessment), candidateId: identifier, label: schema.string({ min: 1, max: 160 }),
  tier: schema.enum(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"] as const),
  confirmedHardConstraints: schema.array(identifier, { max: 30 }), unknownHardConstraints: schema.array(identifier, { max: 30 }), failedHardConstraints: schema.array(identifier, { max: 30 }),
  matchedSoftPreferences: schema.array(identifier, { max: 30 }), conflicts: schema.array(identifier, { max: 20 }), reasons: schema.array(reason, { min: 1, max: 60 }), limitations: schema.array(identifier, { max: 30 }),
  userIntelligenceInvolved: schema.boolean(), userIntelligenceAffectsEligibility: schema.literal(false), fixtureOrderKey: schema.string({ min: 1, max: 200 }), assessmentHash: sha256,
});
export type FounderLabCandidateAssessment = Infer<typeof FounderLabCandidateAssessmentSchema>;

export const FounderLabResultSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.result), resultId: identifier, createdAt: timestamp,
  requestHash: sha256, interpretation: FounderLabInterpretationSchema, compatibilityHash: sha256, phase3BReleaseHash: sha256,
  worldCohort: FounderLabCohortSchema, userProjectionHash: sha256, userProjectionState: schema.enum(["ACTIVE", "NEUTRAL"] as const), userNeutralReason: nullableIdentifier,
  candidates: schema.array(FounderLabCandidateAssessmentSchema, { max: 40 }), explanation: schema.array(reason, { max: 100 }),
  alternative: schema.object({ requested: schema.boolean(), negativeSignalProduced: schema.literal(false) }), reject: schema.object({ candidateIds: schema.array(identifier, { max: 50 }), userEventProduced: schema.literal(false), scope: schema.literal("USER_X_SPOT_X_DECISION_X_CONTEXT") }),
  limitations: schema.array(identifier, { max: 50 }), degradation: schema.enum(["NONE", "SYNTHETIC_WORLD_FALLBACK", "WORLD_COHORT_REQUIRED", "USER_NEUTRAL", "NOT_CONFIGURED"] as const),
  ...labFlags, resultHash: sha256,
});
export type FounderLabResult = Infer<typeof FounderLabResultSchema>;

export const FounderLabOracleSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.oracle), oracleId: identifier, scenarioId: identifier, request: FounderLabRequestSchema,
  expected: schema.object({ requiredReasonCodes: schema.array(identifier, { max: 20 }), requiredTiers: schema.array(schema.enum(["ELIGIBLE_CONFIRMED", "UNCONFIRMED_FALLBACK", "NOT_CONFIGURED", "INELIGIBLE"] as const), { max: 4 }), degradation: schema.enum(["NONE", "SYNTHETIC_WORLD_FALLBACK", "WORLD_COHORT_REQUIRED", "USER_NEUTRAL", "NOT_CONFIGURED"] as const) }),
  worldEvidenceRequired: schema.boolean(), userProjectionExpected: schema.enum(["ACTIVE", "NEUTRAL"] as const), contextExpectation: identifier,
  productionAuthorized: schema.literal(false), productQualityClaim: schema.literal(false), oracleHash: sha256,
});
export type FounderLabOracle = Infer<typeof FounderLabOracleSchema>;

export const FounderLabReportSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.report), releaseHash: sha256, scenarioIds: schema.array(identifier, { min: 28, max: 28 }),
  resultHashes: schema.array(sha256, { min: 28, max: 28 }), oracleHashes: schema.array(sha256, { min: 28, max: 28 }),
  passed: schema.number({ integer: true, min: 28, max: 28 }), failed: schema.literal(0), ...labFlags, reportHash: sha256,
});
export type FounderLabReport = Infer<typeof FounderLabReportSchema>;

export const FounderLabReleaseSchema = schema.object({
  contractVersion: version(PHASE3C_LAB_VERSIONS.release), releaseId: identifier, canonicalBaseSha: schema.string({ pattern: /^[a-f0-9]{40}$/ }),
  phase3BReleaseHash: sha256, compatibilityHash: sha256, worldFounderEvidenceHash: sha256, userFounderRecordHash: sha256,
  userProductPolicyHash: sha256, userSignalRegistryHash: sha256, scenarioSetHash: sha256,
  trustRoot: schema.literal("INHERITED_PHASE3B_SIGNED_RELEASE_PLUS_REPOSITORY_SOURCE_IDENTITY"), ...labFlags, releaseHash: sha256,
});
export type FounderLabRelease = Infer<typeof FounderLabReleaseSchema>;
