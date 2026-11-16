import "server-only";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { buildSeoReport } from "@/lib/analyticsSeo";

const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers });
  return Response.json(await buildSeoReport(request.signal), { headers });
}
