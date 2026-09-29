import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseWorldResearchBatch } from "@backyrd/world-knowledge-core";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { createAdminWorldResearchExport, WORLD_RESEARCH_SPOT_ID } from "@/lib/server/worldResearchExport";

const noStore = { "cache-control": "no-store" };
const UUID = WORLD_RESEARCH_SPOT_ID;
type JobRow = {
  id: string; spot_id: string; spot_name: string; status: string; attempts: number; failure_code: string | null;
  created_at: string; updated_at: string; completed_at: string | null;
  export_document?: unknown; result_document?: unknown;
};

function clients(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("WORLD_RESEARCH_AUTOMATION_NOT_CONFIGURED");
  return {
    actor: createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }),
    service: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }),
  };
}

const summary = (row: JobRow) => ({
  jobId: row.id, spotId: row.spot_id, spotName: row.spot_name, status: row.status, attempts: row.attempts,
  failureCode: row.failure_code, createdAt: row.created_at, updatedAt: row.updated_at,
  completedAt: row.completed_at,
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  try {
    const { service } = clients(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (jobId && !UUID.test(jobId)) return Response.json({ error: "WORLD_RESEARCH_JOB_ID_INVALID" }, { status: 400, headers: noStore });
    const columns = jobId
      ? "id,spot_id,spot_name,status,attempts,failure_code,created_at,updated_at,completed_at,export_document,result_document"
      : "id,spot_id,spot_name,status,attempts,failure_code,created_at,updated_at,completed_at";
    let query = service.from("world_research_automation_jobs_v1").select(columns).eq("actor_id", authorization.userId);
    query = jobId ? query.eq("id", jobId).limit(1) : query.order("created_at", { ascending: false }).limit(30);
    const { data, error } = await query;
    if (error) throw new Error("WORLD_RESEARCH_JOBS_UNAVAILABLE");
    const rows = (data ?? []) as unknown as JobRow[];
    if (jobId) {
      const row = rows[0];
      if (!row) return Response.json({ error: "WORLD_RESEARCH_JOB_NOT_FOUND" }, { status: 404, headers: noStore });
      if (row.status !== "READY_FOR_REVIEW" || !row.result_document) return Response.json({ job: summary(row) }, { headers: noStore });
      const document = parseWorldResearchBatch(row.result_document);
      const exportDocument = row.export_document as { exportHash?: string; research?: { instructions?: unknown } };
      if (document.exportHash !== exportDocument.exportHash || document.batch.spots.length !== 1
        || document.batch.spots[0].spotId !== row.spot_id
        || JSON.stringify(document.research.instructions) !== JSON.stringify(exportDocument.research?.instructions)) {
        throw new Error("WORLD_RESEARCH_JOB_BINDING_INVALID");
      }
      return Response.json({ job: summary(row), document }, { headers: noStore });
    }
    return Response.json({ enabled: process.env.WORLD_RESEARCH_AUTOMATION_ENABLED === "true", jobs: rows.map(summary) }, { headers: noStore });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "WORLD_RESEARCH_JOBS_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  if (process.env.WORLD_RESEARCH_AUTOMATION_ENABLED !== "true") return Response.json({ error: "WORLD_RESEARCH_AUTOMATION_DISABLED" }, { status: 503, headers: noStore });
  if (Number(request.headers.get("content-length") ?? 0) > 4_000) return Response.json({ error: "WORLD_RESEARCH_REQUEST_TOO_LARGE" }, { status: 413, headers: noStore });
  const body = await request.json().catch(() => null) as null | { spotIds?: unknown };
  const spotIds = body?.spotIds;
  if (!Array.isArray(spotIds) || spotIds.length < 1 || spotIds.length > 10
    || spotIds.some((id) => typeof id !== "string" || !UUID.test(id)) || new Set(spotIds).size !== spotIds.length) {
    return Response.json({ error: "WORLD_RESEARCH_SELECTION_INVALID" }, { status: 400, headers: noStore });
  }
  try {
    const { actor, service } = clients(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
    const jobs = [];
    for (const spotId of spotIds as string[]) {
      const document = await createAdminWorldResearchExport(actor, [spotId]);
      const { data, error } = await service.rpc("world_research_automation_enqueue_v1", {
        p_actor_id: authorization.userId, p_spot_id: spotId, p_export_document: document,
      });
      if (error) throw new Error(error.message);
      jobs.push({ spotId, ...data as { jobId: string; status: string; reused: boolean } });
    }
    return Response.json({ jobs }, { status: 202, headers: noStore });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "WORLD_RESEARCH_START_FAILED" }, { status: 409, headers: noStore });
  }
}
