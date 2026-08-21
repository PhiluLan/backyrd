import { createClient } from "npm:@supabase/supabase-js@2";
import { callResearchProvider, DEFAULT_RESEARCH_MODEL, RESEARCH_CONTRACT_VERSION } from "../../../packages/spot-research-runtime/src/index.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCode = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/[^a-zA-Z0-9_:\-]/g, "_").slice(0, 160);
async function sha256(value: unknown) { const bytes = new TextEncoder().encode(JSON.stringify(value)); return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (Deno.env.get("SPOT_RESEARCH_AGENT_ENABLED") !== "true") return json({ error: "research_agent_disabled" }, 503);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!url || !anonKey || !serviceKey || !apiKey) return json({ error: "server_configuration_missing" }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return json({ error: "unauthorized" }, 401);
  let body: { spotId?: string; officialWebsite?: string };
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.spotId || !uuidPattern.test(body.spotId)) return json({ error: "invalid_spot_id" }, 400);

  const { data: profile, error: profileError } = await userClient.rpc("backyrd_gold_profile_v1", { p_spot_id: body.spotId });
  if (profileError) return json({ error: "research_access_denied" }, 403);
  if (!["ADMIN", "FOUNDER"].includes(profile?.actor?.role)) return json({ error: "research_admin_required" }, 403);
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: dailyCount, error: rateError } = await service.from("backyrd_spot_research_runs_v1").select("id", { count: "exact", head: true }).eq("actor_id", user.id).gte("created_at", since);
  if (rateError) return json({ error: "research_rate_limit_unavailable" }, 503);
  if ((dailyCount ?? 0) >= 10) return json({ error: "research_daily_limit_reached" }, 429);
  const { data: spot, error: spotError } = await service.from("spots").select("id,name,city,website").eq("id", body.spotId).single();
  if (spotError || !spot) return json({ error: "spot_not_found" }, 404);
  // An Admin/Founder may supply a missing official website as a research seed.
  // It scopes the provider domain only; it is not persisted as Spot truth.
  // An existing canonical website can never be overridden at this boundary.
  const website = spot.website || body.officialWebsite;
  if (!website) return json({ error: "official_website_required" }, 422);
  if (spot.website && body.officialWebsite && spot.website !== body.officialWebsite) return json({ error: "official_website_override_forbidden" }, 422);
  const context = { spot: { ...spot, website }, catalog: profile.catalog ?? [], acceptedFacts: (profile.acceptedFacts ?? []).map((row: Record<string, unknown>) => ({ fieldKey: row.field_key, value: row.value, status: row.status })) };
  const model = Deno.env.get("SPOT_RESEARCH_MODEL") || DEFAULT_RESEARCH_MODEL;
  const inputHash = await sha256({ contract: RESEARCH_CONTRACT_VERSION, context });
  const { data: run, error: runError } = await service.from("backyrd_spot_research_runs_v1").insert({ spot_id: spot.id, actor_id: user.id, status: "STARTED", model, input_hash: inputHash }).select("id").single();
  if (runError || !run) return json({ error: "research_run_create_failed" }, 503);
  try {
    const provider = await callResearchProvider(context, { apiKey, model });
    const { data: result, error: persistError } = await service.rpc("backyrd_gold_submit_research_batch_v2", {
      p_run_id: run.id, p_spot_id: spot.id, p_proposals: provider.proposals,
      p_provider_metadata: { providerResponseId: provider.providerResponseId, providerStatus: provider.providerStatus, inputTokens: provider.usage.inputTokens, outputTokens: provider.usage.outputTokens, totalTokens: provider.usage.totalTokens, latencyMs: provider.latencyMs }
    });
    if (persistError) throw new Error("research_proposal_persistence_failed");
    return json({ runId: run.id, status: result.status, proposalCount: result.proposalCount, canonicalWrite: false });
  } catch (error) {
    const failureCode = safeCode(error);
    await service.from("backyrd_spot_research_runs_v1").update({ status: "FAILED", failure_code: failureCode, finished_at: new Date().toISOString() }).eq("id", run.id).eq("status", "STARTED");
    return json({ runId: run.id, error: failureCode, canonicalWrite: false }, failureCode.includes("timeout") || failureCode.includes("transport") ? 503 : 422);
  }
});
