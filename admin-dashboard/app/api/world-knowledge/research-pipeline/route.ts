import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import {
  createAdminWorldResearchExport,
  WORLD_RESEARCH_SPOT_ID,
} from "@/lib/server/worldResearchExport";
import {
  BASIC_RESEARCH_KEYS,
  processSafeResearchDocument,
} from "@/lib/server/researchSafeImport";
import { safeImportRepository } from "@/lib/server/researchSafeImportRepository";
import { ResearchSaveError } from "@/lib/researchSaveFeedback";
export const runtime = "nodejs";
export const maxDuration = 120;
const headers = { "cache-control": "no-store" };
export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok)
    return Response.json(
      { error: authorization.error },
      { status: authorization.status, headers },
    );
  const text = await request.text().catch(() => "");
  if (Buffer.byteLength(text) > 2_000_000)
    return Response.json(
      { error: "research_pipeline_payload_too_large" },
      { status: 413, headers },
    );
  const input: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  if (!input || typeof input !== "object" || Array.isArray(input))
    return Response.json(
      { error: "research_pipeline_input_invalid" },
      { status: 400, headers },
    );
  const body = input as {
    action?: unknown;
    spotId?: unknown;
    jobId?: unknown;
    document?: unknown;
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return Response.json(
      { error: "WORLD_SERVICE_UNAVAILABLE" },
      { status: 503, headers },
    );
  const actor = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: request.headers.get("authorization") ?? "" },
    },
  });
  try {
    if (body.action === "export") {
      if (
        typeof body.spotId !== "string" ||
        !WORLD_RESEARCH_SPOT_ID.test(body.spotId)
      )
        throw new Error("research_pipeline_spot_invalid");
      const document = await createAdminWorldResearchExport(actor, [
        body.spotId,
      ]);
      document.research.instructions = [
        ...document.research.instructions,
        "Auftrag: ausschließlich die 16 folgenden Grundinformationen recherchieren: " +
          BASIC_RESEARCH_KEYS.join(", ") +
          ". Keine Zeiten, Preise, Angebote oder Bereiche bearbeiten. Zuerst offizielle Startseite inklusive Footer, Kontakt-Widgets, Metadaten und sichtbarer Telefon-/E-Mail-/Social-Links lesen. Fehlende Felder gezielt weiterrecherchieren. Originalbeleg, URL und tatsächliche Abrufzeit angeben; unbekannt bleibt offen. Keine Erfolgs- oder Vertrauensprozentzahl erfinden.",
      ];
      return Response.json(
        {
          document,
          requestedFields: BASIC_RESEARCH_KEYS,
          automaticImportEnabled:
            process.env.WORLD_RESEARCH_SAFE_IMPORT_ENABLED === "true",
        },
        { headers },
      );
    }
    if (body.action !== "process" && body.action !== "resume")
      throw new Error("research_pipeline_action_invalid");
    if (process.env.WORLD_RESEARCH_SAFE_IMPORT_ENABLED !== "true")
      return Response.json(
        { error: "research_pipeline_automatic_import_disabled" },
        { status: 503, headers },
      );
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey)
      return Response.json(
        { error: "research_pipeline_not_configured" },
        { status: 503, headers },
      );
    const service = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let document = body.document;
    if (body.action === "resume") {
      if (
        typeof body.jobId !== "string" ||
        !WORLD_RESEARCH_SPOT_ID.test(body.jobId)
      )
        throw new Error("research_pipeline_job_invalid");
      const found = await service
        .from("world_research_automation_jobs_v1")
        .select("export_document,result_document")
        .eq("id", body.jobId)
        .eq("actor_id", authorization.userId)
        .eq("status", "READY_FOR_REVIEW")
        .is("reviewed_at", null)
        .maybeSingle();
      const pipeline = found.data?.export_document?.pipeline;
      if (
        found.error ||
        found.data?.export_document?.kind !== "CODEX_RESEARCH_PIPELINE" ||
        !pipeline
      )
        throw new Error("research_pipeline_job_not_found");
      if (
        pipeline.phase === "FINISHED" &&
        pipeline.report?.errors?.length === 0
      )
        return Response.json(
          { report: pipeline.report, document: found.data.result_document },
          { headers },
        );
      document = found.data.result_document;
    }
    const result = await processSafeResearchDocument(document, {
      actorId: authorization.userId,
      repository: safeImportRepository(actor, service, authorization.userId),
    });
    return Response.json(result, { headers });
  } catch (cause) {
    return Response.json(
      {
        error:
          cause instanceof Error ? cause.message : "research_pipeline_failed",
        ...(cause instanceof ResearchSaveError
          ? { saveState: cause.saveState }
          : {}),
      },
      { status: 409, headers },
    );
  }
}
