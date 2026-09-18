import { FounderLabCorrectionsSchema } from "./phase3c-lab-contracts.js";
import { identifier, schema, sha256, timestamp, version, type Infer } from "./schema.js";

export const FOUNDER_LIVE_API_VERSIONS = Object.freeze({
  request: "backyrd.decision-vnext.founder-live-request@1.0",
  response: "backyrd.decision-vnext.founder-live-response@1.1",
  expert: "backyrd.decision-vnext.founder-live-expert@1.1",
  envelope: "backyrd.decision-vnext.founder-live-envelope@1.1",
  release: "backyrd.decision-vnext.founder-live-release@1.1",
  dualRunReport: "backyrd.decision-vnext.founder-live-dual-run-report@1.0",
  postDeployEvidence: "backyrd.decision-vnext.founder-live-post-deploy-evidence@1.0",
} as const);

const nullableText = schema.union([schema.string({ min: 1, max: 240 }), schema.literal(null)] as const);
const contractRef = schema.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$/ });

/** Strict client surface. Server authority, policies, identities and rollout controls are absent. */
export const FounderLiveRequestSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.request),
  requestId: identifier,
  idempotencyKey: identifier,
  naturalLanguage: schema.string({ min: 1, max: 2_000 }),
  explicit: FounderLabCorrectionsSchema,
  alternativeRequested: schema.boolean(),
  rejectedCandidateIds: schema.array(identifier, { max: 50 }),
});
export type FounderLiveRequest = Infer<typeof FounderLiveRequestSchema>;

export const FounderLiveExecutionEnvelopeSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.envelope),
  envelopeId: identifier,
  decisionId: identifier,
  requestHash: sha256,
  idempotencyIdentityHash: sha256,
  actor: schema.object({ subjectBindingHash: sha256, authenticationContextHash: sha256, allowlistAuthorityVersion: contractRef, allowlistDecisionHash: sha256, boundBy: schema.literal("SERVER") }),
  authority: schema.object({ serverTime: timestamp, authorizedCity: identifier, locationBindingHash: sha256, purpose: schema.literal("FOUNDER_DECISION_EVALUATION"), environment: schema.enum(["LOCAL_TEST", "PROD_LIKE_TEST"] as const) }),
  bindings: schema.object({ worldManifestHash: sha256, worldCohortHash: sha256, userProjectionContractVersion: contractRef, evaluatorContractVersion: contractRef, contextPolicyHash: sha256, releaseHash: sha256 }),
  boundaries: schema.object({ evaluationOnly: schema.literal(true), productionAuthorized: schema.literal(false), executionAuthorized: schema.literal(false), durablePersistenceAuthorized: schema.literal(false), externalProviderNetworkAuthorized: schema.literal(false), productOutputAuthorized: schema.literal(false), eligibilityAuthority: schema.literal(false), confidenceAuthority: schema.literal(false), learningAuthorized: schema.literal(false), rankingAuthorized: schema.literal(false), mutationAuthorized: schema.literal(false) }),
  envelopeHash: sha256,
});
export type FounderLiveExecutionEnvelope = Infer<typeof FounderLiveExecutionEnvelopeSchema>;

const normalCandidate = schema.object({ name: schema.string({ min: 1, max: 160 }), group: schema.enum(["BESTAETIGT_PASSEND", "KOENNTE_PASSEN_ANGABE_FEHLT", "REGEL_NOCH_NICHT_FREIGEGEBEN", "PASST_NICHT", "FUER_DIESE_ANFRAGE_ABGEWAEHLT"] as const), reasons: schema.array(schema.string({ min: 1, max: 500 }), { min: 1, max: 60 }) });
export const FounderLiveResponseSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.response),
  status: schema.literal("EVALUATION_ONLY"),
  understood: schema.object({ primaryIntent: nullableText, secondaryIntent: nullableText, occasion: nullableText, targetCity: nullableText, hardConditions: schema.array(schema.string({ min: 1, max: 240 }), { max: 30 }), softPreferences: schema.array(schema.string({ min: 1, max: 240 }), { max: 30 }) }),
  candidates: schema.array(normalCandidate, { max: 40 }),
  limitations: schema.array(schema.string({ min: 1, max: 500 }), { max: 50 }),
  alternative: schema.object({ requested: schema.boolean(), negativeSignalProduced: schema.literal(false) }),
  reject: schema.object({ contextualOnly: schema.literal(true), userLearningProduced: schema.literal(false) }),
  rankingState: schema.literal("NOT_CONFIGURED"),
});
export type FounderLiveResponse = Infer<typeof FounderLiveResponseSchema>;

export const FounderLiveExpertResponseSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.expert),
  normal: FounderLiveResponseSchema,
  envelope: FounderLiveExecutionEnvelopeSchema,
  provenance: schema.object({ worldSnapshotHashes: schema.array(sha256, { min: 1, max: 40 }), worldCohortHash: sha256, userProjectionHash: sha256, contextHash: sha256, evaluationResultHash: sha256, policyHash: sha256, releaseHash: sha256 }),
  candidateProofs: schema.array(schema.object({ candidateId: identifier, assessmentHash: sha256, tier: identifier, coreIntentState: identifier, reasonSourceHashes: schema.array(sha256, { min: 1, max: 60 }) }), { max: 40 }),
  expertHash: sha256,
});
export type FounderLiveExpertResponse = Infer<typeof FounderLiveExpertResponseSchema>;

export const FounderLiveDualRunReportSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.dualRunReport),
  requestHash: sha256,
  primary: schema.object({ evaluatorId: identifier, evaluatorContractVersion: contractRef, expertHash: sha256 }),
  comparator: schema.object({ evaluatorId: identifier, evaluatorContractVersion: contractRef, expertHash: sha256 }),
  semanticResponseEquivalent: schema.boolean(),
  classification: schema.literal("LOCAL_OR_PROD_LIKE_TECHNICAL_COMPARISON_ONLY"),
  productOutputProduced: schema.literal(false), durableWriteProduced: schema.literal(false), learningProduced: schema.literal(false),
  productQualityClaim: schema.literal(false), rankingClaim: schema.literal(false), reportHash: sha256,
});
export type FounderLiveDualRunReport = Infer<typeof FounderLiveDualRunReportSchema>;

export const FounderLiveReleaseSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.release), releaseId: identifier,
  sourceBaseSha: schema.string({ pattern: /^[a-f0-9]{40}$/ }), apiRequestVersion: contractRef, apiResponseVersion: contractRef,
  authPortVersion: contractRef, allowlistPortVersion: contractRef, worldPortVersion: contractRef, userProjectionPortVersion: contractRef, evaluatorPortVersion: contractRef, contextPolicyHash: sha256,
  hostingBoundary: schema.literal("EXISTING_SERVER_EDGE_ADAPTER_REQUIRED"), productRanking: schema.literal("NOT_CONFIGURED"),
  shadowTraffic: schema.literal(false), samplingRate: schema.literal(0), productionAuthorized: schema.literal(false), deploymentAuthorized: schema.literal(false),
  releaseHash: sha256,
});
export type FounderLiveRelease = Infer<typeof FounderLiveReleaseSchema>;

export const FounderLivePostDeployEvidenceSchema = schema.object({
  contractVersion: version(FOUNDER_LIVE_API_VERSIONS.postDeployEvidence), releaseHash: sha256,
  status: schema.literal("NOT_EXECUTED_NO_PRODUCTION_AUTHORITY"), productionPlanHash: sha256,
  executionAuthorized: schema.literal(false), deploymentExecuted: schema.literal(false), migrationExecuted: schema.literal(false),
  functionChanged: schema.literal(false), authChanged: schema.literal(false), shadowTrafficActivated: schema.literal(false), evidenceHash: sha256,
});
export type FounderLivePostDeployEvidence = Infer<typeof FounderLivePostDeployEvidenceSchema>;
