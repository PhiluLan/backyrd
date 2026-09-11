import {
  CONTRACT_VERSIONS as USER_CONTRACT_VERSIONS,
  NEUTRAL_SUBJECT_BINDING_HASH,
  parseRelevantUserProjection,
  type DecisionVNextUserProjectionPort,
  type RelevantUserProjection,
} from "@backyrd/user-intelligence-vnext-core";
import {
  REGISTRY_HASH, REGISTRY_VERSION, RULE_REGISTRY_HASH, RULE_REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION,
  type SourcePolicy, type WorldKnowledgeReaderPort,
} from "@backyrd/world-knowledge-core";
import { CandidatePoolSnapshotSchema, CONTRACT_VERSIONS, DecisionRequestSchema, type CandidatePoolSnapshot, type DecisionRequest } from "./contracts.js";
import { assertContentHash, canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { validateCandidatePool } from "./candidate-pool.js";
import { resolveSituationalContext, validateSituationalContext } from "./context.js";
import { degradationEntry } from "./degradation.js";
import { applyPhase1Eligibility, validateEligibilityResult } from "./eligibility.js";
import { createEvaluationEngineManifests, executeEvaluationEngine, PHASE2_ENGINE_REGISTRY_VERSION, validateEvaluationEngineManifest } from "./engine-registry.js";
import { PHASE2_CANDIDATE_SOURCE_ID, validateEvaluationAuthority, validateSyntheticWorldAuthority } from "./evaluation-authority.js";
import { PHASE1_VERSIONS } from "./manifest.js";
import {
  CanonicalIntegrationExecutionEnvelopeSchema, EvaluationEngineManifestSchema, EvaluationReportSchema,
  PHASE2_CONTRACT_VERSIONS, PHASE2_ENGINE_IDS,
  type CanonicalIntegrationExecutionEnvelope, type DegradationEntry, type EvaluationAuthorityRecord, type EvaluationAuthorityTrustAnchor, type EvaluationReport,
} from "./phase2-contracts.js";
import { SyntheticUserProjectionReader, type SyntheticWorld } from "./sandbox.js";
import { SYNTHETIC_WORLD_SOURCE_POLICY } from "./synthetic-world-policy.js";
import { projectionRequest, readRelevantUserProjection } from "./user-adapter.js";
import { adaptWorldKnowledgeSnapshot, readCanonicalWorld } from "./world-adapter.js";

export class Phase2HarnessError extends Error {
  constructor(readonly code: string, readonly action: "REJECT_REQUEST" | "FAIL_CLOSED") {
    super(code);
    this.name = "Phase2HarnessError";
  }
}

export interface Phase2ServerAuthority {
  readonly decisionId: string;
  readonly serverRequestId: string;
  readonly sessionId: string;
  readonly serverTime: string;
  readonly idempotencyIdentity: string;
  readonly authorizedLocationScope: { readonly kind: "city"; readonly city: string };
  readonly actor: { readonly kind: "AUTHENTICATED_USER"; readonly userId: string; readonly subjectBindingHash: string; readonly authenticationContextHash: string }
    | { readonly kind: "ANONYMOUS"; readonly subjectBindingHash: string };
  readonly userSnapshot?: { readonly snapshotId: string; readonly snapshotHash: string } | null;
  readonly userKillSwitch?: boolean;
}

export interface Phase2EvaluationInput {
  readonly evaluationAuthority: EvaluationAuthorityRecord;
  readonly request: unknown;
  readonly authority: Phase2ServerAuthority;
  readonly world: SyntheticWorld;
  readonly worldReader: WorldKnowledgeReaderPort;
  readonly acceptedWorldSourcePolicy: Pick<SourcePolicy, "policyVersion" | "policyHash">;
  readonly userProjectionPort?: DecisionVNextUserProjectionPort;
}

function fail(code: string, action: "REJECT_REQUEST" | "FAIL_CLOSED" = "FAIL_CLOSED"): never {
  throw new Phase2HarnessError(code, action);
}

function assertSyntheticPolicy(policy: Pick<SourcePolicy, "policyVersion" | "policyHash"> | undefined): asserts policy is Pick<SourcePolicy, "policyVersion" | "policyHash"> {
  if (!policy || policy.policyVersion !== SYNTHETIC_WORLD_SOURCE_POLICY.policyVersion || policy.policyHash !== SYNTHETIC_WORLD_SOURCE_POLICY.policyHash) fail("SOURCE_POLICY_NOT_ACCEPTED");
}

async function neutralPool(input: Phase2EvaluationInput, request: DecisionRequest, context: ReturnType<typeof resolveSituationalContext>): Promise<{ readonly pool: CandidatePoolSnapshot; readonly snapshotBindings: readonly { readonly spotId: string; readonly snapshotHash: string; readonly sourcePolicyVersion: string; readonly sourcePolicyHash: string }[] }> {
  const spots = [...input.world.spots].sort((a, b) => a.id.localeCompare(b.id)).slice(0, input.evaluationAuthority.candidatePoolOrigin.limit);
  const candidates = [];
  const snapshotBindings = [];
  for (let index = 0; index < spots.length; index += 1) {
    const spot = spots[index]!;
    let snapshot;
    try { snapshot = await readCanonicalWorld(input.worldReader, spot.id, [input.acceptedWorldSourcePolicy]); }
    catch (error) { fail(error instanceof Error && /registry/.test(error.message) ? "WORLD_REGISTRY_UNKNOWN" : "WORLD_SNAPSHOT_MISSING"); }
    if (snapshot.sourcePolicyVersion !== input.acceptedWorldSourcePolicy.policyVersion || snapshot.sourcePolicyHash !== input.acceptedWorldSourcePolicy.policyHash) fail("SOURCE_POLICY_NOT_ACCEPTED");
    const candidate = adaptWorldKnowledgeSnapshot(snapshot, spot.retrieval, input.authority.serverTime);
    candidates.push({ candidate, retrievalSource: { kind: "versioned_adapter" as const, sourceId: PHASE2_CANDIDATE_SOURCE_ID, personalized: false as const }, retrievalPosition: index + 1 });
    snapshotBindings.push({ spotId: spot.id, snapshotHash: snapshot.snapshotHash, sourcePolicyVersion: snapshot.sourcePolicyVersion, sourcePolicyHash: snapshot.sourcePolicyHash });
  }
  const pool = CandidatePoolSnapshotSchema.parse(withContentHash({ contractVersion: CONTRACT_VERSIONS.candidatePool, serverRequestId: input.authority.serverRequestId, worldVersion: input.world.version, candidateGeneratorVersion: PHASE1_VERSIONS.candidateGenerator, candidates }, "candidatePoolHash"));
  validateCandidatePool(pool);
  if (request.location.kind !== "city" || context.explicit.location.city !== request.location.city) fail("LOCATION_AUTHORITY_MISMATCH", "REJECT_REQUEST");
  return { pool: deepFreeze(pool) as CandidatePoolSnapshot, snapshotBindings: deepFreeze(snapshotBindings) };
}

async function userProjection(input: Phase2EvaluationInput, context: ReturnType<typeof resolveSituationalContext>): Promise<{ readonly projection: RelevantUserProjection; readonly missingPort: boolean }> {
  const actor = input.authority.actor;
  const userId = actor.kind === "AUTHENTICATED_USER" ? actor.userId : "synthetic-anonymous-user";
  const subjectBindingHash = actor.subjectBindingHash;
  const request = projectionRequest({
    requestId: input.authority.serverRequestId, decisionId: input.authority.decisionId, userId, subjectBindingHash,
    authenticationContextHash: actor.kind === "AUTHENTICATED_USER" ? actor.authenticationContextHash : contentHash("synthetic-anonymous-auth-context"),
    context, killSwitch: input.authority.userKillSwitch ?? false, snapshot: input.authority.userSnapshot ?? null,
  });
  const port = input.userProjectionPort ?? new SyntheticUserProjectionReader("MISSING_SNAPSHOT");
  return { projection: await readRelevantUserProjection(port, request), missingPort: input.userProjectionPort === undefined };
}

function userBinding(projection: RelevantUserProjection, authority: Phase2ServerAuthority) {
  return { projectionContractVersion: projection.contractVersion, projectionId: projection.projectionId, projectionHash: projection.projectionHash, manifestId: projection.manifest.manifestId, manifestHash: projection.manifest.manifestHash, subjectBindingHash: projection.subjectBindingHash, actorKind: authority.actor.kind, authenticationContextHash: authority.actor.kind === "AUTHENTICATED_USER" ? authority.actor.authenticationContextHash : null, status: projection.status, neutralReason: projection.neutralReason, killSwitchRequested: authority.userKillSwitch ?? false } as const;
}

function expectedProjectionSubject(projection: RelevantUserProjection, authority: Phase2ServerAuthority): string {
  return projection.status === "NEUTRAL" ? NEUTRAL_SUBJECT_BINDING_HASH : authority.actor.subjectBindingHash;
}

function degradationFor(projection: RelevantUserProjection, missingPort: boolean, pool: CandidatePoolSnapshot): readonly DegradationEntry[] {
  const entries: DegradationEntry[] = [degradationEntry("POLICY_NOT_CONFIGURED", "scenario-oracles-not-configured")];
  if (missingPort) entries.push(degradationEntry("USER_PROJECTION_MISSING", "canonical-user-projection-port-not-supplied"));
  if (projection.neutralReason === "NO_CONSENT") entries.push(degradationEntry("NO_CONSENT", "personalization-consent-not-granted"));
  if (projection.neutralReason === "COLD_START") entries.push(degradationEntry("COLD_USER", "user-projection-insufficient"));
  if (projection.neutralReason === "KILL_SWITCH") entries.push(degradationEntry("USER_KILL_SWITCH", "personalization-kill-switch-active"));
  if (pool.candidates.length === 0) entries.push(degradationEntry("CANDIDATE_POOL_EMPTY", "neutral-retrieval-returned-no-candidates"));
  for (const entry of pool.candidates) {
    if (entry.candidate.openStatus === "unknown") entries.push(degradationEntry("OPENING_HOURS_UNKNOWN", "opening-hours-unknown", entry.candidate.spotId));
    if (entry.candidate.openStatus === "not_authorized") entries.push(degradationEntry("OPENING_HOURS_NOT_AUTHORIZED", "opening-hours-not-authorized", entry.candidate.spotId));
    if (entry.candidate.openStatus === "disputed") entries.push(degradationEntry("WORLD_CONFLICT", "blocking-world-conflict", entry.candidate.spotId));
  }
  return entries.sort((a, b) => `${a.code}:${a.subjectRef ?? ""}`.localeCompare(`${b.code}:${b.subjectRef ?? ""}`));
}

const productMetricIds = ["TOP_1_RELEVANCE", "TOP_3_RELEVANCE", "BAD_RECOMMENDATION_RATE", "CONTEXT_SENSITIVITY", "PERSONALIZATION_LIFT", "DIVERSITY_EXPLORATION", "CONFIDENCE_CALIBRATION", "EXPLANATION_CONSISTENCY", "RANKING_STABILITY", "DATA_QUALITY_SENSITIVITY"] as const;

function buildReport(envelope: CanonicalIntegrationExecutionEnvelope): EvaluationReport {
  const eligibility = applyPhase1Eligibility(envelope.candidatePool, envelope.context);
  const eligibilityResults = [...eligibility.eligible.map((entry) => entry.eligibility), ...eligibility.rejected].sort((a, b) => a.spotId.localeCompare(b.spotId));
  const rejected = eligibility.rejected.map((result) => ({ candidateId: result.spotId, reasonCodes: result.checks.filter((check) => check.outcome !== "pass").flatMap((check) => check.reasonCodes).sort() })).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const projection = parseRelevantUserProjection(envelope.userProjectionValue);
  const degradation = degradationFor(projection, projection.neutralReason === "MISSING_SNAPSHOT", envelope.candidatePool);
  const engineResults = envelope.engineManifests.map((manifest) => executeEvaluationEngine({ manifest, candidates: eligibility.eligible, context: envelope.context, projection, candidatePoolHash: envelope.candidatePool.candidatePoolHash, degradation }));
  const metrics = [
    ...productMetricIds.map((metricId) => ({ metricId, state: "NOT_CONFIGURED" as const, value: null, oracleVersion: null, definitionVersion: null, productQualityClaim: false as const })),
    { metricId: "HARD_CONSTRAINT_VIOLATION_RATE" as const, state: "TECHNICAL_DETERMINISTIC" as const, value: 0, oracleVersion: null, definitionVersion: "phase2-eligible-output-membership-v1", productQualityClaim: false as const },
    { metricId: "EXPLANATION_REFERENCE_INTEGRITY_RATE" as const, state: "TECHNICAL_DETERMINISTIC" as const, value: 1, oracleVersion: null, definitionVersion: "phase2-explanation-evidence-reference-v1", productQualityClaim: false as const },
  ];
  const body = { contractVersion: PHASE2_CONTRACT_VERSIONS.report, evaluationAuthorityHash: envelope.evaluationAuthority.authorityHash, scenarioId: envelope.evaluationAuthority.scenario.scenarioId, seed: envelope.evaluationAuthority.scenario.seed, sandboxConfigHash: envelope.evaluationAuthority.scenario.sandboxConfigHash, sandboxWorldHash: envelope.evaluationAuthority.scenario.worldHash, requestHash: envelope.requestHash, contextHash: envelope.context.contextHash, worldSnapshotHashes: envelope.world.snapshots.map((item) => item.snapshotHash).sort(), userProjectionHash: envelope.userProjection.projectionHash, candidatePoolHash: envelope.candidatePool.candidatePoolHash, candidateCountBeforeEligibility: envelope.candidatePool.candidates.length, candidateCountAfterEligibility: eligibility.eligible.length, eligibilityResults, eligibilityExclusions: rejected, engineResults, metrics, runtime: { classification: "NON_SEMANTIC_DIAGNOSTIC" as const, measuredMilliseconds: null } };
  const semantic = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "runtime"));
  return deepFreeze(EvaluationReportSchema.parse({ ...body, reportHash: contentHash(semantic) })) as EvaluationReport;
}

