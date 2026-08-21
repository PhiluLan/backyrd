import { supabase } from "@/lib/supabase/client";
import { evaluateOwnerChangeInBackground } from "@/lib/safety-owner";

export type OwnerSpotListItem = {
  spot_id: string;
  name: string;
  city: string | null;
  address: string | null;
  category_name: string | null;
  price_level: number | null;
  status: string | null;
  header_photo_path: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  content_status: string | null;
  quality_score: number | null;
  updated_at: string | null;
  created_at: string | null;
};

export type OwnerSpotDetail = {
  spot: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
    status: string | null;
    website: string | null;
    phone: string | null;
    email: string | null;
    price_level: number | null;
    header_photo_path: string | null;
    category_id: string | null;
    category_name: string | null;
    created_at: string | null;
  };
  description: {
    owner_description: string | null;
    owner_keywords: string[];
    admin_description: string | null;
    admin_keywords: string[];
    enriched_description: string | null;
    enriched_keywords: string[];
    content_status: string | null;
    quality_score: number | null;
    is_verified: boolean | null;
    updated_at: string | null;
  };
  intelligence: {
    best_for: string[];
    occasion_tags: string[];
    atmosphere_tags: string[];
    avoid_if_tags: string[];
    good_for_time: string[];
    noise_level: string | null;
    crowd_type: string[];
    dress_code: string | null;
    reservation_recommended: boolean | null;
    average_duration_minutes: number | null;
    signature_items: string[];
    special_notes: string | null;
    source: string | null;
    is_verified: boolean | null;
    updated_at: string | null;
  };
  metrics: {
    review_count: number;
    social_post_count: number;
    decision_review_count: number;
  };
};

export type OwnerTaxonomyNodeType = "subcategory" | "feature" | "offering" | "service";

export type OwnerTaxonomyCatalogItem = {
  id: string;
  slug: string;
  node_type: OwnerTaxonomyNodeType;
  parent_id: string | null;
  label: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  category_ids: string[];
};

export type OwnerSpotTaxonomyItem = {
  taxonomy_node_id: string;
  slug: string;
  node_type: OwnerTaxonomyNodeType;
  label: string;
  source: string;
  confidence: number;
  is_verified: boolean;
};

export type UpdateOwnerSpotProfileInput = {
  spotId: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  priceLevel: number | null;
  ownerDescription: string | null;
  ownerKeywords: string[];
};

export type UpdateOwnerSpotIntelligenceInput = {
  spotId: string;
  bestFor: string[];
  occasionTags: string[];
  atmosphereTags: string[];
  avoidIfTags: string[];
  goodForTime: string[];
  noiseLevel: string | null;
  crowdType: string[];
  dressCode: string | null;
  reservationRecommended: boolean | null;
  averageDurationMinutes: number | null;
  signatureItems: string[];
  specialNotes: string | null;
};

export type OwnerGoldProfile = {
  actor: { role: "OWNER" | "ADMIN" | "FOUNDER"; capability: "BASIC" | "DEEP"; ownerTier: "BASIC" | "PRO" | "ADMIN" };
  catalog: Array<{ field_key: string; section: string; capability: "BASIC" | "DEEP"; value_kind: string; allowed_values: unknown[]; engine_role: string }>;
  sources: Array<{ id: string; source_type: string; source_url: string | null; source_reference: string | null }>;
  proposals: Array<{ id: string; field_key: string; proposed_value: unknown; status: string; created_at: string }>;
  acceptedFacts: Array<{ id: string; field_key: string; value: unknown; status: string }>;
  readiness: { status: "GOLD_READY" | "PARTIAL"; coverage: number; gaps: Array<{ item: string; state: string }>; n4?: { snapshotHash?: string; conceptCount?: number } };
  canonicalN4: { snapshotHash?: string; intelligence?: { concepts?: Record<string, unknown> } } | null;
};

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function extractOwnerError(error: unknown): string {
  if (error instanceof Error) return error.message;

  const e = error as SupabaseErrorLike | null;
  return (
    [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" • ") ||
    "Unbekannter Fehler"
  );
}

export function parseCsvTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 40);
}

export function tagsToCsv(value: string[] | null | undefined): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

export async function requireOwnerSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw new Error(extractOwnerError(error));
  return session;
}

export async function getOwnerSpots(limit = 80): Promise<OwnerSpotListItem[]> {
  const { data, error } = await supabase.rpc("get_owner_spots_v1", {
    p_limit: limit,
  });

  if (error) throw new Error(extractOwnerError(error));
  return Array.isArray(data) ? (data as OwnerSpotListItem[]) : [];
}

export async function getOwnerSpotDetail(spotId: string): Promise<OwnerSpotDetail> {
  const { data, error } = await supabase.rpc("get_owner_spot_detail_v1", {
    p_spot_id: spotId,
  });

  if (error) throw new Error(extractOwnerError(error));
  return data as OwnerSpotDetail;
}

