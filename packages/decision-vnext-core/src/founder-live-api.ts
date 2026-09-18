import { CONTRACT_VERSIONS as USER_VERSIONS, PRODUCTION_PROJECTION_ARTIFACT_HASH, PRODUCTION_PROJECTION_PORT_RELEASE, PRODUCTION_PROJECTION_SOURCE_SET_HASH, type DecisionVNextUserProjectionPort, type RelevantUserProjection, type RelevantUserProjectionRequest } from "@backyrd/user-intelligence-vnext-core";
import { WORLD_KNOWLEDGE_PORT_VERSION, type FounderWorldCohortManifest, type WorldKnowledgeReaderPort } from "@backyrd/world-knowledge-core";
import { canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { type FounderLabCandidateAssessment, type FounderLabCorrections, type FounderLabRequest, type FounderLabResult, PHASE3C_LAB_VERSIONS } from "./phase3c-lab-contracts.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, resolveFounderLabText, runFounderDecisionLab } from "./phase3c-lab.js";
import { readRelevantUserProjection } from "./user-adapter.js";
import { FOUNDER_LIVE_DURABLE_IDEMPOTENCY_ACL_HASH, FOUNDER_LIVE_DURABLE_IDEMPOTENCY_MIGRATION_SHA256, FOUNDER_LIVE_DURABLE_IDEMPOTENCY_SCHEMA_HASH, FOUNDER_LIVE_DURABLE_IDEMPOTENCY_VERSION, type FounderLiveDurableIdempotencyPort } from "./founder-live-durable-idempotency.js";
import { FOUNDER_LIVE_DURABLE_RATE_LIMIT_MIGRATION, FOUNDER_LIVE_DURABLE_RATE_LIMIT_MIGRATION_SHA256, FOUNDER_LIVE_DURABLE_RATE_LIMIT_RPC, FOUNDER_LIVE_DURABLE_RATE_LIMIT_VERSION } from "./founder-live-durable-rate-limit.js";
import {
  FOUNDER_LIVE_API_VERSIONS, FounderLiveDualRunReportSchema, FounderLiveExecutionEnvelopeSchema, FounderLiveExpertResponseSchema,
  FounderLivePostDeployEvidenceSchema, FounderLiveReleaseSchema, FounderLiveRequestSchema, FounderLiveResponseSchema,
  type FounderLiveDualRunReport, type FounderLiveExecutionEnvelope, type FounderLiveExpertResponse, type FounderLiveRequest, type FounderLiveResponse,
} from "./founder-live-api-contracts.js";

const EVALUATOR_PORT_VERSION = "backyrd.decision-vnext.founder-live-evaluator-port@1.0" as const;

const BASE_SHA = "96f648cebbfdfd854aec688613ddbedb447c25bb";
export const FOUNDER_LIVE_RELEASE = deepFreeze(FounderLiveReleaseSchema.parse(withContentHash({
  contractVersion: FOUNDER_LIVE_API_VERSIONS.release, releaseId: "decision-founder-live-production-adapter-source-3",
  sourceBaseSha: BASE_SHA, apiRequestVersion: FOUNDER_LIVE_API_VERSIONS.request, apiResponseVersion: FOUNDER_LIVE_API_VERSIONS.response,
  authPortVersion: "backyrd.decision-vnext.founder-live-auth-port@2.0", allowlistPortVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0",
  worldPortVersion: WORLD_KNOWLEDGE_PORT_VERSION, userProjectionPortVersion: "backyrd.user-intelligence.decision-projection-port@1.0", evaluatorPortVersion: EVALUATOR_PORT_VERSION,
  userProjectionReleaseHash: PRODUCTION_PROJECTION_PORT_RELEASE.releaseHash, userProjectionArtifactHash: PRODUCTION_PROJECTION_ARTIFACT_HASH, userProjectionSourceSetHash: PRODUCTION_PROJECTION_SOURCE_SET_HASH,
  durableIdempotencyPortVersion: FOUNDER_LIVE_DURABLE_IDEMPOTENCY_VERSION, durableIdempotencyMigrationSha256: FOUNDER_LIVE_DURABLE_IDEMPOTENCY_MIGRATION_SHA256, durableIdempotencyAclHash: FOUNDER_LIVE_DURABLE_IDEMPOTENCY_ACL_HASH, durableIdempotencySchemaHash: FOUNDER_LIVE_DURABLE_IDEMPOTENCY_SCHEMA_HASH,
  durableRateLimitPortVersion: FOUNDER_LIVE_DURABLE_RATE_LIMIT_VERSION, durableRateLimitRpc: FOUNDER_LIVE_DURABLE_RATE_LIMIT_RPC, durableRateLimitMigration: FOUNDER_LIVE_DURABLE_RATE_LIMIT_MIGRATION, durableRateLimitMigrationSha256: FOUNDER_LIVE_DURABLE_RATE_LIMIT_MIGRATION_SHA256,
  contextPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash,
  hostingBoundary: "SERVER_EDGE_ADAPTER_SOURCE_PRESENT_INACTIVE" as const, productRanking: "NOT_CONFIGURED" as const,
  shadowTraffic: false as const, samplingRate: 0 as const, productionAuthorized: false as const, deploymentAuthorized: false as const,
}, "releaseHash")));

export interface FounderLiveAuthenticatedActor { readonly userId: string; readonly subjectBindingHash: string; readonly authenticationContextHash: string; readonly sessionBindingHash: string; readonly issuedAt: string; readonly expiresAt: string; readonly expertAccess: boolean }
export interface FounderLiveAuthPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-auth-port@2.0"; authenticate(bearerToken: string): Promise<FounderLiveAuthenticatedActor | null> }
export interface FounderLiveAllowlistDecision { readonly authorized: boolean; readonly authorityVersion: string; readonly decisionHash: string }
export interface FounderLiveAllowlistPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@2.0"; authorize(input: { readonly verifiedUserId: string; readonly subjectBindingHash: string; readonly authenticationContextHash: string; readonly sessionBindingHash: string; readonly issuedAt: string; readonly expiresAt: string; readonly purpose: "FOUNDER_DECISION_EVALUATION"; readonly environment: "LOCAL_TEST" | "PROD_LIKE_TEST" }): Promise<FounderLiveAllowlistDecision> }
export interface FounderLiveAuthorityPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0"; bind(input: { readonly actor: FounderLiveAuthenticatedActor; readonly requestedCity: string | null; readonly requestHash: string }): Promise<{ readonly serverTime: string; readonly authorizedCity: string; readonly locationBindingHash: string }> }
export interface FounderLiveCandidateRetrievalPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0"; retrieve(input: { readonly authorizedCity: string; readonly requestHash: string }): Promise<FounderWorldCohortManifest> }
export interface FounderLiveRateLimitPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-rate-limit-port@1.0"; consume(subjectBindingHash: string): Promise<boolean> }
export interface FounderLiveEvaluatorPort {
  readonly contractVersion: typeof EVALUATOR_PORT_VERSION; readonly evaluatorId: string;
  evaluate(input: { readonly request: FounderLabRequest; readonly corrections: FounderLabCorrections; readonly worldReader: WorldKnowledgeReaderPort; readonly cohortManifest: FounderWorldCohortManifest; readonly userProjection: RelevantUserProjection }): Promise<FounderLabResult>;
}
export interface FounderLiveRuntimeControl { readonly enabled: boolean; readonly environment: "LOCAL_TEST" | "PROD_LIKE_TEST"; readonly purpose: "FOUNDER_DECISION_EVALUATION"; readonly requestTimeoutMilliseconds: number; readonly maxRequestBytes: number; isKillSwitchEngaged(): boolean }
export interface FounderLivePorts {
  readonly auth: FounderLiveAuthPort; readonly allowlist: FounderLiveAllowlistPort; readonly authority: FounderLiveAuthorityPort; readonly world: WorldKnowledgeReaderPort;
  readonly retrieval: FounderLiveCandidateRetrievalPort; readonly user: DecisionVNextUserProjectionPort;
  readonly evaluator: FounderLiveEvaluatorPort;
  readonly idempotency: FounderLiveDurableIdempotencyPort; readonly rateLimit: FounderLiveRateLimitPort; readonly control: FounderLiveRuntimeControl;
  readonly userSnapshot: { readonly snapshotId: string; readonly snapshotHash: string } | null;
}
export interface FounderLiveExecution { readonly response: FounderLiveResponse; readonly expert: FounderLiveExpertResponse }
interface FounderLiveAuthorizedActor extends FounderLiveAuthenticatedActor { readonly allowlistAuthorityVersion: string; readonly allowlistDecisionHash: string }

export const createCanonicalFounderLiveEvaluator = (): FounderLiveEvaluatorPort => Object.freeze({
  contractVersion: EVALUATOR_PORT_VERSION, evaluatorId: "phase3c-founder-contextual-world-evaluator",
  evaluate: (input: Parameters<FounderLiveEvaluatorPort["evaluate"]>[0]) => runFounderDecisionLab(input),
});

export class FounderLiveApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly publicMessage: string) { super(code); this.name = "FounderLiveApiError"; }
}

