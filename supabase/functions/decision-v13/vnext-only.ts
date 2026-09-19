import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  createDecisionProductProductionPorts,
  createDecisionProductRpcInteractionAuthorityProvider,
  createDecisionProductRpcEvaluationProvider,
  createDecisionProductRpcLearningPort,
  type DecisionProductAuthClient,
  type DecisionProductProductionConfiguration,
  type DecisionProductRpcClient,
} from "../../../packages/decision-vnext-core/dist/product-decision-production-adapter.js";
import { createDecisionProductHttpHandler } from "../../../packages/decision-vnext-core/dist/product-decision.js";

export const DECISION_V13_VNEXT_ONLY_ENTRYPOINT = "backyrd.decision-vnext.single-route@1.0" as const;

type ServiceClient = ReturnType<typeof createClient>;

const unavailable = () => new Response(JSON.stringify({
  contractVersion: "backyrd.decision-vnext.product-error@1.0",
  status: "UNAVAILABLE",
  error: { code: "DECISION_UNAVAILABLE", message: "Decision ist momentan nicht verfügbar. Bitte versuche es später erneut." },
  legacyFallbackUsed: false,
}), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`decision_vnext_configuration_missing:${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`decision_vnext_configuration_invalid:${name}`);
  return value;
}

function configuration(): DecisionProductProductionConfiguration {
  return {
    identity: {
      releaseHash: required("BACKYRD_DECISION_VNEXT_RELEASE_HASH"),
      artifactHash: required("BACKYRD_DECISION_VNEXT_ARTIFACT_HASH"),
      sourceSetHash: required("BACKYRD_DECISION_VNEXT_SOURCE_SET_HASH"),
      controlGeneration: positiveInteger("BACKYRD_DECISION_VNEXT_CONTROL_GENERATION", 1),
    },
    rateLimitOperation: "decision_v13_product",
    rateLimitSubjectKeyVersion: required("BACKYRD_DECISION_VNEXT_RATE_LIMIT_KEY_VERSION"),
    rateLimitSubjectKey: required("BACKYRD_DECISION_VNEXT_RATE_LIMIT_KEY"),
    idempotencyKeyVersion: required("BACKYRD_DECISION_VNEXT_IDEMPOTENCY_KEY_VERSION"),
    idempotencyKey: required("BACKYRD_DECISION_VNEXT_IDEMPOTENCY_KEY"),
    subjectMinuteLimit: positiveInteger("BACKYRD_DECISION_VNEXT_SUBJECT_MINUTE_LIMIT", 20),
    subjectDayLimit: positiveInteger("BACKYRD_DECISION_VNEXT_SUBJECT_DAY_LIMIT", 500),
    globalMinuteLimit: positiveInteger("BACKYRD_DECISION_VNEXT_GLOBAL_MINUTE_LIMIT", 300),
    globalDayLimit: positiveInteger("BACKYRD_DECISION_VNEXT_GLOBAL_DAY_LIMIT", 20_000),
    timeoutMilliseconds: positiveInteger("BACKYRD_DECISION_VNEXT_TIMEOUT_MS", 5_000),
    maxRequestBytes: positiveInteger("BACKYRD_DECISION_VNEXT_MAX_REQUEST_BYTES", 16_384),
    idempotencyTtlSeconds: positiveInteger("BACKYRD_DECISION_VNEXT_IDEMPOTENCY_TTL_SECONDS", 86_400),
  };
}

function rpcClient(service: ServiceClient): DecisionProductRpcClient {
  return {
    async rpc(name, parameters, signal) {
      if (signal.aborted) throw signal.reason ?? new Error("decision_vnext_aborted");
      const query = service.rpc(name, parameters as Record<string, unknown>);
      const abortable = query as typeof query & { abortSignal?: (value: AbortSignal) => typeof query };
      const result = await (typeof abortable.abortSignal === "function" ? abortable.abortSignal(signal) : query);
      if (signal.aborted) throw signal.reason ?? new Error("decision_vnext_aborted");
      return { data: result.data, error: result.error ? { message: result.error.message } : null };
    },
  };
}

function authClient(service: ServiceClient): DecisionProductAuthClient {
  return {
    async getUser(token, signal) {
      if (signal.aborted) return { user: null, error: { message: "aborted" } };
      const result = await service.auth.getUser(token);
      if (signal.aborted) return { user: null, error: { message: "aborted" } };
      return {
        user: result.data.user ? {
          id: result.data.user.id,
          role: result.data.user.role,
          is_anonymous: result.data.user.is_anonymous,
          banned_until: result.data.user.banned_until,
        } : null,
        error: result.error ? { message: result.error.message } : null,
      };
    },
  };
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const configured = (Deno.env.get("BACKYRD_DECISION_VNEXT_CORS_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(origin) ? origin : "DENIED";
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "origin");
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

Deno.serve(async (request: Request) => {
  const origin = allowedOrigin(request);
  if (origin === "DENIED") return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204, headers: { "cache-control": "no-store" } }), origin);
  try {
    const service = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc = rpcClient(service);
    // Fresh ports per request: the authenticated actor is request-local and
    // can never leak across concurrent Edge requests.
    const config = configuration();
    const ports = createDecisionProductProductionPorts({
      rpc,
      authClient: authClient(service),
      evaluationProvider: createDecisionProductRpcEvaluationProvider(rpc),
      interactionAuthority: createDecisionProductRpcInteractionAuthorityProvider(rpc),
      learningPort: createDecisionProductRpcLearningPort(rpc, config.identity),
      configuration: config,
    });
    return withCors(await createDecisionProductHttpHandler({
      ...ports,
      diagnostics: { reportFailure(stage, code) {
        // Fixed-shape operational signal only: no token, actor, query text, or SQL error detail.
        console.error(JSON.stringify({ event: "decision_vnext_failure", stage, code }));
      } },
    })(request), origin);
  } catch {
    return withCors(unavailable(), origin);
  }
});
