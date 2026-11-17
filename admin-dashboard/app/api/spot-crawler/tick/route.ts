import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { claimCrawlerRun, crawlerService, finishCrawlerRun } from "@/lib/server/spotCrawlerJobs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret=process.env.CRON_SECRET;
  const token=Buffer.from(request.headers.get("authorization") ?? "");
  const expected=Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || token.length!==expected.length || !timingSafeEqual(token,expected))
    return new Response(null,{status:401});
  try {
    const service=crawlerService();
    const run=await claimCrawlerRun(service,true);
    if (!run || run.id === undefined) return Response.json({started:false,reason:run?.reason ?? "NOT_DUE"});
    after(()=>finishCrawlerRun(service,run));
    return Response.json({started:true,runId:run.id},{status:202});
  } catch { return Response.json({started:false,reason:"CRAWLER_UNAVAILABLE"},{status:503}); }
}
