import { supabase } from "./supabase";

export type CanonicalSpotImageInput = {
  /** `header_photo_path` is the existing Owner/Admin-selected product image. */
  headerPhotoUrl?: string | null;
  headerPhotoPath?: string | null;
  /** Legacy gallery data is deliberately not authoritative for a Spot cover. */
  photoUrl?: string | null;
};

export type CanonicalSpotImageProvenance = "OWNER_ADMIN" | "GOOGLE_PLACES" | "BACKYRD_FALLBACK";

export type CanonicalSpotImage = {
  imageUrl: string | null;
  provenance: CanonicalSpotImageProvenance;
  /** Stable within the source system; useful for consistency assertions, never user-facing. */
  identity: string;
};

export type DiscoverySpot = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  created_at: string;
  header_photo_url: string | null;
  distribution_priority: number;
};

function normalizedUrl(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return encodeURI(clean);
  return supabase.storage.from("spot-photos").getPublicUrl(clean.replace(/^\/+/, "")).data.publicUrl;
}

/**
 * Product-level source contract. `header_photo_path` is the existing, explicitly
 * selected Owner/Admin header image. Generic gallery rows have no verification
 * provenance in the schema and therefore must not silently become the cover.
 */
export function resolveCanonicalSpotImage(input: CanonicalSpotImageInput): CanonicalSpotImage {
  const ownerAdminUrl = normalizedUrl(input.headerPhotoUrl) ?? normalizedUrl(input.headerPhotoPath);
  if (ownerAdminUrl) {
    return {
      imageUrl: ownerAdminUrl,
      provenance: "OWNER_ADMIN",
      identity: `owner-admin:${ownerAdminUrl}`,
    };
  }

  return {
    imageUrl: null,
    provenance: "BACKYRD_FALLBACK",
    identity: "backyrd:fallback",
  };
}

/** Compatibility helper for existing consumers. It intentionally omits generic gallery rows. */
export function selectSpotImageUrl(input: CanonicalSpotImageInput) {
  return resolveCanonicalSpotImage(input).imageUrl;
}

export async function loadDiscoverySpots(city: string, limit = 120) {
  const { data, error } = await supabase.rpc("distribution_trust_spot_catalog_v1", {
    p_query: null,
    p_city: city.trim() || null,
    p_limit: Math.min(Math.max(limit, 1), 200),
    p_surface: "discovery",
  });
  if (error) throw error;
  const spots = (data ?? []) as DiscoverySpot[];
  const ids = spots.map((spot) => spot.id).filter(Boolean);
  const { data: headers, error: headersError } = await supabase.rpc(
    "backyrd_web_canonical_spot_image_headers_v1",
    { p_spot_ids: ids },
  );
  if (headersError) throw headersError;
  const headerBySpotId = new Map<string, string | null>(
    (headers ?? []).map((row: { spot_id: string; header_photo_path: string | null }) => [row.spot_id, row.header_photo_path]),
  );
  return spots.map((spot) => ({
    ...spot,
    header_photo_url: selectSpotImageUrl({ headerPhotoPath: headerBySpotId.get(spot.id) ?? null }),
  }));
}

export function imageDiagnosticContext(url: string | null | undefined) {
  if (!url) return { host: null, object: null };
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return { host: parsed.host, object: segments.at(-1) ?? null };
  } catch {
    return { host: "invalid", object: null };
  }
}
