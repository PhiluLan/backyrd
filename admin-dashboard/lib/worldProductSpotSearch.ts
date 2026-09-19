export type ProductAdminSpot = Readonly<{ spotId: string; name: string; city: string | null }>;
export type ProductAdminSpotSearch = Readonly<{
  contractVersion: "backyrd.world-knowledge.product-admin-spot-search@1.0";
  spots: readonly ProductAdminSpot[];
  hasMore: boolean;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export function parseProductAdminSpotSearch(value: unknown): ProductAdminSpotSearch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("world_product_search_contract_invalid");
  const result = value as Record<string, unknown>;
  if (!exactKeys(result, ["contractVersion", "spots", "hasMore"])
    || result.contractVersion !== "backyrd.world-knowledge.product-admin-spot-search@1.0"
    || !Array.isArray(result.spots) || result.spots.length > 30 || typeof result.hasMore !== "boolean") {
    throw new Error("world_product_search_contract_invalid");
  }
  const seen = new Set<string>();
  for (const candidate of result.spots) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("world_product_search_spot_invalid");
    const spot = candidate as Record<string, unknown>;
    if (!exactKeys(spot, ["spotId", "name", "city"])
      || typeof spot.spotId !== "string" || !uuid.test(spot.spotId)
      || typeof spot.name !== "string" || !spot.name.trim() || spot.name.length > 200
      || !(spot.city === null || typeof spot.city === "string" && spot.city.length <= 200)
      || seen.has(spot.spotId)) throw new Error("world_product_search_spot_invalid");
    seen.add(spot.spotId);
  }
  return result as ProductAdminSpotSearch;
}

export function productSearchFailure(error: { code?: string; message?: string } | null): { status: number; code: string } {
  if (["PGRST202", "42883", "42P01"].includes(error?.code ?? "")) {
    return { status: 503, code: "WORLD_BACKEND_NOT_PUBLISHED" };
  }
  if (error?.code === "42501") return { status: 403, code: "WORLD_ADMIN_FORBIDDEN" };
  return { status: 503, code: "WORLD_SERVICE_UNAVAILABLE" };
}
