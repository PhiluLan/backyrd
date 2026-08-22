import { createClient } from "npm:@supabase/supabase-js@2";

const adminOrigins = new Set(["https://backyrd-intelligence.vercel.app"]);
const corsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  return adminOrigins.has(origin) ? {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600", vary: "Origin",
  } : {};
};
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...corsHeaders(request) } });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function kickWorker(url: string, serviceKey: string) {
  const task = fetch(`${url}/functions/v1/research-spot-worker`, { method: "POST", headers: { authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(task);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return adminOrigins.has(request.headers.get("origin") ?? "") ? new Response(null, { status: 204, headers: corsHeaders(request) }) : new Response(null, { status: 403 });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  if (Deno.env.get("SPOT_RESEARCH_AGENT_ENABLED") !== "true") return json(request, { error: "research_agent_disabled" }, 503);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json(request, { error: "server_configuration_missing" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  let body: { action?: "ENQUEUE" | "STATUS" | "DIAGNOSE_LAST_FAILURE"; spotId?: string; officialWebsite?: string };
  try { body = await request.json(); } catch { return json(request, { error: "invalid_json" }, 400); }
  if (!body.spotId || !uuidPattern.test(body.spotId)) return json(request, { error: "invalid_spot_id" }, 400);
  const action = body.action ?? "ENQUEUE";
  if (action === "DIAGNOSE_LAST_FAILURE") {
    const authorizationCheck = await userClient.rpc("backyrd_spot_research_job_status_v1", { p_spot_id: body.spotId });
    if (authorizationCheck.error) return json(request, { error: "research_admin_required" }, 403);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: job } = await service.from("backyrd_spot_research_jobs_v1").select("id").eq("spot_id", body.spotId).eq("contract_version", "backyrd-spot-research-agent-v2").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!job) return json(request, { error: "legacy_research_job_not_found" }, 404);
    const { data: pass } = await service.from("backyrd_spot_research_passes_v2").select("provider_response_id").eq("job_id", job.id).eq("pass_key", "B").maybeSingle();
    if (!pass?.provider_response_id) return json(request, { error: "legacy_provider_response_not_found" }, 404);
    const diagnosticResponse = await fetch(`${url}/functions/v1/research-spot-worker`, { method: "POST", headers: { authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: JSON.stringify({ action: "DIAGNOSE_LEGACY_RESPONSE", responseId: pass.provider_response_id }) });
    return json(request, await diagnosticResponse.json(), diagnosticResponse.status);
  }
  const rpcName = action === "STATUS" ? "backyrd_spot_research_job_status_v1" : "backyrd_enqueue_spot_research_job_v1";
  const args = action === "STATUS" ? { p_spot_id: body.spotId } : { p_spot_id: body.spotId, p_official_website: body.officialWebsite ?? null };
  const { data, error } = await userClient.rpc(rpcName, args);
  if (error) {
    const code = String(error.message).replace(/[^a-zA-Z0-9_:\-]/g, "_").slice(0, 160);
    const status = code.includes("admin_required") || code.includes("access_denied") || code.includes("authentication") ? 403 : code.includes("daily_limit") ? 429 : 422;
    return json(request, { error: code }, status);
  }
  if (data && ["QUEUED", "RUNNING"].includes(data.state)) kickWorker(url, serviceKey);
  return json(request, data ?? { state: "NONE", canonicalWrite: false }, action === "ENQUEUE" ? 202 : 200);
});