const primaryLabels: Readonly<Record<string, string>> = { "context.intent.food": "Essen", "context.intent.coffee": "Kaffee", "context.intent.drinks": "Getränke", "context.intent.wine-bar": "Weinbar", "context.intent.bar-nightlife": "Bar oder Nachtleben", "context.intent.family-outing": "Familienausflug", "context.intent.bouldering": "Bouldern", "context.intent.nature-animal": "Natur- oder Tiererlebnis", "context.intent.eat-drink-general": "Essen oder trinken" };
const secondaryLabels: Readonly<Record<string, string>> = { "context.intent.conversation": "In Ruhe reden", "context.intent.food": "Essen" };
const occasionLabels: Readonly<Record<string, string>> = { "context.occasion.first-date": "Erstes Date", "context.occasion.family": "Familie" };
const constraintLabels: Readonly<Record<string, string>> = { LOCATION_SCOPE: "Zielort", ACCESSIBILITY: "Rollstuhlgerechter Zugang", BUDGET_MAXIMUM: "Maximales Budget", DISTANCE_MAXIMUM: "Maximale Entfernung", AGE_OR_LEGAL: "Altersregel", OPENING_CURRENT: "Jetzt geöffnet", KITCHEN_CURRENT: "Küche geöffnet" };
const preferenceLabels: Readonly<Record<string, string>> = { MOOD: "Gewünschte Atmosphäre", EXPLORATION: "Etwas Neues", FAMILIARITY: "Etwas Vertrautes" };
const limitationLabels: Readonly<Record<string, string>> = { "intent-not-understood": "Die Hauptabsicht ist noch unklar.", "location-not-authorized": "Ein serverseitig bestätigter Zielort fehlt.", "incompatible-intents-require-clarification": "Die genannten Absichten widersprechen sich und müssen geklärt werden.", "mood-term-unresolved": "Ein Stimmungsbegriff konnte noch nicht sicher zugeordnet werden.", "no-bound-founder-world-cohort": "Es ist keine gebundene Founder-Welt verfügbar.", "fixture-fit-profile-is-calibration-only": "Die Auswertung ist nur für die lokale Evaluation freigegeben.", "world-cohort-evaluation-only-no-product-ranking": "Es existiert noch kein freigegebenes Product-Ranking." };

