import { PRIMARY_CATEGORIES, type PrimaryCategory } from "@backyrd/world-knowledge-core/browser";

export type CategoryFilter = "all" | "unassigned" | PrimaryCategory;
export type FilterableSpot = { name: string; city: string | null; status: string | null; primary_category?: PrimaryCategory | null };
export type SpotListFilter = { search: string; status: string; category: CategoryFilter };
export function categoryFilter(value: string | null): CategoryFilter {
  return value === "unassigned" || (PRIMARY_CATEGORIES as readonly string[]).includes(value ?? "") ? value as CategoryFilter : "all";
}

/** Missing metadata is a backend capability gap, never an unassigned category. */
export function hasCategoryMetadata(input: unknown): boolean {
  if (typeof input !== "object" || !input || !("categorySource" in input) || input.categorySource !== "WORLD_AUTHORING_CURRENT_V1" || !("spots" in input) || !Array.isArray(input.spots)) return false;
  return input.spots.every((spot: unknown) => {
    if (typeof spot !== "object" || !spot || !("primary_category" in spot)) return false;
    return spot.primary_category === null || (typeof spot.primary_category === "string" && (PRIMARY_CATEGORIES as readonly string[]).includes(spot.primary_category));
  });
}

export function filterSpots<T extends FilterableSpot>(spots: readonly T[], filter: SpotListFilter): T[] {
  const query = filter.search.trim().toLocaleLowerCase("de-CH");
  return spots.filter(spot => (filter.status === "all" || spot.status === filter.status)
    && (filter.category === "all" || (filter.category === "unassigned" ? spot.primary_category === null : spot.primary_category === filter.category))
    && (!query || `${spot.name} ${spot.city ?? ""}`.toLocaleLowerCase("de-CH").includes(query)));
}

/** Count available categories within the text/status search, before pagination. */
export function categoryCounts(spots: readonly FilterableSpot[], filter: Omit<SpotListFilter, "category">): Record<string, number> {
  const counts: Record<string, number> = { all: 0, unassigned: 0 };
  for (const spot of filterSpots(spots, { ...filter, category: "all" })) {
    counts.all += 1;
    if (spot.primary_category === undefined) continue;
    const key = spot.primary_category ?? "unassigned";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function spotListQuery(filter: SpotListFilter, preset: string): string {
  const query = new URLSearchParams();
  if (filter.search) query.set("suche", filter.search);
  if (filter.status !== "all") query.set("status", filter.status);
  if (filter.category !== "all") query.set("kategorie", filter.category);
  if (preset !== "month") query.set("zeitraum", preset);
  return query.toString();
}

/** The category filter needs the complete catalogue, not a silently capped first
 * RPC page. Abort honestly on an incomplete/changing list instead of showing a
 * misleading zero-result count. Normal catalogues require one request. */
export async function loadAllSpotPages<T extends { spots: { spot_id: string }[]; summary: { spots: number } }>(read: (offset: number) => Promise<T>): Promise<T> {
  const first = await read(0);
  const total = first?.summary?.spots;
  const failure = "Die Spotübersicht konnte nicht vollständig geladen werden. Bitte aktualisiere die Seite.";
  if (!Number.isSafeInteger(total) || total < 0 || total > 100000 || !Array.isArray(first.spots)) throw new Error(failure);
  const spots = [...first.spots];
  const seen = new Set<string>();
  const accept = (rows: T["spots"]) => {
    for (const row of rows) {
      if (!row || typeof row.spot_id !== "string" || seen.has(row.spot_id)) throw new Error(failure);
      seen.add(row.spot_id);
    }
  };
  accept(spots);
  while (spots.length < total) {
    const next = await read(spots.length);
    if (next?.summary?.spots !== total || !Array.isArray(next.spots) || next.spots.length === 0) throw new Error(failure);
    accept(next.spots);
    spots.push(...next.spots);
  }
  if (spots.length !== total) throw new Error(failure);
  return { ...first, spots };
}