export async function runPhase2Evaluation(input: Phase2EvaluationInput, trustAnchor: EvaluationAuthorityTrustAnchor): Promise<{ readonly envelope: CanonicalIntegrationExecutionEnvelope; readonly report: EvaluationReport }> {
  const evaluationAuthority = validateEvaluationAuthority(input.evaluationAuthority, trustAnchor);
  validateSyntheticWorldAuthority(input.world, evaluationAuthority);
  assertSyntheticPolicy(input.acceptedWorldSourcePolicy);
  if (input.acceptedWorldSourcePolicy.policyVersion !== evaluationAuthority.worldIdentity.sourcePolicyVersion || input.acceptedWorldSourcePolicy.policyHash !== evaluationAuthority.worldIdentity.sourcePolicyHash) fail("SOURCE_POLICY_NOT_ACCEPTED");
  const request = DecisionRequestSchema.parse(input.request);
  if (!input.authority.authorizedLocationScope) fail("LOCATION_AUTHORITY_MISSING", "REJECT_REQUEST");
  let context;
  try { context = resolveSituationalContext(request, { decisionId: input.authority.decisionId, sessionId: input.authority.sessionId, executedAt: input.authority.serverTime, actorSubjectBindingHash: input.authority.actor.subjectBindingHash, authorizedLocationScope: input.authority.authorizedLocationScope }); }
  catch (error) { fail(error instanceof Error && /required/.test(error.message) ? "LOCATION_AUTHORITY_MISSING" : "LOCATION_AUTHORITY_MISMATCH", "REJECT_REQUEST"); }
  const { pool, snapshotBindings } = await neutralPool(input, request, context);
  const user = await userProjection(input, context);
  if (user.projection.subjectBindingHash !== expectedProjectionSubject(user.projection, input.authority)) fail("USER_PROJECTION_SUBJECT_BINDING_MISMATCH");
  const manifests = createEvaluationEngineManifests({ sourceSha: evaluationAuthority.sourceIdentity.sourceSha, sourceTreeHash: evaluationAuthority.sourceIdentity.sourceTreeHash, artifactIdentityHash: evaluationAuthority.sourceIdentity.artifactIdentityHash, evaluationAuthorityHash: evaluationAuthority.authorityHash, worldPortVersion: WORLD_KNOWLEDGE_PORT_VERSION, worldRegistryVersion: REGISTRY_VERSION, worldRegistryHash: REGISTRY_HASH, worldRuleRegistryVersion: RULE_REGISTRY_VERSION, worldRuleRegistryHash: RULE_REGISTRY_HASH, worldSourcePolicyVersion: input.acceptedWorldSourcePolicy.policyVersion, worldSourcePolicyHash: input.acceptedWorldSourcePolicy.policyHash, userProjectionVersion: USER_CONTRACT_VERSIONS.projection, contextVersion: CONTRACT_VERSIONS.contextSnapshot });
  const body = {
    contractVersion: PHASE2_CONTRACT_VERSIONS.executionEnvelope, evaluationAuthority, decisionId: input.authority.decisionId, serverRequestId: input.authority.serverRequestId, sessionId: input.authority.sessionId, idempotencyIdentity: input.authority.idempotencyIdentity,
    actor: input.authority.actor, request, requestHash: contentHash(request), serverTime: input.authority.serverTime, authorizedLocationScope: input.authority.authorizedLocationScope, context,
    world: { portVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH, ruleRegistryVersion: RULE_REGISTRY_VERSION, ruleRegistryHash: RULE_REGISTRY_HASH, sourcePolicyVersion: input.acceptedWorldSourcePolicy.policyVersion, sourcePolicyHash: input.acceptedWorldSourcePolicy.policyHash, sourcePolicyAcceptedByServer: true as const, snapshots: snapshotBindings, snapshotSetHash: contentHash(snapshotBindings.map((item) => item.snapshotHash)) },
    userProjection: userBinding(user.projection, input.authority), userProjectionValue: user.projection, candidatePool: pool, engineManifests: manifests,
    eligibilityPolicyVersion: PHASE1_VERSIONS.eligibility, unknownPolicyVersion: PHASE1_VERSIONS.unknownPolicy, rankingRegistryVersion: PHASE2_ENGINE_REGISTRY_VERSION,
    confidenceContractVersion: "backyrd-vnext-phase2-confidence-uncalibrated-v1", evidenceContractVersion: "backyrd-vnext-phase2-evidence-v1", explanationContractVersion: "backyrd-vnext-phase2-template-explanation-v1", degradationPolicyVersion: PHASE2_CONTRACT_VERSIONS.degradation,
    commercialInfluence: "FORBIDDEN" as const, writesWorldState: false as const, writesUserState: false as const,
  };
  const envelope = deepFreeze(CanonicalIntegrationExecutionEnvelopeSchema.parse({ ...body, envelopeHash: contentHash(body) })) as CanonicalIntegrationExecutionEnvelope;
  validatePhase2ExecutionEnvelope(envelope, trustAnchor);
  const report = buildReport(envelope);
  validatePhase2EvaluationIntegrity(envelope, report, trustAnchor);
  return { envelope, report };
}