function candidateGroup(candidate: FounderLabCandidateAssessment): FounderLiveResponse["candidates"][number]["group"] {
  if (candidate.rejectionClass === "SITUATIONAL_REJECT") return "FUER_DIESE_ANFRAGE_ABGEWAEHLT";
  if (candidate.tier === "ELIGIBLE_CONFIRMED") return "BESTAETIGT_PASSEND";
  if (candidate.tier === "UNCONFIRMED_FALLBACK") return "KOENNTE_PASSEN_ANGABE_FEHLT";
  if (candidate.tier === "NOT_CONFIGURED") return "REGEL_NOCH_NICHT_FREIGEGEBEN";
  return "PASST_NICHT";
}
const friendly = (value: string | null, labels: Readonly<Record<string, string>>): string | null => value ? labels[value] ?? "Noch nicht verständlich zugeordnet" : null;
const readableLimitations = (values: readonly string[]) => [...new Set(values.map((value) => limitationLabels[value] ?? "Eine benötigte Product-Regel ist noch nicht freigegeben."))].sort();

function projectionRequest(input: { request: FounderLiveRequest; actor: FounderLiveAuthenticatedActor; decisionId: string; contextHash: string; snapshot: FounderLivePorts["userSnapshot"] }): RelevantUserProjectionRequest {
  return {
    contractVersion: USER_VERSIONS.projectionRequest, requestId: `projection-${input.request.requestId}`,
    actor: { kind: "AUTHENTICATED_USER", userId: input.actor.userId, subjectBindingHash: input.actor.subjectBindingHash, authenticationContextHash: input.actor.authenticationContextHash, boundBy: "SERVER" },
    decisionId: input.decisionId, snapshot: input.snapshot,
    context: { contextContractVersion: PHASE3C_LAB_VERSIONS.interpretation, contextHash: input.contextHash, placeTypes: [], domainKeys: [], rawLocationIncluded: false, socialDetailsIncluded: false },
    requestedDomains: [], budgets: { maxItems: 16, maxBytes: 8192 }, projectionPolicyVersion: "phase1-projection-policy-not-configured", killSwitch: false,
  };
}

