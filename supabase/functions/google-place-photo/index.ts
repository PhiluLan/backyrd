import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type GoogleAuthorAttribution = {
  displayName?: string;
  uri?: string;
  photoUri?: string;
};

type GooglePhoto = {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: GoogleAuthorAttribution[];
  googleMapsUri?: string;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  photos?: GooglePhoto[];
};

type SpotRow = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
  header_photo_path: string | null;
  google_place_id: string | null;
  google_photo_enabled: boolean | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=300",
    },
  });
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  return intersection.length / Math.max(leftTokens.size, rightTokens.size, 1);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<GooglePlace | null> {
  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,photos",
      },
    },
  );

  if (!response.ok) {
    console.error("Google Place Details failed:", response.status, await response.text());
    return null;
  }
  return (await response.json()) as GooglePlace;
}

async function searchBusinessPlace(spot: SpotRow, apiKey: string): Promise<GooglePlace | null> {
  const query = [spot.name, spot.address].filter(Boolean).join(", ");
  const body: Record<string, unknown> = {
    textQuery: query,
    languageCode: "de",
    regionCode: "CH",
    maxResultCount: 5,
  };

  if (
    typeof spot.lat === "number" && Number.isFinite(spot.lat) &&
    typeof spot.lng === "number" && Number.isFinite(spot.lng)
  ) {
    body.locationBias = {
      circle: {
        center: { latitude: spot.lat, longitude: spot.lng },
        radius: 750,
      },
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.photos",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("Google Text Search failed:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const places = Array.isArray(data?.places) ? (data.places as GooglePlace[]) : [];

  const ranked = places
    .map((place) => {
      const candidateName = place.displayName?.text ?? "";
      const similarity = nameSimilarity(spot.name, candidateName);
      let distanceMeters: number | null = null;

      if (
        typeof spot.lat === "number" &&
        typeof spot.lng === "number" &&
        typeof place.location?.latitude === "number" &&
        typeof place.location?.longitude === "number"
      ) {
        distanceMeters = haversineMeters(
          spot.lat,
          spot.lng,
          place.location.latitude,
          place.location.longitude,
        );
      }

      const distanceScore =
        distanceMeters === null ? 0 :
        distanceMeters <= 100 ? 0.35 :
        distanceMeters <= 250 ? 0.25 :
        distanceMeters <= 750 ? 0.08 : -0.5;

      const photoBonus = Array.isArray(place.photos) && place.photos.length > 0 ? 0.08 : 0;
      return { place, similarity, distanceMeters, score: similarity + distanceScore + photoBonus };
    })
    .filter((candidate) => {
      if (!candidate.place.id) return false;
      if (candidate.similarity < 0.45) return false;
      if (candidate.distanceMeters !== null && candidate.distanceMeters > 1000) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  console.log("Google business resolution:", {
    spotId: spot.id,
    query,
    candidates: ranked.map((candidate) => ({
      id: candidate.place.id,
      name: candidate.place.displayName?.text ?? null,
      address: candidate.place.formattedAddress ?? null,
      similarity: candidate.similarity,
      distanceMeters: candidate.distanceMeters,
      hasPhotos: Array.isArray(candidate.place.photos) && candidate.place.photos.length > 0,
      score: candidate.score,
    })),
  });

  return ranked[0]?.place ?? null;
}

async function getPhotoUri(photo: GooglePhoto, apiKey: string): Promise<string | null> {
  if (!photo.name) return null;
  const mediaUrl = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
  mediaUrl.searchParams.set("maxWidthPx", "1600");
  mediaUrl.searchParams.set("maxHeightPx", "1600");
  mediaUrl.searchParams.set("skipHttpRedirect", "true");

  const response = await fetch(mediaUrl, {
    headers: { "X-Goog-Api-Key": apiKey },
  });

  if (!response.ok) {
    console.error("Google Place Photo failed:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return typeof data?.photoUri === "string" ? data.photoUri : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ ok: false, error: "Supabase environment is incomplete." }, 500);
    }
    if (!googleApiKey) {
      return json({ ok: false, error: "GOOGLE_PLACES_API_KEY is missing." }, 500);
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await request.json().catch(() => ({}));
    const spotId = String(body?.spotId ?? "").trim();
    if (!spotId) return json({ ok: false, error: "spotId is required." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const [spotResult, photoResult] = await Promise.all([
      admin
        .from("spots")
        .select("id,name,address,lat,lng,status,header_photo_path,google_place_id,google_photo_enabled")
        .eq("id", spotId)
        .maybeSingle(),
      admin
        .from("spot_photos")
        .select("id,url")
        .eq("spot_id", spotId)
        .not("url", "is", null)
        .neq("url", "")
        .limit(1),
    ]);

    if (spotResult.error) throw spotResult.error;
    if (photoResult.error) throw photoResult.error;

    const spot = spotResult.data as SpotRow | null;
    const ownPhotos = photoResult.data;
    if (!spot || spot.status === "hidden" || spot.status === "rejected") {
      return json({ ok: false, error: "Spot not available." }, 404);
    }

    const hasHeaderPhoto = typeof spot.header_photo_path === "string" && spot.header_photo_path.trim().length > 0;
    if (hasHeaderPhoto || (ownPhotos?.length ?? 0) > 0) {
      return json({ ok: true, source: "backyrd", imageUrl: null, reason: "backyrd_photo_exists" });
    }
    if (spot.google_photo_enabled === false) {
      return json({ ok: true, source: "placeholder", imageUrl: null, reason: "google_photo_disabled" });
    }

    let selectedPlace: GooglePlace | null = null;
    let resolutionSource: "stored_place_id" | "business_text_search" = "stored_place_id";

    if (spot.google_place_id) {
      selectedPlace = await getPlaceDetails(spot.google_place_id, googleApiKey);
    }

    if (!Array.isArray(selectedPlace?.photos) || selectedPlace.photos.length === 0) {
      const businessPlace = await searchBusinessPlace(spot, googleApiKey);
      if (businessPlace?.id) {
        selectedPlace = businessPlace;
        resolutionSource = "business_text_search";
        if (businessPlace.id !== spot.google_place_id) {
          const { error: updateError } = await admin
            .from("spots")
            .update({ google_place_id: businessPlace.id })
            .eq("id", spot.id);
          if (updateError) console.warn("Resolved business Place ID could not be persisted:", updateError.message);
        }
      }
    }

    const selectedPhoto = selectedPlace?.photos?.find((photo) => Boolean(photo?.name));
    if (!selectedPhoto) {
      return json({
        ok: true,
        source: "placeholder",
        imageUrl: null,
        reason: "google_photo_missing",
        resolutionSource,
        resolvedPlaceId: selectedPlace?.id ?? null,
        resolvedPlaceName: selectedPlace?.displayName?.text ?? null,
      });
    }

    const imageUrl = await getPhotoUri(selectedPhoto, googleApiKey);
    if (!imageUrl) {
      return json({
        ok: true,
        source: "placeholder",
        imageUrl: null,
        reason: "google_photo_uri_missing",
        resolutionSource,
        resolvedPlaceId: selectedPlace?.id ?? null,
        resolvedPlaceName: selectedPlace?.displayName?.text ?? null,
      });
    }

    return json({
      ok: true,
      source: "google",
      imageUrl,
      authorAttributions: selectedPhoto.authorAttributions ?? [],
      googleMapsUri: selectedPhoto.googleMapsUri ?? null,
      widthPx: selectedPhoto.widthPx ?? null,
      heightPx: selectedPhoto.heightPx ?? null,
      resolutionSource,
      resolvedPlaceId: selectedPlace?.id ?? null,
      resolvedPlaceName: selectedPlace?.displayName?.text ?? null,
    });
  } catch (error) {
    console.error("google-place-photo error:", error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
