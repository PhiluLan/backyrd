import { createHash, createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  CONTRACT_VERSIONS,
  ProductDecisionLearningInputSchema,
  ProductDecisionLearningReceiptSchema,
  ProductDecisionLearningRecordSchema,
  parseConsentEnvelope,
  parseRelevantUserProjection,
  projectionHashBody,
  type ProductDecisionLearningInput,
  type ProductDecisionLearningRecord,
  type ProductDecisionLearningRepository,
  type ProductProjectionReadProvider,
  type RelevantUserProjection,
} from "@backyrd/user-intelligence-vnext-core";
import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import {
  DecisionProductExecutionSchema,
  DecisionProductInteractionRequestSchema,
  type DecisionProductExecution,
  type DecisionProductInteractionRequest,
  type DecisionProductRequest,
} from "./product-v1-contracts.js";
import type {
  DecisionProductAuthenticatedActor,
  DecisionProductBuildInput,
  DecisionProductRuntimeBoundary,
  DecisionProductRuntimePorts,
} from "./product-decision.js";
import { evaluateProductWorldViews, PRODUCT_V1_EVALUATOR_VERSION } from "./product-v1-evaluator.js";
import { parseProductWorldResolverBinding } from "./product-world-resolver-binding.js";

const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-z0-9][a-z0-9._:-]{1,79}$/;

export const DECISION_PRODUCT_PRODUCTION_ADAPTER_VERSION = "backyrd.decision-vnext.product-production-adapter@1.0" as const;
export const DECISION_PRODUCT_RUNTIME_CONTROL_VERSION = "backyrd.decision-vnext.product-runtime-control@1.0" as const;
export const DECISION_PRODUCT_PRODUCTION_RPCS = Object.freeze({
  control: "backyrd_decision_vnext_product_control_v1",
  rateLimit: "backyrd_consume_launch_cost_boundary_v1",
  idempotency: "backyrd_decision_vnext_product_idempotency_commit_v1",
  projection: "backyrd_decision_vnext_product_projection_v1",
  learning: "backyrd_decision_vnext_product_learning_append_v1",
  interactionAuthority: "backyrd_decision_vnext_product_interaction_authority_v1",
  runtimeContext: "backyrd_decision_vnext_product_context_v1",
  learningEvent: "backyrd_decision_vnext_product_learning_event_v1",
} as const);

export interface DecisionProductProductionIdentity {
  readonly releaseHash: string;
  readonly artifactHash: string;
  readonly sourceSetHash: string;
  readonly controlGeneration: number;
}

export interface DecisionProductProductionConfiguration {
  readonly identity: DecisionProductProductionIdentity;
  readonly rateLimitOperation: string;
  readonly rateLimitSubjectKeyVersion: string;
  readonly rateLimitSubjectKey: string;
  readonly idempotencyKeyVersion: string;
  readonly idempotencyKey: string;
  readonly subjectMinuteLimit: number;
  readonly subjectDayLimit: number;
  readonly globalMinuteLimit: number;
  readonly globalDayLimit: number;
  readonly timeoutMilliseconds?: number;
  readonly maxRequestBytes?: number;
  readonly idempotencyTtlSeconds?: number;
}

