/** Local/CI-only rehearsal provisioning. Deliberately absent from the public runtime index. */
import { CONTRACT_VERSIONS as USER_VERSIONS, type RelevantUserProjectionRequest } from "@backyrd/user-intelligence-vnext-core";
import { FOUNDER_COHORT_VERSION, FOUNDER_EVALUATION_SCOPE, REGISTRY_HASH, REGISTRY_VERSION, type FounderWorldCohortManifest, type WorldKnowledgeReaderPort } from "@backyrd/world-knowledge-core";
import { canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { DARK_REQUEST_VERSIONS, DarkRequestAuthoritySchema, DarkRequestOracleCatalogSchema, DarkRequestOracleSchema, DarkRequestParityMetricsSchema, DarkRequestReportSchema, DarkRequestSourceTrustSchema, type DarkRequestAuthority, type DarkRequestOracleCatalog, type DarkRequestReport, type DarkRequestSourceTrust } from "./dark-request-contracts.js";
import { validateDarkRequestAuthority, validateDarkRequestReport } from "./dark-request.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, PHASE3C_FOUNDER_LAB_RELEASE, resolveFounderLabText, runFounderDecisionLab } from "./phase3c-lab.js";
import { PHASE3C_LAB_VERSIONS, FounderLabRequestSchema, type FounderLabRequest } from "./phase3c-lab-contracts.js";
import { readRelevantUserProjection } from "./user-adapter.js";
import type { DecisionDarkUserProjectionPort } from "./dark-request-ports.js";

const LOCAL_CAPABILITY = Symbol("backyrd.dark-request.local-rehearsal");
type LocalCapability = { readonly [LOCAL_CAPABILITY]: true };
const mintLocalCapability = (): LocalCapability => Object.freeze({ [LOCAL_CAPABILITY]: true as const });

const oracleDefinitions = [
  ["dark-request-oracle-a", "quiet-first-date", "LOCATION_EXCLUSION"],
  ["dark-request-oracle-b", "family-age12-with-adult", "CORE_INTENT_GATE"],
  ["dark-request-oracle-c", "wheelchair-confirmed-vs-unknown", "UNKNOWN_FALLBACK"],
  ["dark-request-oracle-d", "target-zurich-device-basel", "LOCATION_EXCLUSION"],
  ["dark-request-oracle-family", "founder-family-outing-afternoon", "CORE_INTENT_GATE"],
  ["dark-request-oracle-bouldering", "founder-bouldering-family", "CORE_INTENT_GATE"],
  ["dark-request-oracle-flip", "context-flip", "CONTEXT_ONLY_CHANGE"],
  ["dark-request-oracle-alternative", "alternative-request", "ALTERNATIVE_NEUTRAL"],
  ["dark-request-oracle-reject", "spot-not-fit", "REJECT_CONTEXTUAL"],
  ["dark-request-oracle-replay", "full-replay", "REPLAY_IDENTICAL"],
  ["dark-request-oracle-unknown", "unknown-hard-constraint", "UNKNOWN_FALLBACK"],
  ["dark-request-oracle-disputed", "disputed-world-fact", "DISPUTED_LIMITATION"],
  ["dark-request-oracle-not-configured", "not-configured-mapping", "NOT_CONFIGURED_LIMITATION"],
  ["dark-request-oracle-closed", "closed-despite-typical-daypart", "AVAILABILITY_EXCLUSION"],
  ["dark-request-oracle-single", "single-spot-cohort", "SINGLE_CANDIDATE_VALID"],
] as const;

const oracles = oracleDefinitions.map(([oracleId, scenarioId, expectedEffect]) => DarkRequestOracleSchema.parse(withContentHash({ oracleId, scenarioId, expectedEffect, rankingExpectation: "NOT_CONFIGURED" as const, productQualityClaim: false as const, productionAuthorized: false as const }, "oracleHash")));
export const LOCAL_DARK_REQUEST_ORACLE_CATALOG: DarkRequestOracleCatalog = deepFreeze(DarkRequestOracleCatalogSchema.parse(withContentHash({ contractVersion: DARK_REQUEST_VERSIONS.oracleCatalog, catalogId: "decision-vnext-dark-request-oracles-week2-1", scenarioIds: oracles.map((item) => item.scenarioId), oracles, closedScenarioSet: true as const, productionAuthorized: false as const }, "catalogHash")));

function manifestFor(input: { readonly cohortId: string; readonly frozenAt: string; readonly snapshots: readonly { readonly spot: { readonly spotId: string }; readonly snapshotHash: string; readonly sourcePolicyVersion: string; readonly sourcePolicyHash: string }[] }): FounderWorldCohortManifest {
  const first = input.snapshots[0]; if (!first || input.snapshots.some((item) => item.sourcePolicyVersion !== first.sourcePolicyVersion || item.sourcePolicyHash !== first.sourcePolicyHash)) throw new Error("dark_request_world_policy_set_mismatch");
  const spots = [...input.snapshots].sort((a, b) => a.spot.spotId.localeCompare(b.spot.spotId)).map((item) => ({ spotId: item.spot.spotId, manifestHash: contentHash({ spotId: item.spot.spotId, snapshotHash: item.snapshotHash }), snapshotHash: item.snapshotHash, contextHandoffHash: contentHash({ spotId: item.spot.spotId, state: "SYNTHETIC_NO_CONTEXT_HANDOFF" }) }));
  const body = { contractVersion: FOUNDER_COHORT_VERSION, scope: FOUNDER_EVALUATION_SCOPE, cohortId: input.cohortId, frozenAt: input.frozenAt, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, policyVersion: first.sourcePolicyVersion, policyHash: first.sourcePolicyHash, spots, exclusions: ["ADMIN_NOTES", "OWNER_TIER", "PAYMENT", "PRIVATE_ACTOR_IDS", "PRIVATE_SOURCE_REFERENCES", "RAW_AI_OUTPUTS", "SUBSCRIPTION"] };
  return { ...body, cohortHash: contentHash(body) };
}

function projectionRequest(request: FounderLabRequest, interpretationHash: string, authority: DarkRequestAuthority): RelevantUserProjectionRequest {
  return { contractVersion: USER_VERSIONS.projectionRequest, requestId: `dark-projection-${request.requestId}`, actor: { kind: "AUTHENTICATED_USER", userId: authority.actor.userId, subjectBindingHash: authority.actor.subjectBindingHash, authenticationContextHash: authority.actor.authenticationContextHash, boundBy: "SERVER" }, decisionId: authority.decisionId, snapshot: null, context: { contextContractVersion: PHASE3C_LAB_VERSIONS.interpretation, contextHash: interpretationHash, placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false }, requestedDomains: [], budgets: { maxItems: 8, maxBytes: 8192 }, projectionPolicyVersion: authority.user.projectionPolicyVersion, killSwitch: false };
}

export function provisionLocalDarkRequestAuthority(input: { readonly request: FounderLabRequest; readonly city: string; readonly manifest: FounderWorldCohortManifest; readonly sourceSha: string; readonly sourceTreeHash: string; readonly serverTime?: string }): { readonly authority: DarkRequestAuthority; readonly sourceTrust: DarkRequestSourceTrust } {
  const serverTime = input.serverTime ?? "2026-09-17T10:00:00.000Z"; const requestHash = contentHash(input.request);
  const authority = deepFreeze(DarkRequestAuthoritySchema.parse(withContentHash({ contractVersion: DARK_REQUEST_VERSIONS.authority, authorityId: `dark-authority-${input.request.requestId}`, executionMode: "LOCAL_SYNTHETIC_REHEARSAL" as const, requestHash, decisionId: `dark-decision-${input.request.requestId}`, sessionId: `dark-session-${input.request.requestId}`, actor: { userId: "syn-user-0001", subjectBindingHash: contentHash("dark-request-subject"), authenticationContextHash: contentHash("dark-request-auth"), boundBy: "SERVER" as const }, serverTime, authorizedLocation: { city: input.city, source: "SYNTHETIC_SERVER_AUTHORITY" as const, bindingHash: contentHash({ city: input.city, source: "SYNTHETIC_SERVER_AUTHORITY" }) }, sourceIdentity: { sourceSha: input.sourceSha, sourceTreeHash: input.sourceTreeHash, artifactIdentityHash: contentHash({ sourceSha: input.sourceSha, sourceTreeHash: input.sourceTreeHash, oracleCatalogHash: LOCAL_DARK_REQUEST_ORACLE_CATALOG.catalogHash }) }, world: { portVersion: "backyrd.world-knowledge.reader-port@1.0", registryVersion: input.manifest.registryVersion, registryHash: input.manifest.registryHash, sourcePolicyVersion: input.manifest.policyVersion, sourcePolicyHash: input.manifest.policyHash, cohortHash: input.manifest.cohortHash }, user: { portVersion: "backyrd.user-intelligence.decision-projection-port@1.0", projectionContractVersion: USER_VERSIONS.projection, projectionPolicyVersion: "phase1-projection-policy-not-configured" }, contextVersion: PHASE3C_LAB_VERSIONS.interpretation, phase3CReleaseHash: PHASE3C_FOUNDER_LAB_RELEASE.releaseHash, phase3CPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, validFrom: "2026-09-17T00:00:00.000Z", validUntil: "2027-09-17T00:00:00.000Z", productionCapable: false as const }, "authorityHash")));
  const sourceTrust = deepFreeze(DarkRequestSourceTrustSchema.parse(withContentHash({ contractVersion: DARK_REQUEST_VERSIONS.sourceTrust, trustId: `dark-source-trust-${input.request.requestId}`, acceptedAuthorityId: authority.authorityId, acceptedAuthorityHash: authority.authorityHash, acceptedSourceSha: authority.sourceIdentity.sourceSha, acceptedSourceTreeHash: authority.sourceIdentity.sourceTreeHash, acceptedArtifactIdentityHash: authority.sourceIdentity.artifactIdentityHash, scope: "SYNTHETIC_FIXTURE_ONLY" as const, productionCapable: false as const }, "trustHash")));
  return { authority, sourceTrust };
}

async function execute(capability: LocalCapability, input: { readonly request: unknown; readonly authority: unknown; readonly sourceTrust: unknown; readonly worldReader: WorldKnowledgeReaderPort; readonly manifest: FounderWorldCohortManifest; readonly userProjectionPort: DecisionDarkUserProjectionPort }): Promise<DarkRequestReport> {
  if (capability[LOCAL_CAPABILITY] !== true) throw new Error("dark_request_local_capability_required");
  const request = FounderLabRequestSchema.parse(input.request); const authority = validateDarkRequestAuthority(input.authority, input.sourceTrust);
  if (contentHash(request) !== authority.requestHash || input.manifest.cohortHash !== authority.world.cohortHash || input.manifest.policyVersion !== authority.world.sourcePolicyVersion || input.manifest.policyHash !== authority.world.sourcePolicyHash) throw new Error("dark_request_execution_binding_mismatch");
  const interpretation = resolveFounderLabText(request); if (interpretation.locationAuthority.state !== "KNOWN" || interpretation.locationAuthority.authorizedCity !== authority.authorizedLocation.city) throw new Error("dark_request_location_authority_mismatch");
  let worldReads = 0; const snapshotHashes: string[] = [];
  const countedReader: WorldKnowledgeReaderPort = { contractVersion: "backyrd.world-knowledge.reader-port@1.0", async readSnapshot(readInput) { worldReads += 1; const snapshot = await input.worldReader.readSnapshot(readInput); if (snapshot.spot.spotId !== readInput.spotId) throw new Error("dark_request_world_spot_binding_mismatch"); snapshotHashes.push(snapshot.snapshotHash); return snapshot; } };
  let userReads = 0; const countedUser: DecisionDarkUserProjectionPort = { contractVersion: "backyrd.user-intelligence.decision-projection-port@1.0", async project(readInput) { userReads += 1; return input.userProjectionPort.project(readInput); } };
  const projection = await readRelevantUserProjection(countedUser, projectionRequest(request, interpretation.interpretationHash, authority));
  const result = await runFounderDecisionLab({ request, worldReader: countedReader, cohortManifest: input.manifest, userProjection: projection });
  if (worldReads !== input.manifest.spots.length || userReads !== 1 || result.userProjectionHash !== projection.projectionHash) throw new Error("dark_request_port_read_binding_mismatch");
  const unknownCandidateCount = result.candidates.filter((item) => item.coreIntentCoverage.state === "UNKNOWN" || item.unknownHardConstraints.length > 0).length;
  const metrics = DarkRequestParityMetricsSchema.parse(withContentHash({ contractVersion: DARK_REQUEST_VERSIONS.metrics, interpretationParity: "IDENTICAL" as const, candidateSetParity: "IDENTICAL" as const, hardConstraintDeviationCount: 0, candidateTierDeviationCount: 0, falseConfirmationCount: 0, falseExclusionCount: 0, unknownCandidateCount, fallbackCandidateCount: result.candidates.filter((item) => item.tier === "UNCONFIRMED_FALLBACK").length, replayParity: "BYTE_IDENTICAL" as const, classification: "TECHNICAL_INTEGRITY_ONLY" as const, productQualityClaim: false as const }, "metricsHash"));
  const body = { contractVersion: DARK_REQUEST_VERSIONS.report, authorityHash: authority.authorityHash, requestHash: authority.requestHash, contextHash: result.interpretation.interpretationHash, sourceCohortHash: input.manifest.cohortHash, worldCohortHash: result.worldCohort.cohortHash, worldSnapshotHashes: [...snapshotHashes].sort(), userProjectionHash: projection.projectionHash, candidateSetHash: contentHash(result.candidates.map((item) => item.candidateId)), evaluationResult: result, metrics, counters: { worldReads, userReads: 1 as const, evaluations: 1 as const, persistenceWrites: 0 as const, networkCalls: 0 as const, productOutputs: 0 as const }, boundaries: { evaluationOnly: true as const, clientResponseProduced: false as const, productRankingAuthorized: false as const, productEligibilityAuthorized: false as const, confidenceAuthorized: false as const, writesWorldState: false as const, writesUserState: false as const, productionDataUsed: false as const } };
  return deepFreeze(validateDarkRequestReport(DarkRequestReportSchema.parse(withContentHash(body, "reportHash")), authority, input.sourceTrust));
}

export async function runLocalDarkRequestRehearsal(input: { readonly request: unknown; readonly authority: unknown; readonly sourceTrust: unknown; readonly worldReader: WorldKnowledgeReaderPort; readonly manifest: FounderWorldCohortManifest; readonly userProjectionPort: DecisionDarkUserProjectionPort }): Promise<DarkRequestReport> { return execute(mintLocalCapability(), input); }

export async function replayLocalDarkRequestRehearsal(input: Parameters<typeof runLocalDarkRequestRehearsal>[0], supplied: unknown): Promise<DarkRequestReport> { const rebuilt = await runLocalDarkRequestRehearsal(input); const parsed = validateDarkRequestReport(supplied, input.authority, input.sourceTrust); if (canonicalJson(parsed) !== canonicalJson(rebuilt)) throw new Error("dark_request_replay_mismatch"); return rebuilt; }

export { manifestFor as createLocalSyntheticDarkRequestManifest };
