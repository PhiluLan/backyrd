import { createClient } from "npm:@supabase/supabase-js@2";
import { processOneResearchJob } from "../../../packages/spot-research-runtime/src/worker.mjs";
import { createSpotResearchRepository } from "../../../packages/spot-research-runtime/src/supabase-repository.mjs";
import { diagnoseLegacyResearchPayload, retrieveBackgroundResearchResponse } from "../../../packages/spot-research-runtime/src/index.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("SPOT_RESEARCH_AGENT_ENABLED") !== "true") return json({ error: "research_agent_disabled" }, 503);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!url || !serviceKey || !apiKey) return json({ error: "server_configuration_missing" }, 503);
  if (request.headers.get("authorization") !== `Bearer ${serviceKey}`) return json({ error: "forbidden" }, 403);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const repository = createSpotResearchRepository(service);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* queue execution has no required body */ }
  if (body.action === "DIAGNOSE_LEGACY_RESPONSE") {
    const responseId = typeof body.responseId === "string" ? body.responseId : "";
    const { data: pass, error: passError } = await service.from("backyrd_spot_research_passes_v2").select("job_id,pass_key,provider_response_id").eq("provider_response_id", responseId).maybeSingle();
    if (passError || !pass || pass.provider_response_id !== responseId) return json({ error: "research_response_not_registered" }, 404);
    const { data: job, error: jobError } = await service.from("backyrd_spot_research_jobs_v1").select("id,spot_id,source_scope").eq("id", pass.job_id).single();
    if (jobError || !job) return json({ error: "research_job_not_found" }, 404);
    const context = await repository.loadContext({ spotId: job.spot_id, sourceScope: job.source_scope, passKey: pass.pass_key });
    const response = await retrieveBackgroundResearchResponse(responseId, { apiKey });
    return json({ responseId, providerStatus: response.providerStatus, diagnostic: diagnoseLegacyResearchPayload(response.payload, context, pass.pass_key) });
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