export interface DecisionProductRpcClient {
  rpc(name: string, parameters: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<{
    readonly data: unknown;
    readonly error: { readonly message?: string } | null;
  }>;
}

export interface DecisionProductAuthClient {
  getUser(token: string, signal: AbortSignal): Promise<{
    readonly user: null | { readonly id?: unknown; readonly role?: unknown; readonly is_anonymous?: unknown; readonly banned_until?: unknown };
    readonly error: { readonly message?: string } | null;
  }>;
}

export interface DecisionProductCanonicalEvaluationProvider {
  readonly contractVersion: "backyrd.decision-vnext.product-canonical-evaluation-provider@1.0";
  evaluate(input: {
    readonly request: DecisionProductRequest;
    readonly actor: DecisionProductAuthenticatedActor;
    readonly identity: DecisionProductProductionIdentity;
    readonly signal: AbortSignal;
  }): Promise<Omit<DecisionProductBuildInput, "request" | "actor">>;
}

export interface DecisionProductCanonicalLearningPort {
  readonly contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0";
  record(event: ProductDecisionLearningInput, signal?: AbortSignal, actor?: DecisionProductAuthenticatedActor): Promise<unknown>;
}

export interface DecisionProductInteractionAuthorityProvider {
  readonly contractVersion: "backyrd.decision-vnext.product-interaction-authority-provider@1.0";
  resolve(input: {
    readonly request: DecisionProductInteractionRequest;
    readonly actor: DecisionProductAuthenticatedActor;
    readonly identity: DecisionProductProductionIdentity;
    readonly signal: AbortSignal;
  }): Promise<
    { readonly status: "AUTHORIZED"; readonly sessionId: string; readonly spotId: string; readonly contextBindingHash: string; readonly occurredAt: string }
    | { readonly status: "SUPPRESSED_NO_CONSENT" }
  >;
}

type CurrentActor = { value: DecisionProductAuthenticatedActor | null };

function assertHash(name: string, value: string): void {
  if (!HASH.test(value)) throw new Error(`product_production_${name}_invalid`);
}

function assertConfiguration(input: DecisionProductProductionConfiguration): void {
  assertHash("release_hash", input.identity.releaseHash);
  assertHash("artifact_hash", input.identity.artifactHash);
  assertHash("source_set_hash", input.identity.sourceSetHash);
  if (!Number.isSafeInteger(input.identity.controlGeneration) || input.identity.controlGeneration < 1) throw new Error("product_production_control_generation_invalid");
  if (!TOKEN.test(input.rateLimitOperation) || !TOKEN.test(input.rateLimitSubjectKeyVersion) || !TOKEN.test(input.idempotencyKeyVersion)) throw new Error("product_production_key_identity_invalid");
  if (Buffer.byteLength(input.rateLimitSubjectKey, "utf8") < 32) throw new Error("product_production_rate_limit_key_invalid");
  if (Buffer.byteLength(input.idempotencyKey, "utf8") < 32) throw new Error("product_production_idempotency_key_invalid");
  const limits = [input.subjectMinuteLimit, input.subjectDayLimit, input.globalMinuteLimit, input.globalDayLimit];
  if (limits.some((value) => !Number.isSafeInteger(value) || value < 1)
    || input.subjectDayLimit < input.subjectMinuteLimit || input.globalMinuteLimit < input.subjectMinuteLimit
    || input.globalDayLimit < input.globalMinuteLimit) throw new Error("product_production_rate_limits_invalid");
  const timeout = input.timeoutMilliseconds ?? 5_000;
  const bytes = input.maxRequestBytes ?? 16_384;
  const ttl = input.idempotencyTtlSeconds ?? 86_400;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 30_000
    || !Number.isSafeInteger(bytes) || bytes < 1_024 || bytes > 65_536
    || !Number.isSafeInteger(ttl) || ttl < 1 || ttl > 86_400) throw new Error("product_production_bounds_invalid");
}

function row(value: unknown, error: string): Record<string, unknown> {
  const selected = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) throw new Error(error);
  return selected as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string, error: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) throw new Error(error);
  return field;
}

function parseJwtClaims(token: string, now: Date): { subject: string; sessionId: string; issuedAt: string; expiresAt: string } | null {
  if (!token || token.length > 16_384 || /\s/.test(token)) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const subject = claims.sub; const sessionId = claims.session_id; const issuedAt = claims.iat; const expiresAt = claims.exp;
    const audience = claims.aud;
    if (typeof subject !== "string" || !UUID.test(subject) || typeof sessionId !== "string" || !UUID.test(sessionId)
      || typeof issuedAt !== "number" || !Number.isSafeInteger(issuedAt) || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)
      || issuedAt > Math.floor(now.getTime() / 1_000) || expiresAt <= Math.floor(now.getTime() / 1_000)
      || claims.role !== "authenticated" || !(audience === "authenticated" || (Array.isArray(audience) && audience.includes("authenticated")))) return null;
    return { subject: subject.toLowerCase(), sessionId: sessionId.toLowerCase(), issuedAt: new Date(issuedAt * 1_000).toISOString(), expiresAt: new Date(expiresAt * 1_000).toISOString() };
  } catch { return null; }
}

function hmac(key: string, scope: string, value: string): string {
  return createHmac("sha256", key).update(`${scope}:${value}`, "utf8").digest("hex");
}

