export type WorldResearchQueueSpot = Readonly<{
  spotId: string;
  name: string;
  city: string | null;
  exportedAt: string | null;
  importedAt: string | null;
}>;

export type WorldResearchQueue = Readonly<{
  contractVersion: "backyrd.world-research-queue@1.0";
  page: number;
  pageSize: 10;
  total: number;
  exported: number;
  imported: number;
  spots: readonly WorldResearchQueueSpot[];
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validTime = (value: unknown) => value === null || typeof value === "string" && !Number.isNaN(Date.parse(value));
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export function parseWorldResearchQueue(value: unknown): WorldResearchQueue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("world_research_queue_invalid");
  const result = value as Record<string, unknown>;
  if (!exactKeys(result, ["contractVersion", "page", "pageSize", "total", "exported", "imported", "spots"])
    || result.contractVersion !== "backyrd.world-research-queue@1.0"
    || !Number.isSafeInteger(result.page) || (result.page as number) < 1
    || result.pageSize !== 10 || !Number.isSafeInteger(result.total) || (result.total as number) < 0
    || !Number.isSafeInteger(result.exported) || (result.exported as number) < 0
    || !Number.isSafeInteger(result.imported) || (result.imported as number) < 0
    || (result.exported as number) > (result.total as number)
    || (result.imported as number) > (result.total as number)
    || !Array.isArray(result.spots) || result.spots.length > 10) throw new Error("world_research_queue_invalid");
  const seen = new Set<string>();
  for (const item of result.spots) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("world_research_queue_spot_invalid");
    const spot = item as Record<string, unknown>;
    if (!exactKeys(spot, ["spotId", "name", "city", "exportedAt", "importedAt"])
      || typeof spot.spotId !== "string" || !uuid.test(spot.spotId) || seen.has(spot.spotId)
      || typeof spot.name !== "string" || !spot.name.trim() || spot.name.length > 200
      || !(spot.city === null || typeof spot.city === "string" && spot.city.length <= 200)
      || !validTime(spot.exportedAt) || !validTime(spot.importedAt)) throw new Error("world_research_queue_spot_invalid");
    seen.add(spot.spotId);
  }
  return result as WorldResearchQueue;
}