function envelope(input: { request: FounderLiveRequest; actor: FounderLiveAuthorizedActor; authority: Awaited<ReturnType<FounderLiveAuthorityPort["bind"]>>; manifest: FounderWorldCohortManifest; environment: FounderLiveRuntimeControl["environment"]; evaluatorContractVersion: string }): FounderLiveExecutionEnvelope {
  const requestHash = contentHash(input.request); const decisionId = `decision-${input.request.idempotencyKey}`;
  return deepFreeze(FounderLiveExecutionEnvelopeSchema.parse(withContentHash({
    contractVersion: FOUNDER_LIVE_API_VERSIONS.envelope, envelopeId: `envelope-${input.request.idempotencyKey}`, decisionId, requestHash,
    idempotencyIdentityHash: contentHash({ subjectBindingHash: input.actor.subjectBindingHash, idempotencyKey: input.request.idempotencyKey, requestHash }),
    actor: { subjectBindingHash: input.actor.subjectBindingHash, authenticationContextHash: input.actor.authenticationContextHash, allowlistAuthorityVersion: input.actor.allowlistAuthorityVersion, allowlistDecisionHash: input.actor.allowlistDecisionHash, boundBy: "SERVER" as const },
    authority: { ...input.authority, purpose: "FOUNDER_DECISION_EVALUATION" as const, environment: input.environment },
    bindings: { worldManifestHash: input.manifest.cohortHash, worldCohortHash: input.manifest.cohortHash, userProjectionContractVersion: USER_VERSIONS.projection, evaluatorContractVersion: input.evaluatorContractVersion, contextPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash },
    boundaries: { evaluationOnly: true as const, productionAuthorized: false as const, executionAuthorized: false as const, durablePersistenceAuthorized: false as const, externalProviderNetworkAuthorized: false as const, productOutputAuthorized: false as const, eligibilityAuthority: false as const, confidenceAuthority: false as const, learningAuthorized: false as const, rankingAuthorized: false as const, mutationAuthorized: false as const },
  }, "envelopeHash")));
}

function assertRunning(ports: FounderLivePorts, signal?: AbortSignal): void { if (signal?.aborted) throw new FounderLiveApiError("REQUEST_TIMEOUT", 504, "Die sichere Auswertung hat zu lange gedauert."); if (!ports.control.enabled) throw new FounderLiveApiError("API_DISABLED", 503, "Die Decision-Auswertung ist derzeit nicht freigegeben."); if (ports.control.isKillSwitchEngaged()) throw new FounderLiveApiError("KILL_SWITCH_ENGAGED", 503, "Die Decision-Auswertung ist derzeit sicher deaktiviert."); }
function assertPortVersions(ports: FounderLivePorts): void {
  if (ports.auth.contractVersion !== "backyrd.decision-vnext.founder-live-auth-port@2.0" || ports.allowlist.contractVersion !== "backyrd.decision-vnext.founder-live-allowlist-port@2.0" || ports.authority.contractVersion !== "backyrd.decision-vnext.founder-live-authority-port@1.0" || ports.retrieval.contractVersion !== "backyrd.decision-vnext.founder-live-retrieval-port@1.0" || ports.idempotency.contractVersion !== FOUNDER_LIVE_DURABLE_IDEMPOTENCY_VERSION || ports.rateLimit.contractVersion !== "backyrd.decision-vnext.founder-live-rate-limit-port@1.0" || ports.world.contractVersion !== "backyrd.world-knowledge.reader-port@1.0" || ports.user.contractVersion !== "backyrd.user-intelligence.decision-projection-port@1.0" || ports.evaluator.contractVersion !== EVALUATOR_PORT_VERSION) throw new FounderLiveApiError("SERVER_PORT_VERSION_UNSUPPORTED", 503, "Eine Server-Komponente verwendet eine nicht unterstützte Version.");
  if (!Number.isInteger(ports.control.requestTimeoutMilliseconds) || ports.control.requestTimeoutMilliseconds < 1 || !Number.isInteger(ports.control.maxRequestBytes) || ports.control.maxRequestBytes < 256) throw new FounderLiveApiError("SERVER_LIMITS_INVALID", 503, "Die Server-Limits sind nicht sicher konfiguriert.");
}

async function authorizeActor(actor: FounderLiveAuthenticatedActor, ports: FounderLivePorts, signal?: AbortSignal): Promise<FounderLiveAuthorizedActor> {
  const allowlist = await ports.allowlist.authorize({ verifiedUserId: actor.userId, subjectBindingHash: actor.subjectBindingHash, authenticationContextHash: actor.authenticationContextHash, sessionBindingHash: actor.sessionBindingHash, issuedAt: actor.issuedAt, expiresAt: actor.expiresAt, purpose: ports.control.purpose, environment: ports.control.environment });
  assertRunning(ports, signal);
  if (!allowlist.authorized) throw new FounderLiveApiError("NOT_ALLOWLISTED", 403, "Dieser Account ist für die Evaluation nicht freigegeben.");
  return Object.freeze({ ...actor, allowlistAuthorityVersion: allowlist.authorityVersion, allowlistDecisionHash: allowlist.decisionHash });
}

