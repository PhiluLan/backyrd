import { after } from "next/server";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { crawlerService, claimCrawlerRun, finishCrawlerRun } from "@/lib/server/spotCrawlerJobs";
import { isCrawlerCandidateVisible, parseCrawlerSettings, type CrawlerOverview, type CrawlerRunUsage, type CrawlerView } from "@/lib/spotCrawler";

export const runtime = "nodejs";
export const maxDuration = 60;
const noStore = {"cache-control":"no-store"};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:noStore});

async function visiblePreview(client: Awaited<ReturnType<typeof crawlerService>>, cursor: number, view: CrawlerView) {
  // Skip pages filled entirely with past decisions using the existing cursor.
  // Bound each request so long archives can still be traversed via pagination.
  for (let pages = 0; pages < 4; pages++) {
    const { data, error } = await client.rpc("admin_backyrd_spot_crawler_preview_v1", { p_after: cursor });
    if (error || !Array.isArray(data?.rows)) throw new Error("crawler_preview_failed");
    const overview = data as CrawlerOverview;
    const rows = overview.rows.filter(row => isCrawlerCandidateVisible(row, view));
    if (rows.length || overview.next_after === null || pages === 3) return { ...overview, rows };
    if (overview.next_after <= cursor) throw new Error("crawler_preview_cursor_invalid");
    cursor = overview.next_after;
  }
  throw new Error("crawler_preview_unavailable");
}

export async function GET(request: Request) {
  const authorization=await authorizeAdminRequest(request);
  if (!authorization.ok) return json({error:authorization.error},authorization.status);
  const params = new URL(request.url).searchParams;
  const cursor = params.get("after") ?? "0";
  const view = params.get("view") ?? "open";
  if (!/^\d{1,10}$/u.test(cursor) || Number(cursor)>2147483647) return json({error:"INVALID_CURSOR"},400);
  if (view !== "open" && view !== "hold" && view !== "history") return json({error:"INVALID_VIEW"},400);
  try {
    const [settings,preview,usage]=await Promise.all([
      crawlerService().rpc("backyrd_spot_crawler_settings_v1"),
      visiblePreview(authorization.client, Number(cursor), view),
      authorization.client.rpc("admin_backyrd_crawler_run_usage_v1"),
    ]);
    if (settings.error || !parseCrawlerSettings(settings.data)) return json({error:"CRAWLER_UNAVAILABLE"},503);
    const perRun = (usage.error ? {} : usage.data ?? {}) as Record<string, CrawlerRunUsage>;
    const overview = { ...preview, runs: preview.runs.map(run => ({ ...run, usage: perRun[String(run.id)] })) };
    return json({settings:settings.data,overview,searchConfigured:!!process.env.BRAVE_SEARCH_API_KEY,
      scheduleConfigured:!!process.env.CRON_SECRET});
  } catch { return json({error:"CRAWLER_UNAVAILABLE"},503); }
}

export async function POST(request: Request) {
  const authorization=await authorizeAdminRequest(request);
  if (!authorization.ok) return json({error:authorization.error},authorization.status);
  const body=await request.text().catch(()=>"");
  if (Buffer.byteLength(body)>12000) return json({error:"REQUEST_TOO_LARGE"},413);
  let input: {action?:unknown;settings?:unknown;revision?:unknown};
  try {
    input=JSON.parse(body);
    if (!input || typeof input!=="object" || Array.isArray(input)) return json({error:"INVALID_SETTINGS"},400);
  } catch { return json({error:"INVALID_SETTINGS"},400); }
  try {
    const service=crawlerService();
    if (input.action==="save") {
      const settings=parseCrawlerSettings(input.settings);
      if (!settings || typeof input.revision!=="string" || !/^\d{1,19}$/u.test(input.revision))
        return json({error:"INVALID_SETTINGS"},400);
      const {data,error}=await service.rpc("backyrd_spot_crawler_settings_v1",{p_settings:settings,p_revision:input.revision});
      if (error) return json({error:error.code==="40001"?"SETTINGS_CHANGED":"CRAWLER_UNAVAILABLE"},error.code==="40001"?409:503);
      return json({settings:data});
    }
    if (input.action!=="start") return json({error:"INVALID_SETTINGS"},400);
    const run=await claimCrawlerRun(service,false);
    if (!run || run.id === undefined) return json({error:run?.reason ?? "CRAWLER_UNAVAILABLE"},409);
    after(()=>finishCrawlerRun(service,run));
    return json({runId:run.id},202);
  } catch { return json({error:"CRAWLER_UNAVAILABLE"},503); }
}
