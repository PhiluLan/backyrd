import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorldResearchBatchDocument } from "@backyrd/world-knowledge-core";
import type { ResearchResult } from "../nuknukResearchDraft";
import { FOLLOWUP_KIND } from "../researchInbox";

type ImportReport = {spotId:string; unresolvedDetails:Array<{attributeKey:string;reason:string}>; imported:string[]; skipped:string[]; declined:string[]};
/** Terminal jobs store review work only. They never enter the research worker or write profile claims. */
export async function persistResearchFollowups(service:SupabaseClient,actorId:string,document:WorldResearchBatchDocument,reports?:ImportReport[]) {
  for(const exported of document.batch.spots) {
    const spot=document.research.spots.find(item=>item.spotId===exported.spotId)!;
    const report=reports?.find(item=>item.spotId===exported.spotId);
    const settled=new Set([...(report?.imported ?? []),...(report?.skipped ?? []),...(report?.declined ?? [])]);
    const results:ResearchResult[]=[...(report?.unresolvedDetails ?? spot.unresolved).map(gap=>({...gap,status:"UNKNOWN"})),
      ...(reports ? spot.claims.filter(claim=>!settled.has(claim.attributeKey)).map(claim=>({attributeKey:claim.attributeKey,status:"REQUIRES_REVIEW",value:claim.value,reason:"Bitte den Recherchevorschlag mit dem Profil vergleichen.",citations:[claim.source,...(claim.supportingSources ?? [])]})) : [])];
    const digest=createHash("sha256").update(`${actorId}:${document.batch.batchId}:${exported.spotId}:followup`).digest("hex");
    const id=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
    const prior=await service.from("world_research_automation_jobs_v1").select("id").eq("id",id).eq("actor_id",actorId).maybeSingle();
    if(prior.error)throw new Error("Die offenen Aufgaben konnten nicht gespeichert werden.");
    if(prior.data)continue; // Preserve prior Admin decisions on retry.
    const saved=await service.from("world_research_automation_jobs_v1").insert({id,actor_id:actorId,spot_id:exported.spotId,spot_name:exported.name,status:"READY_FOR_REVIEW",
      export_document:{kind:FOLLOWUP_KIND,batchId:document.batch.batchId,sourceDigest:createHash("sha256").update(JSON.stringify(document)).digest("hex")},
      result_document:{results},completed_at:new Date().toISOString()});
    if(saved.error && saved.error.code!=="23505")throw new Error("Die offenen Aufgaben konnten nicht gespeichert werden.");
  }
}
