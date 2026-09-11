import "server-only";
import { createClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return Response.json({ error: "local_world_knowledge_not_configured" }, { status: 503 });
  const authorization = request.headers.get("authorization") ?? ""; const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ error: "authentication_required" }, { status: 401 });
  const actor = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: user } = await actor.auth.getUser(token); if (!user.user) return Response.json({ error: "invalid_session" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { action?: string; spotId?: string; cohortId?: string };
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  if (body?.action === "rebuild" && body.spotId && UUID.test(body.spotId)) {
    const { error: scopeError } = await actor.rpc("world_authoring_get_spot_v1", { p_spot_id: body.spotId }); if (scopeError) return Response.json({ error: "world_authoring_scope_denied" }, { status: 403 });
    const now = new Date().toISOString(); const { data, error } = await service.rpc("world_shadow_rebuild_spot_v1", { p_spot_id: body.spotId, p_mode: "FULL", p_as_of: now, p_idempotency_key: `authoring:${body.spotId}:${now}` });
    return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data);
  }
  if (body?.action === "cohort" && body.cohortId) {
    const { data: admin } = await actor.rpc("admin_is_admin_v1"); if (admin !== true) return Response.json({ error: "admin_required" }, { status: 403 });
    const { data, error } = await service.rpc("world_founder_export_cohort_v1", { p_cohort_id: body.cohortId }); return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data);
  }
  return Response.json({ error: "invalid_shadow_action" }, { status: 400 });
}
