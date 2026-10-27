import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supplementResearchValue } from "../nuknukDraftImport";
import { resultsFromInboxRow, taskFingerprint, type InboxRow } from "../researchInbox";
import { researchFieldEdit } from "./researchFieldEdit";
import type { WorldResearchDetail } from "./worldResearchExport";

/** The button confirms a server-stored proposal, never a value supplied by the browser. */
export async function acceptResearchTask(actor:SupabaseClient,service:SupabaseClient,actorId:string,rows:InboxRow[],detail:WorldResearchDetail,input:{fingerprint:string;claimId:unknown;idempotencyKey:unknown}) {
  const proposals=rows.map(row=>{
    if(row.actor_id!==actorId || row.spot_id!==detail.spotId || row.reviewed_at)throw new Error("Bitte die Aufgabe neu öffnen.");
    const result=resultsFromInboxRow(row).find(item=>taskFingerprint(item)===input.fingerprint);
    if(!result || result.value===undefined)throw new Error("Hier fehlt noch eine eindeutige Angabe. Bitte trage sie zuerst ein.");
    return result;
  });
  const result=proposals[0];
  if(!result || !detail.actor?.allowedAttributeKeys?.includes(result.attributeKey))throw new Error("Diese Angabe darf nicht übernommen werden.");
  const current=detail.answers?.[result.attributeKey];
  if((current?.claimId ?? null)!==input.claimId)throw new Error("Die bisherige Angabe wurde inzwischen geändert. Bitte öffne die Aufgabe erneut.");
  const publicAnswer=current?.visibility==="PUBLIC" && current.knowledgeState?{knowledgeState:current.knowledgeState,value:current.value}:undefined;
  const value=supplementResearchValue(result.attributeKey,publicAnswer,result.value);
  const knowledgeState=typeof value==="boolean"?value?"KNOWN_TRUE":"KNOWN_FALSE":"KNOWN_VALUE";
  const saved=await researchFieldEdit(actor,service,actorId,{spotId:detail.spotId,attributeKey:result.attributeKey,knowledgeState,value,expectedClaimId:input.claimId,idempotencyKey:input.idempotencyKey},true);
  return {saved:true,answer:saved.answer,message:"Die geprüfte Angabe ist im Ortprofil gespeichert."};
}
