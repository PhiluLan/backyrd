import { supabase } from "@/lib/supabase/client";

export type PublicCitySpot = {
  spot_id: string;
  name: string;
  city: string | null;
  category_name: string | null;
  photo_url: string | null;
  top_moods: string[];
  review_count: number;
};

export type PublicMoment = {
  review_id: string;
  spot_id: string;
  spot_name: string;
  city: string | null;
  first_name: string | null;
  text: string | null;
  mood_a: string | null;
  mood_b: string | null;
  photo_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
};

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const arr = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0
      )
    : [];

function mapSpot(row: Row): PublicCitySpot {
  return {
    spot_id: String(row.spot_id ?? ""),
    name: str(row.name) ?? "Unbekannter Spot",
    city: str(row.city),
    category_name: str(row.category_name),
    photo_url: str(row.photo_url),
    top_moods: arr(row.top_moods),
    review_count: num(row.review_count),
  };
}

async function attachCanonicalHeaders(spots: PublicCitySpot[]): Promise<PublicCitySpot[]> {
  const ids = spots.map((spot) => spot.spot_id).filter(Boolean);
  if (!ids.length) return spots.map((spot) => ({ ...spot, photo_url: null }));
  const { data, error } = await supabase.rpc("backyrd_web_canonical_spot_image_headers_v1", { p_spot_ids: ids });
  if (error || !Array.isArray(data)) return spots.map((spot) => ({ ...spot, photo_url: null }));
  const headers = new Map(data.filter(isRow).map((row) => [String(row.spot_id ?? ""), str(row.header_photo_path)]));
  return spots.map((spot) => ({ ...spot, photo_url: headers.get(spot.spot_id) ?? null }));
}

export async function getPublicCitySpots(
  city: string,
  limit = 12
): Promise<PublicCitySpot[]> {
  const { data, error } = await supabase.rpc(
    "backyrd_web_city_spots_v1",
    {
      p_city: city,
      p_limit: limit,
    }
  );

  if (error) throw new Error("Backyrd-Daten konnten nicht geladen werden.");

  const spots = Array.isArray(data)
    ? data
        .filter(isRow)
        .map(mapSpot)
        .filter((row) => row.spot_id)
    : [];
  return attachCanonicalHeaders(spots);
}

export async function getPublicTopSpots(
  city = "Basel",
  limit = 9
): Promise<PublicCitySpot[]> {
  const { data, error } = await supabase.rpc(
    "backyrd_web_top_spots_v1",
    {
      p_city: city,
      p_limit: limit,
    }
  );

  if (error) throw new Error("Backyrd-Daten konnten nicht geladen werden.");

  const spots = Array.isArray(data)
    ? data
        .filter(isRow)
        .map(mapSpot)
        .filter((row) => row.spot_id)
    : [];
  return attachCanonicalHeaders(spots);
}

export async function getPublicTopMoments(
  limit = 5
): Promise<PublicMoment[]> {
  const { data, error } = await supabase.rpc(
    "backyrd_web_top_moments_v1",
    {
      p_limit: limit,
    }
  );

  if (error) throw new Error("Backyrd-Daten konnten nicht geladen werden.");

  return Array.isArray(data)
    ? data
        .filter(isRow)
        .map((row) => ({
          review_id: String(row.review_id ?? ""),
          spot_id: String(row.spot_id ?? ""),
          spot_name: str(row.spot_name) ?? "Backyrd Spot",
          city: str(row.city),
          first_name: str(row.first_name),
          text: str(row.text),
          mood_a: str(row.mood_a),
          mood_b: str(row.mood_b),
          photo_url: str(row.photo_url),
          likes_count: num(row.likes_count),
          comments_count: num(row.comments_count),
          created_at: str(row.created_at) ?? new Date(0).toISOString(),
        }))
        .filter((row) => row.review_id && row.spot_id)
    : [];
}
