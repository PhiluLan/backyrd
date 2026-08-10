import { supabase } from "./supabase";

export type DistributionSurface =
  | "decision"
  | "search"
  | "discovery"
  | "feed"
  | "maps";

type EligibilityRow = {
  entity_id: string;
  eligible: boolean;
  distribution_priority: number;
};

/**
 * Applies the canonical server-side Distribution decision without exposing
 * Trust evidence or policy reasons to the client. The original product score
 * and ordering are preserved within each Distribution priority tier.
 */
export async function filterDistributedEntities<T extends { id: string }>(
  items: T[],
  entityType: "spot" | "review" | "social_post",
  surface: DistributionSurface,
): Promise<T[]> {
  const unique = Array.from(new Map(items.map((item) => [item.id, item])).values());
  if (unique.length === 0) return [];

  const { data, error } = await supabase.rpc(
    "distribution_trust_filter_entities_v1",
    {
      p_entity_type: entityType,
      p_entity_ids: unique.map((item) => item.id),
      p_surface: surface,
    },
  );

  if (error) throw error;

  const priorities = new Map(
    ((data ?? []) as EligibilityRow[])
      .filter((row) => row.eligible)
      .map((row) => [row.entity_id, Number(row.distribution_priority)]),
  );
  const originalOrder = new Map(unique.map((item, index) => [item.id, index]));

  return unique
    .filter((item) => priorities.has(item.id))
    .sort((a, b) =>
      (priorities.get(b.id) ?? 0) - (priorities.get(a.id) ?? 0)
      || (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0)
    );
}

export async function filterDistributedSpots<T extends { id: string }>(
  items: T[],
  surface: Exclude<DistributionSurface, "feed">,
): Promise<T[]> {
  return filterDistributedEntities(items, "spot", surface);
}
