import { supabase } from "./supabase";

export type CanonicalSpotImageInput = {
  headerPhotoUrl?: string | null;
  headerPhotoPath?: string | null;
  photoUrl?: string | null;
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

/** Shared Mobile display precedence: canonical projection, selected photo, legacy header path. */
export function selectSpotImageUrl(input: CanonicalSpotImageInput) {
  return normalizedUrl(input.headerPhotoUrl) ?? normalizedUrl(input.photoUrl) ?? normalizedUrl(input.headerPhotoPath);
}

export async function loadDiscoverySpots(city: string, limit = 120) {
  const { data, error } = await supabase.rpc("distribution_trust_spot_catalog_v1", {
    p_query: null,
    p_city: city.trim() || null,
    p_limit: Math.min(Math.max(limit, 1), 200),
    p_surface: "discovery",
  });
  if (error) throw error;
  return ((data ?? []) as DiscoverySpot[]).map((spot) => ({
    ...spot,
    header_photo_url: selectSpotImageUrl({ headerPhotoUrl: spot.header_photo_url }),
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
