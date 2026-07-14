import { supabase } from "@/lib/supabase/client";
import { extractOwnerError } from "@/lib/owner-api";

export type DatePreset = "today"|"yesterday"|"week"|"month"|"year";
export function rangeForPreset(preset: DatePreset){
  const now=new Date(); const to=now.toISOString(); const from=new Date(now);
  if(preset==="today") from.setHours(0,0,0,0);
  if(preset==="yesterday"){from.setDate(from.getDate()-1);from.setHours(0,0,0,0);const end=new Date(from);end.setDate(end.getDate()+1);return{from:from.toISOString(),to:end.toISOString()};}
  if(preset==="week") from.setDate(from.getDate()-7);
  if(preset==="month") from.setDate(from.getDate()-30);
  if(preset==="year") from.setDate(from.getDate()-365);
  return{from:from.toISOString(),to};
}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const{data,error}=await supabase.rpc(name,args);if(error)throw new Error(extractOwnerError(error));return data as T;}
export const getOwnerOverview=(from:string,to:string)=>rpc<any>("owner_intelligence_overview_v1",{p_from:from,p_to:to});
export const getOwnerDecision=(from:string,to:string)=>rpc<any>("owner_decision_intelligence_v1",{p_from:from,p_to:to});
export const getOwnerMoments=(from:string,to:string)=>rpc<any>("owner_moments_intelligence_v1",{p_from:from,p_to:to});
export const getOwnerSpotPerformance=(spotId:string,from:string,to:string)=>rpc<any>("owner_spot_performance_v1",{p_spot_id:spotId,p_from:from,p_to:to});
