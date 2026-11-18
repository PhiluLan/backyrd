import "server-only";
import { createClient } from "@supabase/supabase-js";
import { parseCrawlerSettings, type CrawlerFacts } from "../spotCrawler";
import { discoverCrawlerSpots } from "./spotCrawlerDiscovery";
import { enrichCrawlerCandidates } from "./spotCrawlerBasics";

export function crawlerService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CRAWLER_BACKEND_NOT_CONFIGURED");
  return createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
}

export async function claimCrawlerRun(service: ReturnType<typeof crawlerService>, scheduled: boolean) {
  const {data,error}=await service.rpc("backyrd_spot_crawler_claim_v1",{p_scheduled:scheduled});
  if (error) throw new Error("RUN_CLAIM_FAILED");
  if (data===null) return null;
  if (data.reason==="RUN_ACTIVE" || data.reason==="BUDGET_REACHED") return {reason:data.reason as "RUN_ACTIVE" | "BUDGET_REACHED"};
  const settings=parseCrawlerSettings(data.settings);
  if (!settings || !Number.isSafeInteger(data.id)) throw new Error("RUN_CONFIGURATION_INVALID");
  return {id:data.id as number,settings};
}

export async function finishCrawlerRun(service: ReturnType<typeof crawlerService>, run: {id:number;settings:NonNullable<ReturnType<typeof parseCrawlerSettings>>}) {
  const started = Date.now();
  const key = process.env.BRAVE_SEARCH_API_KEY;
  let web: CrawlerFacts[] = [];
  let webSearches: number | null = 0;
  let failure: string | null = null;
  if (key) {
    try {
      const result = await discoverCrawlerSpots(run.settings, run.id, key, started + 32000);
      web = result.candidates.slice(0, 100);
      webSearches = result.searchResponses === result.searchesAttempted ? result.searchesAttempted : null;
    } catch (error) {
      webSearches = null;
      const code = error instanceof Error ? error.message : "";
      failure = ["SEARCH_RATE_LIMIT", "SEARCH_UNAVAILABLE", "SOURCES_UNAVAILABLE", "RUN_TIME_LIMIT"].includes(code) ? code : "CRAWL_FAILED";
    }
  }
  try {
    const { data, error } = await service.rpc("backyrd_crawler_shortlist_v1", { p_run: run.id, p_web: web });
    if (error || !Array.isArray(data)) throw new Error("SHORTLIST_UNAVAILABLE");
    if (!data.length && (failure || !key)) {
      await service.rpc("backyrd_spot_crawler_finish_v1", { p_run: run.id, p_candidates: [], p_outcome: failure ?? "SEARCH_NOT_CONFIGURED" });
      return;
    }
    const { results, usage } = await enrichCrawlerCandidates(data as CrawlerFacts[], {
      deadline: started + 51000, brave: key, openai: process.env.OPENAI_API_KEY, searches: webSearches,
    });
    const saved = await service.rpc("backyrd_crawler_finish_basics_v1", { p_run: run.id, p_candidates: results, p_usage: usage });
    if (saved.error) throw new Error("RESULT_NOT_SAVED");
    console.info("Crawler run finished", { runId: run.id, newCandidates: saved.data, ...usage });
  } catch (error) {
    console.error("Crawler result could not be recorded", { runId: run.id, code: error instanceof Error ? error.message : "RESULT_NOT_SAVED" });
    await service.rpc("backyrd_spot_crawler_finish_v1", { p_run: run.id, p_candidates: [], p_outcome: "RESULT_NOT_SAVED" });
  }
}
