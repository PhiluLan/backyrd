// Internal-only North-Star decision entrypoint. Public routing remains on v13.
import { createClient } from "npm:@supabase/supabase-js@2";
import { SupabaseDecisionOrchestrator } from "../../../packages/decision-orchestrator-runtime/src/supabase-repository.mjs";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const internalSecret = Deno.env.get("DECISION_ENGINE_INTERNAL_SECRET");
  if (!url || !serviceKey || !internalSecret) return json({ error: "server_configuration_missing" }, 503);
  if (request.headers.get("x-backyrd-internal-secret") !== internalSecret) return json({ error: "forbidden" }, 403);
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return json({ error: "unauthorized" }, 401);
  let input: { decisionId?: string };
  try { input = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!input.decisionId || !/^[0-9a-f-]{36}$/i.test(input.decisionId)) return json({ error: "invalid_decision_id" }, 400);

  try {
    const result = await new SupabaseDecisionOrchestrator(service).run({ decisionId: input.decisionId, authenticatedUserId: user.id });
    return json({ response: result.response, traceId: result.traceId, performance: result.performance });
  } catch (error) {
    const code = String(error instanceof Error ? error.message : error).slice(0, 160);
    return json({ error: code }, code.includes("cross_user") ? 403 : 422);
  }
});