function createControl(input: { readonly rpc: DecisionProductRpcClient; readonly configuration: DecisionProductProductionConfiguration }) {
  const expected = input.configuration.identity;
  return Object.freeze({
    timeoutMilliseconds: input.configuration.timeoutMilliseconds ?? 5_000,
    maxRequestBytes: input.configuration.maxRequestBytes ?? 16_384,
    async assertBoundary(_boundary: DecisionProductRuntimeBoundary, signal: AbortSignal): Promise<void> {
      if (signal.aborted) throw signal.reason ?? new Error("product_runtime_aborted");
      const result = await input.rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.control, {
        p_release_hash: expected.releaseHash, p_artifact_hash: expected.artifactHash,
        p_source_set_hash: expected.sourceSetHash, p_generation: expected.controlGeneration,
      }, signal);
      if (result.error) throw new Error("product_runtime_control_unavailable");
      const value = row(result.data, "product_runtime_control_invalid");
      if (value.contractVersion !== DECISION_PRODUCT_RUNTIME_CONTROL_VERSION || value.state !== "ON"
        || value.enabled !== true || value.killSwitch !== false || value.releaseHash !== expected.releaseHash
        || value.artifactHash !== expected.artifactHash || value.sourceSetHash !== expected.sourceSetHash
        || value.generation !== expected.controlGeneration) throw new Error("product_runtime_control_denied");
      if (signal.aborted) throw signal.reason ?? new Error("product_runtime_aborted");
    },
  });
}

