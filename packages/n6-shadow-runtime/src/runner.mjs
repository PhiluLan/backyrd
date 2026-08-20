#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { N6ShadowService } from "./shadow.mjs";
import { SupabaseN6ShadowRepository } from "./supabase-repository.mjs";

export async function runN6ShadowOnce({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("n6_shadow_server_credentials_required");
  class DisabledRealtimeTransport { constructor() { throw new Error("n6_shadow_realtime_disabled"); } }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: DisabledRealtimeTransport } });
  const repository = new SupabaseN6ShadowRepository(client);
  const service = new N6ShadowService({ repository, apiKey: env.BACKYRD_N6_OPENAI_API_KEY ?? env.DECISION_LAB_OPENAI_API_KEY, fetchImpl });
  return service.runNext();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runN6ShadowOnce().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
