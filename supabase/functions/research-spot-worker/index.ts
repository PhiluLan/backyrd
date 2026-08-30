import { createClient } from "npm:@supabase/supabase-js@2";
import { processOneResearchJob } from "../../../packages/spot-research-runtime/src/worker.mjs";
import { createSpotResearchRepository } from "../../../packages/spot-research-runtime/src/supabase-repository.mjs";
import { DEFAULT_RESEARCH_MODEL, diagnoseLegacyResearchPayload, diagnoseResearchSourcePayload, retrieveBackgroundResearchResponse } from "../../../packages/spot-research-runtime/src/index.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("SPOT_RESEARCH_AGENT_ENABLED") !== "true") return json({ error: "research_agent_disabled" }, 503);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!url || !serviceKey || !apiKey) return json({ error: "server_configuration_missing" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${serviceKey}`) return json({ error: "forbidden" }, 403);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* queue execution has no required body */ }
  const populationRunId = typeof body.populationRunId === "string" ? body.populationRunId : null;
  if (populationRunId !== null && !uuidPattern.test(populationRunId)) return json({ error: "population_run_invalid" }, 400);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const repository = createSpotResearchRepository(service, { populationRunId });
  if (body.action === "PROVIDER_HEALTH") {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: DEFAULT_RESEARCH_MODEL, store: false, background: false, reasoning: { effort: "low" }, input: "Return exactly OK.", max_output_tokens: 64 }) });
    let payload: Record<string, unknown> = {};try { payload = await response.json(); } catch { /* bounded health result below */ }
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const providerStatus = typeof payload.status === "string" ? payload.status : null,errorCode = typeof error.code === "string" ? error.code : null,ok = response.ok && providerStatus === "completed";
    return json({ ok, providerStatus, errorCode, canonicalProviderSecret: true, wroteCanonicalFacts: false }, ok ? 200 : 503);
  }
  if (body.action === "DIAGNOSE_LEGACY_RESPONSE" || body.action === "DIAGNOSE_SOURCE_RESPONSE") {
    const responseId = typeof body.responseId === "string" ? body.responseId : "";
    const { data: pass, error: passError } = await service.from("backyrd_spot_research_passes_v2").select("job_id,pass_key,provider_response_id").eq("provider_response_id", responseId).maybeSingle();
    if (passError || !pass || pass.provider_response_id !== responseId) return json({ error: "research_response_not_registered" }, 404);
    const { data: job, error: jobError } = await service.from("backyrd_spot_research_jobs_v1").select("id,spot_id,source_scope").eq("id", pass.job_id).single();
    if (jobError || !job) return json({ error: "research_job_not_found" }, 404);
    const context = await repository.loadContext({ spotId: job.spot_id, sourceScope: job.source_scope, passKey: pass.pass_key });
    const response = await retrieveBackgroundResearchResponse(responseId, { apiKey });
    const diagnostic = body.action === "DIAGNOSE_SOURCE_RESPONSE" ? diagnoseResearchSourcePayload(response.payload, context, pass.pass_key) : diagnoseLegacyResearchPayload(response.payload, context, pass.pass_key);
    return json({ responseId, providerStatus: response.providerStatus, providerErrorCode: response.errorCode, providerIncompleteReason: response.incompleteReason, diagnostic });
  }
  const runnerId = `research-edge:${crypto.randomUUID()}`;
  const started = Date.now();
  const results: unknown[] = [];
  while (Date.now() - started < 105_000) {
    const result = await processOneResearchJob({ repository, apiKey, runnerId });
    results.push(result);
    if (result.state === "IDLE" || result.state === "READY_FOR_REVIEW" || result.state === "FAILED") break;
    await pause(4_000);
  }
  return json({ runnerId, results });
});