/** Request-scoped production assembly. There is no Founder, legacy, synthetic, dual-run or fallback path. */
export function createDecisionProductProductionPorts(input: {
  readonly rpc: DecisionProductRpcClient;
  readonly authClient: DecisionProductAuthClient;
  readonly evaluationProvider: DecisionProductCanonicalEvaluationProvider;
  readonly interactionAuthority: DecisionProductInteractionAuthorityProvider;
  readonly learningPort: DecisionProductCanonicalLearningPort;
  readonly configuration: DecisionProductProductionConfiguration;
  readonly now?: () => Date;
}): DecisionProductRuntimePorts {
  assertConfiguration(input.configuration);
  if (input.evaluationProvider.contractVersion !== "backyrd.decision-vnext.product-canonical-evaluation-provider@1.0") throw new Error("product_production_evaluation_provider_invalid");
  if (input.interactionAuthority.contractVersion !== "backyrd.decision-vnext.product-interaction-authority-provider@1.0") throw new Error("product_production_interaction_provider_invalid");
  if (input.learningPort.contractVersion !== "backyrd.user-intelligence.product-decision-learning-port@1.0") throw new Error("product_production_learning_port_invalid");
  const now = input.now ?? (() => new Date());
  const currentActor: CurrentActor = { value: null };
  const identity = input.configuration.identity;
  return deepFreeze({
    control: createControl({ rpc: input.rpc, configuration: input.configuration }),
    auth: {
      async authenticate(token: string, signal: AbortSignal): Promise<DecisionProductAuthenticatedActor | null> {
        const claims = parseJwtClaims(token, now());
        if (!claims || signal.aborted) return null;
        const verified = await input.authClient.getUser(token, signal);
        if (signal.aborted || verified.error || !verified.user || verified.user.id?.toString().toLowerCase() !== claims.subject
          || verified.user.role !== "authenticated" || verified.user.is_anonymous === true
          || (typeof verified.user.banned_until === "string" && Date.parse(verified.user.banned_until) > now().getTime())) return null;
        const subjectBindingHash = contentHash({ namespace: "decision-product-subject@1.0", verifiedUserId: claims.subject });
        const sessionBindingHash = contentHash({ namespace: "decision-product-session@1.0", subjectBindingHash, sessionId: claims.sessionId });
        const actor = deepFreeze({ userId: claims.subject, subjectBindingHash, sessionId: claims.sessionId, sessionBindingHash,
          authenticationContextHash: contentHash({ namespace: "decision-product-auth-context@1.0", subjectBindingHash, sessionId: claims.sessionId, issuedAt: claims.issuedAt, expiresAt: claims.expiresAt }) });
        currentActor.value = actor;
        return actor;
      },
    },
    rateLimit: {
      async consume(subjectBindingHash: string, signal: AbortSignal): Promise<boolean> {
        if (!currentActor.value || currentActor.value.subjectBindingHash !== subjectBindingHash || signal.aborted) throw new Error("product_rate_limit_actor_unbound");
        const subjectKey = hmac(input.configuration.rateLimitSubjectKey, `backyrd-decision-product-rate-limit@1.0:${input.configuration.rateLimitSubjectKeyVersion}`, subjectBindingHash);
        const result = await input.rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.rateLimit, {
          p_operation: input.configuration.rateLimitOperation, p_subject_key: subjectKey,
          p_subject_minute_limit: input.configuration.subjectMinuteLimit, p_subject_day_limit: input.configuration.subjectDayLimit,
          p_global_minute_limit: input.configuration.globalMinuteLimit, p_global_day_limit: input.configuration.globalDayLimit,
        }, signal);
        if (result.error) throw new Error("product_rate_limit_store_unavailable");
        const value = row(result.data, "product_rate_limit_result_invalid");
        if (value.allowed === true) return true;
        if (value.allowed === false && ["subject_minute", "subject_day", "global_minute", "global_day"].includes(String(value.blockedScope))) return false;
        throw new Error("product_rate_limit_result_invalid");
      },
    },
    async evaluate(request: DecisionProductRequest, actor: DecisionProductAuthenticatedActor, signal: AbortSignal) {
      if (!currentActor.value || canonicalJson(currentActor.value) !== canonicalJson(actor) || signal.aborted) throw new Error("product_evaluation_actor_unbound");
      return input.evaluationProvider.evaluate({ request, actor, identity, signal });
    },
    idempotency: {
      async commit(commitInput: { subjectBindingHash: string; idempotencyKey: string; payloadHash: string; execution: DecisionProductExecution }, signal: AbortSignal) {
        const actor = currentActor.value;
        if (!actor || actor.subjectBindingHash !== commitInput.subjectBindingHash || signal.aborted) throw new Error("product_idempotency_actor_unbound");
        assertHash("payload_hash", commitInput.payloadHash);
        const execution = DecisionProductExecutionSchema.parse(commitInput.execution);
        const responseEnvelopeBytes = canonicalJson(execution);
        const responseHash = createHash("sha256").update(responseEnvelopeBytes, "utf8").digest("hex");
        const scope = `backyrd-decision-product-idempotency@1.0:${input.configuration.idempotencyKeyVersion}:${identity.releaseHash}`;
        const result = await input.rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.idempotency, {
          p_purpose: "PRODUCT_DECISION_VNEXT_EVALUATION", p_auth_user_id: actor.userId,
          // subjectBindingHash is already a one-way server binding and is the
          // exact join key used by the server-ledger interaction authority.
          p_subject_digest: commitInput.subjectBindingHash,
          p_idempotency_key_digest: hmac(input.configuration.idempotencyKey, `${scope}:key`, commitInput.idempotencyKey),
          p_payload_hash: commitInput.payloadHash, p_response_contract_version: execution.response.contractVersion,
          p_release_hash: identity.releaseHash, p_artifact_hash: identity.artifactHash, p_source_set_hash: identity.sourceSetHash,
          p_generation: identity.controlGeneration, p_response_envelope_bytes: responseEnvelopeBytes,
          p_response_hash: responseHash, p_ttl_seconds: input.configuration.idempotencyTtlSeconds ?? 86_400,
        }, signal);
        if (result.error) throw new Error("product_idempotency_store_unavailable");
        const value = row(result.data, "product_idempotency_result_invalid");
        if (value.status === "CREATED") {
          if (value.responseHash !== responseHash) throw new Error("product_idempotency_created_hash_mismatch");
          return { status: "CREATED" } as const;
        }
        if (value.status === "CONFLICT" || value.status === "EXPIRED") return { status: value.status } as const;
        if (value.status !== "REPLAYED") throw new Error("product_idempotency_result_invalid");
        const storedBytes = stringField(value, "responseEnvelopeBytes", "product_idempotency_replay_invalid");
        const storedHash = stringField(value, "responseHash", "product_idempotency_replay_invalid");
        if (createHash("sha256").update(storedBytes, "utf8").digest("hex") !== storedHash) throw new Error("product_idempotency_replay_hash_mismatch");
        let stored: unknown; try { stored = JSON.parse(storedBytes); } catch { throw new Error("product_idempotency_replay_invalid"); }
        return { status: "REPLAYED", execution: DecisionProductExecutionSchema.parse(stored) } as const;
      },
    },
    interaction: {
      async resolve(interactionInput, signal) {
        if (!currentActor.value || canonicalJson(currentActor.value) !== canonicalJson(interactionInput.actor) || signal.aborted) throw new Error("product_interaction_actor_unbound");
        return input.interactionAuthority.resolve({ request: interactionInput.request, actor: interactionInput.actor, identity, signal });
      },
    },
    learning: {
      contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0" as const,
      async record(event: ProductDecisionLearningInput, signal: AbortSignal) {
        if (!currentActor.value || signal.aborted || event.sessionId !== currentActor.value.sessionId) throw new Error("product_learning_actor_unbound");
        return input.learningPort.record(event, signal, currentActor.value);
      },
    },
  });
}

