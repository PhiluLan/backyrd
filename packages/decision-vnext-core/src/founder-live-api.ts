import { CONTRACT_VERSIONS as USER_VERSIONS, type DecisionVNextUserProjectionPort, type RelevantUserProjection, type RelevantUserProjectionRequest } from "@backyrd/user-intelligence-vnext-core";
import { WORLD_KNOWLEDGE_PORT_VERSION, type FounderWorldCohortManifest, type WorldKnowledgeReaderPort } from "@backyrd/world-knowledge-core";
import { canonicalJson, contentHash, deepFreeze, withContentHash } from "./canonical.js";
import { type FounderLabCandidateAssessment, type FounderLabCorrections, type FounderLabRequest, type FounderLabResult, PHASE3C_LAB_VERSIONS } from "./phase3c-lab-contracts.js";
import { PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY, resolveFounderLabText, runFounderDecisionLab } from "./phase3c-lab.js";
import { readRelevantUserProjection } from "./user-adapter.js";
import {
  FOUNDER_LIVE_API_VERSIONS, FounderLiveDualRunReportSchema, FounderLiveExecutionEnvelopeSchema, FounderLiveExpertResponseSchema,
  FounderLivePostDeployEvidenceSchema, FounderLiveReleaseSchema, FounderLiveRequestSchema, FounderLiveResponseSchema,
  type FounderLiveDualRunReport, type FounderLiveExecutionEnvelope, type FounderLiveExpertResponse, type FounderLiveRequest, type FounderLiveResponse,
} from "./founder-live-api-contracts.js";

const EVALUATOR_PORT_VERSION = "backyrd.decision-vnext.founder-live-evaluator-port@1.0" as const;

const BASE_SHA = "9c38946462c5698ee1ff6375d996463254dd829e";
export const FOUNDER_LIVE_RELEASE = deepFreeze(FounderLiveReleaseSchema.parse(withContentHash({
  contractVersion: FOUNDER_LIVE_API_VERSIONS.release, releaseId: "decision-founder-live-server-api-1",
  sourceBaseSha: BASE_SHA, apiRequestVersion: FOUNDER_LIVE_API_VERSIONS.request, apiResponseVersion: FOUNDER_LIVE_API_VERSIONS.response,
  worldPortVersion: WORLD_KNOWLEDGE_PORT_VERSION, userProjectionPortVersion: "backyrd.user-intelligence.decision-projection-port@1.0", evaluatorPortVersion: EVALUATOR_PORT_VERSION,
  contextPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash,
  hostingBoundary: "EXISTING_SERVER_EDGE_ADAPTER_REQUIRED" as const, productRanking: "NOT_CONFIGURED" as const,
  shadowTraffic: false as const, productionAuthorized: false as const, deploymentAuthorized: false as const,
}, "releaseHash")));

export interface FounderLiveAuthenticatedActor { readonly userId: string; readonly subjectBindingHash: string; readonly authenticationContextHash: string; readonly expertAccess: boolean }
export interface FounderLiveAuthPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-auth-port@1.0"; authenticate(bearerToken: string): Promise<FounderLiveAuthenticatedActor | null> }
export interface FounderLiveAllowlistPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-allowlist-port@1.0"; authorize(input: { readonly subjectBindingHash: string; readonly purpose: "FOUNDER_DECISION_EVALUATION"; readonly environment: "LOCAL_TEST" | "PROD_LIKE_TEST" }): Promise<boolean> }
export interface FounderLiveAuthorityPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-authority-port@1.0"; bind(input: { readonly actor: FounderLiveAuthenticatedActor; readonly requestedCity: string | null; readonly requestHash: string }): Promise<{ readonly serverTime: string; readonly authorizedCity: string; readonly locationBindingHash: string }> }
export interface FounderLiveCandidateRetrievalPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-retrieval-port@1.0"; retrieve(input: { readonly authorizedCity: string; readonly requestHash: string }): Promise<FounderWorldCohortManifest> }
export interface FounderLiveIdempotencyPort { readonly contractVersion: "backyrd.decision-vnext.founder-live-idempotency-port@1.0"; read(key: string): Promise<FounderLiveExecution | null>; create(key: string, value: FounderLiveExecution): Promise<"CREATED" | "CONFLICT"> }
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
  readonly idempotency: FounderLiveIdempotencyPort; readonly rateLimit: FounderLiveRateLimitPort; readonly control: FounderLiveRuntimeControl;
  readonly userSnapshot: { readonly snapshotId: string; readonly snapshotHash: string } | null;
}
export interface FounderLiveExecution { readonly response: FounderLiveResponse; readonly expert: FounderLiveExpertResponse }

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

