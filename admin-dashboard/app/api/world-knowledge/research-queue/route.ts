import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { parseWorldResearchQueue } from "@/lib/worldResearchQueue";
import { productSearchFailure } from "@/lib/worldProductSpotSearch";

const noStore = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,4}$/.test(rawPage)) return Response.json({ error: "WORLD_RESEARCH_PAGE_INVALID" }, { status: 400, headers: noStore });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "WORLD_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actor = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    const { data, error } = await actor.rpc("world_product_admin_research_queue_v1", { p_page: Number(rawPage) });
    if (error) {
      const failure = productSearchFailure(error);
      return Response.json({ error: failure.code }, { status: failure.status, headers: noStore });
    }
    return Response.json(parseWorldResearchQueue(data), { headers: noStore });
  } catch {
    return Response.json({ error: "WORLD_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