export function validatePhase2ExecutionEnvelope(envelopeValue: unknown, trustAnchor: EvaluationAuthorityTrustAnchor): CanonicalIntegrationExecutionEnvelope {
  const envelope = CanonicalIntegrationExecutionEnvelopeSchema.parse(envelopeValue);
  const evaluationAuthority = validateEvaluationAuthority(envelope.evaluationAuthority, trustAnchor);
  assertContentHash(envelope as unknown as Record<string, unknown>, "envelopeHash"); validateSituationalContext(envelope.context); validateCandidatePool(envelope.candidatePool);
  if (contentHash(envelope.request) !== envelope.requestHash) fail("REQUEST_HASH_MISMATCH");
  if (envelope.request.location.kind !== "city" || envelope.request.location.city !== envelope.authorizedLocationScope.city || envelope.context.serverBound.authorizedLocationScope.city !== envelope.authorizedLocationScope.city) fail("LOCATION_AUTHORITY_MISMATCH", "REJECT_REQUEST");
  assertSyntheticPolicy({ policyVersion: envelope.world.sourcePolicyVersion, policyHash: envelope.world.sourcePolicyHash });
  if (envelope.world.registryVersion !== REGISTRY_VERSION || envelope.world.registryHash !== REGISTRY_HASH || envelope.world.ruleRegistryVersion !== RULE_REGISTRY_VERSION || envelope.world.ruleRegistryHash !== RULE_REGISTRY_HASH || envelope.world.portVersion !== WORLD_KNOWLEDGE_PORT_VERSION) fail("WORLD_REGISTRY_UNKNOWN");
  if (new Set(envelope.world.snapshots.map((item) => item.spotId)).size !== envelope.world.snapshots.length || contentHash(envelope.world.snapshots.map((item) => item.snapshotHash)) !== envelope.world.snapshotSetHash) fail("WORLD_SNAPSHOT_BINDING_MISMATCH");
  if (envelope.candidatePool.candidates.length !== envelope.world.snapshots.length) fail("WORLD_SNAPSHOT_BINDING_MISMATCH");
  if (envelope.candidatePool.worldVersion !== evaluationAuthority.scenario.worldVersion || envelope.candidatePool.candidateGeneratorVersion !== evaluationAuthority.candidatePoolOrigin.generatorVersion || envelope.candidatePool.candidates.length !== evaluationAuthority.candidatePoolOrigin.limit || envelope.candidatePool.candidates.some((entry) => entry.retrievalSource.sourceId !== evaluationAuthority.candidatePoolOrigin.sourceId)) fail("CANDIDATE_POOL_AUTHORITY_MISMATCH");
  envelope.candidatePool.candidates.forEach((entry, index) => { const binding = envelope.world.snapshots[index]; if (!binding || binding.spotId !== entry.candidate.spotId || binding.snapshotHash !== entry.candidate.worldReference.snapshotHash || binding.sourcePolicyVersion !== envelope.world.sourcePolicyVersion || binding.sourcePolicyHash !== envelope.world.sourcePolicyHash) fail("WORLD_SNAPSHOT_BINDING_MISMATCH"); });
  const projectionRequestForValidation = projectionRequest({
    requestId: envelope.serverRequestId,
    decisionId: envelope.decisionId,
    userId: envelope.actor.kind === "AUTHENTICATED_USER" ? envelope.actor.userId : "synthetic-anonymous-user",
    subjectBindingHash: envelope.actor.subjectBindingHash,
    authenticationContextHash: envelope.actor.kind === "AUTHENTICATED_USER" ? envelope.actor.authenticationContextHash : contentHash("synthetic-anonymous-auth-context"),
    context: envelope.context,
    killSwitch: envelope.userProjection.killSwitchRequested,
    snapshot: envelope.userProjectionValue.snapshot,
  });
  const projection = parseRelevantUserProjection(envelope.userProjectionValue, projectionRequestForValidation);
  const envelopeAuthority = { decisionId: envelope.decisionId, serverRequestId: envelope.serverRequestId, sessionId: envelope.sessionId, serverTime: envelope.serverTime, idempotencyIdentity: envelope.idempotencyIdentity, authorizedLocationScope: envelope.authorizedLocationScope, actor: envelope.actor, userKillSwitch: envelope.userProjection.killSwitchRequested };
  const expectedUserBinding = userBinding(projection, envelopeAuthority);
  if (canonicalJson(expectedUserBinding) !== canonicalJson(envelope.userProjection) || projection.subjectBindingHash !== expectedProjectionSubject(projection, envelopeAuthority) || (envelope.actor.kind === "AUTHENTICATED_USER" && envelope.userProjection.authenticationContextHash !== envelope.actor.authenticationContextHash) || (envelope.actor.kind === "ANONYMOUS" && envelope.userProjection.authenticationContextHash !== null)) fail("USER_PROJECTION_BINDING_MISMATCH");
  if (envelope.userProjection.killSwitchRequested !== (projection.neutralReason === "KILL_SWITCH")) fail("USER_PROJECTION_KILL_SWITCH_BINDING_MISMATCH");
  if (envelope.engineManifests.length !== PHASE2_ENGINE_IDS.length || new Set(envelope.engineManifests.map((item) => item.engineId)).size !== PHASE2_ENGINE_IDS.length) fail("ENGINE_REGISTRY_INCOMPLETE");
  envelope.engineManifests.forEach((manifest, index) => { EvaluationEngineManifestSchema.parse(manifest); try { validateEvaluationEngineManifest(manifest); } catch { fail("ENGINE_MANIFEST_BINDING_MISMATCH"); } if (manifest.engineId !== PHASE2_ENGINE_IDS[index] || manifest.worldSourcePolicyHash !== envelope.world.sourcePolicyHash || manifest.sourceSha !== evaluationAuthority.sourceIdentity.sourceSha || manifest.sourceTreeHash !== evaluationAuthority.sourceIdentity.sourceTreeHash || manifest.artifactIdentityHash !== evaluationAuthority.sourceIdentity.artifactIdentityHash || manifest.evaluationAuthorityHash !== evaluationAuthority.authorityHash) fail("ENGINE_MANIFEST_BINDING_MISMATCH"); });
  if (envelope.commercialInfluence !== "FORBIDDEN" || envelope.writesUserState || envelope.writesWorldState) fail("ENGINE_BOUNDARY_VIOLATION");
  return envelope;
}

