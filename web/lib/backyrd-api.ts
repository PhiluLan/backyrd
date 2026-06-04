import { supabase } from "@/lib/supabase/client";
import type {
  HomeSectionsDTO,
  HomeSectionDTO,
  HomeSectionKey,
  SpotCardDTO,
  SpotDetailDTO,
  CreateReviewWithPhotosRequest,
  CreateReviewWithPhotosResponse,
} from "@backyrd/shared";

type RawHomePayload = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (isRecord(error)) {
    const message = typeof error.message === "string" ? error.message : null;
    const details = typeof error.details === "string" ? error.details : null;
    const hint = typeof error.hint === "string" ? error.hint : null;
    const code = typeof error.code === "string" ? error.code : null;

    return [message, details, hint, code].filter(Boolean).join(" • ") || "Unbekannter Fehler";
  }

  return "Unbekannter Fehler";
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asSpotCardArray(value: unknown): SpotCardDTO[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      id: String(item.id ?? ""),
      name: typeof item.name === "string" ? item.name : "Unnamed Spot",
      slug: toNullableString(item.slug),
      address: toNullableString(item.address),
      city: toNullableString(item.city),
      country: toNullableString(item.country),
      price_level: toNullableNumber(item.price_level),
      category_name:
        toNullableString(item.category_name) ?? toNullableString(item.category),
      header_photo_path:
        toNullableString(item.header_photo_path) ??
        toNullableString(item.cover_photo_url),
      photo_url:
        toNullableString(item.photo_url) ??
        toNullableString(item.cover_photo_url) ??
        toNullableString(item.header_photo_path),
    }))
    .filter((item) => item.id.length > 0);
}

function extractBucketItems(value: unknown): SpotCardDTO[] {
  if (Array.isArray(value)) {
    return asSpotCardArray(value);
  }

  if (isRecord(value)) {
    if (Array.isArray(value.items)) return asSpotCardArray(value.items);
    if (Array.isArray(value.results)) return asSpotCardArray(value.results);
    if (Array.isArray(value.spots)) return asSpotCardArray(value.spots);
  }

  return [];
}

function titleForSection(key: HomeSectionKey): string {
  switch (key) {
    case "for_you":
      return "Für dich";
    case "your_city":
      return "Neu entdeckt";
    case "based_on_favorites":
      return "Aus deinen Favoriten";
    case "trending":
      return "Trending";
  }
}

function subtitleForSection(
  key: HomeSectionKey,
  source: HomeSectionsDTO["source"]
): string {
  if (source === "personalized") {
    switch (key) {
      case "for_you":
        return "Personalisierte Vorschläge auf Basis deiner Signale.";
      case "your_city":
        return "Neue Spots und frische Entdeckungen.";
      case "based_on_favorites":
        return "Angelehnt an Orte, die du bereits magst.";
      case "trending":
        return "Gerade auffällige Spots im Netzwerk.";
    }
  }

  switch (key) {
    case "for_you":
      return "Öffentliche Empfehlungen als Fallback.";
    case "your_city":
      return "Neuere öffentliche Spots aus dem Discovery-Layer.";
    case "based_on_favorites":
      return "Noch leer, bis echte Favoriten-/User-Signale da sind.";
    case "trending":
      return "Öffentliche Trending-Spots.";
  }
}

function buildSections(
  source: HomeSectionsDTO["source"],
  buckets: Record<HomeSectionKey, SpotCardDTO[]>
): HomeSectionDTO[] {
  const order: HomeSectionKey[] = [
    "for_you",
    "your_city",
    "based_on_favorites",
    "trending",
  ];

  return order.map((key) => ({
    key,
    title: titleForSection(key),
    subtitle: subtitleForSection(key, source),
    items: buckets[key],
  }));
}

function normalizeDiscoveryOverviewPayload(payload: Record<string, unknown>): HomeSectionsDTO {
  const trendingItems = extractBucketItems(payload.trending);

  const personalized = isRecord(payload.personalized) ? payload.personalized : {};

  const popularItems = extractBucketItems(personalized.popular);
  const newestItems = extractBucketItems(personalized.newest);
  const favoritesItems = extractBucketItems(personalized.favorites);

  const buckets: Record<HomeSectionKey, SpotCardDTO[]> = {
    for_you: popularItems.length ? popularItems : trendingItems,
    your_city: newestItems,
    based_on_favorites: favoritesItems,
    trending: trendingItems,
  };

  return {
    source: "discovery_overview",
    sections: buildSections("discovery_overview", buckets),
    ...buckets,
  };
}

function normalizePersonalizedHomePayload(payload: Record<string, unknown>): HomeSectionsDTO {
  const buckets: Record<HomeSectionKey, SpotCardDTO[]> = {
    for_you: extractBucketItems(payload.for_you),
    your_city: extractBucketItems(payload.your_city),
    based_on_favorites: extractBucketItems(payload.based_on_favorites),
    trending: extractBucketItems(payload.trending),
  };

  return {
    source: "personalized",
    sections: buildSections("personalized", buckets),
    ...buckets,
  };
}

function normalizeHomePayload(
  payload: RawHomePayload,
  source: HomeSectionsDTO["source"]
): HomeSectionsDTO {
  const record = isRecord(payload) ? payload : {};

  if (source === "discovery_overview") {
    return normalizeDiscoveryOverviewPayload(record);
  }

  return normalizePersonalizedHomePayload(record);
}

function shouldFallbackToDiscovery(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";

  const code =
    "code" in error && typeof error.code === "string"
      ? error.code.toLowerCase()
      : "";

  return (
    !message ||
    message.includes("jwt") ||
    message.includes("auth") ||
    message.includes("permission") ||
    message.includes("not authenticated") ||
    message.includes("row-level security") ||
    code.includes("pgrst") ||
    code.includes("42501")
  );
}

export async function getHomeSections(limit = 12): Promise<HomeSectionsDTO> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const personalized = await supabase.rpc("get_my_personalized_home_v1", {
      p_limit: limit,
    });

    if (!personalized.error) {
      return normalizeHomePayload(personalized.data as RawHomePayload, "personalized");
    }

    if (!shouldFallbackToDiscovery(personalized.error)) {
      throw new Error(extractErrorMessage(personalized.error));
    }
  }

  const overview = await supabase.rpc("get_discovery_overview_v1");

  if (overview.error) {
    throw new Error(extractErrorMessage(overview.error));
  }

  return normalizeHomePayload(overview.data as RawHomePayload, "discovery_overview");
}

export async function getSpotDetail(spotId: string): Promise<SpotDetailDTO> {
  const { data, error } = await supabase.rpc("get_spot_detail_v1", {
    p_spot_id: spotId,
  });

  if (error) {
    throw new Error(extractErrorMessage(error));
  }

  return data as SpotDetailDTO;
}

export async function createReviewWithPhotos(
  payload: CreateReviewWithPhotosRequest,
  accessToken: string
): Promise<CreateReviewWithPhotosResponse> {
  const { data, error } = await supabase.functions.invoke(
    "create-review-with-photos",
    {
      body: payload,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (error) {
    return { error: extractErrorMessage(error) };
  }

  return data as CreateReviewWithPhotosResponse;
}