import { supabase } from "./supabase";

export type MobileTaxonomyNodeType =
  | "subcategory"
  | "feature"
  | "offering"
  | "service";

export type MobileSpotTaxonomyItem = {
  taxonomy_node_id: string;
  slug: string;
  node_type: MobileTaxonomyNodeType;
  label: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  source: string;
  confidence: number;
  is_verified: boolean;
  ml_weight: number;
};

export type MobileTaxonomyGroups = {
  subcategories: MobileSpotTaxonomyItem[];
  features: MobileSpotTaxonomyItem[];
  offerings: MobileSpotTaxonomyItem[];
  services: MobileSpotTaxonomyItem[];
};

export async function getMobileSpotTaxonomy(
  spotId: string,
  locale = "de",
): Promise<MobileSpotTaxonomyItem[]> {
  const { data, error } = await supabase.rpc("get_mobile_spot_taxonomy_v1", {
    p_spot_id: spotId,
    p_locale: locale,
  });

  if (error) throw new Error(error.message);

  return Array.isArray(data)
    ? (data as MobileSpotTaxonomyItem[]).map((item) => ({
        ...item,
        sort_order: Number(item.sort_order ?? 0),
        confidence: Number(item.confidence ?? 1),
        ml_weight: Number(item.ml_weight ?? 1),
      }))
    : [];
}

export function groupMobileTaxonomy(
  items: MobileSpotTaxonomyItem[],
): MobileTaxonomyGroups {
  return {
    subcategories: items.filter((item) => item.node_type === "subcategory"),
    features: items.filter((item) => item.node_type === "feature"),
    offerings: items.filter((item) => item.node_type === "offering"),
    services: items.filter((item) => item.node_type === "service"),
  };
}

function importance(item: MobileSpotTaxonomyItem) {
  let score = Number(item.ml_weight ?? 1) * 10;
  if (item.is_verified) score += 5;
  if (item.node_type === "subcategory") score += 4;
  if (item.node_type === "offering") score += 2;
  if (item.node_type === "feature") score += 1;
  return score;
}

export function getMobileTaxonomyHighlights(
  items: MobileSpotTaxonomyItem[],
  limit = 4,
): MobileSpotTaxonomyItem[] {
  const selected: MobileSpotTaxonomyItem[] = [];
  const sorted = [...items].sort((a, b) => importance(b) - importance(a));

  const primary = sorted.find((item) => item.node_type === "subcategory");
  if (primary) selected.push(primary);

  for (const preferredType of ["offering", "feature", "service"] as const) {
    const candidate = sorted.find(
      (item) =>
        item.node_type === preferredType &&
        !selected.some((selectedItem) => selectedItem.taxonomy_node_id === item.taxonomy_node_id),
    );
    if (candidate && selected.length < limit) selected.push(candidate);
  }

  for (const item of sorted) {
    if (selected.length >= limit) break;
    if (selected.some((selectedItem) => selectedItem.taxonomy_node_id === item.taxonomy_node_id)) continue;
    selected.push(item);
  }

  return selected;
}