const neutralSubjectBindingHash = contentHash("backyrd.user-intelligence.neutral-subject-binding@1.0");
const productProjectionManifest = Object.freeze({
  manifestId: "backyrd-product-runtime-projection-manifest-v1",
  manifestHash: contentHash({ authority: "CANONICAL_USER_CARD", version: 1 }),
});

function productTargetCity(request: DecisionProductRequest): string {
  if (request.explicit.targetCity) return request.explicit.targetCity;
  const normalized = request.naturalLanguage.normalize("NFKC").toLocaleLowerCase("de-CH");
  if (normalized.includes("zürich") || normalized.includes("zurich")) return "Zurich";
  if (normalized.includes("basel")) return "Basel";
  throw new Error("product_target_area_required");
}

function productProjection(input: {
  readonly request: DecisionProductRequest;
  readonly actor: DecisionProductAuthenticatedActor;
  readonly serverTime: string;
  readonly context: Record<string, unknown>;
}) {
  const decisionId = `decision-${contentHash({ requestId: input.request.requestId, idempotencyKey: input.request.idempotencyKey }).slice(0, 32)}`;
  const snapshot = input.context.snapshot && typeof input.context.snapshot === "object" && !Array.isArray(input.context.snapshot)
    ? input.context.snapshot as Record<string, unknown> : null;
  const consentValue = input.context.consent;
  const consent = consentValue && typeof consentValue === "object" ? parseConsentEnvelope(consentValue) : null;
  const active = input.context.status === "ACTIVE" && consent?.state === "GRANTED" && snapshot !== null;
  const rawNodes = active && Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,239}$/;
  const registryVersion = typeof snapshot?.runtimeVersion === "string" && identifier.test(snapshot.runtimeVersion) ? snapshot.runtimeVersion : "backyrd-product-user-concepts-v1";
  const taste = active ? rawNodes.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const node = raw as Record<string, unknown>; const concept = node.concept;
    const affinity = Number(node.affinity); const confidence = Number(node.confidence);
    if (typeof concept !== "string" || !identifier.test(concept) || !Number.isFinite(affinity) || affinity < -1 || affinity > 1 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return [];
    const scopeValue = node.scope && typeof node.scope === "object" && !Array.isArray(node.scope) ? node.scope as Record<string, unknown> : {};
    const kind = ["GLOBAL", "PLACE_TYPE", "CONTEXT"].includes(String(scopeValue.kind)) ? String(scopeValue.kind) as "GLOBAL" | "PLACE_TYPE" | "CONTEXT" : "GLOBAL";
    const reference = typeof scopeValue.key === "string" && identifier.test(scopeValue.key) && kind !== "GLOBAL" ? scopeValue.key : undefined;
    const reasonCode: "PORTABLE_GLOBAL" | "EXACT_CONTEXT" = kind === "GLOBAL" ? "PORTABLE_GLOBAL" : "EXACT_CONTEXT";
    return [{ concept: { contractVersion: CONTRACT_VERSIONS.userConceptReference, registryVersion, conceptId: concept }, scope: { kind, ...(reference ? { reference } : {}) }, affinity, confidence, reason: { code: reasonCode, subjectRef: String(node.nodeKey ?? concept), policyRef: "backyrd-product-runtime-projection-policy-v1" } }];
  }).slice(0, 32) : [];
  const snapshotId = typeof snapshot?.snapshotId === "string" ? snapshot.snapshotId : null;
  const snapshotHash = typeof snapshot?.snapshotHash === "string" && HASH.test(snapshot.snapshotHash) ? snapshot.snapshotHash : null;
  const isActive = active && snapshotId !== null && snapshotHash !== null && taste.length > 0;
  const neutralReason: RelevantUserProjection["neutralReason"] = isActive ? null : input.context.status === "NO_CONSENT" ? "NO_CONSENT" : active ? "COLD_START" : "MISSING_SNAPSHOT";
  const body = {
    contractVersion: CONTRACT_VERSIONS.projection,
    projectionId: `product-projection-${contentHash({ decisionId, snapshotHash, neutralReason }).slice(0, 32)}`,
    decisionId,
    subjectBindingHash: isActive ? input.actor.subjectBindingHash : neutralSubjectBindingHash,
    snapshot: isActive ? { snapshotId: snapshotId!, snapshotHash: snapshotHash! } : neutralReason === "COLD_START" && snapshotId && snapshotHash ? { snapshotId, snapshotHash } : null,
    manifest: productProjectionManifest,
    status: isActive ? "ACTIVE" as const : "NEUTRAL" as const,
    neutralReason,
    taste: isActive ? taste : [], practical: [], directSpot: [], domainSufficiency: [],
    knowledgeLevel: isActive ? "PARTIAL" as const : "UNKNOWN" as const,
    suppression: neutralReason === "NO_CONSENT" || neutralReason === "MISSING_SNAPSHOT" ? { total: 0, byReason: [] } : neutralReason ? { total: 1, byReason: [{ code: neutralReason, count: 1 }] } : { total: 0, byReason: [] },
    boundaries: { rawEventsIncluded: false as const, reviewTextIncluded: false as const, rawLocationIncluded: false as const, privateSocialDataIncluded: false as const, eligibilityAuthority: false as const, rankingAuthority: false as const },
    budgets: { maxItems: 32, maxBytes: 65536, actualItems: isActive ? taste.length : 0, canonicalPayloadBytes: 0 },
    technicalMetadata: { createdAt: input.serverTime },
  };
  const measured = { ...body, budgets: { ...body.budgets, canonicalPayloadBytes: Buffer.byteLength(canonicalJson(projectionHashBody(body)), "utf8") } };
  return parseRelevantUserProjection({ ...measured, projectionHash: contentHash(projectionHashBody(measured)) });
}