async function executeAuthorizedFounderLiveDecision(raw: unknown, actor: FounderLiveAuthorizedActor, ports: FounderLivePorts, options: { readonly signal?: AbortSignal } = {}): Promise<FounderLiveExecution> {
  const signal = options.signal; assertPortVersions(ports); assertRunning(ports, signal);
  const request = FounderLiveRequestSchema.parse(raw); const requestHash = contentHash(request);
  const labRequest = { contractVersion: PHASE3C_LAB_VERSIONS.request, requestId: request.requestId, ephemeralText: request.naturalLanguage, deviceLocation: { state: "DENIED" as const, city: null }, userMode: "NEUTRAL_MISSING" as const, alternativeRequested: request.alternativeRequested, rejectedCandidateIds: request.rejectedCandidateIds };
  const initial = resolveFounderLabText(labRequest, request.explicit); const requestedCity = initial.targetCity;
  if (!requestedCity) throw new FounderLiveApiError("LOCATION_REQUIRED", 422, "Bitte gib an, in welcher Stadt oder welchem Gebiet du suchst.");
  const bound = await ports.authority.bind({ actor, requestedCity, requestHash }); assertRunning(ports, signal);
  if (bound.authorizedCity !== requestedCity || bound.locationBindingHash !== contentHash({ requestedCity, authorizedCity: bound.authorizedCity, subjectBindingHash: actor.subjectBindingHash })) throw new FounderLiveApiError("LOCATION_AUTHORITY_MISMATCH", 403, "Der gewünschte Ort konnte serverseitig nicht bestätigt werden.");
  const interpretation = resolveFounderLabText(labRequest, { ...request.explicit, targetCity: bound.authorizedCity });
  if (!interpretation.primaryIntent) throw new FounderLiveApiError("PRIMARY_INTENT_REQUIRED", 422, "Bitte beschreibe noch, was du jetzt unternehmen möchtest.");
  assertRunning(ports, signal);
  const decisionId = `decision-${request.idempotencyKey}`;
  const worldManifest = await ports.retrieval.retrieve({ authorizedCity: bound.authorizedCity, requestHash }); assertRunning(ports, signal);
  const userRequest = projectionRequest({ request, actor, decisionId, contextHash: interpretation.interpretationHash, snapshot: ports.userSnapshot });
  const projection = await readRelevantUserProjection(ports.user, userRequest); assertRunning(ports, signal);
  if (projection.decisionId !== decisionId || (projection.status === "ACTIVE" && projection.subjectBindingHash !== actor.subjectBindingHash) || projection.boundaries.eligibilityAuthority || projection.boundaries.rankingAuthority) throw new FounderLiveApiError("USER_PROJECTION_BINDING_INVALID", 503, "Die Personalisierung konnte nicht sicher gebunden werden; die Anfrage wurde beendet.");
  const guardedWorld: WorldKnowledgeReaderPort = { contractVersion: ports.world.contractVersion, async readSnapshot(input) { assertRunning(ports, signal); const value = await ports.world.readSnapshot(input); assertRunning(ports, signal); return value; } };
  const evaluation = await ports.evaluator.evaluate({ request: labRequest, corrections: { ...request.explicit, targetCity: bound.authorizedCity }, worldReader: guardedWorld, cohortManifest: worldManifest, userProjection: projection });
  assertRunning(ports, signal);
  const env = envelope({ request, actor, authority: bound, manifest: worldManifest, environment: ports.control.environment, evaluatorContractVersion: ports.evaluator.contractVersion });
  const normalBody = {
    contractVersion: FOUNDER_LIVE_API_VERSIONS.response, status: "EVALUATION_ONLY" as const,
    understood: { primaryIntent: friendly(evaluation.interpretation.primaryIntent, primaryLabels), secondaryIntent: friendly(evaluation.interpretation.secondaryIntent, secondaryLabels), occasion: friendly(evaluation.interpretation.occasion, occasionLabels), targetCity: evaluation.interpretation.targetCity, hardConditions: ["Zielort", ...evaluation.interpretation.hardConstraints.map((item) => constraintLabels[item] ?? "Weitere zwingende Bedingung")], softPreferences: evaluation.interpretation.softPreferences.map((item) => preferenceLabels[item] ?? "Weiterer Wunsch") },
    candidates: evaluation.candidates.map((candidate) => ({ name: candidate.label, group: candidateGroup(candidate), reasons: candidate.reasons.map((item) => item.statementDe) })),
    limitations: readableLimitations(evaluation.limitations), alternative: evaluation.alternative,
    reject: { contextualOnly: true as const, userLearningProduced: evaluation.reject.userEventProduced }, rankingState: "NOT_CONFIGURED" as const,
  };
  const response = deepFreeze(FounderLiveResponseSchema.parse(normalBody));
  const expertBody = { contractVersion: FOUNDER_LIVE_API_VERSIONS.expert, normal: response, envelope: env, provenance: { worldSnapshotHashes: evaluation.worldCohort.spotBindings.map((row) => row.snapshotHash), worldCohortHash: evaluation.worldCohort.cohortHash, userProjectionHash: evaluation.userProjectionHash, contextHash: evaluation.interpretation.interpretationHash, evaluationResultHash: evaluation.resultHash, policyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash }, candidateProofs: evaluation.candidates.map((candidate) => ({ candidateId: candidate.candidateId, assessmentHash: candidate.assessmentHash, tier: candidate.tier, coreIntentState: candidate.coreIntentCoverage.state, reasonSourceHashes: candidate.reasons.map((reason) => reason.sourceHash) })) };
  const expert = deepFreeze(FounderLiveExpertResponseSchema.parse(withContentHash(expertBody, "expertHash")));
  const result = deepFreeze({ response, expert });
  const committed = await ports.idempotency.commit({ subjectBindingHash: actor.subjectBindingHash, idempotencyKey: request.idempotencyKey, payloadHash: requestHash, execution: result });
  assertRunning(ports, signal);
  if (committed.status === "CONFLICT" || committed.status === "EXPIRED") throw new FounderLiveApiError("IDEMPOTENCY_CONFLICT", 409, "Diese Anfrage-ID wurde bereits mit anderen Eingaben verwendet oder ist abgelaufen.");
  if (committed.status === "CREATED") return result;
  if (committed.status !== "REPLAYED") throw new FounderLiveApiError("IDEMPOTENCY_REPLAY_INVALID", 503, "Die gespeicherte Wiederholung besitzt keinen unterstützten Zustand.");
  const replayResponse = FounderLiveResponseSchema.parse(committed.execution.response);
  const replayExpert = FounderLiveExpertResponseSchema.parse(committed.execution.expert);
  const { envelopeHash: _envelopeHash, ...envelopeBody } = replayExpert.envelope;
  const { expertHash: _expertHash, ...replayExpertBody } = replayExpert;
  const identityHash = contentHash({ subjectBindingHash: actor.subjectBindingHash, idempotencyKey: request.idempotencyKey, requestHash });
  if (contentHash(envelopeBody) !== replayExpert.envelope.envelopeHash || contentHash(replayExpertBody) !== replayExpert.expertHash || canonicalJson(replayResponse) !== canonicalJson(replayExpert.normal) || replayExpert.envelope.requestHash !== requestHash || replayExpert.envelope.idempotencyIdentityHash !== identityHash || replayExpert.envelope.actor.subjectBindingHash !== actor.subjectBindingHash) throw new FounderLiveApiError("IDEMPOTENCY_REPLAY_INVALID", 503, "Die gespeicherte Wiederholung konnte nicht sicher validiert werden.");
  return deepFreeze({ response: replayResponse, expert: replayExpert });
}

