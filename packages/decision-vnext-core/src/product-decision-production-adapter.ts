import { createHash, createHmac } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  ProductDecisionLearningRecordSchema,
  type ProductDecisionLearningInput,
  type ProductDecisionLearningRecord,
  type ProductDecisionLearningRepository,
  type ProductProjectionReadProvider,
} from "@backyrd/user-intelligence-vnext-core";
import { canonicalJson, contentHash, deepFreeze } from "./canonical.js";
import {
  DecisionProductExecutionSchema,
  DecisionProductInteractionRequestSchema,
  type DecisionProductExecution,
  type DecisionProductInteractionRequest,
  type DecisionProductRequest,
} from "./product-decision-contracts.js";
import type {
  DecisionProductAuthenticatedActor,
  DecisionProductBuildInput,
  DecisionProductRuntimeBoundary,
  DecisionProductRuntimePorts,
} from "./product-decision.js";

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
  record(event: ProductDecisionLearningInput, signal?: AbortSignal): Promise<unknown>;
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
        return input.learningPort.record(event, signal);
      },
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