// The public response stays fail-closed. Only a fixed, data-free stage code
// crosses into operational diagnostics; never log a claim, actor or raw error.
function productEvaluationStage<T>(stage: "world_binding" | "user_projection" | "ranking", run: () => T): T {
  try { return run(); }
  catch (error) {
    if (error instanceof Error && /^product_[a-z0-9_]{1,75}$/.test(error.message)) throw error;
    throw new Error(`product_evaluation_${stage}_invalid`);
  }
}

/** Canonical Product composition over service-only World/User RPCs. */
export function createDecisionProductRpcEvaluationProvider(rpc: DecisionProductRpcClient): DecisionProductCanonicalEvaluationProvider {
  return Object.freeze({
    contractVersion: "backyrd.decision-vnext.product-canonical-evaluation-provider@1.0" as const,
    async evaluate(input: Parameters<DecisionProductCanonicalEvaluationProvider["evaluate"]>[0]) {
      const targetCity = productTargetCity(input.request);
      const result = await rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.runtimeContext, {
        p_auth_user_id: input.actor.userId, p_subject_binding_hash: input.actor.subjectBindingHash,
        p_target_city: targetCity, p_release_hash: input.identity.releaseHash,
        p_artifact_hash: input.identity.artifactHash, p_source_set_hash: input.identity.sourceSetHash,
        p_generation: input.identity.controlGeneration,
      }, input.signal);
      if (result.error) throw new Error("product_runtime_context_unavailable");
      const context = row(result.data, "product_runtime_context_invalid");
      if (context.contractVersion !== "backyrd.decision-vnext.product-runtime-context@1.0" || context.authorizedCity !== targetCity || typeof context.serverTime !== "string" || !Number.isFinite(Date.parse(context.serverTime))) throw new Error("product_runtime_context_invalid");
      const serverTime = new Date(context.serverTime).toISOString();
      const rawSnapshots = Array.isArray(context.worldSnapshots) ? context.worldSnapshots : [];
      const snapshots = new Map<string, ReturnType<typeof parseProductWorldResolverBinding>>();
      for (const raw of rawSnapshots) {
        const snapshot = productEvaluationStage("world_binding", () => parseProductWorldResolverBinding(raw, targetCity));
        if (snapshots.has(snapshot.spot.spotId)) throw new Error("product_world_snapshot_duplicate");
        snapshots.set(snapshot.spot.spotId, snapshot);
      }
      const candidateIds = [...snapshots.keys()].sort();
      if (!candidateIds.length || candidateIds.length > 1000) throw new Error("product_world_candidate_set_invalid");
      const projection = productEvaluationStage("user_projection", () => productProjection({ request: input.request, actor: input.actor, serverTime, context }));
      const evaluated = productEvaluationStage("ranking", () => evaluateProductWorldViews(input.request, { authorizedCity: targetCity, serverTime }, projection, [...snapshots.values()], contentHash(candidateIds)));
      return { ...evaluated, projection, authority: { serverTime, authorizedCity: targetCity, locationBindingHash: contentHash({ authorizedCity: targetCity, subjectBindingHash: input.actor.subjectBindingHash, worldCandidateSetHash: contentHash(candidateIds) }) }, evaluatorContractVersion: PRODUCT_V1_EVALUATOR_VERSION };
    },
  });
}

