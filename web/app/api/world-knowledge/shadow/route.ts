import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createFounderWorldKnowledgeReader, REGISTRY_HASH, REGISTRY_VERSION, WORLD_KNOWLEDGE_PORT_VERSION } from "@backyrd/world-knowledge-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return Response.json({ error: "local_world_knowledge_not_configured" }, { status: 503 });
  const authorization = request.headers.get("authorization") ?? ""; const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ error: "authentication_required" }, { status: 401 });
  const actor = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: user } = await actor.auth.getUser(token); if (!user.user) return Response.json({ error: "invalid_session" }, { status: 401 });
  const body = await request.json().catch(() => null) as null | { action?: string; spotId?: string; cohortId?: string; idempotencyKey?: string };
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  if (body?.action === "product-rebuild") {
    if (!body.spotId || !UUID.test(body.spotId) || !body.idempotencyKey || body.idempotencyKey.length > 180) return Response.json({ error: "invalid_product_rebuild_request" }, { status: 400 });
    const before = await actor.rpc("world_product_authoring_detail_v1", { p_spot_id: body.spotId });
    if (before.error || !before.data) return Response.json({ error: "world_authoring_scope_denied" }, { status: 403 });
    const { data, error } = await service.rpc("world_product_rebuild_spot_v1", { p_actor_user_id: user.user.id, p_spot_id: body.spotId, p_as_of: new Date().toISOString(), p_idempotency_key: body.idempotencyKey });
    if (error) return Response.json({ error: error.message }, { status: 409 });
    const after = await actor.rpc("world_product_authoring_detail_v1", { p_spot_id: body.spotId });
    if (after.error || !after.data) return Response.json({ error: "world_product_reader_unavailable" }, { status: 503 });
    const detail = after.data as { manifest?: { manifestHash?: string; worldSnapshot?: { spotId?: string } } | null; openConflicts?: unknown[] };
    const rebuilt = data as { manifestHash?: string; worldSnapshot?: { spotId?: string } } | null;
    if (!detail.manifest?.manifestHash || detail.manifest.manifestHash !== rebuilt?.manifestHash
      || detail.manifest.worldSnapshot?.spotId !== body.spotId || rebuilt.worldSnapshot?.spotId !== body.spotId
      || JSON.stringify(detail.manifest.worldSnapshot) !== JSON.stringify(rebuilt.worldSnapshot)) return Response.json({ error: "world_product_reader_invalid" }, { status: 503 });
    return Response.json({ rebuild: data, manifestHash: detail.manifest.manifestHash, readerSnapshot: detail.manifest.worldSnapshot, openConflicts: detail.openConflicts ?? [] });
  }
  const localBinding = process.env.WORLD_KNOWLEDGE_LOCAL_SUPABASE_URL ?? process.env.WK_LOCAL_SUPABASE_URL;
  try {
    if (!localBinding) throw new Error("missing_local_binding");
    const configured = new URL(url); const expected = new URL(localBinding);
    if (!['127.0.0.1', 'localhost', '::1'].includes(configured.hostname) || `${configured.protocol}//${configured.host}` !== `${expected.protocol}//${expected.host}`) throw new Error("local_endpoint_mismatch");
  } catch { return Response.json({ error: "local_world_knowledge_endpoint_mismatch" }, { status: 503 }); }
  if (body?.action === "rebuild" && body.spotId && UUID.test(body.spotId)) {
    const { error: scopeError } = await actor.rpc("world_authoring_get_spot_v1", { p_spot_id: body.spotId }); if (scopeError) return Response.json({ error: "world_authoring_scope_denied" }, { status: 403 });
    const now = new Date().toISOString(); const { data, error } = await service.rpc("world_shadow_rebuild_spot_v1", { p_spot_id: body.spotId, p_mode: "FULL", p_as_of: now, p_idempotency_key: `authoring:${body.spotId}:${now}` });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    try {
      const readerSnapshot = await createFounderWorldKnowledgeReader(async () => {
        const result = await actor.rpc("world_authoring_get_spot_v1", { p_spot_id: body.spotId });
        if (result.error || !result.data) throw new Error(result.error?.message ?? "founder_reader_snapshot_missing");
        const detail = result.data as { manifest?: { worldSnapshot?: unknown } | null };
        if (!detail.manifest?.worldSnapshot) throw new Error("founder_reader_snapshot_missing");
        return detail.manifest.worldSnapshot;
      }).readSnapshot({ spotId: body.spotId, contractVersion: WORLD_KNOWLEDGE_PORT_VERSION, registryVersion: REGISTRY_VERSION, registryHash: REGISTRY_HASH });
      return Response.json({ rebuild: data, readerSnapshot });
    } catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "founder_reader_snapshot_invalid" }, { status: 400 }); }
  }
  if (body?.action === "cohort" && body.cohortId) {
    const { data: admin } = await actor.rpc("admin_is_admin_v1"); if (admin !== true) return Response.json({ error: "admin_required" }, { status: 403 });
    const { data, error } = await service.rpc("world_founder_export_cohort_v1", { p_cohort_id: body.cohortId }); return error ? Response.json({ error: error.message }, { status: 400 }) : Response.json(data);
  }
  return Response.json({ error: "invalid_shadow_action" }, { status: 400 });
}
