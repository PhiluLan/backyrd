import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import {
  createAdminWorldResearchExport,
  WORLD_RESEARCH_SPOT_ID,
} from "@/lib/server/worldResearchExport";
import {
  COMPLETE_RESEARCH_KEYS,
  processSafeResearchDocument,
} from "@/lib/server/researchSafeImport";
import { safeImportRepository } from "@/lib/server/researchSafeImportRepository";
import { readResearchPdf } from "@/lib/server/researchPdf";
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
        "Auftrag: vollständige Spot-Recherche anhand des Feldkatalogs. Reihenfolge: Grunddaten und Kontakt, Öffnungszeiten, Angebote und Bereiche, praktische Eigenschaften. Offizielle Seiten inklusive Footer und verlinkter PDF-Karten lesen. Datenschutz und AGB nie lesen; Impressum nur für fehlende Kontaktdaten. Quellen, wörtliche Belege und tatsächliche Abrufzeit erhalten. Nicht belegte Angaben bleiben unresolved; keine negativen Eigenschaften erfinden.",
        "Zusätzlich research.assessments liefern: je Claim {attributeKey, uncertainty: NONE|MINOR|MAJOR, reason, bindings:{}}. reason begründet die fachliche Einordnung konkret. Beleg plus geringe Restunsicherheit wird übernommen; erhebliche Unsicherheit kommt zur Prüfung. Synonyme wie Mittag/Mittagsmenü/Lunch und Mittagessen sind gleichwertig. Keine Vertrauensprozentzahlen.",
        "Für experience.profile muss bindings jeden Bereich, jedes Angebot und jede Eigenschaft/Preisposition an eine konkrete Quelle binden: JSON-Pfad -> Index in [source,...supportingSources], z.B. /offers/0:0 oder /offers/0/prices/0:1. Ausprägungen, räumliche Zuordnung, Preisbasis und Gültigkeit nicht verallgemeinern. reviewed darf erst nach dieser fachlichen Quellenprüfung true werden; dies ist die delegierte Admin-Übernahme, keine erfundene persönliche Prüfung.",
        "Bestehende Angaben nur mit klar belegter Korrektur ersetzen; erhebliche Quellenkonflikte als MAJOR einordnen. Standortdaten nur aus einer eindeutigen Adresssuche, nicht aus Kartenmittelpunkten ableiten. Beobachtete Website-Weiterleitungen gelten als gleichwertig. state.current bleibt ausserhalb der automatischen Recherche.",
      ];
      return Response.json(
        {
          document,
          requestedFields: COMPLETE_RESEARCH_KEYS,
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
      readPdf: readResearchPdf,
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
