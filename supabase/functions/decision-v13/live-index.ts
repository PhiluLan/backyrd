// Production-only internal-live wrapper. The frozen canonical v13 source is
// imported unchanged; this layer may only route its already-valid candidates.
import { createClient } from "npm:@supabase/supabase-js@2";
import { isInternalLiveUser, runInternalLiveDecision } from "./north-star-live.ts";
import { sanitizeLiveProductCandidate, sanitizeLiveProductRequestBody, selectLiveCandidateUniverse } from "../../../packages/decision-input-runtime/src/live-product-boundary.mjs";

type Handler = (request: Request) => Promise<Response> | Response;
let canonicalHandler: Handler | null = null;
const denoMutable = Deno as unknown as { serve: (handler: Handler) => unknown };
const realServe = denoMutable.serve.bind(Deno);
denoMutable.serve = (handler: Handler) => { canonicalHandler = handler; return undefined; };
await import("./index.ts");
denoMutable.serve = realServe;
if (!canonicalHandler) throw new Error("canonical_v13_handler_missing");

const bearer = (request: Request) => (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const text = (value: unknown) => { const result = String(value ?? "").trim(); return result || null; };

realServe(async (request: Request) => {
  const body = request.method === "POST" ? await request.clone().json().catch(() => ({})) : {};
  let service: ReturnType<typeof createClient> | null = null;
  let userId: string | null = null;
  let internalInvocation = false;
  let liveEnabled = false;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && serviceKey && request.method === "POST") {
      const configuredSecret = Deno.env.get("DECISION_ENGINE_INTERNAL_SECRET");
      internalInvocation = Boolean(configuredSecret && request.headers.get("x-backyrd-internal-secret") === configuredSecret);
      service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      if (internalInvocation) userId = text(request.headers.get("x-backyrd-test-user-id"));
      else {
        const token = bearer(request);
        if (token) {
          const { data: verified, error } = await service.auth.getUser(token);
          if (!error && verified.user) userId = verified.user.id;
        }
      }
      if (userId) liveEnabled = await isInternalLiveUser(service, userId, "DECISION");
    }
  } catch {
    service = null;
    userId = null;
    liveEnabled = false;
  }

  const canonicalHeaders = new Headers(request.headers);
  canonicalHeaders.delete("content-length");
  const canonicalRequest = liveEnabled
    ? new Request(request.url, { method: request.method, headers: canonicalHeaders, body: JSON.stringify(sanitizeLiveProductRequestBody(body)) })
    : request;
  const baseResponse = await canonicalHandler!(canonicalRequest);
  if (!baseResponse.ok || request.method !== "POST") return baseResponse;
  const payload = await baseResponse.clone().json().catch(() => null) as Record<string, unknown> | null;
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates as Array<Record<string, unknown>> : [];
  if (!payload?.ok || candidates.length === 0) return baseResponse;

  try {
    if (!liveEnabled || !service || !userId || (!internalInvocation && text(payload.user_id) !== userId)) return baseResponse;

    const selected = selectLiveCandidateUniverse(candidates, 10);
    const live = await runInternalLiveDecision({
      service,
      userId,
      city: text(body.city),
      moodA: text(body.moodA),
      moodB: text(body.moodB),
      requestContext: {
        inputMode: text(body.inputMode),
        rawFreeText: text(body.rawFreeText) ?? text(body.query),
        city: text(body.city),
        audience: Array.isArray(body.audience) ? body.audience : [],
        selectedAudiences: Array.isArray(body.audience) ? body.audience : [],
        selectedMoods: [text(body.moodA), text(body.moodB)].filter(Boolean),
        preferredPlaceTypes: body.preferredPlaceTypes ?? body.placeTypes ?? body.categories ?? [],
        excludedPlaceTypes: body.excludedPlaceTypes ?? body.avoidPlaceTypes ?? [],
        strictCategoryIntent: body.strictCategoryIntent === true,
        openNow: (payload.intent as Record<string, unknown> | undefined)?.openNow === true,
        explicitConstraints: { openNow: (payload.intent as Record<string, unknown> | undefined)?.openNow === true },
        intent: payload.intent ?? {},
      },
      candidates: selected.map((candidate) => ({ spotId: String(candidate.spot_id), why: text(candidate.human_reason) })),
      openAIKey: Deno.env.get("OPENAI_API_KEY") ?? null,
      learningEligible: !internalInvocation,
    });
    if (!live.active) return baseResponse;
    const byId = new Map(selected.map((candidate) => [String(candidate.spot_id), candidate]));
    const ordered = live.finalOrder.map((spotId, index) => {
      const candidate = byId.get(spotId);
      return candidate ? { ...sanitizeLiveProductCandidate(candidate, live.reasons[spotId]), rank: index + 1 } : null;
    }).filter(Boolean);
    const safeRequest = sanitizeLiveProductRequestBody(body);
    return new Response(JSON.stringify({
      ...payload,
      query: safeRequest.query,
      queryText: safeRequest.query,
      candidates: ordered,
      north_star: {
        active: true, decision_id: live.decisionId, final_source: live.finalSource,
        knowledge_mode: live.knowledgeMode, user_card_hash: live.userCardHash,
        package_hash: live.packageHash, deterministic_trace_id: live.deterministicTraceId,
        n6_trace_id: live.n6TraceId, n6_disposition: live.n6Disposition,
        fallback_error: live.errorCode ?? null,
      },
    }), { status: baseResponse.status, headers: baseResponse.headers });
  } catch {
    return baseResponse;
  }
});