function reportSemanticBody(report: EvaluationReport): Record<string, unknown> {
  return Object.fromEntries(Object.entries(report).filter(([key]) => key !== "reportHash" && key !== "runtime"));
}

export function validatePhase2EvaluationIntegrity(envelopeValue: unknown, reportValue: unknown, trustAnchor: EvaluationAuthorityTrustAnchor): EvaluationReport {
  const envelope = validatePhase2ExecutionEnvelope(envelopeValue, trustAnchor); const report = EvaluationReportSchema.parse(reportValue);
  if (contentHash(reportSemanticBody(report)) !== report.reportHash) fail("EVALUATION_REPORT_HASH_MISMATCH");
  if (report.evaluationAuthorityHash !== envelope.evaluationAuthority.authorityHash || report.scenarioId !== envelope.evaluationAuthority.scenario.scenarioId || report.seed !== envelope.evaluationAuthority.scenario.seed || report.sandboxConfigHash !== envelope.evaluationAuthority.scenario.sandboxConfigHash || report.sandboxWorldHash !== envelope.evaluationAuthority.scenario.worldHash || report.requestHash !== envelope.requestHash || report.contextHash !== envelope.context.contextHash || report.candidatePoolHash !== envelope.candidatePool.candidatePoolHash || report.userProjectionHash !== envelope.userProjection.projectionHash) fail("EVALUATION_REPORT_BINDING_MISMATCH");
  if (canonicalJson(report.worldSnapshotHashes) !== canonicalJson(envelope.world.snapshots.map((item) => item.snapshotHash).sort())) fail("EVALUATION_WORLD_BINDING_MISMATCH");
  if (report.eligibilityResults.length !== envelope.candidatePool.candidates.length || new Set(report.eligibilityResults.map((item) => item.spotId)).size !== report.eligibilityResults.length) fail("EVALUATION_ELIGIBILITY_IDENTITY_MISMATCH");
  const candidateBySpot = new Map(envelope.candidatePool.candidates.map((entry) => [entry.candidate.spotId, entry.candidate]));
  for (const result of report.eligibilityResults) {
    validateEligibilityResult(result);
    const candidate = candidateBySpot.get(result.spotId);
    if (!candidate) fail("EVALUATION_ELIGIBILITY_OUTSIDE_POOL");
    const evidenceIds = new Set(candidate.evidence.map((item) => item.evidenceId));
    if (result.checks.some((check) => check.evidenceIds.some((id) => !evidenceIds.has(id)))) fail("EVALUATION_ELIGIBILITY_EVIDENCE_MISMATCH");
  }
  if (report.engineResults.length !== PHASE2_ENGINE_IDS.length || new Set(report.engineResults.map((result) => result.engineId)).size !== PHASE2_ENGINE_IDS.length || canonicalJson(report.engineResults.map((result) => result.engineId)) !== canonicalJson(PHASE2_ENGINE_IDS)) fail("ENGINE_RESULT_SET_MISMATCH");
  const expected = buildReport(envelope);
  if (canonicalJson(reportSemanticBody(expected)) !== canonicalJson(reportSemanticBody(report))) fail("EVALUATION_SEMANTIC_REPLAY_MISMATCH");
  for (const result of report.engineResults) {
    assertContentHash(result as unknown as Record<string, unknown>, "resultHash");
    const envelopeManifest = envelope.engineManifests.find((manifest) => manifest.engineId === result.engineId);
    if (!envelopeManifest || result.candidatePoolHash !== envelope.candidatePool.candidatePoolHash || result.manifest.engineId !== result.engineId || canonicalJson(result.manifest) !== canonicalJson(envelopeManifest)) fail("ENGINE_RESULT_BINDING_MISMATCH");
    if (new Set(result.rankings.map((entry) => entry.candidateId)).size !== result.rankings.length) fail("ENGINE_RANKING_DUPLICATE_CANDIDATE");
    result.rankings.forEach((entry, index) => { if (entry.rank !== index + 1) fail("ENGINE_RANKING_POSITION_INVALID"); assertContentHash(entry.fit as unknown as Record<string, unknown>, "fitHash"); });
    if (result.top1 !== (result.rankings[0]?.candidateId ?? null) || canonicalJson(result.top3) !== canonicalJson(result.rankings.slice(0, 3).map((entry) => entry.candidateId))) fail("ENGINE_TOP_RANK_BINDING_MISMATCH");
    const evidenceIds = new Set(result.evidence.map((item) => { assertContentHash(item as unknown as Record<string, unknown>, "evidenceHash"); return item.evidenceId; }));
    const explanationIdentities = result.explanation.map((reason) => contentHash(reason));
    if (evidenceIds.size !== result.evidence.length || new Set(explanationIdentities).size !== explanationIdentities.length || result.explanation.some((reason) => new Set(reason.evidenceIds).size !== reason.evidenceIds.length || reason.evidenceIds.some((id) => !evidenceIds.has(id)))) fail("EXPLANATION_EVIDENCE_INCOMPLETE");
  }
  report.metrics.forEach((metric) => { if (metric.productQualityClaim !== false) fail("EVALUATION_METRIC_PRODUCT_CLAIM_FORBIDDEN"); if (metric.state === "NOT_CONFIGURED" && (metric.value !== null || metric.oracleVersion !== null || metric.definitionVersion !== null)) fail("UNCONFIGURED_METRIC_HAS_VALUE"); if (metric.state === "TECHNICAL_DETERMINISTIC" && (metric.value === null || metric.definitionVersion === null || metric.oracleVersion !== null)) fail("TECHNICAL_METRIC_BINDING_INVALID"); });
  return report;
}

export function replayPhase2Evaluation(envelope: CanonicalIntegrationExecutionEnvelope, expectedReport: EvaluationReport, trustAnchor: EvaluationAuthorityTrustAnchor): EvaluationReport {
  const replayed = buildReport(validatePhase2ExecutionEnvelope(envelope, trustAnchor));
  if (replayed.reportHash !== expectedReport.reportHash || canonicalJson(replayed) !== canonicalJson(expectedReport)) fail("PHASE2_REPLAY_MISMATCH");
  return replayed;
}
