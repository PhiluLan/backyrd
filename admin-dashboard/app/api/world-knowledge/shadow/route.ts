import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { assertWorldKnowledgeLocalEndpoints } from "@/lib/worldKnowledgeSession";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request); if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !serviceKey) return Response.json({ error: "local_world_knowledge_not_configured" }, { status: 503 });
  const localBinding = process.env.WORLD_KNOWLEDGE_LOCAL_SUPABASE_URL ?? process.env.WK_LOCAL_SUPABASE_URL;
  try { assertWorldKnowledgeLocalEndpoints(url, localBinding); } catch { return Response.json({ error: "local_world_knowledge_endpoint_mismatch" }, { status: 503 }); }
  const body = await request.json().catch(() => null) as null | { action?: string; spotId?: string; cohortId?: string }; const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  if (body?.action === "rebuild" && body.spotId && UUID.test(body.spotId)) { const now = new Date().toISOString(); const { data, error } = await service.rpc("world_shadow_rebuild_spot_v1", { p_spot_id: body.spotId, p_mode: "FULL", p_as_of: now, p_idempotency_key: `admin-authoring:${body.spotId}:${now}` }); return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data); }
  if (body?.action === "cohort" && body.cohortId) { const { data, error } = await service.rpc("world_founder_export_cohort_v1", { p_cohort_id: body.cohortId }); return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data); }
  return Response.json({ error: "invalid_shadow_action" }, { status: 400 });
}