export async function executeFounderLiveDecision(raw: unknown, authenticatedActor: FounderLiveAuthenticatedActor, ports: FounderLivePorts, options: { readonly signal?: AbortSignal } = {}): Promise<FounderLiveExecution> {
  assertPortVersions(ports); assertRunning(ports, options.signal);
  const actor = await authorizeActor(authenticatedActor, ports, options.signal);
  return executeAuthorizedFounderLiveDecision(raw, actor, ports, options);
}

/** Local/prod-like technical comparison only. It is deliberately not exposed by the HTTP route. */
export async function executeFounderLiveDualRun(input: { readonly request: unknown; readonly actor: FounderLiveAuthenticatedActor; readonly primary: FounderLivePorts; readonly comparator: FounderLivePorts }): Promise<FounderLiveDualRunReport> {
  if (!(["LOCAL_TEST", "PROD_LIKE_TEST"] as const).includes(input.primary.control.environment) || !(["LOCAL_TEST", "PROD_LIKE_TEST"] as const).includes(input.comparator.control.environment)) throw new FounderLiveApiError("DUAL_RUN_ENVIRONMENT_FORBIDDEN", 403, "Der technische Vergleich ist in dieser Umgebung nicht erlaubt.");
  const primary = await executeFounderLiveDecision(input.request, input.actor, input.primary);
  const comparator = await executeFounderLiveDecision(input.request, input.actor, input.comparator);
  const body = { contractVersion: FOUNDER_LIVE_API_VERSIONS.dualRunReport, requestHash: primary.expert.envelope.requestHash, primary: { evaluatorId: input.primary.evaluator.evaluatorId, evaluatorContractVersion: input.primary.evaluator.contractVersion, expertHash: primary.expert.expertHash }, comparator: { evaluatorId: input.comparator.evaluator.evaluatorId, evaluatorContractVersion: input.comparator.evaluator.contractVersion, expertHash: comparator.expert.expertHash }, semanticResponseEquivalent: canonicalJson(primary.response) === canonicalJson(comparator.response), classification: "LOCAL_OR_PROD_LIKE_TECHNICAL_COMPARISON_ONLY" as const, productOutputProduced: false as const, durableWriteProduced: false as const, learningProduced: false as const, productQualityClaim: false as const, rankingClaim: false as const };
  return deepFreeze(FounderLiveDualRunReportSchema.parse(withContentHash(body, "reportHash")));
}