function envelope(input: { request: FounderLiveRequest; actor: FounderLiveAuthenticatedActor; authority: Awaited<ReturnType<FounderLiveAuthorityPort["bind"]>>; manifest: FounderWorldCohortManifest; environment: FounderLiveRuntimeControl["environment"]; evaluatorContractVersion: string }): FounderLiveExecutionEnvelope {
  const requestHash = contentHash(input.request); const decisionId = `decision-${input.request.idempotencyKey}`;
  return deepFreeze(FounderLiveExecutionEnvelopeSchema.parse(withContentHash({
    contractVersion: FOUNDER_LIVE_API_VERSIONS.envelope, envelopeId: `envelope-${input.request.idempotencyKey}`, decisionId, requestHash,
    idempotencyIdentityHash: contentHash({ subjectBindingHash: input.actor.subjectBindingHash, idempotencyKey: input.request.idempotencyKey, requestHash }),
    actor: { userId: input.actor.userId, subjectBindingHash: input.actor.subjectBindingHash, authenticationContextHash: input.actor.authenticationContextHash, boundBy: "SERVER" as const },
    authority: { ...input.authority, purpose: "FOUNDER_DECISION_EVALUATION" as const, environment: input.environment },
    bindings: { worldManifestHash: input.manifest.cohortHash, worldCohortHash: input.manifest.cohortHash, userProjectionContractVersion: USER_VERSIONS.projection, evaluatorContractVersion: input.evaluatorContractVersion, contextPolicyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash },
    boundaries: { evaluationOnly: true as const, productionAuthorized: false as const, durablePersistenceAuthorized: false as const, learningAuthorized: false as const, rankingAuthorized: false as const, mutationAuthorized: false as const },
  }, "envelopeHash")));
}

function assertRunning(ports: FounderLivePorts, signal?: AbortSignal): void { if (signal?.aborted) throw new FounderLiveApiError("REQUEST_TIMEOUT", 504, "Die sichere Auswertung hat zu lange gedauert."); if (!ports.control.enabled) throw new FounderLiveApiError("API_DISABLED", 503, "Die Decision-Auswertung ist derzeit nicht freigegeben."); if (ports.control.isKillSwitchEngaged()) throw new FounderLiveApiError("KILL_SWITCH_ENGAGED", 503, "Die Decision-Auswertung ist derzeit sicher deaktiviert."); }
function assertPortVersions(ports: FounderLivePorts): void {
  if (ports.auth.contractVersion !== "backyrd.decision-vnext.founder-live-auth-port@1.0" || ports.allowlist.contractVersion !== "backyrd.decision-vnext.founder-live-allowlist-port@1.0" || ports.authority.contractVersion !== "backyrd.decision-vnext.founder-live-authority-port@1.0" || ports.retrieval.contractVersion !== "backyrd.decision-vnext.founder-live-retrieval-port@1.0" || ports.idempotency.contractVersion !== "backyrd.decision-vnext.founder-live-idempotency-port@1.0" || ports.rateLimit.contractVersion !== "backyrd.decision-vnext.founder-live-rate-limit-port@1.0" || ports.world.contractVersion !== "backyrd.world-knowledge.reader-port@1.0" || ports.user.contractVersion !== "backyrd.user-intelligence.decision-projection-port@1.0" || ports.evaluator.contractVersion !== EVALUATOR_PORT_VERSION) throw new FounderLiveApiError("SERVER_PORT_VERSION_UNSUPPORTED", 503, "Eine Server-Komponente verwendet eine nicht unterstützte Version.");
  if (!Number.isInteger(ports.control.requestTimeoutMilliseconds) || ports.control.requestTimeoutMilliseconds < 1 || !Number.isInteger(ports.control.maxRequestBytes) || ports.control.maxRequestBytes < 256) throw new FounderLiveApiError("SERVER_LIMITS_INVALID", 503, "Die Server-Limits sind nicht sicher konfiguriert.");
}

