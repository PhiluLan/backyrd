// Internal queue executor. It contains no learning or ranking semantics.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";
import { runQueueOnce } from "../../../packages/user-intelligence-runtime/src/queue-runner.mjs";
import { SupabaseUserIntelligenceRepository } from "../../../packages/user-intelligence-runtime/src/supabase-repository.mjs";
import { N6ShadowService } from "../../../packages/n6-shadow-runtime/src/shadow.mjs";
import { SupabaseN6ShadowRepository } from "../../../packages/n6-shadow-runtime/src/supabase-repository.mjs";

// The frozen runtime uses Node's UTF-8 byte counter for bounded token/input
// estimation. Supabase Edge supports node:buffer but does not expose Buffer as
// a global, so establish the standard compatibility binding at the boundary.
(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  const internalSecret = Deno.env.get("DECISION_ENGINE_INTERNAL_SECRET");
  if (!url || !serviceKey || !internalSecret) return json({ error: "server_configuration_missing" }, 503);
  if (request.headers.get("x-backyrd-internal-secret") !== internalSecret) return json({ error: "forbidden" }, 403);
  let input: { mode?: "USER_INTELLIGENCE" | "N6_SHADOW" };
  try { input = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (input.mode === "USER_INTELLIGENCE") {
      const result = await runQueueOnce({ repository: new SupabaseUserIntelligenceRepository(service) });
      return json({ mode: input.mode, result });
    }
    if (input.mode === "N6_SHADOW") {
      if (!openAIKey) return json({ error: "openai_key_missing" }, 503);
      const repository = new SupabaseN6ShadowRepository(service);
      const claim = await repository.claim();
      if (!claim) return json({ mode: input.mode, result: { status: "IDLE" } });
      const result = await new N6ShadowService({ repository, apiKey: openAIKey, fetchImpl: globalThis.fetch }).processClaimed(claim);
      return json({ mode: input.mode, result });
    }
    return json({ error: "invalid_mode" }, 400);
  } catch (error) {
    return json({ error: String(error instanceof Error ? error.message : error).slice(0, 160) }, 500);
  }
});