const errorBody = (code: string, message: string) => ({ contractVersion: "backyrd.decision-vnext.founder-live-error@1.0", error: { code, message } });
export function createFounderLiveHttpHandler(ports: FounderLivePorts): (request: Request) => Promise<Response> {
  return async (request) => {
    const abort = new AbortController(); let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/decision/evaluate") throw new FounderLiveApiError("NOT_FOUND", 404, "Dieser API-Pfad existiert nicht.");
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new FounderLiveApiError("CONTENT_TYPE_REQUIRED", 415, "Die Anfrage muss JSON verwenden.");
      const authHeader = request.headers.get("authorization") ?? ""; const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) throw new FounderLiveApiError("UNAUTHENTICATED", 401, "Bitte melde dich an.");
      timeout = setTimeout(() => abort.abort(), ports.control.requestTimeoutMilliseconds);
      const timedOut = new Promise<never>((_, reject) => abort.signal.addEventListener("abort", () => reject(new FounderLiveApiError("REQUEST_TIMEOUT", 504, "Die sichere Auswertung hat zu lange gedauert.")), { once: true }));
      const pipeline = async () => {
      assertPortVersions(ports); assertRunning(ports, abort.signal);
      const actor = await ports.auth.authenticate(token); assertRunning(ports, abort.signal); if (!actor) throw new FounderLiveApiError("UNAUTHENTICATED", 401, "Die Anmeldung ist ungültig oder abgelaufen.");
      const authorizedActor = await authorizeActor(actor, ports, abort.signal);
      if (!await ports.rateLimit.consume(actor.subjectBindingHash)) throw new FounderLiveApiError("RATE_LIMITED", 429, "Zu viele Anfragen. Bitte versuche es später erneut.");
      const text = await request.text(); if (new TextEncoder().encode(text).length > ports.control.maxRequestBytes) throw new FounderLiveApiError("REQUEST_TOO_LARGE", 413, "Die Anfrage ist zu groß.");
      let body: unknown; try { body = JSON.parse(text); } catch { throw new FounderLiveApiError("INVALID_JSON", 400, "Die Anfrage enthält kein gültiges JSON."); }
      const execution = await executeAuthorizedFounderLiveDecision(body, authorizedActor, ports, { signal: abort.signal });
      const expertRequested = request.headers.get("x-backyrd-expert-view") === "true";
      if (expertRequested && !actor.expertAccess) throw new FounderLiveApiError("EXPERT_ACCESS_FORBIDDEN", 403, "Die Expertensicht ist für diesen Account nicht freigegeben.");
      return new Response(JSON.stringify(expertRequested ? execution.expert : execution.response), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } }); };
      return await Promise.race([pipeline(), timedOut]);
    } catch (error) {
      const known = error instanceof FounderLiveApiError ? error : new FounderLiveApiError("REQUEST_REJECTED", 422, "Die Anfrage konnte nicht sicher ausgewertet werden.");
      return new Response(JSON.stringify(errorBody(known.code, known.publicMessage)), { status: known.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } finally { if (timeout) clearTimeout(timeout); }
  };
}

