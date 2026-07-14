import { supabase } from "@/lib/supabase/client";

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

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function extractOwnerError(error: unknown): string {
  if (error instanceof Error) return error.message;

  const e = error as SupabaseErrorLike | null;
  return [e?.message, e?.details, e?.hint, e?.code]
    .filter(Boolean)
    .join(" • ") || "Unbekannter Fehler";
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

  if (error) {
    throw new Error(extractOwnerError(error));
  }

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

export async function updateOwnerSpotProfile(input: UpdateOwnerSpotProfileInput) {
  const { data, error } = await supabase.rpc("update_owner_spot_profile_v1", {
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
  });

  if (error) throw new Error(extractOwnerError(error));
  return data;
}

export async function updateOwnerSpotIntelligence(input: UpdateOwnerSpotIntelligenceInput) {
  const { data, error } = await supabase.rpc("update_owner_spot_intelligence_v1", {
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
  });

  if (error) throw new Error(extractOwnerError(error));
  return data;
}
