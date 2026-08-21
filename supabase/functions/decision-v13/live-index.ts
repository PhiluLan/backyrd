// Production-only internal-live wrapper. The frozen canonical v13 source is
// imported unchanged; this layer may only route its already-valid candidates.
import { createClient } from "npm:@supabase/supabase-js@2";
import { runInternalLiveDecision } from "./north-star-live.ts";

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
  const baseResponse = await canonicalHandler!(request);
  if (!baseResponse.ok || request.method !== "POST") return baseResponse;
  const payload = await baseResponse.clone().json().catch(() => null) as Record<string, unknown> | null;
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates as Array<Record<string, unknown>> : [];
  if (!payload?.ok || candidates.length === 0) return baseResponse;

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return baseResponse;
    const configuredSecret = Deno.env.get("DECISION_ENGINE_INTERNAL_SECRET");
    const internalInvocation = Boolean(configuredSecret && request.headers.get("x-backyrd-internal-secret") === configuredSecret);
    const internalUser = internalInvocation ? text(request.headers.get("x-backyrd-test-user-id")) : null;
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let userId = internalUser ?? text(payload.user_id);
    if (!internalInvocation) {
      const token = bearer(request);
      if (!token) return baseResponse;
      const { data: verified, error } = await service.auth.getUser(token);
      if (error || !verified.user || verified.user.id !== userId) return baseResponse;
      userId = verified.user.id;
    }
    if (!userId) return baseResponse;

    const selected = candidates.slice(0, Math.min(3, candidates.length));
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
        selectedAudiences: Array.isArray(body.audience) ? body.audience : [],
        selectedMoods: [text(body.moodA), text(body.moodB)].filter(Boolean),
        requestedPlaceTypes: body.preferredPlaceTypes ?? body.placeTypes ?? body.categories ?? [],
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
      return candidate ? { ...candidate, rank: index + 1, human_reason: live.reasons[spotId] ?? candidate.human_reason } : null;
    }).filter(Boolean);
    return new Response(JSON.stringify({
      ...payload,
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
