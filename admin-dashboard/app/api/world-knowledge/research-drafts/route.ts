import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { parseNuknukDraft, recoverDraftObservations } from "@/lib/nuknukResearchDraft";

import { finishNuknukDraftReview, assessNuknukDraftReview } from "@/lib/nuknukDraftImport";
import { readWorldResearchDetail } from "@/lib/server/worldResearchExport";

const noStore = { "cache-control": "no-store" };
const uuid = /^[0-9a-f-]{36}$/i;
const kind = "NUKNUK_RESEARCH_DRAFT";
type DraftRow = {
  id: string; spot_id: string; spot_name: string; actor_id: string; created_at: string; reviewed_at?: string | null; updated_at?: string;
  export_document: { kind?: string; version?: string; digest?: string };
  result_document?: unknown;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("WORLD_RESEARCH_DRAFTS_NOT_CONFIGURED");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const summary = (row: DraftRow) => ({
  draftId: row.id, spotId: row.spot_id, spotName: row.spot_name,
  version: row.export_document.version ?? "", createdAt: row.created_at, archivedAt: row.reviewed_at ?? null,
});

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  try {
    const service = serviceClient();
    const params = new URL(request.url).searchParams;
    const draftId = params.get("draftId");
    const archive = params.get("view") === "archive";
    if (draftId && !uuid.test(draftId)) return Response.json({ error: "WORLD_RESEARCH_DRAFT_ID_INVALID" }, { status: 400, headers: noStore });
    let query = service.from("world_research_automation_jobs_v1")
      .select(draftId ? "id,spot_id,spot_name,actor_id,created_at,reviewed_at,export_document,result_document" : "id,spot_id,spot_name,actor_id,created_at,reviewed_at,export_document")
      .contains("export_document", { kind }).eq("status", "READY_FOR_REVIEW");
    if (!draftId) query = archive ? query.not("reviewed_at", "is", null) : query.is("reviewed_at", null);
    query = draftId ? query.eq("id", draftId).limit(1) : query.order("created_at", { ascending: false }).limit(30);
    const { data, error } = await query;
    if (error) throw new Error("WORLD_RESEARCH_DRAFTS_UNAVAILABLE");
    const rows = (data ?? []) as unknown as DraftRow[];
    if (!draftId) return Response.json({ drafts: rows.map(summary) }, { headers: noStore });
    const row = rows[0];
    if (!row) return Response.json({ error: "WORLD_RESEARCH_DRAFT_NOT_FOUND" }, { status: 404, headers: noStore });
    const draft = parseNuknukDraft(row.result_document);
    if (!draft || draft.spotId !== row.spot_id) throw new Error("WORLD_RESEARCH_DRAFT_INVALID");
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"") ?? "";
    const actor=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
    const detail=await readWorldResearchDetail(actor,row.spot_id);
    return Response.json({ draft: summary(row), report: draft, review:{fields:assessNuknukDraftReview(draft,detail.answers ?? {}),manifestHash:detail.manifest!.manifestHash} }, { headers: noStore });
  } catch {
    return Response.json({ error: "WORLD_RESEARCH_DRAFTS_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  if (Number(request.headers.get("content-length") ?? 0) > 200_000) return Response.json({ error: "WORLD_RESEARCH_DRAFT_TOO_LARGE" }, { status: 413, headers: noStore });
  const text = await request.text().catch(() => "");
  if (text.length > 200_000) return Response.json({ error: "WORLD_RESEARCH_DRAFT_TOO_LARGE" }, { status: 413, headers: noStore });
  const input: unknown = (() => { try { return JSON.parse(text); } catch { return null; } })();
  if (input && typeof input === "object" && "action" in input && ["complete", "restore"].includes(String(input.action))) {
    const command = input as { action: string; draftId?: unknown; kept?: unknown; expectedManifestHash?: unknown };
    if (typeof command.draftId !== "string" || !uuid.test(command.draftId)) return Response.json({error:"Ungültiger Recherchebericht."},{status:400,headers:noStore});
    try {
      const service = serviceClient();
      const found = await service.from("world_research_automation_jobs_v1")
        .select("id,spot_id,spot_name,actor_id,created_at,updated_at,reviewed_at,export_document,result_document")
        .eq("id",command.draftId).contains("export_document",{kind}).eq("status","READY_FOR_REVIEW").maybeSingle();
      const report = parseNuknukDraft(found.data?.result_document);
      if (found.error || !found.data || !report || report.spotId !== found.data.spot_id) throw new Error("Der Recherchebericht wurde nicht gefunden.");
      const row = found.data;
      if(command.action === "restore") {
        if (!row.reviewed_at) return Response.json({draft:summary(row),restored:true},{headers:noStore});
        const restored = await service.from("world_research_automation_jobs_v1").update({reviewed_at:null,reviewed_by:null,review_outcome:null,updated_at:new Date().toISOString(),
          export_document:{...row.export_document,restoredAt:new Date().toISOString(),restoredBy:authorization.userId}})
          .eq("id",row.id).eq("updated_at",row.updated_at).eq("reviewed_at",row.reviewed_at).select("id").maybeSingle();
        if(restored.error || !restored.data) throw new Error("Der Bericht wurde inzwischen geändert. Bitte neu laden.");
        return Response.json({restored:true},{headers:noStore});
      }
      if(row.reviewed_at) return Response.json({archived:true,draft:summary(row)},{headers:noStore});
      const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if(!url || !key) throw new Error("Der Profilstand konnte nicht geprüft werden.");
      const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"") ?? "";
      const actor=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${token}`}}});
      const detail=await readWorldResearchDetail(actor,row.spot_id);
      if(command.expectedManifestHash !== detail.manifest?.manifestHash) throw new Error("Das Profil wurde inzwischen geändert. Bitte den Bericht neu öffnen.");
      if(command.kept !== undefined && (!command.kept || typeof command.kept !== "object" || Array.isArray(command.kept))) throw new Error("Ungültige Abschlussauswahl.");
      const checked=finishNuknukDraftReview(report,detail.answers ?? {},(command.kept as Record<string,unknown> | undefined) ?? {});
      if(checked.pending.length) return Response.json({archived:false,pending:checked.pending},{headers:noStore});
      const now=new Date().toISOString();
      const marked=await service.from("world_research_automation_jobs_v1").update({reviewed_at:now,reviewed_by:authorization.userId,review_outcome:"NO_CHANGES",updated_at:now,
        export_document:{...row.export_document,reviewReceipt:{actorId:authorization.userId,completedAt:now,manifestHash:detail.manifest!.manifestHash,decisions:checked.decisions}}})
        .eq("id",row.id).eq("updated_at",row.updated_at).is("reviewed_at",null).select("id,reviewed_at").maybeSingle();
      if(marked.error || !marked.data) throw new Error("Der Bericht konnte nicht archiviert werden. Bitte erneut versuchen.");
      return Response.json({archived:true,verified:checked.decisions.filter(item=>item.outcome === "PROFILE_VERIFIED").length,kept:checked.decisions.filter(item=>item.outcome !== "PROFILE_VERIFIED").length},{headers:noStore});
    } catch(cause) {return Response.json({error:cause instanceof Error ? cause.message : "Der Prüfabschluss konnte nicht bestätigt werden."},{status:409,headers:noStore});}
  }
  const recovery = input && typeof input === "object" && "recoverDraftId" in input ? input as { recoverDraftId?: unknown; original?: unknown } : null;
  const draft = parseNuknukDraft(recovery ? recovery.original : input);
  if (!draft) return Response.json({ error: "WORLD_RESEARCH_DRAFT_INVALID" }, { status: 400, headers: noStore });
  try {
    const service = serviceClient();
    if (recovery) {
      if (typeof recovery.recoverDraftId !== "string" || !uuid.test(recovery.recoverDraftId)) return Response.json({ error: "WORLD_RESEARCH_DRAFT_ID_INVALID" }, { status: 400, headers: noStore });
      const found = await service.from("world_research_automation_jobs_v1")
        .select("id,spot_id,spot_name,actor_id,created_at,updated_at,export_document,result_document")
        .eq("id", recovery.recoverDraftId).contains("export_document", { kind }).eq("status", "READY_FOR_REVIEW").is("reviewed_at", null).maybeSingle();
      const stored = parseNuknukDraft(found.data?.result_document);
      if (found.error || !found.data || !stored || stored.spotId !== found.data.spot_id) return Response.json({ error: "WORLD_RESEARCH_DRAFT_NOT_FOUND" }, { status: 404, headers: noStore });
      let report;
      try { report = recoverDraftObservations(stored, draft); }
      catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : "Originalbericht ungültig" }, { status: 409, headers: noStore }); }
      if (JSON.stringify(report) === JSON.stringify(stored)) return Response.json({draft:summary(found.data as DraftRow),report}, {headers:noStore});
      const digest = createHash("sha256").update(JSON.stringify(report)).digest("hex");
      const previous = found.data.export_document;
      const now = new Date().toISOString();
      const updated = await service.from("world_research_automation_jobs_v1").update({ result_document: report, updated_at: now,
        export_document: { ...previous, digest, observationRecovery: { actorId: authorization.userId, recoveredAt: now,
          previousDigest: previous.digest ?? createHash("sha256").update(JSON.stringify(stored)).digest("hex"),
          originalDigest: createHash("sha256").update(JSON.stringify(draft)).digest("hex") } },
      }).eq("id", found.data.id).eq("updated_at", found.data.updated_at).eq("status", "READY_FOR_REVIEW").is("reviewed_at", null)
        .select("id,spot_id,spot_name,actor_id,created_at,export_document").maybeSingle();
      if (updated.error || !updated.data) return Response.json({ error: "Der Entwurf wurde inzwischen geändert. Bitte neu öffnen." }, { status: 409, headers: noStore });
      return Response.json({ draft: summary(updated.data as DraftRow), report }, { headers: noStore });
    }
    const { data: spot, error: spotError } = await service.from("spots").select("id,name").eq("id", draft.spotId).maybeSingle();
    if (spotError) throw new Error("WORLD_RESEARCH_SPOT_UNAVAILABLE");
    if (!spot) return Response.json({ error: "WORLD_RESEARCH_SPOT_NOT_FOUND" }, { status: 404, headers: noStore });
    const report = { ...draft, name: spot.name };
    const digest = createHash("sha256").update(JSON.stringify(report)).digest("hex");
    const { data: existing, error: existingError } = await service.from("world_research_automation_jobs_v1")
      .select("id,spot_id,spot_name,actor_id,created_at,export_document")
      .eq("spot_id", draft.spotId).contains("export_document", { kind, digest })
      .eq("status", "READY_FOR_REVIEW").is("reviewed_at", null).limit(1);
    if (existingError) throw new Error("WORLD_RESEARCH_DRAFTS_UNAVAILABLE");
    if (existing?.[0]) return Response.json({ draft: summary(existing[0] as DraftRow), reused: true }, { headers: noStore });
    const now = new Date().toISOString();
    const { data, error } = await service.from("world_research_automation_jobs_v1").insert({
      spot_id: draft.spotId, spot_name: spot.name, actor_id: authorization.userId,
      export_document: { kind, version: draft.version, digest }, result_document: report,
      status: "READY_FOR_REVIEW", completed_at: now, updated_at: now,
    }).select("id,spot_id,spot_name,actor_id,created_at,export_document").single();
    if (error || !data) throw new Error("WORLD_RESEARCH_DRAFT_SAVE_FAILED");
    return Response.json({ draft: summary(data as DraftRow), reused: false }, { status: 201, headers: noStore });
  } catch {
    return Response.json({ error: "WORLD_RESEARCH_DRAFT_SAVE_FAILED" }, { status: 503, headers: noStore });
  }
}
