import "server-only";
import { readOfficialSpotBasics } from "../../../../../packages/spot-research-runtime/src/official-spot-basics.mjs";
import { createClient } from "@supabase/supabase-js";
import { AUTHORING_FIELDS, normalizeAutomatedWorldResearchBatch, parseWorldResearchBatch, type WorldResearchBatchDocument } from "@backyrd/world-knowledge-core";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { readWorldResearchDetail, WORLD_RESEARCH_SPOT_ID } from "@/lib/server/worldResearchExport";
import { assessNuknukDraftReview } from "@/lib/nuknukDraftImport";
import { RESEARCH_INBOX_CUTOVER, buildInboxSpot, resultsFromInboxRow, taskFingerprint, type InboxRow, type InboxDecision, type InboxSpot } from "@/lib/researchInbox";
import { persistResearchFollowups } from "@/lib/server/researchFollowups";
import { acceptResearchTask } from "@/lib/server/researchTaskAcceptance";
import { INBOX_AUTO_RESEARCH_KEYS, processSafeResearchDocument } from "@/lib/server/researchSafeImport";
import { safeImportRepository } from "@/lib/server/researchSafeImportRepository";
import { readResearchPdf } from "@/lib/server/researchPdf";
import { ResearchSaveError } from "@/lib/researchSaveFeedback";
export const runtime = "nodejs";
export const maxDuration = 120;
const headers={"cache-control":"no-store"};
function clients(request:Request) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !anon || !key)throw new Error("Die Aufgaben sind momentan nicht erreichbar.");
  return {service:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),actor:createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:request.headers.get("authorization")!}}})};
}
const columns="id,actor_id,spot_id,spot_name,status,created_at,updated_at,reviewed_at,export_document,result_document,lease_expires_at";
const allowed=new Set(AUTHORING_FIELDS.map(field=>field.attributeKey));
const officialBasics = new Set(["contact.public_email", "contact.phone", "hours.regular"]);
type AssessedResearch = WorldResearchBatchDocument & {
  research: WorldResearchBatchDocument["research"] & {
    assessments?: { attributeKey: string; uncertainty: string; reason: string; bindings: Record<string, string> }[];
  };
};

function canCheckOfficialBasics(document: AssessedResearch | null) {
  const spot = document?.batch?.spots?.[0];
  const website = spot?.existingValues?.["contact.website"];
  return !!spot?.locality && website?.knowledgeState === "KNOWN_VALUE" &&
    typeof website.value === "string" &&
    document?.research?.spots?.[0]?.unresolved?.some(item =>
      officialBasics.has(item.attributeKey) && !spot.existingValues[item.attributeKey]) === true;
}

