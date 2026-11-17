import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseCrawlerSettings } from "../spotCrawler";
import { discoverCrawlerSpots } from "./spotCrawlerDiscovery";

export function crawlerService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CRAWLER_BACKEND_NOT_CONFIGURED");
  return createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
}

export async function claimCrawlerRun(service: ReturnType<typeof crawlerService>, scheduled: boolean) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return {reason:"SEARCH_NOT_CONFIGURED"} as const;
  const {data,error}=await service.rpc("backyrd_spot_crawler_claim_v1",{p_scheduled:scheduled});
  if (error) throw new Error("RUN_CLAIM_FAILED");
  if (data===null) return null;
  if (data.reason==="RUN_ACTIVE" || data.reason==="BUDGET_REACHED") return {reason:data.reason as "RUN_ACTIVE" | "BUDGET_REACHED"};
  const settings=parseCrawlerSettings(data.settings);
  if (!settings || !Number.isSafeInteger(data.id)) throw new Error("RUN_CONFIGURATION_INVALID");
  return {id:data.id as number,settings};
}

export async function finishCrawlerRun(service: ReturnType<typeof crawlerService>, run: {id:number;settings:NonNullable<ReturnType<typeof parseCrawlerSettings>>}) {
  const key=process.env.BRAVE_SEARCH_API_KEY;
  let candidates: Awaited<ReturnType<typeof discoverCrawlerSpots>>["candidates"]=[];
  let reason: string|null=null;
  try {
    if (!key) throw new Error("SEARCH_NOT_CONFIGURED");
    candidates=(await discoverCrawlerSpots(run.settings,run.id,key)).candidates.slice(0,100);
  } catch(error) {
    const code=error instanceof Error ? error.message : "";
    reason=["SEARCH_NOT_CONFIGURED","SEARCH_RATE_LIMIT","SEARCH_UNAVAILABLE","SOURCES_UNAVAILABLE","RUN_TIME_LIMIT"].includes(code)?code:"CRAWL_FAILED";
  }
  const result=await service.rpc("backyrd_spot_crawler_finish_v1",{p_run:run.id,p_candidates:candidates,p_outcome:reason});
  if (result.error) {
    console.error("Crawler result could not be recorded", {runId:run.id,code:result.error.code});
    await service.rpc("backyrd_spot_crawler_finish_v1",{p_run:run.id,p_candidates:[],p_outcome:"RESULT_NOT_SAVED"});
  }
}