export async function executeFounderLiveDecision(raw: unknown, actor: FounderLiveAuthenticatedActor, ports: FounderLivePorts, options: { readonly signal?: AbortSignal } = {}): Promise<FounderLiveExecution> {
  const signal = options.signal; assertPortVersions(ports); assertRunning(ports, signal);
  const request = FounderLiveRequestSchema.parse(raw); const requestHash = contentHash(request);
  const idempotencyIdentity = contentHash({ subjectBindingHash: actor.subjectBindingHash, idempotencyKey: request.idempotencyKey });
  const prior = await ports.idempotency.read(idempotencyIdentity);
  if (prior) {
    if (prior.expert.envelope.requestHash !== requestHash) throw new FounderLiveApiError("IDEMPOTENCY_CONFLICT", 409, "Diese Anfrage-ID wurde bereits mit anderen Eingaben verwendet.");
    return prior;
  }
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
    contractVersion: FOUNDER_LIVE_API_VERSIONS.response, decisionId, requestId: request.requestId, status: "EVALUATION_ONLY" as const,
    understood: { primaryIntent: friendly(evaluation.interpretation.primaryIntent, primaryLabels), secondaryIntent: friendly(evaluation.interpretation.secondaryIntent, secondaryLabels), occasion: friendly(evaluation.interpretation.occasion, occasionLabels), targetCity: evaluation.interpretation.targetCity, hardConditions: ["Zielort", ...evaluation.interpretation.hardConstraints.map((item) => constraintLabels[item] ?? "Weitere zwingende Bedingung")], softPreferences: evaluation.interpretation.softPreferences.map((item) => preferenceLabels[item] ?? "Weiterer Wunsch") },
    candidates: evaluation.candidates.map((candidate) => ({ name: candidate.label, group: candidateGroup(candidate), reasons: candidate.reasons.map((item) => item.statementDe) })),
    limitations: readableLimitations(evaluation.limitations), alternative: evaluation.alternative,
    reject: { contextualOnly: true as const, userLearningProduced: evaluation.reject.userEventProduced }, rankingState: "NOT_CONFIGURED" as const,
  };
  const response = deepFreeze(FounderLiveResponseSchema.parse(normalBody));
  const expertBody = { contractVersion: FOUNDER_LIVE_API_VERSIONS.expert, normal: response, envelope: env, provenance: { worldSnapshotHashes: evaluation.worldCohort.spotBindings.map((row) => row.snapshotHash), worldCohortHash: evaluation.worldCohort.cohortHash, userProjectionHash: evaluation.userProjectionHash, contextHash: evaluation.interpretation.interpretationHash, evaluationResultHash: evaluation.resultHash, policyHash: PHASE3C_CONTEXTUAL_WORLD_EVALUATION_POLICY.policyHash, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash }, candidateProofs: evaluation.candidates.map((candidate) => ({ candidateId: candidate.candidateId, assessmentHash: candidate.assessmentHash, tier: candidate.tier, coreIntentState: candidate.coreIntentCoverage.state, reasonSourceHashes: candidate.reasons.map((reason) => reason.sourceHash) })) };
  const expert = deepFreeze(FounderLiveExpertResponseSchema.parse(withContentHash(expertBody, "expertHash")));
  const result = deepFreeze({ response, expert });
  if (await ports.idempotency.create(idempotencyIdentity, result) === "CONFLICT") { const winner = await ports.idempotency.read(idempotencyIdentity); if (!winner || canonicalJson(winner) !== canonicalJson(result)) throw new FounderLiveApiError("IDEMPOTENCY_CONFLICT", 409, "Diese Anfrage-ID wurde bereits mit anderen Eingaben verwendet."); return winner; }
  return result;
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
      const actor = await ports.auth.authenticate(token); assertRunning(ports, abort.signal); if (!actor) throw new FounderLiveApiError("UNAUTHENTICATED", 401, "Die Anmeldung ist ungültig oder abgelaufen.");
      if (!await ports.allowlist.authorize({ subjectBindingHash: actor.subjectBindingHash, purpose: ports.control.purpose, environment: ports.control.environment })) throw new FounderLiveApiError("NOT_ALLOWLISTED", 403, "Dieser Account ist für die Evaluation nicht freigegeben.");
      if (!await ports.rateLimit.consume(actor.subjectBindingHash)) throw new FounderLiveApiError("RATE_LIMITED", 429, "Zu viele Anfragen. Bitte versuche es später erneut.");
      const text = await request.text(); if (new TextEncoder().encode(text).length > ports.control.maxRequestBytes) throw new FounderLiveApiError("REQUEST_TOO_LARGE", 413, "Die Anfrage ist zu groß.");
      let body: unknown; try { body = JSON.parse(text); } catch { throw new FounderLiveApiError("INVALID_JSON", 400, "Die Anfrage enthält kein gültiges JSON."); }
      const execution = await executeFounderLiveDecision(body, actor, ports, { signal: abort.signal });
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

export function createFounderLivePostDeployEvidence(productionPlanHash: string) {
  return deepFreeze(FounderLivePostDeployEvidenceSchema.parse(withContentHash({ contractVersion: FOUNDER_LIVE_API_VERSIONS.postDeployEvidence, releaseHash: FOUNDER_LIVE_RELEASE.releaseHash, status: "NOT_EXECUTED_NO_PRODUCTION_AUTHORITY" as const, productionPlanHash, executionAuthorized: false as const, deploymentExecuted: false as const, migrationExecuted: false as const, functionChanged: false as const, authChanged: false as const, shadowTrafficActivated: false as const }, "evidenceHash")));
}