function canPrepareResearch(row: InboxRow) {
  const kind=row.export_document.kind;
  const document = row.result_document as AssessedResearch | null;
  return process.env.WORLD_RESEARCH_SAFE_IMPORT_ENABLED === "true" &&
    row.status === "READY_FOR_REVIEW" && !row.reviewed_at &&
    (kind === "AUTOMATIC_RESEARCH_REVIEW" || (!kind && !!row.provider_response_id)) &&
    row.export_document.pipeline?.phase !== "FINISHED" &&
    (!row.lease_expires_at || Date.parse(row.lease_expires_at)<=Date.now()) &&
    !row.export_document.taskDecisions?.length &&
    (canCheckOfficialBasics(document) || document?.research?.assessments?.some(
      assessment=>assessment.uncertainty==="NONE" && INBOX_AUTO_RESEARCH_KEYS.has(assessment.attributeKey),
    ) === true);
}
export async function GET(request:Request) {
  const auth=await authorizeAdminRequest(request);
  if(!auth.ok)return Response.json({error:auth.error},{status:auth.status,headers});
  try {
    const selected=new URL(request.url).searchParams.get("spotId");
    if(selected!==null && !WORLD_RESEARCH_SPOT_ID.test(selected)) {
      return Response.json({error:"Ungültiger Ort."},{status:400,headers});
    }
    const {service,actor}=clients(request);
    // Paginate rather than silently hiding tasks behind the former last-30-jobs limit.
    const rows:InboxRow[]=[];
    for(let page=0;page<10;page++) {
      let query=service.from("world_research_automation_jobs_v1").select(`${columns},provider_response_id`).eq("actor_id",auth.userId).gte("created_at",RESEARCH_INBOX_CUTOVER);
      if(selected) query=query.eq("spot_id",selected);
      const result=await query.order("created_at",{ascending:false}).order("id").range(page*100,page*100+99);
      if(result.error)throw new Error("Die Aufgaben konnten nicht geladen werden. Bitte erneut versuchen.");
      rows.push(...result.data as InboxRow[]);
      if(result.data.length<100)break;
      if(page===9)throw new Error("Es liegen mehr Berichte vor als auf einmal geprüft werden können. Bitte den Support informieren; es werden keine Aufgaben als erledigt ausgeblendet.");
    }
    const grouped=new Map<string,InboxRow[]>();
    for(const row of rows)grouped.set(row.spot_id,[...(grouped.get(row.spot_id) ?? []),row]);
    const summarize=(spot:InboxSpot)=>{
      const {tasks,...summary}=spot;
      return {...summary,needsReview:tasks.some(task=>allowed.has(task.attributeKey))};
    };
    if(!selected) {
      const spots=[...grouped.values()].map(items=>summarize(buildInboxSpot(items,{},()=>false)));
      return Response.json({spots,checkedAt:new Date().toISOString()},{headers});
    }

    const items=grouped.get(selected);
    if(!items) return Response.json({error:"Der Recherchebericht wurde nicht gefunden."},{status:404,headers});
    try {
      const detail=await readWorldResearchDetail(actor,selected);
      const answers=detail.answers ?? {};
      const covered=(result:ReturnType<typeof resultsFromInboxRow>[number])=>assessNuknukDraftReview({version:"nuknuk-research-v1",spotId:selected,name:detail.name,canonicalWrite:false,importable:false,results:[{...result,status:"REQUIRES_REVIEW"}]},answers)[0]?.covered===true;
      const spot=buildInboxSpot(items,answers,covered);
      spot.tasks=spot.tasks.filter(task=>allowed.has(task.attributeKey));
      const automaticallyStored = [...new Set(items.flatMap(row=>
        row.export_document.pipeline?.phase === "FINISHED" ? row.export_document.pipeline.report?.stored ?? [] : []
      ))].flatMap(attributeKey=>{
        const answer=answers[attributeKey];
        if (!allowed.has(attributeKey) || answer?.visibility !== "PUBLIC" || answer.value === undefined) return [];
        return [{attributeKey,value:answer.value}];
      });
      const latestWorkerReport=items.find(item=>item.provider_response_id);
      const preparationJob=latestWorkerReport && canPrepareResearch(latestWorkerReport) ? latestWorkerReport.id : undefined;
      return Response.json({spot:{...spot,name:detail.name,needsReview:spot.tasks.length>0,automaticallyStored,preparationJob}},{headers});
    } catch {
      throw new Error("Das Ortprofil konnte nicht abgeglichen werden. Bitte aktualisiere den Auftrag.");
    }
  } catch(cause){return Response.json({error:cause instanceof Error?cause.message:"Die Aufgaben konnten nicht geladen werden."},{status:503,headers});}
}
export async function POST(request:Request) {
  const auth=await authorizeAdminRequest(request);
  if(!auth.ok)return Response.json({error:auth.error},{status:auth.status,headers});
  const text=await request.text();
  if(text.length>2_000_000)return Response.json({error:"Die Datei ist zu gross."},{status:413,headers});
  try {
    const body=JSON.parse(text) as {action?:unknown;idempotencyKey?:unknown;document?:unknown;jobId?:unknown;spotId?:unknown;fingerprint?:unknown;claimId?:unknown;jobIds?:unknown};
    const {service,actor}=clients(request);
    if(body.action === "prepare") {
      if (typeof body.jobId !== "string" || !WORLD_RESEARCH_SPOT_ID.test(body.jobId) ||
          typeof body.spotId !== "string" || !WORLD_RESEARCH_SPOT_ID.test(body.spotId))
        throw new Error("Ungültiger Rechercheauftrag.");
      const found=await service.from("world_research_automation_jobs_v1")
        .select(`${columns},provider_response_id`).eq("actor_id",auth.userId)
        .eq("id",body.jobId).eq("spot_id",body.spotId).gte("created_at",RESEARCH_INBOX_CUTOVER).maybeSingle();
      if(found.error || !found.data)throw new Error("Der Rechercheauftrag wurde nicht gefunden.");
      const row=found.data as InboxRow;
      if(!canPrepareResearch(row))return Response.json({prepared:false},{headers});
      const document = normalizeAutomatedWorldResearchBatch(row.result_document as WorldResearchBatchDocument) as AssessedResearch;
      const exported=row.export_document as unknown as WorldResearchBatchDocument;
      if (document.exportHash !== exported.exportHash || document.batch.spots.length !== 1 ||
          document.batch.spots[0].spotId !== row.spot_id ||
          JSON.stringify(document.research.instructions) !== JSON.stringify(exported.research.instructions))
        throw new Error("Die Recherche gehört zu einem anderen Auftrag.");
      const research = document.research.spots[0];
      const claims = new Set(research.claims.map(claim => claim.attributeKey));
      document.research.assessments = (document.research.assessments ?? [])
        .filter(assessment => claims.has(assessment.attributeKey));
      // Once adopted, the stored document and its proof state must remain stable on retry.
      if (!row.export_document.pipeline && canCheckOfficialBasics(document)) {
        const detail = await readWorldResearchDetail(actor, row.spot_id);
        const spot = document.batch.spots[0];
        const website = detail.answers?.["contact.website"];
        if (website?.visibility === "PUBLIC" && website.knowledgeState === "KNOWN_VALUE" &&
            typeof website.value === "string" && website.value === spot.existingValues["contact.website"].value) {
          const missing = new Set(research.unresolved.filter(({ attributeKey }) =>
            officialBasics.has(attributeKey) && !spot.existingValues[attributeKey] && !detail.answers?.[attributeKey],
          ).map(({ attributeKey }) => attributeKey));
          const address = detail.answers?.["location.address_line1"];
          const found = missing.size ? await readOfficialSpotBasics({
            website: website.value, name: detail.name, locality: spot.locality,
            address: address?.visibility === "PUBLIC" && typeof address.value === "string" ? address.value : undefined,
          }) : [];
          for (const claim of found) {
            if (!missing.has(claim.attributeKey)) continue;
            research.claims.push(claim);
            research.unresolved = research.unresolved.filter(item => item.attributeKey !== claim.attributeKey);
            document.research.assessments.push({
              attributeKey: claim.attributeKey,
              uncertainty: claim.attributeKey === "hours.regular" ? "MINOR" : "NONE",
              bindings: {},
              reason: claim.attributeKey === "hours.regular"
                ? "Die veröffentlichten Öffnungszeiten sind als Vorschlag zur Prüfung erfasst. Nicht genannte Tage und Ausnahmen bleiben offen."
                : "Veröffentlichte Kontaktangabe auf der offiziellen Website.",
            });
          }
        }
      }
      const {report}=await processSafeResearchDocument(document,{
        actorId:auth.userId,
        inboxJobId:row.id,
        readPdf:readResearchPdf,
        repository:safeImportRepository(actor,service,auth.userId,{
          jobId:row.id,updatedAt:row.updated_at,exportDocument:row.export_document,
        }),
      });
      return Response.json({prepared:report.errors.length===0},{headers});
    }
    if(body.action === "recover") {
      const document=parseWorldResearchBatch(body.document);
      for(const spot of document.batch.spots)await readWorldResearchDetail(actor,spot.spotId);
      await persistResearchFollowups(service,auth.userId,document);
      return Response.json({saved:true,message:"Offene Angaben sind jetzt in deinen Aufgaben. Die Profile wurden nicht verändert."},{headers});
    }
    if(!["keep","accept"].includes(String(body.action)) || typeof body.spotId!=="string" || !WORLD_RESEARCH_SPOT_ID.test(body.spotId) || typeof body.fingerprint!=="string" || body.fingerprint.length>200_000 || !Array.isArray(body.jobIds) || !body.jobIds.length || body.jobIds.length>100 || body.jobIds.some(id=>typeof id!=="string" || !WORLD_RESEARCH_SPOT_ID.test(id)))throw new Error("Bitte die Aufgabe neu öffnen.");
    const [detail,found]=await Promise.all([
      readWorldResearchDetail(actor,body.spotId),
      service.from("world_research_automation_jobs_v1").select(columns).eq("actor_id",auth.userId).eq("spot_id",body.spotId).gte("created_at",RESEARCH_INBOX_CUTOVER).in("id",body.jobIds),
    ]);
    if(found.error || found.data.length!==new Set(body.jobIds).size)throw new Error("Die Aufgabe wurde nicht gefunden.");
    if (found.data.some(row=>row.lease_expires_at && Date.parse(row.lease_expires_at)>Date.now()))
      throw new Error("Die Quellenprüfung für diesen Auftrag läuft. Bitte aktualisiere die Aufgabe.");
    if(body.action === "accept")return Response.json(await acceptResearchTask(actor,service,auth.userId,found.data as InboxRow[],detail,{fingerprint:body.fingerprint,claimId:body.claimId,idempotencyKey:body.idempotencyKey}),{headers});
    for(const row of found.data as InboxRow[]) {
      const result=resultsFromInboxRow(row).find(item=>taskFingerprint(item)===body.fingerprint);
      if(!result || !allowed.has(result.attributeKey))throw new Error("Der Vorschlag wurde inzwischen geändert. Bitte neu laden.");
      const answer=detail.answers?.[result.attributeKey];
      const claimId=answer?.visibility === "PUBLIC" ? answer.claimId ?? null : null;
      if(claimId!==body.claimId)throw new Error("Das Profil wurde inzwischen geändert. Bitte neu laden.");
      const decision:InboxDecision={fingerprint:body.fingerprint,claimId,actorId:auth.userId,at:new Date().toISOString(),outcome:claimId?"KEPT_PROFILE":"LEFT_UNKNOWN"};
      const decisions=[...(row.export_document.taskDecisions ?? []).filter(item=>item.fingerprint!==body.fingerprint),decision];
      const updated=await service.from("world_research_automation_jobs_v1").update({export_document:{...row.export_document,taskDecisions:decisions},updated_at:decision.at}).eq("id",row.id).eq("actor_id",auth.userId).eq("updated_at",row.updated_at).select("id").maybeSingle();
      if(updated.error || !updated.data)throw new Error("Die Entscheidung konnte nicht vollständig gespeichert werden. Bitte neu laden und erneut versuchen.");
    }
    return Response.json({saved:true,message:"Entscheidung gespeichert. Das Profil bleibt unverändert."},{headers});
  } catch(cause){return Response.json({error:cause instanceof Error?cause.message:"Die Entscheidung konnte nicht gespeichert werden.",...(cause instanceof ResearchSaveError?{saveState:cause.saveState}:{})},{status:409,headers});}
}
