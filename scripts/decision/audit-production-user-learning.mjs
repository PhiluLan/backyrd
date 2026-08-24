import { createClient } from "@supabase/supabase-js";
import {
  buildUserIntelligenceReadOnly,
  SupabaseUserIntelligenceRepository,
} from "../../packages/user-intelligence-runtime/src/index.mjs";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.TARGET_USER_ID;
if (!url || !serviceKey || !userId) throw new Error("SUPABASE_URL_SUPABASE_SERVICE_ROLE_KEY_TARGET_USER_ID_required");

class DisabledRealtimeTransport { constructor() { throw new Error("realtime_disabled_for_server_audit"); } }
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: DisabledRealtimeTransport },
});
const repository = new SupabaseUserIntelligenceRepository(service);
const fail = (error, label) => { if (error) throw new Error(`${label}:${error.message}`); };
const countBy = (rows, key) => rows.reduce((counts, row) => {
  const name = row[key] ?? "NONE";
  counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}, {});

const { data: memory, error: memoryError } = await service
  .from("backyrd_memory_events_v1")
  .select("event_type,ingested_at")
  .eq("user_id", userId)
  .order("ingested_at");
fail(memoryError, "memory");
const { data: work, error: workError } = await service
  .from("backyrd_user_intelligence_work_v1")
  .select("state,failure_code,source_memory_event_id,updated_at")
  .eq("user_id", userId)
  .order("updated_at");
fail(workError, "work");
const { data: latestRow, error: latestError } = await service
  .from("backyrd_user_intelligence_latest_v1")
  .select("snapshot_id,source_watermark,updated_at")
  .eq("user_id", userId)
  .maybeSingle();
fail(latestError, "latest");
const { data: persisted, error: cardError } = await service.rpc("backyrd_read_latest_shared_user_card_v1", { p_user_id: userId });
fail(cardError, "persisted_card");

const sources = await repository.readCanonicalSources(userId);
const { input, validated } = buildUserIntelligenceReadOnly({ userId, source: sources });
const direct = validated?.card ?? null;

console.log(JSON.stringify({
  userId,
  consentGranted: sources.consentGranted,
  n2: {
    count: memory?.length ?? 0,
    byType: countBy(memory ?? [], "event_type"),
    latestWatermark: memory?.at(-1)?.ingested_at ?? null,
  },
  work: {
    byState: countBy(work ?? [], "state"),
    failureCodes: countBy((work ?? []).filter((row) => row.failure_code), "failure_code"),
    latestUpdatedAt: work?.at(-1)?.updated_at ?? null,
  },
  persisted: persisted ? {
    snapshotId: latestRow?.snapshot_id ?? null,
    sourceWatermark: latestRow?.source_watermark ?? null,
    updatedAt: latestRow?.updated_at ?? null,
    hash: persisted.userCardHash,
    maturity: persisted.maturity,
    nodeCount: persisted.nodes?.length ?? 0,
  } : null,
  readOnlyRuntime: direct ? {
    hash: direct.userCardHash,
    maturity: direct.maturity,
    nodeCount: direct.nodes?.length ?? 0,
    inputEventCount: input.length,
  } : null,
  parity: Boolean(persisted && direct && persisted.userCardHash === direct.userCardHash),
}, null, 2));
