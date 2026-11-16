import "server-only";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { parsePageViews } from "@/lib/analyticsPages";

const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers });

  const range = new URL(request.url).searchParams;
  const from = Date.parse(range.get("from") ?? "");
  const to = Date.parse(range.get("to") ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to > Date.now() + 300_000 || to - from > 370 * 86_400_000) {
    return Response.json({ error: "invalid_range" }, { status: 400, headers });
  }

  const { data, error } = await authorization.client.rpc("admin_analytics_pageviews_v1", {
    p_from: new Date(from).toISOString(),
    p_to: new Date(to).toISOString(),
  }).abortSignal(AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]));
  const pageViews = error ? null : parsePageViews(data);
  if (!pageViews) return Response.json({ error: "page_views_unavailable" }, { status: 502, headers });
  return Response.json(pageViews, { headers });
}