/** Exact event transport; the database derives User×Decision×Context×Candidate authority from the sealed decision ledger. */
export function createDecisionProductRpcLearningPort(rpc: DecisionProductRpcClient, identity: DecisionProductProductionIdentity): DecisionProductCanonicalLearningPort {
  return Object.freeze({
    contractVersion: "backyrd.user-intelligence.product-decision-learning-port@1.0" as const,
    async record(raw: ProductDecisionLearningInput, signal?: AbortSignal, actor?: DecisionProductAuthenticatedActor) {
      if (!signal || !actor) throw new Error("product_learning_actor_unbound");
      const event = ProductDecisionLearningInputSchema.parse(raw);
      const result = await rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.learningEvent, {
        p_auth_user_id: actor.userId, p_subject_binding_hash: actor.subjectBindingHash,
        p_authentication_context_hash: actor.authenticationContextHash, p_event: event,
        p_release_hash: identity.releaseHash, p_artifact_hash: identity.artifactHash,
        p_source_set_hash: identity.sourceSetHash, p_generation: identity.controlGeneration,
      }, signal);
      if (result.error) throw new Error("product_learning_authority_unavailable");
      return ProductDecisionLearningReceiptSchema.parse(row(result.data, "product_learning_receipt_invalid"));
    },
  });
}

/** Exact service-only projection reader for the canonical User projection port. */
export function createDecisionProductRpcProjectionProvider(input: {
  readonly rpc: DecisionProductRpcClient; readonly identity: DecisionProductProductionIdentity;
  readonly actor: Pick<DecisionProductAuthenticatedActor, "userId" | "subjectBindingHash">; readonly signal: () => AbortSignal;
}): ProductProjectionReadProvider {
  return Object.freeze({
    contractVersion: "backyrd.user-intelligence.product-projection-read-provider@1.0" as const,
    async read(request: { readonly authUserId: string; readonly requestHash: string; readonly consentHash: string }) {
      if (request.authUserId !== input.actor.userId) throw new Error("product_projection_actor_unbound");
      const result = await input.rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.projection, {
        p_auth_user_id: input.actor.userId, p_request_hash: request.requestHash, p_consent_hash: request.consentHash,
        p_subject_binding_hash: input.actor.subjectBindingHash, p_release_hash: input.identity.releaseHash,
        p_artifact_hash: input.identity.artifactHash, p_source_set_hash: input.identity.sourceSetHash,
        p_generation: input.identity.controlGeneration,
      }, input.signal());
      if (result.error) throw new Error("product_projection_store_unavailable");
      const value = row(result.data, "product_projection_result_invalid");
      if (value.status === "ACTIVE" && value.neutralReason === null && value.envelope) return value.envelope;
      if (value.status === "NEUTRAL" && ["KILL_SWITCH", "NO_CONSENT", "MISSING_SNAPSHOT"].includes(String(value.neutralReason)) && value.envelope === null) throw new Error(`product_projection_neutral:${String(value.neutralReason)}`);
      throw new Error("product_projection_result_invalid");
    },
  });
}