const MOBILE_GATEWAY_VERSION = "backyrd.decision-api.gateway-response@1.0" as const;
function parseMobileGatewayRequest(value: unknown): { contractVersion: "backyrd.decision-api.request@1.0"; requestId: string; idempotencyKey: string; context: { city: string; query: string; moods: string[]; audience: string[]; placeTypes: string[] }; continuation: null | { decisionId: string; requestId: string } } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FounderLiveApiError("MOBILE_REQUEST_INVALID", 400, "Die Anfrage verwendet keinen unterstützten Vertrag.");
  const object = value as Record<string, unknown>; const exact = (target: Record<string, unknown>, keys: readonly string[]) => Object.keys(target).sort().join("|") === [...keys].sort().join("|");
  if (!exact(object, ["contractVersion", "requestId", "idempotencyKey", "context", "continuation"]) || object.contractVersion !== "backyrd.decision-api.request@1.0") throw new FounderLiveApiError("MOBILE_REQUEST_VERSION_UNSUPPORTED", 400, "Die Anfrage verwendet keinen unterstützten Vertrag.");
  const context = object.context as Record<string, unknown>;
  if (!context || !exact(context, ["city", "query", "moods", "audience", "placeTypes"]) || typeof context.city !== "string" || typeof context.query !== "string" || ![context.moods, context.audience, context.placeTypes].every((list) => Array.isArray(list) && list.every((item) => typeof item === "string"))) throw new FounderLiveApiError("MOBILE_CONTEXT_INVALID", 400, "Die Situation konnte nicht sicher gelesen werden.");
  if (typeof object.requestId !== "string" || typeof object.idempotencyKey !== "string") throw new FounderLiveApiError("MOBILE_REQUEST_IDENTITY_INVALID", 400, "Die Anfrage besitzt keine gültige Identität.");
  if (object.continuation !== null) throw new FounderLiveApiError("CROSS_ENGINE_CONTINUATION_FORBIDDEN", 409, "Eine bestehende Decision kann nicht zwischen Engines fortgesetzt werden.");
  return object as ReturnType<typeof parseMobileGatewayRequest>;
}

/** Server-selected mobile gateway. Founder output stays read-only and distinct from v13. */
export function createFounderLiveMobileGatewayHandler(ports: FounderLivePorts): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      assertPortVersions(ports); assertRunning(ports);
      if (request.method !== "POST") throw new FounderLiveApiError("METHOD_NOT_ALLOWED", 405, "Dieser API-Pfad unterstützt nur POST.");
      const token = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) throw new FounderLiveApiError("UNAUTHENTICATED", 401, "Bitte melde dich an.");
      const actor = await ports.auth.authenticate(token); if (!actor) throw new FounderLiveApiError("UNAUTHENTICATED", 401, "Die Anmeldung ist ungültig oder abgelaufen.");
      const raw = await request.json(); const mobile = parseMobileGatewayRequest(raw);
      const allowlist = await ports.allowlist.authorize({ verifiedUserId: actor.userId, subjectBindingHash: actor.subjectBindingHash, authenticationContextHash: actor.authenticationContextHash, sessionBindingHash: actor.sessionBindingHash, issuedAt: actor.issuedAt, expiresAt: actor.expiresAt, purpose: ports.control.purpose, environment: ports.control.environment });
      if (!allowlist.authorized) return new Response(JSON.stringify({ contractVersion: MOBILE_GATEWAY_VERSION, route: "EXISTING_ENGINE", requestId: mobile.requestId, writebackPerformed: false, response: null }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      const founderRequest: FounderLiveRequest = { contractVersion: FOUNDER_LIVE_API_VERSIONS.request, requestId: mobile.requestId, idempotencyKey: mobile.idempotencyKey, naturalLanguage: mobile.context.query, explicit: { targetCity: mobile.context.city }, alternativeRequested: false, rejectedCandidateIds: [] };
      const execution = await executeFounderLiveDecision(founderRequest, actor, ports);
      return new Response(JSON.stringify({ contractVersion: MOBILE_GATEWAY_VERSION, route: "FOUNDER_LIVE_READ_ONLY", requestId: mobile.requestId, writebackPerformed: false, response: execution.response }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch (error) {
      const known = error instanceof FounderLiveApiError ? error : new FounderLiveApiError("REQUEST_REJECTED", 422, "Die Anfrage konnte nicht sicher ausgewertet werden.");
      return new Response(JSON.stringify(errorBody(known.code, known.publicMessage)), { status: known.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
  };
}

export function createFounderLivePostDeployEvidence(productionPlanHash: string) {
  return deepFreeze(FounderLivePostDeployEvidenceSchema.parse(withContentHash({ contractVersion: FOUNDER_LIVE_API_VERSIONS.postDeployEvidence, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash, status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" as const, productionPlanHash, executionAuthorized: false as const, deploymentExecuted: false as const, migrationExecuted: false as const, functionChanged: false as const, authChanged: false as const, shadowTrafficActivated: false as const }, "evidenceHash")));
}
