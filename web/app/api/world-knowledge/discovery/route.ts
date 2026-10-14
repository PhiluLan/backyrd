import { createDiscoveryPreparationHttpHandler } from "@backyrd/world-knowledge-core";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createDiscoveryPreparationHttpHandler({
    apiKey: process.env.OPENAI_API_KEY ?? process.env.DECISION_PRODUCT_OPENAI_API_KEY,
    loadPublicMaterial: async (token, spotId, sourceHash, signal) => {
      if (!url || !key) return null;
      const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/world_product_discovery_prepare_context_v1`, {
        method: "POST", redirect: "error", cache: "no-store", signal,
        headers: { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ p_spot_id: spotId, p_source_hash: sourceHash }),
      });
      if(response.status===429)throw new Error("discovery_preparation_rate_limited");
      if (!response.ok) return null;
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("sourceText" in data) || !("visibility" in data) || !("sourceHash" in data)
        || data.visibility !== "PUBLIC" || data.sourceHash !== sourceHash || typeof data.sourceText !== "string") return null;
      return data.sourceText;
    },
  })(request);
}