/** Exact N2-outbox repository. The DB receives canonical record BODY bytes only. */
export function createDecisionProductRpcLearningRepository(input: {
  readonly rpc: DecisionProductRpcClient; readonly identity: DecisionProductProductionIdentity; readonly signal: () => AbortSignal;
}): ProductDecisionLearningRepository {
  return Object.freeze({
    contractVersion: "backyrd.user-intelligence.product-decision-learning-repository@1.0" as const,
    async append(raw: ProductDecisionLearningRecord) {
      const record = ProductDecisionLearningRecordSchema.parse(raw);
      const { recordHash, ...body } = record;
      const recordBodyBytes = canonicalJson(body);
      if (createHash("sha256").update(recordBodyBytes, "utf8").digest("hex") !== recordHash) throw new Error("product_learning_record_hash_invalid");
      const result = await input.rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.learning, {
        p_record_bytes: recordBodyBytes, p_release_hash: input.identity.releaseHash,
        p_artifact_hash: input.identity.artifactHash, p_source_set_hash: input.identity.sourceSetHash,
        p_generation: input.identity.controlGeneration,
      }, input.signal());
      if (result.error) throw new Error("product_learning_store_unavailable");
      const value = row(result.data, "product_learning_receipt_invalid");
      if (!["PERSISTED", "REPLAYED"].includes(String(value.status)) || value.eventId !== record.eventId || value.recordHash !== recordHash) throw new Error("product_learning_receipt_invalid");
      return { status: value.status as "PERSISTED" | "REPLAYED", eventId: record.eventId, recordHash };
    },
  });
}

/** Same-route server-ledger authority. No client-supplied session/context is trusted. */
export function createDecisionProductRpcInteractionAuthorityProvider(rpc: DecisionProductRpcClient): DecisionProductInteractionAuthorityProvider {
  return Object.freeze({
    contractVersion: "backyrd.decision-vnext.product-interaction-authority-provider@1.0" as const,
    async resolve(input: Parameters<DecisionProductInteractionAuthorityProvider["resolve"]>[0]) {
      const request = DecisionProductInteractionRequestSchema.parse(input.request);
      const result = await rpc.rpc(DECISION_PRODUCT_PRODUCTION_RPCS.interactionAuthority, {
        p_auth_user_id: input.actor.userId, p_subject_binding_hash: input.actor.subjectBindingHash,
        p_decision_id: request.decisionId, p_candidate_id: request.candidateId,
        p_release_hash: input.identity.releaseHash, p_artifact_hash: input.identity.artifactHash,
        p_source_set_hash: input.identity.sourceSetHash, p_generation: input.identity.controlGeneration,
      }, input.signal);
      if (result.error) throw new Error("product_interaction_authority_unavailable");
      const value = row(result.data, "product_interaction_authority_invalid");
      if (value.status === "SUPPRESSED_NO_CONSENT" && Object.keys(value).length === 1) return deepFreeze({ status: "SUPPRESSED_NO_CONSENT" as const });
      if (value.status !== "AUTHORIZED") throw new Error("product_interaction_authority_invalid");
      const sessionId = stringField(value, "sessionId", "product_interaction_authority_invalid");
      const spotId = stringField(value, "spotId", "product_interaction_authority_invalid");
      const contextBindingHash = stringField(value, "contextBindingHash", "product_interaction_authority_invalid");
      const occurredAt = stringField(value, "occurredAt", "product_interaction_authority_invalid");
      if (sessionId !== input.actor.sessionId || spotId !== request.candidateId || !HASH.test(contextBindingHash) || !Number.isFinite(Date.parse(occurredAt))) throw new Error("product_interaction_authority_invalid");
      return deepFreeze({ status: "AUTHORIZED" as const, sessionId, spotId, contextBindingHash, occurredAt });
    },
  });
}