export async function getOwnerTaxonomyCatalog(
  categoryId: string | null,
  locale = "de",
): Promise<OwnerTaxonomyCatalogItem[]> {
  const { data, error } = await supabase.rpc("get_taxonomy_catalog_v1", {
    p_locale: locale,
    p_category_id: categoryId,
    p_owner_selectable_only: true,
  });

  if (error) throw new Error(extractOwnerError(error));
  return Array.isArray(data) ? (data as OwnerTaxonomyCatalogItem[]) : [];
}

export async function getOwnerSpotTaxonomies(
  spotId: string,
  locale = "de",
): Promise<OwnerSpotTaxonomyItem[]> {
  const { data, error } = await supabase.rpc("get_spot_taxonomies_v1", {
    p_spot_id: spotId,
    p_locale: locale,
  });

  if (error) throw new Error(extractOwnerError(error));
  return Array.isArray(data) ? (data as OwnerSpotTaxonomyItem[]) : [];
}

export async function setOwnerSpotTaxonomies(
  spotId: string,
  taxonomyNodeIds: string[],
) {
  const { data, error } = await supabase.rpc("set_owner_spot_taxonomies_moderated_v1", {
    p_spot_id: spotId,
    p_taxonomy_node_ids: taxonomyNodeIds,
    p_change_source: "owner_web",
  });

  if (error) throw new Error(extractOwnerError(error));
  return data;
}

export async function updateOwnerSpotProfile(input: UpdateOwnerSpotProfileInput) {
  const { data, error } = await supabase.rpc("update_owner_spot_profile_moderated_v1", {
    p_spot_id: input.spotId,
    p_name: input.name,
    p_address: input.address,
    p_city: input.city,
    p_country: input.country,
    p_phone: input.phone,
    p_website: input.website,
    p_email: input.email,
    p_price_level: input.priceLevel,
    p_owner_description: input.ownerDescription,
    p_owner_keywords: input.ownerKeywords,
    p_change_source: "owner_web",
  });

  if (error) throw new Error(extractOwnerError(error));
  void evaluateOwnerChangeInBackground(data);
  return data;
}

export async function updateOwnerSpotIntelligence(input: UpdateOwnerSpotIntelligenceInput) {
  const { data, error } = await supabase.rpc("update_owner_spot_intelligence_moderated_v1", {
    p_spot_id: input.spotId,
    p_best_for: input.bestFor,
    p_occasion_tags: input.occasionTags,
    p_atmosphere_tags: input.atmosphereTags,
    p_avoid_if_tags: input.avoidIfTags,
    p_good_for_time: input.goodForTime,
    p_noise_level: input.noiseLevel,
    p_crowd_type: input.crowdType,
    p_dress_code: input.dressCode,
    p_reservation_recommended: input.reservationRecommended,
    p_average_duration_minutes: input.averageDurationMinutes,
    p_signature_items: input.signatureItems,
    p_special_notes: input.specialNotes,
    p_change_source: "owner_web",
  });

  if (error) throw new Error(extractOwnerError(error));
  void evaluateOwnerChangeInBackground(data);
  return data;
}

export async function getOwnerGoldProfile(spotId: string): Promise<OwnerGoldProfile> {
  const { data, error } = await supabase.rpc("backyrd_gold_profile_v1", { p_spot_id: spotId });
  if (error) throw new Error(extractOwnerError(error));
  return data as OwnerGoldProfile;
}

export async function submitOwnerGoldProposal(input: {
  spotId: string;
  fieldKey: string;
  value: unknown;
  sourceUrl?: string | null;
  sourceReference?: string | null;
}) {
  const { data: sourceId, error: sourceError } = await supabase.rpc("backyrd_gold_create_source_v1", {
    p_spot_id: input.spotId,
    p_source_type: input.sourceUrl ? "OFFICIAL_WEBSITE" : "OWNER_CLAIM",
    p_source_url: input.sourceUrl ?? null,
    p_source_reference: input.sourceReference ?? `owner-claim:${crypto.randomUUID()}`,
    p_title: "Owner Editor V2",
    p_provider_identity: "Spot Owner",
    p_observed_at: new Date().toISOString(),
    p_last_checked_at: input.sourceUrl ? new Date().toISOString() : null,
    p_legal_use_status: "NOT_REQUIRED",
  });
  if (sourceError) throw new Error(extractOwnerError(sourceError));

  const { data, error } = await supabase.rpc("backyrd_gold_submit_proposal_v1", {
    p_spot_id: input.spotId,
    p_field_key: input.fieldKey,
    p_value: input.value,
    p_source_id: sourceId,
    p_idempotency_key: `owner-v2:${crypto.randomUUID()}`,
    p_confidence_rationale: "Owner-provided structured claim; canonical qualification remains server-controlled.",
    p_evidence_excerpt: null,
  });
  if (error) throw new Error(extractOwnerError(error));
  return data;
}
