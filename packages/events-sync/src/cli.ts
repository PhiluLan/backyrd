import { createClient } from "@supabase/supabase-js";

import { EventfrogAdapter } from "./eventfrog-adapter.js";
import { EventsRepository } from "./repository.js";
import { runEventsSync } from "./sync.js";
import type { SyncMode } from "./contracts.js";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function isoOffset(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

async function main(): Promise<void> {
  const mode: SyncMode = process.env.EVENTS_SYNC_MODE === "INCREMENTAL"
    ? "INCREMENTAL"
    : "RECONCILE";
  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const eventfrogToken = requiredEnvironment("EVENTFROG_API_TOKEN");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const metrics = await runEventsSync({
    adapter: new EventfrogAdapter(eventfrogToken),
    repository: new EventsRepository(client),
    mode,
    from: process.env.EVENTS_FROM ?? isoOffset(-1),
    to: process.env.EVENTS_TO ?? isoOffset(180),
    ...(mode === "INCREMENTAL" ? { modifiedSince: isoOffset(-3) } : {}),
  });

  const matchedTotal = metrics.matchedVenues + metrics.unmatchedVenues;
  const matchPercent = matchedTotal === 0
    ? "0.0"
    : ((metrics.matchedVenues / matchedTotal) * 100).toFixed(1);
  console.log("EVENTS V1 PILOT — PASS");
  console.log("SOURCE — Eventfrog");
  console.log(`RAW EVENTS — ${metrics.rawEvents}`);
  console.log(`CANONICAL EVENTS — ${metrics.canonicalEvents}`);
  console.log(`OCCURRENCES — ${metrics.occurrences}`);
  console.log(`DUPLICATES MERGED — ${metrics.duplicatesMerged}`);
  console.log(`VENUE → BACKYRD SPOT MATCH — ${metrics.matchedVenues}/${matchPercent}%`);
  console.log(`UNMATCHED VENUES — ${metrics.unmatchedVenues}`);
  console.log(`FREE EVENTS — ${metrics.freeEvents}`);
  console.log(`IMAGE RIGHTS VERIFIED — ${metrics.imageRightsVerified}`);
  console.log(`UNAUTHORIZED IMAGES STORED — ${metrics.unauthorizedImagesStored}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("EVENTS V1 PILOT — FAIL");
  console.error(message);
  process.exitCode = 1;
});
