import { parseDiscoveryProfile, type DiscoveryProfile } from "@backyrd/world-knowledge-core";
import type { WorldAuthoringClient } from "./session";
/** Publication is explicit in the UI; upstream text is loaded server-side from
 * this canonical PUBLIC claim, never copied from the import request body. */
export async function preparePublicDiscovery(client:WorldAuthoringClient,token:string,spotId:string,sourceText:string,rebuild:(spotId:string,idempotencyKey:string)=>Promise<unknown>):Promise<DiscoveryProfile>{
  const idempotency=crypto.randomUUID();
  const submitted=await client.rpc("world_product_discovery_publish_source_v1",{p_spot_id:spotId,p_source_text:sourceText,p_idempotency_key:idempotency});
  if(submitted.error)throw new Error("discovery_publication_failed");
  const data=submitted.data;
  if(data && typeof data==="object" && "visibility" in data && data.visibility==="SHADOW_HELD")throw new Error("discovery_source_review_required");
  if(!data||typeof data!=="object"||!("sourceHash" in data)||typeof data.sourceHash!=="string")throw new Error("discovery_publication_invalid");
  try { await rebuild(spotId,`${idempotency}:source-rebuild`); } catch { throw new Error("discovery_source_rebuild_failed"); }
  const response=await fetch("/api/world-knowledge/discovery",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({spotId,sourceHash:data.sourceHash,consentToOpenAI:true})});
  if(!response.ok){
    const failure:unknown=await response.json().catch(()=>null);
    const safeCodes=new Set(["authentication_required","preparation_unavailable","preparation_rate_limited","preparation_timeout","public_source_scope_or_budget_denied"]);
    const code=failure&&typeof failure==="object"&&"error" in failure&&typeof failure.error==="string"?failure.error:"";
    throw new Error(safeCodes.has(code)?code:"discovery_preparation_failed");
  }
  const output:unknown=await response.json();if(!output||typeof output!=="object"||!("draft" in output))throw new Error("discovery_preparation_invalid");
  return parseDiscoveryProfile(output.draft,false);
}
