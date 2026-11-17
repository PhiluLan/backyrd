import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { crawlerService } from "@/lib/server/spotCrawlerJobs";
import { createAutomaticWorldResearchExport, WORLD_RESEARCH_SPOT_ID } from "@/lib/server/worldResearchExport";

export const runtime = "nodejs";
export const maxDuration = 60;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);
  const raw = await request.text().catch(() => "");
  if (raw.length > 1200) return json({ error: "INVALID_APPROVAL" }, 400);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "INVALID_APPROVAL" }, 400);
  } catch {
    return json({ error: "INVALID_APPROVAL" }, 400);
  }
  const { action, sourceId, fingerprint, revision, categoryId, confirmDistinct } = body;
  if (typeof sourceId !== "number" || !Number.isInteger(sourceId) || sourceId < 1 || sourceId > 2147483647) {
    return json({ error: "INVALID_APPROVAL" }, 400);
  }

  const actor = authorization.client;
  let spotId: string;
  if (action === "approve") {
    if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(fingerprint)
      || typeof revision !== "string" || !/^\d{1,19}$/u.test(revision)
      || (categoryId !== null && (typeof categoryId !== "string" || !WORLD_RESEARCH_SPOT_ID.test(categoryId)))
      || typeof confirmDistinct !== "boolean") return json({ error: "INVALID_APPROVAL" }, 400);
    const { data, error } = await actor.rpc("admin_backyrd_crawler_approve_spot_v1", {
      p_source_id: sourceId, p_fingerprint: fingerprint, p_revision: revision,
      p_category_id: categoryId, p_confirm_distinct: confirmDistinct,
    });
    if (error || typeof data !== "string") {
      if (error?.code === "40001") return json({ error: "APPROVAL_CHANGED" }, 409);
      if (error?.message === "spot_import_category_required") return json({ error: "APPROVAL_CATEGORY_REQUIRED" }, 400);
      return json({ error: "APPROVAL_FAILED" }, 503);
    }
    spotId = data;
  } else if (action === "research") {
    const { data, error } = await actor.rpc("admin_backyrd_crawler_import_v1", { p_source_id: sourceId });
    if (error || typeof data?.spotId !== "string") return json({ error: "APPROVAL_FAILED" }, 404);
    spotId = data.spotId;
  } else {
    return json({ error: "INVALID_APPROVAL" }, 400);
  }

  try {
    const { data: imported, error: importError } = await actor.rpc("admin_backyrd_crawler_import_v1", { p_source_id: sourceId });
    if (importError || imported?.spotId !== spotId) throw new Error("Crawler import unavailable");
    if (imported.jobId && ["QUEUED", "RUNNING", "READY_FOR_REVIEW"].includes(imported.status)) {
      return json({ spotId, researchQueued: true });
    }
    if (process.env.WORLD_RESEARCH_AUTOMATION_ENABLED !== "true") return json({ spotId, researchQueued: false });
    const service = crawlerService();
    const document = await createAutomaticWorldResearchExport(actor, service, authorization.userId, spotId, { includeApprovedWebsite: true });
    const { data: jobId, error } = await service.rpc("backyrd_crawler_enqueue_research_v1", {
      p_source_id: sourceId, p_spot_id: spotId, p_actor_id: authorization.userId, p_document: document,
    });
    if (error || typeof jobId !== "string") throw new Error("Crawler research enqueue failed");
    return json({ spotId, researchQueued: true });
  } catch {
    console.error("Crawler research handoff failed", { sourceId, spotId });
    return json({ spotId, researchQueued: false });
  }
}
