import "server-only";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest } from "@/lib/server/adminAuthorization";
import { parseProductAdminSpotSearch, productSearchFailure } from "@/lib/worldProductSpotSearch";

const noStore = { "cache-control": "no-store" };

/** Admin-only discovery over the canonical approved Production spot catalog. */
export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status, headers: noStore });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > 80 || /[\x00-\x1f\x7f]/.test(query)) {
    return Response.json({ error: "WORLD_SEARCH_INPUT_INVALID" }, { status: 400, headers: noStore });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "WORLD_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actor = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  try {
    const { data, error } = await actor.rpc("world_product_admin_search_spots_v1", { p_search: query || null, p_limit: 20 });
    if (error) {
      const failure = productSearchFailure(error);
      return Response.json({ error: failure.code }, { status: failure.status, headers: noStore });
    }
    return Response.json(parseProductAdminSpotSearch(data), { headers: noStore });
  } catch {
    return Response.json({ error: "WORLD_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
