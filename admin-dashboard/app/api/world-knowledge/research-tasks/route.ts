import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AUTHORING_FIELDS, parseWorldResearchBatch } from "@backyrd/world-knowledge-core";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { readWorldResearchDetail, WORLD_RESEARCH_SPOT_ID } from "@/lib/server/worldResearchExport";
import { assessNuknukDraftReview } from "@/lib/nuknukDraftImport";
import { buildInboxSpot, resultsFromInboxRow, taskFingerprint, type InboxRow, type InboxDecision } from "@/lib/researchInbox";
import { persistResearchFollowups } from "@/lib/server/researchFollowups";
const headers={"cache-control":"no-store"};
function clients(request:Request) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !anon || !key)throw new Error("Die Aufgaben sind momentan nicht erreichbar.");
  return {service:createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),actor:createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:request.headers.get("authorization")!}}})};
}
const columns="id,actor_id,spot_id,spot_name,status,created_at,updated_at,reviewed_at,export_document,result_document";
const allowed=new Set(AUTHORING_FIELDS.map(field=>field.attributeKey));
export async function GET(request:Request) {
  const auth=await authorizeAdminRequest(request);
  if(!auth.ok)return Response.json({error:auth.error},{status:auth.status,headers});
  try {
    const {service,actor}=clients(request);
    // Paginate rather than silently hiding tasks behind the former last-30-jobs limit.
    const rows:InboxRow[]=[];
    for(let page=0;page<10;page++) {
      const result=await service.from("world_research_automation_jobs_v1").select(columns).eq("actor_id",auth.userId).order("created_at",{ascending:false}).order("id").range(page*100,page*100+99);
      if(result.error)throw new Error("Die Aufgaben konnten nicht geladen werden. Bitte erneut versuchen.");
      rows.push(...result.data as InboxRow[]);
      if(result.data.length<100)break;
      if(page===9)throw new Error("Es liegen mehr Berichte vor als auf einmal geprüft werden können. Bitte den Support informieren; es werden keine Aufgaben als erledigt ausgeblendet.");
    }
    const grouped=new Map<string,InboxRow[]>();
    for(const row of rows)grouped.set(row.spot_id,[...(grouped.get(row.spot_id) ?? []),row]);
    const spots=[];
    for(const [spotId,items] of grouped) {
      try {
        const detail=await readWorldResearchDetail(actor,spotId);
        const answers=detail.answers ?? {};
        const covered=(result:ReturnType<typeof resultsFromInboxRow>[number])=>assessNuknukDraftReview({version:"nuknuk-research-v1",spotId,name:detail.name,canonicalWrite:false,importable:false,results:[{...result,status:"REQUIRES_REVIEW"}]},answers)[0]?.covered===true;
        const spot=buildInboxSpot(items,answers,covered);
        spot.tasks=spot.tasks.filter(task=>allowed.has(task.attributeKey));spot.name=detail.name;
        spots.push(spot);
      } catch { spots.push({...buildInboxSpot(items,{},()=>false),unavailable:true}); }
    }
    return Response.json({spots,checkedAt:new Date().toISOString()},{headers});
  } catch(cause){return Response.json({error:cause instanceof Error?cause.message:"Die Aufgaben konnten nicht geladen werden."},{status:503,headers});}
}
export async function POST(request:Request) {
  const auth=await authorizeAdminRequest(request);
  if(!auth.ok)return Response.json({error:auth.error},{status:auth.status,headers});
  const text=await request.text();
  if(text.length>2_000_000)return Response.json({error:"Die Datei ist zu gross."},{status:413,headers});
  try {
    const body=JSON.parse(text) as {action?:unknown;document?:unknown;spotId?:unknown;fingerprint?:unknown;claimId?:unknown;jobIds?:unknown};
    const {service,actor}=clients(request);
    if(body.action === "recover") {
      const document=parseWorldResearchBatch(body.document);
      for(const spot of document.batch.spots)await readWorldResearchDetail(actor,spot.spotId);
      await persistResearchFollowups(service,auth.userId,document);
      return Response.json({saved:true,message:"Offene Angaben sind jetzt in deinen Aufgaben. Die Profile wurden nicht verändert."},{headers});
    }
    if(body.action!=="keep" || typeof body.spotId!=="string" || !WORLD_RESEARCH_SPOT_ID.test(body.spotId) || typeof body.fingerprint!=="string" || body.fingerprint.length>50_000 || !Array.isArray(body.jobIds) || !body.jobIds.length || body.jobIds.length>100 || body.jobIds.some(id=>typeof id!=="string" || !WORLD_RESEARCH_SPOT_ID.test(id)))throw new Error("Bitte die Aufgabe neu öffnen.");
    const detail=await readWorldResearchDetail(actor,body.spotId);
    const found=await service.from("world_research_automation_jobs_v1").select(columns).eq("actor_id",auth.userId).eq("spot_id",body.spotId).in("id",body.jobIds);
    if(found.error || found.data.length!==new Set(body.jobIds).size)throw new Error("Die Aufgabe wurde nicht gefunden.");
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
  } catch(cause){return Response.json({error:cause instanceof Error?cause.message:"Die Entscheidung konnte nicht gespeichert werden."},{status:409,headers});}
}
